/**
 * Enlace de una transacción EXISTENTE como pago de préstamo (useDebts.linkDebtPayment).
 *
 * Rama autenticada: copia el harness de debtAtomicWrites.test.ts (mock de
 * firebase/firestore + accountOrchestration) para observar writes/commits sobre
 * los stores en memoria. Rama invitado: copia el patrón de registerDebtPayment.test.ts
 * (userId=null, mutaciones sobre el ledger local).
 */
import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOAN_PAYMENT_CATEGORY } from '../../config/constants';
import type { Account, Debt, Transaction } from '../../types/finance';
import {
  GUEST_LEDGER_STORAGE_KEY,
  createGuestLedgerEnvelope,
  readGuestLedgerEnvelope,
} from '../../utils/guestLedger';

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
  createdAt: new Date('2026-08-01T12:00:00Z'),
  personName: 'Isabella',
  type: 'lent',
  originalAmount: 1_000_000,
  remainingAmount: 1_000_000,
  accountId: 'savings',
  isSettled: false,
  ...updates,
});

const existingTransaction = (overrides: Partial<Transaction> = {}): StoredDocument => ({
  type: 'income',
  amount: 400_000,
  category: 'Otros',
  description: 'Cobro suelto',
  date: new Date('2026-08-10T12:00:00Z'),
  paid: true,
  accountId: 'savings',
  ...overrides,
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

describe('linkDebtPayment — rama autenticada', () => {
  it('enlaza un movimiento existente: set debtId, reduce saldo, UN commit, NO crea transacción', async () => {
    seedDebt(existingDebt());
    M.transactions.set('tx-1', existingTransaction());
    const { result } = renderHook(() => useDebts(UID, [], [existingDebt()], {}));

    await act(async () => {
      await result.current.linkDebtPayment('debt-1', 'tx-1');
    });

    expect(M.transactionCommits).toBe(1);
    expect(M.transactions.size).toBe(1);
    expect(M.transactions.get('tx-1')).toMatchObject({
      debtId: 'debt-1',
      category: LOAN_PAYMENT_CATEGORY,
      mutationSource: 'debt',
    });
    expect(M.debts.get('debt-1')).toMatchObject({
      remainingAmount: 600_000,
      isSettled: false,
    });
  });

  it('auto-settle a 0 cuando el monto iguala el saldo pendiente', async () => {
    seedDebt(existingDebt({ remainingAmount: 400_000 }));
    M.transactions.set('tx-1', existingTransaction({ amount: 400_000 }));
    const { result } = renderHook(() => useDebts(UID, [], [existingDebt()], {}));

    await act(async () => {
      await result.current.linkDebtPayment('debt-1', 'tx-1');
    });

    expect(M.debts.get('debt-1')).toMatchObject({
      remainingAmount: 0,
      isSettled: true,
      settledAt: expect.any(Date),
    });
  });

  it('es idempotente: repetir el enlace del mismo pago no reduce otra vez el saldo', async () => {
    seedDebt(existingDebt());
    M.transactions.set('tx-1', existingTransaction());
    const { result } = renderHook(() => useDebts(UID, [], [existingDebt()], {}));

    await act(async () => {
      await result.current.linkDebtPayment('debt-1', 'tx-1');
      await result.current.linkDebtPayment('debt-1', 'tx-1');
    });

    expect(M.transactionCommits).toBe(1);
    expect(M.debts.get('debt-1')).toMatchObject({ remainingAmount: 600_000 });
  });

  it('rechaza enlazar una transacción que ya pertenece a OTRA deuda', async () => {
    seedDebt(existingDebt());
    M.transactions.set('tx-1', existingTransaction({ debtId: 'otra-deuda' }));
    const { result } = renderHook(() => useDebts(UID, [], [existingDebt()], {}));

    await expect(result.current.linkDebtPayment('debt-1', 'tx-1'))
      .rejects.toThrow(/otro préstamo/i);
    expect(M.transactionCommits).toBe(0);
    expect(M.debts.get('debt-1')).toMatchObject({ remainingAmount: 1_000_000 });
  });

  it('rechaza enlazar una transacción de un pago periódico', async () => {
    seedDebt(existingDebt());
    M.transactions.set('tx-1', existingTransaction({ recurringPaymentId: 'rec-1' }));
    const { result } = renderHook(() => useDebts(UID, [], [existingDebt()], {}));

    await expect(result.current.linkDebtPayment('debt-1', 'tx-1'))
      .rejects.toThrow(/pago periódico/i);
    expect(M.transactionCommits).toBe(0);
  });

  it('rechaza enlazar una mitad de pago vinculado (linkedTransactionId)', async () => {
    seedDebt(existingDebt());
    M.transactions.set('tx-1', existingTransaction({ linkedTransactionId: 'tx-9' }));
    const { result } = renderHook(() => useDebts(UID, [], [existingDebt()], {}));

    await expect(result.current.linkDebtPayment('debt-1', 'tx-1'))
      .rejects.toThrow(/pago vinculado/i);
    expect(M.transactionCommits).toBe(0);
  });

  it('rechaza un type incorrecto para la dirección del préstamo', async () => {
    seedDebt(existingDebt());
    M.transactions.set('tx-1', existingTransaction({ type: 'expense' }));
    const { result } = renderHook(() => useDebts(UID, [], [existingDebt()], {}));

    await expect(result.current.linkDebtPayment('debt-1', 'tx-1'))
      .rejects.toThrow(/dirección del préstamo/i);
    expect(M.transactionCommits).toBe(0);
  });

  it('rechaza un monto mayor al saldo pendiente', async () => {
    seedDebt(existingDebt({ remainingAmount: 200_000 }));
    M.transactions.set('tx-1', existingTransaction({ amount: 400_000 }));
    const { result } = renderHook(() => useDebts(UID, [], [existingDebt()], {}));

    await expect(result.current.linkDebtPayment('debt-1', 'tx-1'))
      .rejects.toThrow(/supera el saldo pendiente/i);
    expect(M.transactionCommits).toBe(0);
  });

  it('rechaza una transacción de otra cuenta', async () => {
    seedDebt(existingDebt());
    M.transactions.set('tx-1', existingTransaction({ accountId: 'credit' }));
    const { result } = renderHook(() => useDebts(UID, [], [existingDebt()], {}));

    await expect(result.current.linkDebtPayment('debt-1', 'tx-1'))
      .rejects.toThrow(/cuenta del préstamo/i);
    expect(M.transactionCommits).toBe(0);
  });

  it('no deja estado parcial si el commit falla', async () => {
    seedDebt(existingDebt());
    M.transactions.set('tx-1', existingTransaction());
    const originalTx = { ...M.transactions.get('tx-1') };
    M.failCommit = true;
    const { result } = renderHook(() => useDebts(UID, [], [existingDebt()], {}));

    await expect(result.current.linkDebtPayment('debt-1', 'tx-1'))
      .rejects.toThrow('commit rejected');
    expect(M.transactionCommits).toBe(0);
    expect(M.transactions.get('tx-1')).toEqual(originalTx);
    expect(M.debts.get('debt-1')).toMatchObject({ remainingAmount: 1_000_000 });
  });
});

// ── Rama invitado ────────────────────────────────────────────────────────────

const GUEST_ACCOUNTS: Account[] = [
  { id: 'acc-1', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 5_000_000 },
];

const guestDebt = (overrides: Partial<Debt> = {}): Debt => ({
  id: 'd1',
  personName: 'Juan',
  type: 'lent',
  originalAmount: 1000,
  remainingAmount: 1000,
  accountId: 'acc-1',
  isSettled: false,
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const guestTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  type: 'income',
  amount: 300,
  category: 'Otros',
  description: 'Cobro suelto',
  date: new Date('2026-02-01'),
  paid: true,
  accountId: 'acc-1',
  ...overrides,
});

const seedGuest = (debts: Debt[], transactions: Transaction[]) => {
  const envelope = createGuestLedgerEnvelope({
    accounts: GUEST_ACCOUNTS,
    transactions,
    debts,
    recurringPayments: [],
  }, { revision: 1, commitId: 'test-seed', committedAt: '2026-08-24T12:00:00.000Z' });
  localStorage.setItem(GUEST_LEDGER_STORAGE_KEY, JSON.stringify(envelope));
};

describe('linkDebtPayment — rama invitado', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('enlaza la transacción, reduce el saldo y NO crea otra fila', async () => {
    seedGuest([guestDebt()], [guestTransaction()]);
    const { result } = renderHook(() => useDebts(null, [], undefined, { accounts: GUEST_ACCOUNTS }));

    await act(async () => {
      await result.current.linkDebtPayment('d1', 't1');
    });

    const persisted = readGuestLedgerEnvelope().data;
    expect(persisted.transactions).toHaveLength(1);
    expect(persisted.transactions[0]).toMatchObject({
      id: 't1',
      debtId: 'd1',
      category: LOAN_PAYMENT_CATEGORY,
      mutationSource: 'debt',
    });
    expect(result.current.debts[0].remainingAmount).toBe(700);
  });

  it('es idempotente: repetir el enlace no vuelve a reducir el saldo', async () => {
    seedGuest([guestDebt()], [guestTransaction()]);
    const { result } = renderHook(() => useDebts(null, [], undefined, { accounts: GUEST_ACCOUNTS }));

    await act(async () => {
      await result.current.linkDebtPayment('d1', 't1');
      await result.current.linkDebtPayment('d1', 't1');
    });

    expect(result.current.debts[0].remainingAmount).toBe(700);
    expect(readGuestLedgerEnvelope().data.transactions).toHaveLength(1);
  });

  it('auto-settle a 0 y rechaza una transacción ya enlazada a otra deuda', async () => {
    seedGuest(
      [guestDebt({ remainingAmount: 300 })],
      [guestTransaction()],
    );
    const settle = renderHook(() => useDebts(null, [], undefined, { accounts: GUEST_ACCOUNTS })).result;
    await act(async () => {
      await settle.current.linkDebtPayment('d1', 't1');
    });
    expect(settle.current.debts[0]).toMatchObject({ remainingAmount: 0, isSettled: true });

    localStorage.clear();
    seedGuest(
      [guestDebt(), guestDebt({ id: 'd2' })],
      [guestTransaction({ debtId: 'd2', category: LOAN_PAYMENT_CATEGORY })],
    );
    const rejected = renderHook(() => useDebts(null, [], undefined, { accounts: GUEST_ACCOUNTS })).result;
    await expect(rejected.current.linkDebtPayment('d1', 't1')).rejects.toThrow(/otro préstamo/i);
    expect(rejected.current.debts.find(d => d.id === 'd1')?.remainingAmount).toBe(1000);
  });
});
