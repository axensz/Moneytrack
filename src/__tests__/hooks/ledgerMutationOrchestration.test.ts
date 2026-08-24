import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LedgerMutationIntent } from '../../types/finance';

type StoredDocument = Record<string, unknown>;
type Filter = { field: string; value: unknown };

const M = vi.hoisted(() => ({
  accounts: new Map<string, StoredDocument>(),
  transactions: new Map<string, StoredDocument>(),
  queries: [] as Filter[],
}));

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __kind: 'collection', path }),
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
    return { docs };
  },
}));

import {
  loadServerLedgerContext,
  normalizeLedgerIntentAccountReferences,
} from '../../hooks/firestore/ledgerMutationOrchestration';

const UID = 'owner';
const on = (date = '2026-08-24T12:00:00-05:00') => new Date(date);

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
