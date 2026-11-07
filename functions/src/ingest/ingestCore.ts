/**
 * Pure ingest core for the transaction-ingestion HTTP API (Fase 1).
 *
 * No I/O, no Admin SDK, no firebase-functions. Only `node:crypto`. Everything
 * here is deterministic and testable: reject-unknown-keys parsers, pesos->minor
 * conversion, account resolution, deterministic candidate ids, shortcut
 * candidate construction with the EXACT shape the pipeline decoder accepts, the
 * batch orchestration with warning mapping, and the pure API-key helpers.
 *
 * Follows the repo pattern: contracts.ts (sha256 + reject-unknown-keys parsers)
 * and deviceCallables.ts (injected deps + error-type translated by the adapter).
 *
 * `uid` NUNCA viene del payload: el adaptador HTTP lo resuelve desde la API key
 * y lo inyecta en `ingestBatchCore`.
 */

import { createHash, randomBytes } from 'node:crypto';

// ── Error type mapped to an HTTP response by the adapter ────────────────────
export type IngestErrorCode = 'bad-request' | 'unauthorized' | 'payload-too-large';

const INGEST_ERROR_STATUS: Readonly<Record<IngestErrorCode, number>> = {
  'bad-request': 400,
  unauthorized: 401,
  'payload-too-large': 413,
};

export class IngestError extends Error {
  readonly status: number;
  constructor(public readonly code: IngestErrorCode, message: string) {
    super(message);
    this.name = 'IngestError';
    this.status = INGEST_ERROR_STATUS[code];
  }
}

// ── Request contract ─────────────────────────────────────────────────────────
export interface IngestItem {
  type: 'expense';
  /** Monto en pesos (COP). Se convierte a minor units con pesosToMinor. */
  amount: number;
  currency?: 'COP';
  merchant: string;
  /** ISO 8601 date-time. */
  occurredAt: string;
  suggestedCategory?: string;
  suggestedAccountName?: string;
  externalId?: string;
  note?: string;
}

export interface BatchMeta {
  idempotencyKey?: string;
  source?: 'api';
  defaultCurrency?: 'COP';
}

export interface IngestRequest {
  batch?: BatchMeta;
  transactions: IngestItem[];
}

// ── Limits ───────────────────────────────────────────────────────────────────
export const MAX_TRANSACTIONS_PER_BATCH = 100;
export const MAX_AMOUNT_PESOS = 1_000_000_000;

// ── Reject-unknown-keys parsers (estilo parseRuntimePrivateDocument) ────────
const BATCH_META_KEYS = new Set(['idempotencyKey', 'source', 'defaultCurrency']);

const INGEST_ITEM_KEYS = new Set([
  'type',
  'amount',
  'currency',
  'merchant',
  'occurredAt',
  'suggestedCategory',
  'suggestedAccountName',
  'externalId',
  'note',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isBoundedString = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max;

export const parseBatchMeta = (input: unknown): BatchMeta => {
  if (!isRecord(input)) {
    throw new IngestError('bad-request', 'batch must be an object');
  }
  for (const key of Object.keys(input)) {
    if (!BATCH_META_KEYS.has(key)) {
      throw new IngestError('bad-request', `Unexpected key in batch: ${key}`);
    }
  }
  if (input.idempotencyKey !== undefined && !isBoundedString(input.idempotencyKey, 1, 200)) {
    throw new IngestError('bad-request', 'batch.idempotencyKey must be a non-empty string (<=200)');
  }
  if (input.source !== undefined && input.source !== 'api') {
    throw new IngestError('bad-request', "batch.source must be 'api'");
  }
  if (input.defaultCurrency !== undefined && input.defaultCurrency !== 'COP') {
    throw new IngestError('bad-request', "batch.defaultCurrency must be 'COP'");
  }
  return {
    ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.source !== undefined ? { source: input.source as 'api' } : {}),
    ...(input.defaultCurrency !== undefined ? { defaultCurrency: input.defaultCurrency as 'COP' } : {}),
  };
};

export const parseIngestItem = (input: unknown): IngestItem => {
  if (!isRecord(input)) {
    throw new IngestError('bad-request', 'transaction must be an object');
  }
  for (const key of Object.keys(input)) {
    if (!INGEST_ITEM_KEYS.has(key)) {
      throw new IngestError('bad-request', `Unexpected key in transaction: ${key}`);
    }
  }
  if (input.type !== 'expense') {
    throw new IngestError('bad-request', "transaction.type must be 'expense'");
  }
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount)) {
    throw new IngestError('bad-request', 'transaction.amount must be a finite number');
  }
  if (input.currency !== undefined && input.currency !== 'COP') {
    throw new IngestError('bad-request', "transaction.currency must be 'COP'");
  }
  if (!isBoundedString(input.merchant, 1, 140)) {
    throw new IngestError('bad-request', 'transaction.merchant must be a string (1..140)');
  }
  if (typeof input.occurredAt !== 'string' || Number.isNaN(Date.parse(input.occurredAt))) {
    throw new IngestError('bad-request', 'transaction.occurredAt must be an ISO 8601 date-time');
  }
  if (input.suggestedCategory !== undefined && !isBoundedString(input.suggestedCategory, 1, 100)) {
    throw new IngestError('bad-request', 'transaction.suggestedCategory must be a string (1..100)');
  }
  if (input.suggestedAccountName !== undefined && !isBoundedString(input.suggestedAccountName, 1, 120)) {
    throw new IngestError('bad-request', 'transaction.suggestedAccountName must be a string (1..120)');
  }
  if (input.externalId !== undefined && !isBoundedString(input.externalId, 1, 120)) {
    throw new IngestError('bad-request', 'transaction.externalId must be a string (1..120)');
  }
  if (input.note !== undefined && !isBoundedString(input.note, 0, 500)) {
    throw new IngestError('bad-request', 'transaction.note must be a string (<=500)');
  }
  return {
    type: 'expense',
    amount: input.amount,
    ...(input.currency !== undefined ? { currency: input.currency as 'COP' } : {}),
    merchant: input.merchant,
    occurredAt: input.occurredAt,
    ...(input.suggestedCategory !== undefined ? { suggestedCategory: input.suggestedCategory } : {}),
    ...(input.suggestedAccountName !== undefined ? { suggestedAccountName: input.suggestedAccountName } : {}),
    ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
};

/**
 * Parse the top-level request. Validates the 1..100 transactions bound:
 * 0 valid transactions or a malformed body => 400; more than 100 => 413.
 */
export const parseIngestRequest = (input: unknown): IngestRequest => {
  if (!isRecord(input)) {
    throw new IngestError('bad-request', 'Request body must be an object');
  }
  for (const key of Object.keys(input)) {
    if (key !== 'batch' && key !== 'transactions') {
      throw new IngestError('bad-request', `Unexpected key in request body: ${key}`);
    }
  }
  if (!Array.isArray(input.transactions)) {
    throw new IngestError('bad-request', 'transactions must be an array');
  }
  if (input.transactions.length === 0) {
    throw new IngestError('bad-request', 'transactions must contain at least 1 item');
  }
  if (input.transactions.length > MAX_TRANSACTIONS_PER_BATCH) {
    throw new IngestError(
      'payload-too-large',
      `transactions must contain at most ${MAX_TRANSACTIONS_PER_BATCH} items`,
    );
  }
  const batch = input.batch !== undefined ? parseBatchMeta(input.batch) : undefined;
  // Items are validated per-item by the orchestrator so one bad item becomes a
  // warning instead of failing the whole batch; here we only shape the array.
  return {
    ...(batch !== undefined ? { batch } : {}),
    transactions: input.transactions as IngestItem[],
  };
};

// ── pesos -> minor units ─────────────────────────────────────────────────────
/**
 * Convert pesos to minor units (COP has 2 decimals here, matching amountMinor).
 * Returns null when the amount is not a finite number >0 and <=1e9 pesos; the
 * orchestrator turns null into an `invalid_item` warning (no throw).
 */
export const pesosToMinor = (amount: number): number | null => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  if (amount <= 0 || amount > MAX_AMOUNT_PESOS) return null;
  return Math.round(amount * 100);
};

// ── Account resolution ───────────────────────────────────────────────────────
/**
 * Resolve an account id from a suggested name. Normalizes with trim +
 * toLowerCase and requires a single EXACT match; no match, multiple matches, or
 * an absent name => null (orchestrator => `account_not_found` warning). En
 * Fase 1 NO se crea candidato sin cuenta.
 */
export const resolveAccountId = (
  accounts: { id: string; name: string }[],
  suggestedAccountName?: string,
): string | null => {
  if (typeof suggestedAccountName !== 'string') return null;
  const target = suggestedAccountName.trim().toLowerCase();
  if (target.length === 0) return null;
  const matches = accounts.filter(
    account => account.name.trim().toLowerCase() === target,
  );
  return matches.length === 1 ? matches[0]!.id : null;
};

// ── Deterministic candidate id (sha256 hex 64) ──────────────────────────────
const sha256 = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

export interface CandidateIdInput {
  uid: string;
  index: number;
  amountMinor: number;
  occurredAt: string;
  merchant: string;
  externalId?: string;
  idempotencyKey?: string;
}

/**
 * Derive a deterministic candidate id. With an externalId the id is stable
 * across batches for the same (uid, externalId); otherwise it is scoped to the
 * batch via idempotencyKey + index + content. A retry of the same batch yields
 * the same ids.
 */
export const candidateIdFor = (input: CandidateIdInput): string => {
  if (input.externalId !== undefined && input.externalId.length > 0) {
    return sha256(`${input.uid}\0${input.externalId}`);
  }
  return sha256(
    `${input.uid}\0${input.idempotencyKey ?? ''}\0${input.index}\0${input.amountMinor}\0${input.occurredAt}\0${input.merchant}`,
  );
};

// ── Shortcut candidate construction (EXACT shape) ───────────────────────────
export const DEFAULT_SUGGESTED_CATEGORY = 'Sin categoria';

export interface ShortcutCandidate {
  schemaVersion: 3;
  source: 'android-shortcut';
  occurredAt: Date;
  amountMinor: number;
  currency: 'COP';
  merchant: string;
  suggestedAccountId: string;
  suggestedCategory: string;
  status: 'pending';
}

export interface BuildShortcutCandidateInput {
  occurredAt: Date;
  amountMinor: number;
  merchant: string;
  suggestedAccountId: string;
  suggestedCategory?: string;
}

/**
 * Build the shortcut candidate with EXACTLY the keys the pipeline decoder
 * accepts. `createdAt` is NOT included: the adapter stamps it with the server
 * timestamp. suggestedCategory falls back to a non-empty default.
 */
export const buildShortcutCandidate = (
  input: BuildShortcutCandidateInput,
): ShortcutCandidate => {
  const category =
    typeof input.suggestedCategory === 'string'
    && input.suggestedCategory.trim().length > 0
      ? input.suggestedCategory
      : DEFAULT_SUGGESTED_CATEGORY;
  return {
    schemaVersion: 3,
    source: 'android-shortcut',
    occurredAt: input.occurredAt,
    amountMinor: input.amountMinor,
    currency: 'COP',
    merchant: input.merchant,
    suggestedAccountId: input.suggestedAccountId,
    suggestedCategory: category,
    status: 'pending',
  };
};

// ── Injected dependencies ────────────────────────────────────────────────────
export interface Clock {
  now(): Date;
}

export interface AccountLookup {
  list(): Promise<{ id: string; name: string }[]>;
}

export interface CandidateStore {
  exists(id: string): Promise<boolean>;
  create(id: string, candidate: ShortcutCandidate, createdAt: Date): Promise<void>;
}

export interface IngestDeps {
  accounts: AccountLookup;
  store: CandidateStore;
  clock: Clock;
}

// ── Batch orchestration ──────────────────────────────────────────────────────
export type IngestWarningCode =
  | 'duplicate'
  | 'account_not_found'
  | 'invalid_item'
  | 'unsupported_type';

export interface IngestWarning {
  index: number;
  externalId?: string;
  code: IngestWarningCode;
  message: string;
}

export interface IngestCandidateSummary {
  id: string;
  merchant: string;
  amountMinor: number;
  occurredAt: Date;
  suggestedAccountId: string;
  suggestedCategory: string;
  status: 'pending';
}

export interface IngestResult {
  batchId: string;
  received: number;
  created: number;
  skipped: number;
  failed: number;
  candidates: IngestCandidateSummary[];
  warnings: IngestWarning[];
}

/**
 * Orchestrate a validated batch item by item. Any single-item problem becomes a
 * warning instead of failing the whole batch. `input` must already have passed
 * `parseIngestRequest` (the 1..100 bound and body shape were checked there);
 * individual items are parsed here so a bad item is a warning.
 */
export const ingestBatchCore = async (
  input: IngestRequest,
  deps: IngestDeps,
  uid: string,
): Promise<IngestResult> => {
  const batchId =
    input.batch?.idempotencyKey ?? randomBytes(16).toString('base64url');
  const accounts = await deps.accounts.list();

  const warnings: IngestWarning[] = [];
  const candidates: IngestCandidateSummary[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;

  const received = input.transactions.length;

  for (let index = 0; index < received; index += 1) {
    const rawItem = input.transactions[index];
    const rawExternalId = isRecord(rawItem) ? rawItem.externalId : undefined;
    const warningExternalId =
      typeof rawExternalId === 'string' ? rawExternalId : undefined;
    const pushWarning = (code: IngestWarningCode, message: string): void => {
      warnings.push({
        index,
        ...(warningExternalId !== undefined ? { externalId: warningExternalId } : {}),
        code,
        message,
      });
      failed += 1;
    };

    // Unsupported type is detected before full parsing to give a precise code.
    if (isRecord(rawItem) && rawItem.type !== undefined && rawItem.type !== 'expense') {
      pushWarning('unsupported_type', `Unsupported transaction type: ${String(rawItem.type)}`);
      continue;
    }

    let item: IngestItem;
    try {
      item = parseIngestItem(rawItem);
    } catch (error) {
      pushWarning('invalid_item', (error as Error).message);
      continue;
    }

    const amountMinor = pesosToMinor(item.amount);
    if (amountMinor === null) {
      pushWarning('invalid_item', `Amount out of range: ${item.amount}`);
      continue;
    }

    const suggestedAccountId = resolveAccountId(accounts, item.suggestedAccountName);
    if (suggestedAccountId === null) {
      pushWarning('account_not_found', 'No single account matched suggestedAccountName');
      continue;
    }

    const id = candidateIdFor({
      uid,
      index,
      amountMinor,
      occurredAt: item.occurredAt,
      merchant: item.merchant,
      ...(item.externalId !== undefined ? { externalId: item.externalId } : {}),
      ...(input.batch?.idempotencyKey !== undefined
        ? { idempotencyKey: input.batch.idempotencyKey }
        : {}),
    });

    if (await deps.store.exists(id)) {
      warnings.push({
        index,
        ...(warningExternalId !== undefined ? { externalId: warningExternalId } : {}),
        code: 'duplicate',
        message: 'Candidate already exists',
      });
      skipped += 1;
      continue;
    }

    const candidate = buildShortcutCandidate({
      occurredAt: new Date(item.occurredAt),
      amountMinor,
      merchant: item.merchant,
      suggestedAccountId,
      ...(item.suggestedCategory !== undefined
        ? { suggestedCategory: item.suggestedCategory }
        : {}),
    });

    const createdAt = deps.clock.now();
    await deps.store.create(id, candidate, createdAt);
    created += 1;
    candidates.push({
      id,
      merchant: candidate.merchant,
      amountMinor: candidate.amountMinor,
      occurredAt: candidate.occurredAt,
      suggestedAccountId: candidate.suggestedAccountId,
      suggestedCategory: candidate.suggestedCategory,
      status: 'pending',
    });
  }

  return { batchId, received, created, skipped, failed, candidates, warnings };
};

// ── API-key helpers (puras) ─────────────────────────────────────────────────
/** sha256 hex del raw key; es el doc-id en la coleccion global apiKeys/. */
export const hashApiKey = (raw: string): string => sha256(raw);

/** Server-generated random 256-bit base64url API key (devuelta una sola vez). */
export const generateApiKey = (): string => randomBytes(32).toString('base64url');
