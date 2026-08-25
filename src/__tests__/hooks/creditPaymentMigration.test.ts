import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Transaction } from '../../types/finance';

const state = vi.hoisted(() => ({
  updates: [] as Array<{ path: string; data: Record<string, unknown> }>,
  documents: new Map<string, Transaction>(),
  accounts: new Map<string, Record<string, unknown>>(),
  serverReads: 0,
  batchCommits: 0,
  failCommit: false,
}));

vi.mock('../../lib/firebaseDb', () => ({ db: { mocked: true } }));
vi.mock('../../utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('../../hooks/firestore/accountOrchestration', () => ({
  acquireAccountOperationLock: vi.fn(async () => undefined),
  assertAtomicBatchCapacity: vi.fn(),
  createAccountOperationId: vi.fn(() => 'ledger-mutation:migration-test'),
  createAccountOperationRelease: vi.fn((id: string, kind: string) => ({
    accountOperationLock: { id, kind, releasedAt: new Date('2026-08-24') },
  })),
  releaseAccountOperationLock: vi.fn(async () => undefined),
  renewAccountOperationLock: vi.fn(async () => undefined),
}));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  query: (
    source: { path: string },
    ...filters: Array<{ field: string; value: unknown }>
  ) => ({ ...source, filters }),
  where: (field: string, _operator: string, value: unknown) => ({ field, value }),
  doc: (
    first: { path?: string },
    path: string,
    id?: string
  ) => id
    ? { path: `${path}/${id}`, collectionPath: path, id }
    : { path: `${first.path}/${path}`, collectionPath: first.path, id: path },
  getDocsFromServer: async (reference: {
    path: string;
    filters?: Array<{ field: string; value: unknown }>;
  }) => {
    state.serverReads += 1;
    const values = reference.path.endsWith('/accounts')
      ? Array.from(state.accounts.entries()).map(([id, data]) => ({ id, data }))
      : Array.from(state.documents.entries()).map(([id, data]) => ({ id, data }));
    const filtered = values.filter(({ data }) =>
      (reference.filters ?? []).every(filter =>
        (data as unknown as Record<string, unknown>)[filter.field] === filter.value
      )
    );
    return { docs: filtered.map(({ id, data }) => ({ id, data: () => data })) };
  },
  getDocFromServer: async (ref: { id: string; collectionPath: string }) => {
    const data = ref.collectionPath.endsWith('/accounts')
      ? state.accounts.get(ref.id)
      : state.documents.get(ref.id);
    return { id: ref.id, exists: () => Boolean(data), data: () => data ?? {} };
  },
  writeBatch: () => {
    const staged: Array<{
      ref: { path: string; collectionPath: string; id: string };
      data: Record<string, unknown>;
    }> = [];
    return {
      set: (
        ref: { path: string; collectionPath: string; id: string },
        data: Record<string, unknown>
      ) => staged.push({ ref, data }),
      update: (
        ref: { path: string; collectionPath: string; id: string },
        data: Record<string, unknown>
      ) => staged.push({ ref, data }),
      commit: async () => {
        if (state.failCommit) throw new Error('migration batch rejected');
        staged.forEach(({ ref, data }) => {
          if (ref.collectionPath === 'users') return;
          state.updates.push({ path: ref.path, data });
          if (ref.collectionPath.endsWith('/accounts')) {
            state.accounts.set(ref.id, { ...(state.accounts.get(ref.id) ?? {}), ...data });
          } else {
            state.documents.set(ref.id, {
              ...state.documents.get(ref.id)!,
              ...data,
            } as Transaction);
          }
        });
        state.batchCommits += 1;
      },
    };
  },
}));

import {
  migrateServerCreditAccount,
  useCreditMigration,
} from '../../hooks/firestore/useCreditMigration';
import { logger } from '../../utils/logger';

const card: Account = {
  id: 'card', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0,
  usedCredit: 100_000, creditDebtModelVersion: 2,
};

const seedHistoricalPair = () => {
  const date = new Date('2026-05-12T17:00:00.000Z');
  state.documents = new Map([
    ['credit-old', {
      id: 'credit-old', type: 'income', amount: 100_000, category: 'Pago Crédito',
      description: 'Mayo', date, paid: true, accountId: 'card',
    }],
    ['bank-old', {
      id: 'bank-old', type: 'expense', amount: 100_000, category: 'Pago Crédito',
      description: 'Pago a Visa: Mayo', date, paid: true, accountId: 'savings',
    }],
  ]);
};

describe('useCreditMigration — autoridad y pares históricos autenticados', () => {
  beforeEach(() => {
    state.updates = [];
    state.serverReads = 0;
    state.batchCommits = 0;
    state.failCommit = false;
    vi.mocked(logger.error).mockClear();
    state.accounts = new Map([['card', { ...card, id: undefined }]]);
    seedHistoricalPair();
  });

  it('revalida y escribe ambos vínculos antes de marcar la versión', async () => {
    renderHook(() => useCreditMigration('user-1', [card]));

    await waitFor(() => {
      expect(state.updates).toContainEqual({
        path: 'users/user-1/transactions/credit-old',
        data: expect.objectContaining({
          linkedTransactionId: 'bank-old',
          mutationKind: 'migration',
          mutationSource: 'migration',
        }),
      });
      expect(state.updates).toContainEqual({
        path: 'users/user-1/transactions/bank-old',
        data: expect.objectContaining({ linkedTransactionId: 'credit-old' }),
      });
      expect(state.updates.at(-1)).toEqual({
        path: 'users/user-1/accounts/card',
        data: { paymentPairModelVersion: 1 },
      });
      expect(state.batchCommits).toBe(1);
    });
  });

  it('no migra desde un render obsoleto si el servidor ya tiene las versiones vigentes', async () => {
    state.accounts.set('card', {
      ...card,
      id: undefined,
      paymentPairModelVersion: 1,
    });

    renderHook(() => useCreditMigration('user-1', [card]));

    await waitFor(() => expect(state.serverReads).toBeGreaterThan(0));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(state.updates).toHaveLength(0);
    expect(state.batchCommits).toBe(1);
  });

  it('repara usedCredit inválido desde el historial confirmado aunque la versión ya sea actual', async () => {
    state.accounts.set('card', {
      ...card,
      id: undefined,
      usedCredit: undefined,
      paymentPairModelVersion: 1,
    });
    state.documents = new Map([
      ['charge', {
        id: 'charge', type: 'expense', amount: 250_000, category: 'Compras',
        description: 'Compra', date: new Date('2026-05-01'), paid: true, accountId: 'card',
      }],
      ['payment', {
        id: 'payment', type: 'income', amount: 100_000, category: 'Pago Crédito',
        description: 'Pago', date: new Date('2026-05-02'), paid: true, accountId: 'card',
      }],
    ]);

    const result = await migrateServerCreditAccount('user-1', 'card');

    expect(result.usedCredit).toBe(150_000);
    expect(state.updates).toContainEqual({
      path: 'users/user-1/accounts/card',
      data: {
        usedCredit: 150_000,
        creditDebtModelVersion: 2,
      },
    });
  });

  it('si falla el batch no persiste enlaces ni versión parcial', async () => {
    state.failCommit = true;

    await expect(migrateServerCreditAccount('user-1', 'card'))
      .rejects.toThrow('migration batch rejected');

    expect(state.updates).toHaveLength(0);
    expect(state.documents.get('credit-old')?.linkedTransactionId).toBeUndefined();
    expect(state.accounts.get('card')?.paymentPairModelVersion).toBeUndefined();
    expect(state.batchCommits).toBe(0);
  });

  it('reintenta el candidato después de un batch fallido sin duplicar enlaces', async () => {
    state.failCommit = true;
    const { rerender } = renderHook(
      ({ cards }) => useCreditMigration('user-1', cards),
      { initialProps: { cards: [card] } }
    );
    await waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1));
    expect(state.updates).toHaveLength(0);

    state.failCommit = false;
    rerender({ cards: [{ ...card }] });

    await waitFor(() => expect(state.batchCommits).toBe(1));
    expect(state.updates.filter(update => update.path.includes('/transactions/')))
      .toHaveLength(2);
  });

  it('rechaza una fila de servidor malformada sin marcar la versión', async () => {
    state.documents.set('malformed', {
      id: 'malformed',
      type: 'expense',
      amount: Number.NaN,
      category: 'Pago Crédito',
      description: 'Inválida',
      date: new Date('2026-05-12'),
      paid: true,
      accountId: 'savings',
    });

    await expect(migrateServerCreditAccount('user-1', 'card'))
      .rejects.toMatchObject({ code: 'INVALID_ACCOUNT_AUTHORITY' });
    expect(state.updates).toHaveLength(0);
    expect(state.accounts.get('card')?.paymentPairModelVersion).toBeUndefined();
  });
});
