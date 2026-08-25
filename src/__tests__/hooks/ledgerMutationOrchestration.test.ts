import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, LedgerMutationIntent, Transaction } from '../../types/finance';

type StoredDocument = Record<string, unknown>;
type Filter = { field: string; value: unknown };

const M = vi.hoisted(() => ({
  accounts: new Map<string, StoredDocument>(),
  transactions: new Map<string, StoredDocument>(),
  queries: [] as Filter[],
  readRequests: 0,
  readDocuments: 0,
  events: [] as string[],
  batchCommits: 0,
  commitDelayMs: 0,
  commitLatencies: [] as number[],
  failCommit: false,
  failRenew: false,
  releaseError: false,
  leaseHeld: false,
  nextOperation: 0,
  acquisitions: [] as Array<{ userId: string; operationId: string; kind: string }>,
}));

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));

vi.mock('../../hooks/firestore/accountOrchestration', () => ({
  acquireAccountOperationLock: async (userId: string, operationId: string, kind: string) => {
    M.events.push('acquire');
    M.acquisitions.push({ userId, operationId, kind });
    if (M.leaseHeld) {
      throw new Error('Ya hay otra operación en curso');
    }
    M.leaseHeld = true;
  },
  renewAccountOperationLock: async () => {
    M.events.push('renew');
    if (M.failRenew) throw new Error('lost lease');
  },
  releaseAccountOperationLock: async () => {
    M.events.push('safe-release');
    if (M.releaseError) throw new Error('release failed');
    M.leaseHeld = false;
  },
  createAccountOperationId: () => {
    M.nextOperation += 1;
    return `ledger-mutation:operation-${M.nextOperation}`;
  },
  createAccountOperationRelease: (id: string, kind: string) => ({
    accountOperationLock: {
      id,
      kind,
      releasedAt: { __serverTimestamp: true },
    },
  }),
  assertAtomicBatchCapacity: (_operation: string, count: number) => {
    if (count > 40) throw new Error('límite atómico');
  },
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __kind: 'collection', path }),
  doc: (_db: unknown, path: string, id: string) => ({ path, id }),
  where: (field: string, _operator: string, value: unknown) => ({ field, value }),
  query: (source: { path: string }, ...filters: Filter[]) => ({
    __kind: 'query',
    path: source.path,
    filters,
  }),
  getDocsFromServer: async (reference: {
    __kind: string;
    path: string;
    filters?: Filter[];
  }) => {
    const store = reference.path.endsWith('/accounts') ? M.accounts : M.transactions;
    const filters = reference.filters ?? [];
    M.queries.push(...filters);
    const docs = [...store.entries()]
      .filter(([, data]) => filters.every(filter => data[filter.field] === filter.value))
      .map(([id, data]) => ({ id, data: () => data }));
    M.readRequests += 1;
    M.readDocuments += docs.length;
    return { docs };
  },
  getDocFromServer: async (reference: { path: string; id: string }) => {
    const store = reference.path.endsWith('/accounts') ? M.accounts : M.transactions;
    const data = store.get(reference.id);
    return {
      id: reference.id,
      exists: () => Boolean(data),
      data: () => data ?? {},
    };
  },
  writeBatch: () => {
    const writes: Array<{ operation: string; reference: { path: string; id: string } }> = [];
    return {
      set: (reference: { path: string; id: string }) => {
        const operation = reference.path === 'users' ? 'release:set' : 'stage:set';
        M.events.push(operation);
        writes.push({ operation, reference });
      },
      update: (reference: { path: string; id: string }) => {
        M.events.push('stage:update');
        writes.push({ operation: 'stage:update', reference });
      },
      delete: (reference: { path: string; id: string }) => {
        M.events.push('stage:delete');
        writes.push({ operation: 'stage:delete', reference });
      },
      commit: async () => {
        const startedAt = performance.now();
        M.events.push('commit');
        if (M.commitDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, M.commitDelayMs));
        }
        if (M.failCommit) throw new Error('commit rejected');
        M.batchCommits += 1;
        if (writes.some(write => write.operation === 'release:set')) {
          M.leaseHeld = false;
        }
        M.commitLatencies.push(performance.now() - startedAt);
        return writes;
      },
    };
  },
  increment: (amount: number) => ({ __increment: amount }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
}));

import {
  collectLedgerMutationAccountIds,
  executeAuthenticatedLedgerMutation,
  loadServerLedgerTransaction,
  loadServerLedgerTransactions,
  loadServerLedgerContext,
  normalizeLedgerIntentAccountReferences,
  planCreditAuthorityChanges,
  type LedgerServerContext,
} from '../../hooks/firestore/ledgerMutationOrchestration';

const UID = 'owner';
const on = (date = '2026-08-24T12:00:00-05:00') => new Date(date);
const reportPerformance = (measurement: Record<string, unknown>) => {
  if (process.env.LEDGER_PERF_REPORT === '1') {
    console.info('[ledger-performance]', JSON.stringify(measurement));
  }
};

const transaction = (overrides: StoredDocument = {}): StoredDocument => ({
  type: 'expense',
  amount: 100,
  category: 'Prueba',
  description: 'Movimiento',
  date: on(),
  paid: true,
  accountId: 'savings',
  ...overrides,
});

beforeEach(() => {
  M.accounts.clear();
  M.transactions.clear();
  M.queries.length = 0;
  M.readRequests = 0;
  M.readDocuments = 0;
  M.events.length = 0;
  M.batchCommits = 0;
  M.commitDelayMs = 0;
  M.commitLatencies.length = 0;
  M.failCommit = false;
  M.failRenew = false;
  M.releaseError = false;
  M.leaseHeld = false;
  M.nextOperation = 0;
  M.acquisitions.length = 0;
  M.accounts.set('savings', {
    name: 'Ahorros',
    type: 'savings',
    isDefault: true,
    initialBalance: 1_000,
  });
  M.accounts.set('cash', {
    name: 'Efectivo',
    type: 'cash',
    isDefault: false,
    initialBalance: 100,
  });
  M.accounts.set('card', {
    name: 'Visa',
    type: 'credit',
    isDefault: false,
    initialBalance: 0,
    creditLimit: 5_000,
    usedCredit: 700,
    mergedAccountIds: ['old-card'],
  });
});

describe('loadServerLedgerContext', () => {
  it('queries source and destination references, deduplicates rows, and derives balances', async () => {
    M.transactions.set('income', transaction({ type: 'income', amount: 500 }));
    M.transactions.set('expense', transaction({ amount: 200 }));
    M.transactions.set('transfer', transaction({
      type: 'transfer',
      amount: 100,
      accountId: 'savings',
      toAccountId: 'cash',
    }));
    M.transactions.set('unpaid', transaction({ amount: 900, paid: false }));

    const context = await loadServerLedgerContext(UID, ['savings', 'cash']);

    expect(context.transactions.map(row => row.id).sort()).toEqual([
      'expense',
      'income',
      'transfer',
      'unpaid',
    ]);
    expect(context.authorities).toEqual(expect.arrayContaining([
      expect.objectContaining({ account: expect.objectContaining({ id: 'savings' }), currentBalance: 1_200 }),
      expect.objectContaining({ account: expect.objectContaining({ id: 'cash' }), currentBalance: 200 }),
    ]));
    expect(M.queries).toEqual(expect.arrayContaining([
      { field: 'accountId', value: 'savings' },
      { field: 'toAccountId', value: 'savings' },
      { field: 'accountId', value: 'cash' },
      { field: 'toAccountId', value: 'cash' },
    ]));
  });

  it('resolves merged credit references to the canonical account and queries every alias', async () => {
    M.transactions.set('legacy-card-row', transaction({ accountId: 'old-card' }));

    const context = await loadServerLedgerContext(UID, ['old-card']);

    expect(context.canonicalAccountId('old-card')).toBe('card');
    expect(context.accounts.map(account => account.id)).toEqual(['card']);
    expect(context.transactions.map(row => row.id)).toEqual(['legacy-card-row']);
    expect(M.queries).toEqual(expect.arrayContaining([
      { field: 'accountId', value: 'card' },
      { field: 'accountId', value: 'old-card' },
      { field: 'toAccountId', value: 'card' },
      { field: 'toAccountId', value: 'old-card' },
    ]));
  });

  it('rejects a missing requested account instead of guessing', async () => {
    await expect(loadServerLedgerContext(UID, ['missing']))
      .rejects.toThrow(/no existe/i);
  });

  it.each([
    ['amount', { amount: Number.NaN }],
    ['type', { type: 'other' }],
    ['paid', { paid: 'yes' }],
    ['account', { type: 'transfer', accountId: 42, toAccountId: 'savings' }],
    ['destination', { type: 'transfer', toAccountId: '' }],
    ['date', { date: 'not-a-date' }],
  ])('rejects malformed %s records', async (_name, overrides) => {
    M.transactions.set('invalid', transaction(overrides));

    await expect(loadServerLedgerContext(UID, ['savings']))
      .rejects.toThrow(/inválid|válid/i);
  });

  it('rejects non-finite calculated authority', async () => {
    M.accounts.set('savings', {
      ...M.accounts.get('savings'),
      initialBalance: Number.POSITIVE_INFINITY,
    });

    await expect(loadServerLedgerContext(UID, ['savings']))
      .rejects.toThrow(/saldo|autoridad/i);
  });
});

describe('ledger mutation performance baseline', () => {
  const seedHistory = (count: number, accountIds: readonly string[] = ['savings']) => {
    for (let index = 0; index < count; index += 1) {
      M.transactions.set(`history-${index}`, transaction({
        type: 'income',
        amount: 1,
        accountId: accountIds[index % accountIds.length],
      }));
    }
  };

  const percentile95 = (values: readonly number[]) => {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
  };

  it.each([499, 500, 501])(
    'keeps %i-row histories account-scoped with a constant query count',
    async historySize => {
      seedHistory(historySize);
      const startedAt = performance.now();

      const context = await loadServerLedgerContext(UID, ['savings']);
      const elapsedMs = performance.now() - startedAt;

      expect(context.transactions).toHaveLength(historySize);
      expect(M.readRequests).toBe(3);
      expect(M.readDocuments).toBe(historySize + M.accounts.size);
      expect(elapsedMs).toBeLessThan(1_000);
      reportPerformance({
        scenario: `single-account-${historySize}`,
        queryRequests: M.readRequests,
        documentReads: M.readDocuments,
        elapsedMs: Number(elapsedMs.toFixed(2)),
      });
    }
  );

  it('scopes a 501-row multi-account history to four transaction queries', async () => {
    seedHistory(501, ['savings', 'cash']);
    const startedAt = performance.now();

    const context = await loadServerLedgerContext(UID, ['savings', 'cash']);
    const elapsedMs = performance.now() - startedAt;

    expect(context.transactions).toHaveLength(501);
    expect(M.readRequests).toBe(5);
    expect(M.readDocuments).toBe(501 + M.accounts.size);
    expect(elapsedMs).toBeLessThan(1_000);
    reportPerformance({
      scenario: 'multi-account-501',
      queryRequests: M.readRequests,
      documentReads: M.readDocuments,
      elapsedMs: Number(elapsedMs.toFixed(2)),
    });
  });

  it('records p95 commit and end-to-end latency over a 501-row affected history', async () => {
    seedHistory(501);
    M.commitDelayMs = 4;
    const endToEndLatencies: number[] = [];

    for (let sample = 0; sample < 10; sample += 1) {
      const startedAt = performance.now();
      await executeAuthenticatedLedgerMutation(UID, async ({ operationId, loadContext }) => {
        const context = await loadContext(['savings']);
        return {
          intent: {
            kind: 'create' as const,
            before: [],
            after: [effect({ amount: 1 })],
            metadata: { operationId, mutationSource: 'manual' as const },
          },
          context,
          writeCount: 1,
          stage: (batch: { set(reference: { path: string; id: string }, data: unknown): void }) => {
            batch.set({ path: 'users/owner/transactions', id: `perf-${sample}` }, { amount: 1 });
          },
          result: 'committed',
        };
      });
      endToEndLatencies.push(performance.now() - startedAt);
    }

    const commitP95Ms = percentile95(M.commitLatencies);
    const endToEndP95Ms = percentile95(endToEndLatencies);
    expect(M.batchCommits).toBe(10);
    expect(commitP95Ms).toBeGreaterThan(0);
    expect(commitP95Ms).toBeLessThan(1_000);
    expect(endToEndP95Ms).toBeLessThan(1_000);
    reportPerformance({
      scenario: 'mutation-501',
      samples: 10,
      commitP95Ms: Number(commitP95Ms.toFixed(2)),
      endToEndP95Ms: Number(endToEndP95Ms.toFixed(2)),
      queryRequestsPerMutation: 3,
      documentReadsPerMutation: 501 + M.accounts.size,
    });
  });
});

describe('loadServerLedgerTransaction', () => {
  it('loads and strictly decodes a transaction by document ID', async () => {
    M.transactions.set('tx-1', transaction({ amount: 125.5 }));

    await expect(loadServerLedgerTransaction(UID, 'tx-1')).resolves.toMatchObject({
      id: 'tx-1',
      amount: 125.5,
      accountId: 'savings',
    });
  });

  it('returns null only when the transaction document is absent', async () => {
    await expect(loadServerLedgerTransaction(UID, 'missing')).resolves.toBeNull();
  });

  it('rejects a malformed transaction document', async () => {
    M.transactions.set('invalid', transaction({ amount: Number.NaN }));

    await expect(loadServerLedgerTransaction(UID, 'invalid'))
      .rejects.toThrow(/inválid|válid/i);
  });

  it('loads the complete collection with the same strict decoder', async () => {
    M.transactions.set('tx-1', transaction({ amount: 125.5 }));
    M.transactions.set('tx-2', transaction({ type: 'income', amount: 80 }));

    await expect(loadServerLedgerTransactions(UID)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'tx-1', amount: 125.5 }),
        expect.objectContaining({ id: 'tx-2', type: 'income', amount: 80 }),
      ])
    );

    M.transactions.set('invalid', transaction({ date: new Date('invalid') }));
    await expect(loadServerLedgerTransactions(UID)).rejects.toThrow(/fecha|válid/i);
  });
});

describe('collectLedgerMutationAccountIds', () => {
  it('returns sorted unique source and transfer destination IDs from both sides', () => {
    expect(collectLedgerMutationAccountIds({
      kind: 'edit',
      before: [effect({ accountId: 'savings' })],
      after: [effect({ type: 'transfer', accountId: 'cash', toAccountId: 'card' })],
    })).toEqual(['card', 'cash', 'savings']);
  });
});

describe('normalizeLedgerIntentAccountReferences', () => {
  it('maps historical aliases to one canonical before/after authority', () => {
    const intent: LedgerMutationIntent = {
      kind: 'edit',
      before: [transaction({ accountId: 'old-card' }) as never],
      after: [transaction({ accountId: 'card' }) as never],
    };

    const normalized = normalizeLedgerIntentAccountReferences(
      intent,
      referenceId => referenceId === 'old-card' ? 'card' : referenceId
    );

    expect(normalized.before[0].accountId).toBe('card');
    expect(normalized.after[0].accountId).toBe('card');
  });
});

const savingsAccount: Account = {
  id: 'savings',
  name: 'Ahorros',
  type: 'savings',
  isDefault: true,
  initialBalance: 1_000,
};

const effect = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  type: 'expense',
  amount: 100,
  category: 'Prueba',
  description: 'Movimiento',
  date: on(),
  paid: true,
  accountId: 'savings',
  ...overrides,
});

const contextFor = (
  account: Account = savingsAccount,
  currentBalance = 1_000
): LedgerServerContext => ({
  accounts: [account],
  transactions: [],
  authorities: [{ account: { id: account.id, type: account.type }, currentBalance }],
  canonicalAccountId: referenceId => referenceId,
});

const prepareCreate = (amount = 100) => async ({
  operationId,
}: {
  operationId: string;
}) => {
  M.events.push('prepare');
  return {
    intent: {
      kind: 'create' as const,
      before: [],
      after: [effect({ amount })],
      metadata: { operationId, mutationSource: 'debt' as const },
    },
    context: contextFor(),
    writeCount: 1,
    stage: (batch: { set(reference: { path: string; id: string }, data: unknown): void }) => {
      batch.set({ path: 'users/owner/transactions', id: 'tx-1' }, { amount });
    },
    result: 'committed',
  };
};

describe('executeAuthenticatedLedgerMutation', () => {
  it('passes a validated caller operation ID to the ledger while leasing a fresh attempt', async () => {
    const operationId = 'ledger-mutation:ai:message-1:create';
    const prepare = prepareCreate();

    await expect(executeAuthenticatedLedgerMutation(
      UID,
      async tools => {
        expect(tools.operationId).toBe(operationId);
        return prepare(tools);
      },
      { operationId },
    )).resolves.toBe('committed');

    expect(M.acquisitions).toEqual([{
      userId: UID,
      operationId: 'ledger-mutation:operation-1',
      kind: 'ledger-mutation',
    }]);
    expect(M.nextOperation).toBe(1);
  });

  it.each([
    'manual:wrong-prefix',
    'ledger-mutation:contains/slash',
    `ledger-mutation:${'x'.repeat(201)}`,
  ])('rejects an invalid caller operation ID before acquiring the lease: %s', async operationId => {
    await expect(executeAuthenticatedLedgerMutation(
      UID,
      prepareCreate(),
      { operationId },
    )).rejects.toThrow(/identificador/i);

    expect(M.acquisitions).toHaveLength(0);
    expect(M.events).toHaveLength(0);
  });

  it('acquires, plans, renews, stages, releases, and commits exactly once', async () => {
    await expect(
      executeAuthenticatedLedgerMutation(UID, prepareCreate())
    ).resolves.toBe('committed');

    expect(M.events).toEqual([
      'acquire',
      'prepare',
      'renew',
      'stage:set',
      'release:set',
      'commit',
    ]);
    expect(M.batchCommits).toBe(1);
  });

  it('releases safely without staging when the pure plan rejects', async () => {
    await expect(executeAuthenticatedLedgerMutation(UID, prepareCreate(1_000.01)))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

    expect(M.events).toEqual(['acquire', 'prepare', 'safe-release']);
    expect(M.batchCommits).toBe(0);
  });

  it('does not stage when renewal proves the lease was lost', async () => {
    M.failRenew = true;

    await expect(executeAuthenticatedLedgerMutation(UID, prepareCreate()))
      .rejects.toThrow('lost lease');

    expect(M.events).toEqual(['acquire', 'prepare', 'renew', 'safe-release']);
    expect(M.batchCommits).toBe(0);
  });

  it('keeps batch rejection as the primary error and attempts safe release', async () => {
    M.failCommit = true;
    M.releaseError = true;

    await expect(executeAuthenticatedLedgerMutation(UID, prepareCreate()))
      .rejects.toThrow('commit rejected');

    expect(M.events).toEqual([
      'acquire',
      'prepare',
      'renew',
      'stage:set',
      'release:set',
      'commit',
      'safe-release',
    ]);
    expect(M.batchCommits).toBe(0);
  });

  it('releases after preparation failure without creating a batch', async () => {
    await expect(executeAuthenticatedLedgerMutation(UID, async () => {
      M.events.push('prepare');
      throw new Error('prepare rejected');
    })).rejects.toThrow('prepare rejected');

    expect(M.events).toEqual(['acquire', 'prepare', 'safe-release']);
  });

  it('counts the release tombstone against the atomic write limit', async () => {
    const prepare = prepareCreate();

    await expect(executeAuthenticatedLedgerMutation(UID, async tools => ({
      ...(await prepare(tools)),
      writeCount: 40,
    }))).rejects.toThrow('límite atómico');

    expect(M.events).toEqual(['acquire', 'prepare', 'safe-release']);
    expect(M.batchCommits).toBe(0);
  });

  it('rejects a concurrent attempt and accepts an exact-balance retry after release', async () => {
    let markPrepared!: () => void;
    let releasePreparation!: () => void;
    const prepared = new Promise<void>(resolve => { markPrepared = resolve; });
    const preparationGate = new Promise<void>(resolve => { releasePreparation = resolve; });

    const holdingAttempt = executeAuthenticatedLedgerMutation(UID, async () => {
      M.events.push('prepare');
      markPrepared();
      await preparationGate;
      throw new Error('cancelled preparation');
    });
    await prepared;

    await expect(executeAuthenticatedLedgerMutation(UID, prepareCreate()))
      .rejects.toThrow(/otra operación/i);
    expect(M.batchCommits).toBe(0);

    releasePreparation();
    await expect(holdingAttempt).rejects.toThrow('cancelled preparation');
    await expect(executeAuthenticatedLedgerMutation(UID, prepareCreate(1_000)))
      .resolves.toBe('committed');

    expect(M.batchCommits).toBe(1);
  });
});

describe('planCreditAuthorityChanges', () => {
  const card = (usedCredit: number | null | undefined): Account => ({
    id: 'card',
    name: 'Visa',
    type: 'credit',
    isDefault: false,
    initialBalance: 0,
    creditLimit: 5_000,
    usedCredit: usedCredit as number | undefined,
  });
  const creditIntent = (transactionEffect: Transaction): LedgerMutationIntent => ({
    kind: 'create',
    before: [],
    after: [transactionEffect],
  });

  it.each([
    ['absent', undefined],
    ['null', null],
    ['negative', -1],
    ['non-finite', Number.POSITIVE_INFINITY],
  ])('rejects %s persisted credit authority', (_name, usedCredit) => {
    const account = card(usedCredit);
    expect(() => planCreditAuthorityChanges(
      creditIntent(effect({ type: 'expense', accountId: 'card', amount: 50 })),
      contextFor(account, 0)
    )).toThrowError(expect.objectContaining({ code: 'INVALID_ACCOUNT_AUTHORITY' }));
  });

  it('rejects a payment that exceeds persisted card debt', () => {
    const account = card(100);
    expect(() => planCreditAuthorityChanges(
      creditIntent(effect({ type: 'income', accountId: 'card', amount: 150 })),
      contextFor(account, 0)
    )).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_FUNDS' }));
  });

  it('returns the rounded persisted credit delta for a valid mutation', () => {
    const account = card(100);
    expect(planCreditAuthorityChanges(
      creditIntent(effect({ type: 'expense', accountId: 'card', amount: 50 })),
      contextFor(account, 0)
    )).toEqual([{
      accountId: 'card',
      delta: 50,
      beforeUsedCredit: 100,
      afterUsedCredit: 150,
    }]);
  });
});
