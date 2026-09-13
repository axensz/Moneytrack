import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../../types/finance';

type StoredDocument = Record<string, unknown>;
type MockRef = { __path: string; __id: string; id: string };

const M = vi.hoisted(() => ({
  transactions: new Map<string, StoredDocument>(),
  recurringPayments: new Map<string, StoredDocument>(),
  atomicMutations: 0,
  directDeletes: 0,
}));

const applyUpdate = (current: StoredDocument, updates: StoredDocument) => {
  const next = { ...current };
  Object.entries(updates).forEach(([key, value]) => {
    if (value && typeof value === 'object' && '__deleteField' in value) {
      delete next[key];
    } else {
      next[key] = value;
    }
  });
  return next;
};

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));
vi.mock('../../utils/firestoreHelpers', () => ({
  checkNetworkConnection: () => true,
  safeFirestoreOperation: (operation: () => Promise<unknown>) => operation(),
  stripUndefined: (value: StoredDocument) => value,
}));

vi.mock('../../hooks/firestore/ledgerMutationOrchestration', () => ({
  loadServerLedgerTransactionsByRecurringPayment: async (
    _userId: string,
    recurringPaymentId: string,
  ) => [...M.transactions.entries()]
    .filter(([, value]) => value.recurringPaymentId === recurringPaymentId)
    .map(([id, value]) => ({ ...value, id })),
  executeAuthenticatedLedgerMutation: async (
    _userId: string,
    prepare: (tools: {
      operationId: string;
      loadContext: () => Promise<{
        accounts: never[];
        transactions: never[];
        authorities: never[];
        canonicalAccountId: (value: string) => string;
      }>;
    }) => Promise<{
      stage: (batch: {
        update: (ref: MockRef, data: StoredDocument) => void;
        delete: (ref: MockRef) => void;
      }) => void;
      result: unknown;
    }>,
  ) => {
    const preparation = await prepare({
      operationId: 'ledger-mutation:test-delete-recurring',
      loadContext: async () => ({
        accounts: [],
        transactions: [],
        authorities: [],
        canonicalAccountId: (value: string) => value,
      }),
    });
    preparation.stage({
      update: (ref, data) => {
        const current = M.transactions.get(ref.__id) ?? {};
        M.transactions.set(ref.__id, applyUpdate(current, data));
      },
      delete: ref => M.recurringPayments.delete(ref.__id),
    });
    M.atomicMutations += 1;
    return preparation.result;
  },
}));

vi.mock('../../hooks/firestore/transactionPaginationCache', () => ({
  publishTransactionCacheMutation: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __path: path }),
  doc: (_db: unknown, path: string, id: string): MockRef => ({
    __path: path,
    __id: id,
    id,
  }),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: async (ref: MockRef) => {
    M.directDeletes += 1;
    M.recurringPayments.delete(ref.__id);
  },
  deleteField: () => ({ __deleteField: true }),
  onSnapshot: () => () => undefined,
  orderBy: () => ({}),
  query: (source: unknown) => source,
}));

import { useRecurringPayments } from '../../hooks/useRecurringPayments';

const linkedTransaction = (id: string, recurringPaymentId?: string): Transaction => ({
  id,
  type: 'expense',
  amount: 10,
  category: 'Servicios',
  description: id,
  date: new Date('2026-08-01T12:00:00Z'),
  paid: true,
  accountId: 'account-1',
  ...(recurringPaymentId ? { recurringPaymentId, recurringCycle: '2026-7-1' } : {}),
});

beforeEach(() => {
  M.transactions.clear();
  M.recurringPayments.clear();
  M.atomicMutations = 0;
  M.directDeletes = 0;
  M.transactions.set('linked', { ...linkedTransaction('linked', 'recurring-1'), id: undefined });
  M.transactions.set('unrelated', { ...linkedTransaction('unrelated', 'recurring-2'), id: undefined });
  M.recurringPayments.set('recurring-1', { name: 'Servicio' });
  localStorage.clear();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('useRecurringPayments.deleteRecurringPayment', () => {
  it('removes the recurring definition and all stale references atomically', async () => {
    const { result } = renderHook(() => useRecurringPayments('owner', [], []));

    await act(async () => {
      await result.current.deleteRecurringPayment('recurring-1');
    });

    expect(M.atomicMutations).toBe(1);
    expect(M.directDeletes).toBe(0);
    expect(M.recurringPayments.has('recurring-1')).toBe(false);
    expect(M.transactions.get('linked')).not.toHaveProperty('recurringPaymentId');
    expect(M.transactions.get('linked')).not.toHaveProperty('recurringCycle');
    expect(M.transactions.get('unrelated')).toMatchObject({
      recurringPaymentId: 'recurring-2',
      recurringCycle: '2026-7-1',
    });
  });
});
