import { generateId } from './formatters';
import { getAccountReferenceIds } from './accountTransactions';
import { reconcileUsedCredit } from './creditDeltas';
import type {
  Account,
  Debt,
  RecurringPayment,
  Transaction,
} from '../types/finance';

export const GUEST_LEDGER_SCHEMA_VERSION = 1 as const;
export const GUEST_LEDGER_STORAGE_KEY = 'moneytrack_guest_ledger_v1';
export const GUEST_LEDGER_RECOVERY_KEY = 'moneytrack_guest_ledger_previous_v1';
export const GUEST_LEDGER_LOCK_NAME = 'moneytrack_guest_ledger';

export const GUEST_LEDGER_LEGACY_KEYS = [
  'accounts',
  'transactions',
  'debts',
  'recurringPayments',
] as const;

export interface GuestLedgerData {
  accounts: Account[];
  transactions: Transaction[];
  debts: Debt[];
  recurringPayments: RecurringPayment[];
}

export interface GuestLedgerEnvelope {
  schemaVersion: typeof GUEST_LEDGER_SCHEMA_VERSION;
  revision: number;
  commitId: string;
  committedAt: string;
  recentOperationIds: string[];
  data: GuestLedgerData;
}

export interface GuestLedgerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type GuestLedgerLock = <T>(task: () => Promise<T>) => Promise<T>;

export interface GuestLedgerReadOptions {
  storage?: GuestLedgerStorage;
}

export interface GuestLedgerMutationOptions extends GuestLedgerReadOptions {
  operationId?: string;
  maxRetries?: number;
  lock?: GuestLedgerLock;
  now?: () => Date;
  createCommitId?: () => string;
}

export type GuestLedgerMutator = (
  draft: GuestLedgerData,
  context: { attempt: number; baseRevision: number },
) => void | Promise<void>;

type GuestLedgerSubscriber = (envelope: GuestLedgerEnvelope) => void;

const subscribers = new Set<GuestLedgerSubscriber>();
let localMutationQueue: Promise<void> = Promise.resolve();

const getDefaultStorage = (): GuestLedgerStorage => {
  if (typeof localStorage === 'undefined') {
    throw new Error('El almacenamiento local no está disponible.');
  }
  return localStorage;
};

const cloneData = (data: GuestLedgerData): GuestLedgerData => {
  if (typeof structuredClone === 'function') return structuredClone(data);
  return JSON.parse(JSON.stringify(data)) as GuestLedgerData;
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const stableHash = (input: string): string => {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

const withStableLegacyIds = <T extends { id?: string }>(
  collection: string,
  items: T[],
): T[] => items.map((item, index) => (
  typeof item.id === 'string' && item.id.length > 0
    ? item
    : {
        ...item,
        id: `legacy_${collection}_${stableHash(`${collection}:${index}:${stableStringify(item)}`)}`,
      }
));

const readLegacyArray = <T extends { id?: string }>(
  storage: GuestLedgerStorage,
  key: string,
): T[] => {
  const raw = storage.getItem(key);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`La clave legacy ${key} contiene JSON inválido.`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`La clave legacy ${key} no contiene una colección válida.`);
  }
  return withStableLegacyIds(key, parsed as T[]);
};

export const readLegacyGuestLedgerData = (
  storage: GuestLedgerStorage = getDefaultStorage(),
): GuestLedgerData => ({
  accounts: readLegacyArray<Account>(storage, 'accounts'),
  transactions: readLegacyArray<Transaction>(storage, 'transactions'),
  debts: readLegacyArray<Debt>(storage, 'debts'),
  recurringPayments: readLegacyArray<RecurringPayment>(storage, 'recurringPayments'),
});

const requireRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} no tiene un formato válido.`);
  }
  return value as Record<string, unknown>;
};

const requireId = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} no tiene un identificador válido.`);
  }
  return value;
};

const requireFinite = (value: unknown, label: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} no tiene un valor monetario válido.`);
  }
  return value;
};

const requireUniqueIds = (
  values: readonly { id?: string }[],
  label: string,
): Set<string> => {
  const ids = new Set<string>();
  values.forEach((value, index) => {
    const id = requireId(value.id, `${label}[${index}]`);
    if (ids.has(id)) throw new Error(`${label} contiene el identificador duplicado ${id}.`);
    ids.add(id);
  });
  return ids;
};

const requireAccountReference = (
  accountIds: Set<string>,
  value: unknown,
  label: string,
  optional = false,
): void => {
  if (optional && (value === undefined || value === null || value === '')) return;
  const accountId = requireId(value, label);
  if (!accountIds.has(accountId)) {
    throw new Error(`${label} referencia una cuenta inexistente.`);
  }
};

export function validateGuestLedgerData(data: GuestLedgerData): void {
  if (!data || typeof data !== 'object') throw new Error('El guest ledger no es válido.');
  for (const key of GUEST_LEDGER_LEGACY_KEYS) {
    if (!Array.isArray(data[key])) throw new Error(`La colección ${key} no es válida.`);
  }

  const accountIds = requireUniqueIds(data.accounts, 'accounts');
  const transactionIds = requireUniqueIds(data.transactions, 'transactions');
  const debtIds = requireUniqueIds(data.debts, 'debts');
  requireUniqueIds(data.recurringPayments, 'recurringPayments');

  data.accounts.forEach((account, index) => {
    const value = requireRecord(account, `accounts[${index}]`);
    if (typeof value.name !== 'string' || value.name.trim().length === 0) {
      throw new Error(`accounts[${index}] no tiene nombre válido.`);
    }
    if (!['savings', 'credit', 'cash'].includes(String(value.type))) {
      throw new Error(`accounts[${index}] no tiene tipo válido.`);
    }
    requireFinite(value.initialBalance, `accounts[${index}].initialBalance`);
    if (typeof value.isDefault !== 'boolean') {
      throw new Error(`accounts[${index}].isDefault no es booleano.`);
    }
    for (const field of ['creditLimit', 'usedCredit', 'interestRate'] as const) {
      if (value[field] !== undefined) requireFinite(value[field], `accounts[${index}].${field}`);
    }
  });

  data.debts.forEach((debt, index) => {
    const value = requireRecord(debt, `debts[${index}]`);
    if (typeof value.personName !== 'string' || value.personName.trim().length === 0) {
      throw new Error(`debts[${index}] no tiene persona válida.`);
    }
    if (!['lent', 'borrowed'].includes(String(value.type))) {
      throw new Error(`debts[${index}] no tiene tipo válido.`);
    }
    requireFinite(value.originalAmount, `debts[${index}].originalAmount`);
    requireFinite(value.remainingAmount, `debts[${index}].remainingAmount`);
    if (typeof value.isSettled !== 'boolean') {
      throw new Error(`debts[${index}].isSettled no es booleano.`);
    }
    requireAccountReference(accountIds, value.accountId, `debts[${index}].accountId`, true);
  });

  data.transactions.forEach((transaction, index) => {
    const value = requireRecord(transaction, `transactions[${index}]`);
    if (!['income', 'expense', 'transfer'].includes(String(value.type))) {
      throw new Error(`transactions[${index}] no tiene tipo válido.`);
    }
    requireFinite(value.amount, `transactions[${index}].amount`, Number.EPSILON);
    if (typeof value.category !== 'string' || typeof value.description !== 'string') {
      throw new Error(`transactions[${index}] no tiene texto válido.`);
    }
    if (typeof value.paid !== 'boolean') {
      throw new Error(`transactions[${index}].paid no es booleano.`);
    }
    requireAccountReference(accountIds, value.accountId, `transactions[${index}].accountId`);
    if (value.type === 'transfer') {
      requireAccountReference(accountIds, value.toAccountId, `transactions[${index}].toAccountId`);
      if (value.toAccountId === value.accountId) {
        throw new Error(`transactions[${index}] referencia la misma cuenta de origen y destino.`);
      }
    }
    if (value.debtId !== undefined && !debtIds.has(requireId(value.debtId, `transactions[${index}].debtId`))) {
      throw new Error(`transactions[${index}].debtId referencia una deuda inexistente.`);
    }
    if (value.linkedTransactionId !== undefined) {
      const linkedId = requireId(value.linkedTransactionId, `transactions[${index}].linkedTransactionId`);
      if (!transactionIds.has(linkedId)) {
        throw new Error(`transactions[${index}].linkedTransactionId referencia una transacción inexistente.`);
      }
      const linked = data.transactions.find(candidate => candidate.id === linkedId);
      if (linked?.linkedTransactionId !== value.id) {
        throw new Error(`transactions[${index}] no tiene un enlace recíproco válido.`);
      }
    }
  });

  data.recurringPayments.forEach((payment, index) => {
    const value = requireRecord(payment, `recurringPayments[${index}]`);
    if (
      typeof value.name !== 'string'
      || value.name.trim().length === 0
      || typeof value.category !== 'string'
    ) {
      throw new Error(`recurringPayments[${index}] no tiene texto válido.`);
    }
    requireFinite(value.amount, `recurringPayments[${index}].amount`, Number.EPSILON);
    if (
      typeof value.dueDay !== 'number'
      || !Number.isInteger(value.dueDay)
      || value.dueDay < 1
      || value.dueDay > 31
    ) {
      throw new Error(`recurringPayments[${index}].dueDay no es válido.`);
    }
    if (!['monthly', 'yearly'].includes(String(value.frequency))) {
      throw new Error(`recurringPayments[${index}] no tiene frecuencia válida.`);
    }
    if (typeof value.isActive !== 'boolean') {
      throw new Error(`recurringPayments[${index}].isActive no es booleano.`);
    }
    requireAccountReference(
      accountIds,
      value.accountId,
      `recurringPayments[${index}].accountId`,
      true,
    );
  });
}

export function reconcileGuestCreditAuthority(data: GuestLedgerData): void {
  data.accounts = data.accounts.map(account => {
    if (account.type !== 'credit' || !account.id) return account;
    return {
      ...account,
      usedCredit: reconcileUsedCredit(
        getAccountReferenceIds(account),
        data.transactions,
      ),
    };
  });
}

export function createGuestLedgerEnvelope(
  data: GuestLedgerData,
  options: {
    revision?: number;
    commitId?: string;
    committedAt?: string;
    recentOperationIds?: string[];
  } = {},
): GuestLedgerEnvelope {
  validateGuestLedgerData(data);
  return {
    schemaVersion: GUEST_LEDGER_SCHEMA_VERSION,
    revision: options.revision ?? 0,
    commitId: options.commitId ?? 'guest-ledger-empty',
    committedAt: options.committedAt ?? new Date(0).toISOString(),
    recentOperationIds: options.recentOperationIds ?? [],
    data,
  };
}

export function parseGuestLedgerEnvelope(raw: string): GuestLedgerEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('El guest ledger persistido contiene JSON inválido.');
  }
  const value = requireRecord(parsed, 'guest ledger');
  if (value.schemaVersion !== GUEST_LEDGER_SCHEMA_VERSION) {
    throw new Error('La versión del guest ledger no es compatible.');
  }
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) {
    throw new Error('La revisión del guest ledger no es válida.');
  }
  if (typeof value.commitId !== 'string' || typeof value.committedAt !== 'string') {
    throw new Error('La metadata del guest ledger no es válida.');
  }
  if (!Array.isArray(value.recentOperationIds) || value.recentOperationIds.some(item => typeof item !== 'string')) {
    throw new Error('El historial de operaciones del guest ledger no es válido.');
  }
  const data = value.data as GuestLedgerData;
  validateGuestLedgerData(data);
  return value as unknown as GuestLedgerEnvelope;
}

export function readGuestLedgerEnvelope(
  options: GuestLedgerReadOptions = {},
): GuestLedgerEnvelope {
  const storage = options.storage ?? getDefaultStorage();
  const raw = storage.getItem(GUEST_LEDGER_STORAGE_KEY);
  if (raw) return parseGuestLedgerEnvelope(raw);
  return createGuestLedgerEnvelope(readLegacyGuestLedgerData(storage));
}

export function subscribeGuestLedger(subscriber: GuestLedgerSubscriber): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

const publishGuestLedger = (envelope: GuestLedgerEnvelope): void => {
  subscribers.forEach(subscriber => subscriber(envelope));
};

const cleanupLegacyKeys = (storage: GuestLedgerStorage): void => {
  GUEST_LEDGER_LEGACY_KEYS.forEach(key => {
    try {
      storage.removeItem(key);
    } catch {
      // El envelope ya está verificado. El siguiente arranque termina la limpieza.
    }
  });
};

const rollbackEnvelope = (
  storage: GuestLedgerStorage,
  previousRaw: string | null,
): void => {
  if (previousRaw === null) storage.removeItem(GUEST_LEDGER_STORAGE_KEY);
  else storage.setItem(GUEST_LEDGER_STORAGE_KEY, previousRaw);
};

class GuestLedgerRevisionConflictError extends Error {
  constructor() {
    super('El guest ledger cambió durante la verificación.');
    this.name = 'GuestLedgerRevisionConflictError';
  }
}

const persistCandidate = (
  storage: GuestLedgerStorage,
  candidate: GuestLedgerEnvelope,
  previousRaw: string | null,
): GuestLedgerEnvelope => {
  const serialized = JSON.stringify(candidate);
  if (previousRaw !== null) {
    storage.setItem(GUEST_LEDGER_RECOVERY_KEY, previousRaw);
  }
  storage.setItem(GUEST_LEDGER_STORAGE_KEY, serialized);
  const observed = storage.getItem(GUEST_LEDGER_STORAGE_KEY);
  if (observed === serialized) return parseGuestLedgerEnvelope(observed);

  if (observed) {
    try {
      const conflicting = parseGuestLedgerEnvelope(observed);
      if (
        conflicting.commitId !== candidate.commitId
        && conflicting.revision >= candidate.revision
      ) {
        throw new GuestLedgerRevisionConflictError();
      }
    } catch (error) {
      if (error instanceof GuestLedgerRevisionConflictError) throw error;
    }
  }

  try {
    rollbackEnvelope(storage, previousRaw);
  } catch {
    // El error original de verificación es el que explica que no hubo commit.
  }
  throw new Error('No se pudo verificar el guest ledger después de persistirlo.');
};

const runQueued: GuestLedgerLock = <T>(task: () => Promise<T>): Promise<T> => {
  const run = localMutationQueue.then(task, task);
  localMutationQueue = run.then(() => undefined, () => undefined);
  return run;
};

const defaultLock: GuestLedgerLock = async <T>(task: () => Promise<T>): Promise<T> => {
  const lockManager = typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & {
        locks?: { request<R>(name: string, callback: () => Promise<R>): Promise<R> };
      }).locks;
  if (lockManager) return lockManager.request(GUEST_LEDGER_LOCK_NAME, task);
  return runQueued(task);
};

const isValidConflictingEnvelope = (
  observedRaw: string | null,
  baseRevision: number,
): boolean => {
  if (!observedRaw) return false;
  try {
    return parseGuestLedgerEnvelope(observedRaw).revision > baseRevision;
  } catch {
    return false;
  }
};

export async function ensureGuestLedgerEnvelope(
  options: GuestLedgerMutationOptions = {},
): Promise<GuestLedgerEnvelope> {
  const storage = options.storage ?? getDefaultStorage();
  const lock = options.lock ?? defaultLock;
  return lock(async () => {
    const raw = storage.getItem(GUEST_LEDGER_STORAGE_KEY);
    if (raw) {
      const existing = parseGuestLedgerEnvelope(raw);
      cleanupLegacyKeys(storage);
      return existing;
    }

    const data = readLegacyGuestLedgerData(storage);
    reconcileGuestCreditAuthority(data);
    const candidate = createGuestLedgerEnvelope(data, {
      revision: 1,
      commitId: options.createCommitId?.() ?? generateId(),
      committedAt: (options.now?.() ?? new Date()).toISOString(),
    });
    const verified = persistCandidate(storage, candidate, null);
    cleanupLegacyKeys(storage);
    publishGuestLedger(verified);
    return verified;
  });
}

export async function mutateGuestLedger(
  mutator: GuestLedgerMutator,
  options: GuestLedgerMutationOptions = {},
): Promise<GuestLedgerEnvelope> {
  const storage = options.storage ?? getDefaultStorage();
  const lock = options.lock ?? defaultLock;
  const maxRetries = options.maxRetries ?? 5;
  const operationId = options.operationId;

  return lock(async () => {
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      const baseRaw = storage.getItem(GUEST_LEDGER_STORAGE_KEY);
      const base = baseRaw
        ? parseGuestLedgerEnvelope(baseRaw)
        : createGuestLedgerEnvelope(readLegacyGuestLedgerData(storage));

      if (operationId && base.recentOperationIds.includes(operationId)) {
        cleanupLegacyKeys(storage);
        return base;
      }

      const draft = cloneData(base.data);
      await mutator(draft, { attempt, baseRevision: base.revision });
      reconcileGuestCreditAuthority(draft);
      validateGuestLedgerData(draft);
      const serializedData = JSON.stringify(draft);
      if (serializedData === JSON.stringify(base.data)) return base;
      const recentOperationIds = operationId
        ? [...base.recentOperationIds.filter(id => id !== operationId), operationId].slice(-100)
        : base.recentOperationIds.slice(-100);
      const candidate = createGuestLedgerEnvelope(draft, {
        revision: base.revision + 1,
        commitId: options.createCommitId?.() ?? generateId(),
        committedAt: (options.now?.() ?? new Date()).toISOString(),
        recentOperationIds,
      });

      // Force serialization before touching either durable key.
      JSON.stringify(candidate);

      const latestRaw = storage.getItem(GUEST_LEDGER_STORAGE_KEY);
      if (latestRaw !== baseRaw) continue;

      try {
        const verified = persistCandidate(storage, candidate, baseRaw);
        cleanupLegacyKeys(storage);
        publishGuestLedger(verified);
        return verified;
      } catch (error) {
        if (error instanceof GuestLedgerRevisionConflictError) continue;
        const observedRaw = storage.getItem(GUEST_LEDGER_STORAGE_KEY);
        if (isValidConflictingEnvelope(observedRaw, base.revision)) continue;
        throw error;
      }

    }
    throw new Error('El guest ledger cambió en otra pestaña. Reintenta la operación.');
  });
}

export function exportGuestLedgerRecovery(
  options: GuestLedgerReadOptions = {},
): string {
  const storage = options.storage ?? getDefaultStorage();
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    current: storage.getItem(GUEST_LEDGER_STORAGE_KEY),
    previous: storage.getItem(GUEST_LEDGER_RECOVERY_KEY),
  }, null, 2);
}
