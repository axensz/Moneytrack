import { describe, it, expect } from 'vitest';
import {
  parseBatchMeta,
  parseIngestItem,
  parseIngestRequest,
  pesosToMinor,
  resolveAccountId,
  candidateIdFor,
  buildShortcutCandidate,
  ingestBatchCore,
  hashApiKey,
  apiKeyHashEquals,
  generateApiKey,
  IngestError,
  DEFAULT_SUGGESTED_CATEGORY,
  type IngestItem,
  type ShortcutCandidate,
  type AccountLookup,
  type CandidateStore,
  type Clock,
} from '../../src/ingest/ingestCore.js';
import { decodeTransactionImportCandidate } from '../../../src/utils/transactionImportDecoder.js';

const validItem = (overrides: Partial<IngestItem> = {}): IngestItem => ({
  type: 'expense',
  amount: 10_000,
  merchant: 'Tienda',
  occurredAt: '2026-01-15T10:30:00.000Z',
  suggestedAccountName: 'Efectivo',
  ...overrides,
});

describe('parseIngestItem', () => {
  it('accepts a valid item', () => {
    expect(() => parseIngestItem(validItem())).not.toThrow();
  });

  it('rejects an unknown key with a 400', () => {
    try {
      parseIngestItem({ ...validItem(), surprise: true } as unknown);
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(IngestError);
      expect((error as IngestError).status).toBe(400);
      expect((error as IngestError).code).toBe('bad-request');
    }
  });

  it('rejects a non-expense type', () => {
    expect(() => parseIngestItem(validItem({ type: 'income' as unknown as 'expense' }))).toThrow(
      IngestError,
    );
  });

  it('rejects a merchant longer than 140 chars', () => {
    expect(() => parseIngestItem(validItem({ merchant: 'x'.repeat(141) }))).toThrow(IngestError);
  });

  it('rejects an unparseable occurredAt', () => {
    expect(() => parseIngestItem(validItem({ occurredAt: 'not-a-date' }))).toThrow(IngestError);
  });
});

describe('parseBatchMeta', () => {
  it('accepts a valid batch', () => {
    expect(parseBatchMeta({ idempotencyKey: 'abc', source: 'api', defaultCurrency: 'COP' })).toEqual({
      idempotencyKey: 'abc',
      source: 'api',
      defaultCurrency: 'COP',
    });
  });

  it('rejects an unknown key', () => {
    expect(() => parseBatchMeta({ nope: 1 })).toThrow(IngestError);
  });

  it("rejects a source other than 'api'", () => {
    expect(() => parseBatchMeta({ source: 'web' })).toThrow(IngestError);
  });
});

describe('parseIngestRequest', () => {
  it('rejects a body with 0 transactions (400)', () => {
    try {
      parseIngestRequest({ transactions: [] });
      throw new Error('expected throw');
    } catch (error) {
      expect((error as IngestError).status).toBe(400);
    }
  });

  it('rejects more than 100 transactions (413)', () => {
    const transactions = Array.from({ length: 101 }, () => validItem());
    try {
      parseIngestRequest({ transactions });
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(IngestError);
      expect((error as IngestError).status).toBe(413);
      expect((error as IngestError).code).toBe('payload-too-large');
    }
  });

  it('rejects a malformed body (400)', () => {
    try {
      parseIngestRequest({ transactions: 'nope' });
      throw new Error('expected throw');
    } catch (error) {
      expect((error as IngestError).status).toBe(400);
    }
  });

  it('accepts exactly 100 transactions', () => {
    const transactions = Array.from({ length: 100 }, () => validItem());
    expect(parseIngestRequest({ transactions }).transactions).toHaveLength(100);
  });
});

describe('pesosToMinor', () => {
  it('rounds to the nearest minor unit', () => {
    expect(pesosToMinor(10_000)).toBe(1_000_000);
    expect(pesosToMinor(10.005)).toBe(1001);
    expect(pesosToMinor(10.004)).toBe(1000);
  });

  it('returns null for amounts <= 0', () => {
    expect(pesosToMinor(0)).toBeNull();
    expect(pesosToMinor(-5)).toBeNull();
  });

  it('returns null for amounts above 1e9 pesos', () => {
    expect(pesosToMinor(1_000_000_001)).toBeNull();
    expect(pesosToMinor(1_000_000_000)).toBe(100_000_000_000);
  });

  it('returns null for non-finite numbers', () => {
    expect(pesosToMinor(Number.NaN)).toBeNull();
    expect(pesosToMinor(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('resolveAccountId', () => {
  const accounts = [
    { id: 'acc-1', name: 'Efectivo' },
    { id: 'acc-2', name: 'Banco' },
  ];

  it('matches a single account case-insensitively and trimmed', () => {
    expect(resolveAccountId(accounts, '  efectivo ')).toBe('acc-1');
  });

  it('returns null when nothing matches', () => {
    expect(resolveAccountId(accounts, 'Nequi')).toBeNull();
  });

  it('returns null when the name is absent', () => {
    expect(resolveAccountId(accounts, undefined)).toBeNull();
  });

  it('returns null on multiple matches', () => {
    const dup = [
      { id: 'acc-1', name: 'Efectivo' },
      { id: 'acc-3', name: ' efectivo ' },
    ];
    expect(resolveAccountId(dup, 'Efectivo')).toBeNull();
  });
});

describe('candidateIdFor', () => {
  it('is a deterministic 64-char hex for the same input', () => {
    const input = {
      uid: 'u1',
      index: 0,
      amountMinor: 1_000_000,
      occurredAt: '2026-01-15T10:30:00.000Z',
      merchant: 'Tienda',
    };
    const a = candidateIdFor(input);
    const b = candidateIdFor({ ...input });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses externalId when present (stable across batches)', () => {
    const withExt = { uid: 'u1', index: 0, amountMinor: 1, occurredAt: 'x', merchant: 'm', externalId: 'ext-1' };
    const sameExtDifferentContent = { uid: 'u1', index: 9, amountMinor: 999, occurredAt: 'y', merchant: 'z', externalId: 'ext-1' };
    expect(candidateIdFor(withExt)).toBe(candidateIdFor(sameExtDifferentContent));
  });

  it('differs when uid differs', () => {
    const base = { uid: 'u1', index: 0, amountMinor: 1, occurredAt: 'x', merchant: 'm' };
    expect(candidateIdFor(base)).not.toBe(candidateIdFor({ ...base, uid: 'u2' }));
  });
});

const buildAccounts = (list: { id: string; name: string }[]): AccountLookup => ({
  list: async () => list,
});

interface RecordingStore extends CandidateStore {
  readonly created: { id: string; candidate: ShortcutCandidate; createdAt: Date }[];
}

const buildStore = (existingIds: Set<string> = new Set()): RecordingStore => {
  const created: { id: string; candidate: ShortcutCandidate; createdAt: Date }[] = [];
  return {
    created,
    exists: async (id: string) => existingIds.has(id),
    create: async (id, candidate, createdAt) => {
      created.push({ id, candidate, createdAt });
    },
  };
};

const fixedClock: Clock = { now: () => new Date('2026-02-01T00:00:00.000Z') };

describe('ingestBatchCore warning mapping', () => {
  const accounts = buildAccounts([{ id: 'acc-1', name: 'Efectivo' }]);

  it('maps unsupported_type for a non-expense item', async () => {
    const request = parseIngestRequestUnsafe([
      { type: 'income', amount: 1, merchant: 'm', occurredAt: '2026-01-15T10:30:00.000Z' },
    ]);
    const result = await ingestBatchCore(request, { accounts, store: buildStore(), clock: fixedClock }, 'u1');
    expect(result.failed).toBe(1);
    expect(result.warnings[0]!.code).toBe('unsupported_type');
  });

  it('maps invalid_item for an amount out of range', async () => {
    const request = parseIngestRequest({ transactions: [validItem({ amount: -5 })] });
    const result = await ingestBatchCore(request, { accounts, store: buildStore(), clock: fixedClock }, 'u1');
    expect(result.warnings[0]!.code).toBe('invalid_item');
    expect(result.failed).toBe(1);
  });

  it('maps account_not_found when no account matches', async () => {
    const request = parseIngestRequest({ transactions: [validItem({ suggestedAccountName: 'Nequi' })] });
    const result = await ingestBatchCore(request, { accounts, store: buildStore(), clock: fixedClock }, 'u1');
    expect(result.warnings[0]!.code).toBe('account_not_found');
    expect(result.failed).toBe(1);
  });

  it('maps duplicate when CandidateStore.exists returns true', async () => {
    const request = parseIngestRequest({ transactions: [validItem({ externalId: 'ext-1' })] });
    const id = candidateIdFor({ uid: 'u1', index: 0, amountMinor: 1_000_000, occurredAt: '2026-01-15T10:30:00.000Z', merchant: 'Tienda', externalId: 'ext-1' });
    const result = await ingestBatchCore(request, { accounts, store: buildStore(new Set([id])), clock: fixedClock }, 'u1');
    expect(result.skipped).toBe(1);
    expect(result.warnings[0]!.code).toBe('duplicate');
    expect(result.warnings[0]!.externalId).toBe('ext-1');
  });

  it('creates a candidate for a valid item', async () => {
    const request = parseIngestRequest({ transactions: [validItem()] });
    const store = buildStore();
    const result = await ingestBatchCore(request, { accounts, store, clock: fixedClock }, 'u1');
    expect(result.created).toBe(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.suggestedAccountId).toBe('acc-1');
    expect(store.created[0]!.createdAt).toEqual(new Date('2026-02-01T00:00:00.000Z'));
  });

  it('reuses batch.idempotencyKey as batchId and yields stable ids on retry', async () => {
    const body = { batch: { idempotencyKey: 'batch-42' }, transactions: [validItem()] };
    const first = await ingestBatchCore(parseIngestRequest(body), { accounts, store: buildStore(), clock: fixedClock }, 'u1');
    const second = await ingestBatchCore(parseIngestRequest(body), { accounts, store: buildStore(), clock: fixedClock }, 'u1');
    expect(first.batchId).toBe('batch-42');
    expect(first.candidates[0]!.id).toBe(second.candidates[0]!.id);
  });
});

describe('buildShortcutCandidate', () => {
  it('produces EXACTLY the shortcut keys', () => {
    const candidate = buildShortcutCandidate({
      occurredAt: new Date('2026-01-15T10:30:00.000Z'),
      amountMinor: 1_000_000,
      merchant: 'Tienda',
      suggestedAccountId: 'acc-1',
      suggestedCategory: 'Comida',
    });
    expect(Object.keys(candidate).sort()).toEqual(
      ['amountMinor', 'currency', 'merchant', 'occurredAt', 'schemaVersion', 'source', 'status', 'suggestedAccountId', 'suggestedCategory'].sort(),
    );
    expect(candidate).not.toHaveProperty('createdAt');
    expect(candidate).not.toHaveProperty('transactionId');
  });

  it('falls back to a non-empty default category', () => {
    const candidate = buildShortcutCandidate({
      occurredAt: new Date(),
      amountMinor: 1,
      merchant: 'm',
      suggestedAccountId: 'acc-1',
    });
    expect(candidate.suggestedCategory).toBe(DEFAULT_SUGGESTED_CATEGORY);
    expect(candidate.suggestedCategory.trim().length).toBeGreaterThan(0);
  });
});

describe('contract: built candidate passes the pipeline decoder', () => {
  it('decodeTransactionImportCandidate accepts the built shortcut candidate', () => {
    const candidate = buildShortcutCandidate({
      occurredAt: new Date('2026-01-15T10:30:00.000Z'),
      amountMinor: 1_000_000,
      merchant: 'Tienda',
      suggestedAccountId: 'acc-1',
      suggestedCategory: 'Comida',
    });
    const candidateId = candidateIdFor({
      uid: 'u1',
      index: 0,
      amountMinor: 1_000_000,
      occurredAt: '2026-01-15T10:30:00.000Z',
      merchant: 'Tienda',
    });
    // The adapter stamps createdAt with the server timestamp; replicate here.
    const persisted = { ...candidate, createdAt: new Date() };
    const result = decodeTransactionImportCandidate({
      id: candidateId,
      data: () => persisted,
    });
    expect(result.ok).toBe(true);
  });
});

describe('API-key helpers', () => {
  const PEPPER = 'test-server-pepper';

  it('hashApiKey is a deterministic 64-char hex for the same raw+pepper', () => {
    expect(hashApiKey('secret', PEPPER)).toBe(hashApiKey('secret', PEPPER));
    expect(hashApiKey('secret', PEPPER)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashApiKey yields different hashes for different peppers (keyed)', () => {
    expect(hashApiKey('secret', PEPPER)).not.toBe(hashApiKey('secret', 'other-pepper'));
  });

  it('hashApiKey throws when the pepper is missing (fail-closed)', () => {
    expect(() => hashApiKey('secret', '')).toThrow(IngestError);
  });

  it('apiKeyHashEquals compares equal and unequal hashes safely', () => {
    const h = hashApiKey('secret', PEPPER);
    expect(apiKeyHashEquals(h, h)).toBe(true);
    expect(apiKeyHashEquals(h, hashApiKey('other', PEPPER))).toBe(false);
    // Distinta longitud no debe lanzar, solo devolver false.
    expect(apiKeyHashEquals(h, 'abc')).toBe(false);
  });

  it('generateApiKey yields distinct base64url tokens', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

// Helper to build a request with items that bypass top-level item typing but
// still pass the array-shape check in parseIngestRequest.
function parseIngestRequestUnsafe(transactions: unknown[]) {
  return parseIngestRequest({ transactions } as unknown);
}
