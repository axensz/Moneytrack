import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Transaction } from '../../types/finance';

const state = vi.hoisted(() => ({
  updates: [] as Array<{ path: string; data: Record<string, unknown> }>,
  documents: new Map<string, Transaction>(),
}));

vi.mock('../../lib/firebaseDb', () => ({ db: { mocked: true } }));
vi.mock('../../utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  query: (value: unknown) => value,
  where: vi.fn(),
  doc: (_db: unknown, path: string, id: string) => ({ path: `${path}/${id}`, id }),
  getDocs: async () => ({
    docs: Array.from(state.documents.values()).map(transaction => ({
      id: transaction.id,
      data: () => transaction,
    })),
  }),
  updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    state.updates.push({ path: ref.path, data });
  },
  runTransaction: async (_db: unknown, callback: (transaction: {
    get: (ref: { path: string; id: string }) => Promise<unknown>;
    update: (ref: { path: string }, data: Record<string, unknown>) => void;
  }) => Promise<unknown>) => callback({
    get: async ref => {
      const transaction = state.documents.get(ref.id);
      return {
        id: ref.id,
        exists: () => Boolean(transaction),
        data: () => transaction,
      };
    },
    update: (ref, data) => state.updates.push({ path: ref.path, data }),
  }),
}));

import { useCreditMigration } from '../../hooks/firestore/useCreditMigration';

const card: Account = {
  id: 'card', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0,
  usedCredit: 100_000, creditDebtModelVersion: 2,
};

describe('useCreditMigration — pares históricos autenticados', () => {
  beforeEach(() => {
    state.updates = [];
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
  });

  it('revalida y escribe ambos vínculos antes de marcar la versión', async () => {
    renderHook(() => useCreditMigration('user-1', [card]));

    await waitFor(() => {
      expect(state.updates).toContainEqual({
        path: 'users/user-1/transactions/credit-old',
        data: { linkedTransactionId: 'bank-old' },
      });
      expect(state.updates).toContainEqual({
        path: 'users/user-1/transactions/bank-old',
        data: { linkedTransactionId: 'credit-old' },
      });
      expect(state.updates.at(-1)).toEqual({
        path: 'users/user-1/accounts/card',
        data: { paymentPairModelVersion: 1 },
      });
    });
  });
});
