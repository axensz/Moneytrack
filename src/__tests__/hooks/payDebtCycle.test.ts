/**
 * Cuota periódica de un préstamo (useDebts.payDebtCycle).
 *
 * Rama autenticada: copia el harness de debtAtomicWrites.test.ts (mock de
 * firebase/firestore + accountOrchestration) para observar writes/commits sobre
 * los stores en memoria. Verifica que la cuota cree el movimiento Y reduzca el
 * saldo enlazados por debtId + recurringCycle en UN commit, que sea idempotente
 * por ciclo, que auto-settle a 0 y que una deuda no periódica quede intacta.
 */
import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOAN_PAYMENT_CATEGORY } from '../../config/constants';
import type { Account, Debt } from '../../types/finance';

type StoredDocument = Record<string, unknown>;
type MockRef = { __path: string; __id: string; id: string };

const M = vi.hoisted(() => ({
  users: new Map<string, StoredDocument>(),
  accounts: new Map<string, StoredDocument>(),
  debts: new Map<string, StoredDocument>(),
  transactions: new Map<string, StoredDocument>(),
  transactionCommits: 0,
  nextId: 0,
  failCommit: false,
  failAfterCommitOnce: false,
}));

const collectionStore = (path: string) => {
  if (path === 'users') return M.users;
  if (path.endsWith('/accounts')) return M.accounts;
  if (path.endsWith('/debts')) return M.debts;
  if (path.endsWith('/transactions')) return M.transactions;
  throw new Error(`Unexpected collection: ${path}`);
};

const applyUpdate = (current: StoredDocument, updates: StoredDocument) => {
  const next = { ...current };
  Object.entries(updates).forEach(([key, value]) => {
    if (value && typeof value === 'object' && '__increment' in value) {
      next[key] = Number(next[key] ?? 0) + Number((value as { __increment: number }).__increment);
    } else {
      next[key] = value;
    }
  });
  return next;
};

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));

vi.mock('../../utils/firestoreHelpers', () => ({
  checkNetworkConnection: () => true,
  safeFirestoreOperation: async (operation: () => Promise<unknown>) => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Error && error.message.includes('network')) {
        return operation();
      }
      throw error;
    }
  },
  stripUndefined: (value: StoredDocument) => Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ),
}));

vi.mock('../../hooks/firestore/accountOrchestration', () => ({
  acquireAccountOperationLock: vi.fn(async () => undefined),
  assertAtomicBatchCapacity: vi.fn(),
  createAccountOperationId: vi.fn(() => 'ledger-mutation:test-operation'),
  createAccountOperationRelease: vi.fn((id: string, kind: string) => ({
    accountOperationLock: { id, kind, releasedAt: { __serverTimestamp: true } },
  })),
  releaseAccountOperationLock: vi.fn(async () => undefined),
  renewAccountOperationLock: vi.fn(async () => undefined),
}));

vi.mock('../../hooks/firestore/transactionPaginationCache', () => ({
  publishTransactionCacheMutation: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __path: path }),
  doc: (first: { __path?: string }, path?: string, id?: string): MockRef => {
    if (typeof path === 'string') return { __path: path, __id: id as string, id: id as string };
    M.nextId += 1;
    return { __path: first.__path as string, __id: `auto-${M.nextId}`, id: `auto-${M.nextId}` };
  },
  updateDoc: async (ref: MockRef, updates: StoredDocument) => {
    const store = collectionStore(ref.__path);
    store.set(ref.__id, applyUpdate(store.get(ref.__id) ?? {}, updates));
  },
  increment: (amount: number) => ({ __increment: amount }),
  deleteField: () => ({ __deleteField: true }),
  onSnapshot: () => () => undefined,
  orderBy: () => ({}),
  query: (source: { __path: string }, ...filters: Array<{ field: string; value: unknown }>) => ({
    ...source,
    __filters: filters,
  }),
  where: (field: string, _operator: string, value: unknown) => ({ field, value }),
  getDocsFromServer: async (reference: {
    __path: string;
    __filters?: Array<{ field: string; value: unknown }>;
  }) => {
    const filters = reference.__filters ?? [];
    const docs = [...collectionStore(reference.__path).entries()]
      .filter(([, data]) => filters.every(filter => data[filter.field] === filter.value))
      .map(([id, data]) => ({ id, data: () => data }));
    return { docs };
  },
  getDocFromServer: async (ref: MockRef) => {
    const data = collectionStore(ref.__path).get(ref.__id);
    return { exists: () => Boolean(data), data: () => data ?? {} };
  },
  writeBatch: () => {
    const staged: Array<{
      kind: 'set' | 'update' | 'delete';
      ref: MockRef;
      data?: StoredDocument;
    }> = [];
    return {
      set: (ref: MockRef, data: StoredDocument) => staged.push({ kind: 'set', ref, data }),
      update: (ref: MockRef, data: StoredDocument) => staged.push({ kind: 'update', ref, data }),
      delete: (ref: MockRef) => staged.push({ kind: 'delete', ref }),
      commit: async () => {
        if (M.failCommit) throw new Error('commit rejected');
        staged.forEach(({ kind, ref, data }) => {
          const store = collectionStore(ref.__path);
          if (kind === 'delete') {
            store.delete(ref.__id);
            return;
          }
          store.set(
            ref.__id,
            kind === 'set'
              ? (data ?? {})
              : applyUpdate(store.get(ref.__id) ?? {}, data ?? {})
          );
        });
        M.transactionCommits += 1;
        if (M.failAfterCommitOnce) {
          M.failAfterCommitOnce = false;
          throw new Error('network acknowledgement lost');
        }
      },
    };
  },
  serverTimestamp: () => ({ __serverTimestamp: true }),
}));

import { useDebts } from '../../hooks/useDebts';

const UID = 'owner';
const CYCLE = '2026-2-15';

const creditAccount: Account = {
  id: 'credit',
  name: 'Visa',
  type: 'credit',
  isDefault: true,
  initialBalance: 0,
  creditLimit: 5_000_000,
  usedCredit: 0,
};

const savingsAccount: Account = {
  id: 'savings',
  name: 'Ahorros',
  type: 'savings',
  isDefault: false,
  initialBalance: 5_000_000,
};

const existingDebt = (updates: Partial<Debt> = {}): Debt => ({
  id: 'debt-1',
  createdAt: new Date('2026-01-01T12:00:00Z'),
  personName: 'Isabella',
  type: 'borrowed',
  originalAmount: 1_000_000,
  remainingAmount: 1_000_000,
  accountId: 'savings',
  isSettled: false,
  expectedPaymentDay: 15,
  isRecurringPayment: true,
  recurringPaymentAmount: 300_000,
  ...updates,
});

const seedDebt = (debt: Debt) => M.debts.set(debt.id!, { ...debt, id: undefined });

beforeEach(() => {
  M.users.clear();
  M.accounts.clear();
  M.debts.clear();
  M.transactions.clear();
  M.transactionCommits = 0;
  M.nextId = 0;
  M.failCommit = false;
  M.failAfterCommitOnce = false;
  M.accounts.set('savings', { ...savingsAccount });
  M.accounts.set('credit', { ...creditAccount });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('payDebtCycle — rama autenticada', () => {
  it('crea el movimiento de la cuota y reduce el saldo, enlazados por debtId+recurringCycle en UN commit', async () => {
    seedDebt(existingDebt());
    const { result } = renderHook(() => useDebts(UID, [], [existingDebt()], {}));

    await act(async () => {
      await result.current.payDebtCycle('debt-1', CYCLE);
    });

    expect(M.transactionCommits).toBe(1);
    expect(M.transactions.size).toBe(1);
    expect([...M.transactions.values()][0]).toMatchObject({
      type: 'expense',
      amount: 300_000,
      accountId: 'savings',
      debtId: 'debt-1',
      recurringCycle: CYCLE,
      category: LOAN_PAYMENT_CATEGORY,
      mutationSource: 'debt',
    });
    expect(M.debts.get('debt-1')).toMatchObject({
      remainingAmount: 700_000,
      isSettled: false,
    });
  });

  it('es idempotente por ciclo: un segundo pago del mismo ciclo es no-op', async () => {
    seedDebt(existingDebt());
    const { result } = renderHook(() => useDebts(UID, [], [existingDebt()], {}));

    await act(async () => {
      await result.current.payDebtCycle('debt-1', CYCLE);
      await result.current.payDebtCycle('debt-1', CYCLE);
    });

    // El segundo pago del ciclo es no-op: NO duplica el movimiento ni vuelve a
    // reducir el saldo (el commit extra solo libera el lease del intento).
    expect(M.transactions.size).toBe(1);
    expect(M.debts.get('debt-1')).toMatchObject({ remainingAmount: 700_000 });
  });

  it('acota la cuota al saldo pendiente y auto-settle a 0', async () => {
    seedDebt(existingDebt({ remainingAmount: 200_000 }));
    const { result } = renderHook(() => useDebts(UID, [], [existingDebt()], {}));

    await act(async () => {
      await result.current.payDebtCycle('debt-1', CYCLE);
    });

    expect([...M.transactions.values()][0]?.amount).toBe(200_000);
    expect(M.debts.get('debt-1')).toMatchObject({
      remainingAmount: 0,
      isSettled: true,
      settledAt: expect.any(Date),
    });
  });

  it('rechaza una deuda sin cuota periódica configurada (retrocompatibilidad)', async () => {
    seedDebt(existingDebt({ isRecurringPayment: undefined, recurringPaymentAmount: undefined }));
    const before = { ...M.debts.get('debt-1') };
    const { result } = renderHook(() => useDebts(UID, [], [existingDebt()], {}));

    await expect(result.current.payDebtCycle('debt-1', CYCLE))
      .rejects.toThrow(/cuota periódica/i);
    expect(M.transactionCommits).toBe(0);
    expect(M.transactions.size).toBe(0);
    expect(M.debts.get('debt-1')).toEqual(before);
  });

  it('no deja estado parcial si el commit falla', async () => {
    seedDebt(existingDebt());
    const before = { ...M.debts.get('debt-1') };
    M.failCommit = true;
    const { result } = renderHook(() => useDebts(UID, [], [existingDebt()], {}));

    await expect(result.current.payDebtCycle('debt-1', CYCLE))
      .rejects.toThrow('commit rejected');
    expect(M.transactionCommits).toBe(0);
    expect(M.transactions.size).toBe(0);
    expect(M.debts.get('debt-1')).toEqual(before);
  });
});
