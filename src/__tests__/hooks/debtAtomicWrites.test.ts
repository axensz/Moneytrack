import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  addDoc: async (collectionRef: { __path: string }, data: StoredDocument) => {
    M.nextId += 1;
    const id = `legacy-${M.nextId}`;
    collectionStore(collectionRef.__path).set(id, data);
    return { id };
  },
  updateDoc: async (ref: MockRef, updates: StoredDocument) => {
    const store = collectionStore(ref.__path);
    store.set(ref.__id, applyUpdate(store.get(ref.__id) ?? {}, updates));
  },
  runTransaction: async (_db: unknown, callback: (transaction: {
    get: (ref: MockRef) => Promise<{ exists: () => boolean; data: () => StoredDocument }>;
    set: (ref: MockRef, data: StoredDocument) => void;
    update: (ref: MockRef, data: StoredDocument) => void;
  }) => Promise<unknown>) => {
    const staged: Array<{ kind: 'set' | 'update'; ref: MockRef; data: StoredDocument }> = [];
    const result = await callback({
      get: async (ref) => {
        const data = collectionStore(ref.__path).get(ref.__id);
        return { exists: () => Boolean(data), data: () => data ?? {} };
      },
      set: (ref, data) => staged.push({ kind: 'set', ref, data }),
      update: (ref, data) => staged.push({ kind: 'update', ref, data }),
    });
    if (M.failCommit) throw new Error('commit rejected');
    staged.forEach(({ kind, ref, data }) => {
      const store = collectionStore(ref.__path);
      store.set(
        ref.__id,
        kind === 'set' ? data : applyUpdate(store.get(ref.__id) ?? {}, data)
      );
    });
    M.transactionCommits += 1;
    return result;
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
  initialBalance: 1_000,
};

const newDebt = (): Omit<Debt, 'id' | 'createdAt'> => ({
  personName: 'Isabella',
  type: 'lent',
  originalAmount: 1_000_000,
  remainingAmount: 1_000_000,
  accountId: 'credit',
  isSettled: false,
});

const existingDebt = (updates: Partial<Debt> = {}): Debt => ({
  id: 'debt-1',
  createdAt: new Date('2026-08-01T12:00:00Z'),
  ...newDebt(),
  ...updates,
});

beforeEach(() => {
  M.users.clear();
  M.accounts.clear();
  M.debts.clear();
  M.transactions.clear();
  M.transactionCommits = 0;
  M.nextId = 0;
  M.failCommit = false;
  M.failAfterCommitOnce = false;
  M.accounts.set('credit', { ...creditAccount });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('useDebts authenticated atomic writes', () => {
  it('rejects lent origination that would overdraw persisted savings', async () => {
    M.accounts.set('savings', { ...savingsAccount });
    const { result } = renderHook(() => useDebts(UID, [], [], {}));

    await expect(result.current.addDebt({
      ...newDebt(),
      accountId: 'savings',
      originalAmount: 1_000.01,
      remainingAmount: 1_000.01,
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

    expect(M.transactionCommits).toBe(0);
    expect(M.debts.size).toBe(0);
    expect(M.transactions.size).toBe(0);
  });

  it('rejects borrowed repayment that would overdraw persisted savings', async () => {
    M.accounts.set('savings', { ...savingsAccount });
    const debt = existingDebt({
      type: 'borrowed',
      accountId: 'savings',
      originalAmount: 1_000.01,
      remainingAmount: 1_000.01,
    });
    M.debts.set(debt.id!, { ...debt, id: undefined });
    const { result } = renderHook(() => useDebts(UID, [], [debt], {}));

    await expect(result.current.registerDebtPayment(debt.id!, 1_000.01))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

    expect(M.transactionCommits).toBe(0);
    expect(M.transactions.size).toBe(0);
    expect(M.debts.get(debt.id!)).toMatchObject({ remainingAmount: 1_000.01 });
  });

  it('creates the debt, original transaction, and usedCredit in one transaction', async () => {
    const { result } = renderHook(() => useDebts(UID, [], [], {}));

    await result.current.addDebt(newDebt());

    expect(M.transactionCommits).toBe(1);
    expect(M.debts.size).toBe(1);
    expect(M.transactions.size).toBe(1);
    expect([...M.transactions.values()][0]).toMatchObject({
      type: 'expense',
      amount: 1_000_000,
      accountId: 'credit',
      debtId: [...M.debts.keys()][0],
      operationId: 'ledger-mutation:test-operation',
      mutationKind: 'create',
      mutationSource: 'debt',
    });
    expect(M.accounts.get('credit')?.usedCredit).toBe(1_000_000);
  });

  it('treats an acknowledged-lost debt creation as one committed compound', async () => {
    M.failAfterCommitOnce = true;
    const { result } = renderHook(() => useDebts(UID, [], [], {}));

    await result.current.addDebt(newDebt());

    expect(M.transactionCommits).toBe(1);
    expect(M.debts.size).toBe(1);
    expect(M.transactions.size).toBe(1);
    expect(M.accounts.get('credit')?.usedCredit).toBe(1_000_000);
  });

  it('reduces persisted credit debt when a borrowed loan enters the card', async () => {
    M.accounts.set('credit', { ...creditAccount, usedCredit: 2_000_000 });
    const { result } = renderHook(() => useDebts(UID, [], [], {}));

    await result.current.addDebt({
      ...newDebt(),
      type: 'borrowed',
      originalAmount: 500_000,
      remainingAmount: 500_000,
    });

    expect(M.transactionCommits).toBe(1);
    expect([...M.transactions.values()][0]).toMatchObject({
      type: 'income',
      amount: 500_000,
      accountId: 'credit',
    });
    expect(M.accounts.get('credit')?.usedCredit).toBe(1_500_000);
  });

  it('keeps a debt without an account as tracking-only data', async () => {
    const { result } = renderHook(() => useDebts(UID, [], [], {}));

    await result.current.addDebt({ ...newDebt(), accountId: undefined });

    expect(M.transactionCommits).toBe(1);
    expect(M.debts.size).toBe(1);
    expect(M.transactions.size).toBe(0);
    expect(M.accounts.get('credit')?.usedCredit).toBe(0);
  });

  it('writes nothing when the associated account does not exist', async () => {
    const { result } = renderHook(() => useDebts(UID, [], [], {}));

    await expect(result.current.addDebt({ ...newDebt(), accountId: 'missing' }))
      .rejects.toThrow('no existe');

    expect(M.transactionCommits).toBe(0);
    expect(M.debts.size).toBe(0);
    expect(M.transactions.size).toBe(0);
    expect(M.accounts.get('credit')?.usedCredit).toBe(0);
  });

  it('writes nothing when Firestore rejects the atomic commit', async () => {
    M.failCommit = true;
    const { result } = renderHook(() => useDebts(UID, [], [], {}));

    await expect(result.current.addDebt(newDebt())).rejects.toThrow('commit rejected');

    expect(M.transactionCommits).toBe(0);
    expect(M.debts.size).toBe(0);
    expect(M.transactions.size).toBe(0);
    expect(M.accounts.get('credit')?.usedCredit).toBe(0);
  });

  it('atomically registers a partial payment and releases credit used by a lent loan', async () => {
    const debt = existingDebt();
    M.debts.set(debt.id!, { ...debt, id: undefined });
    M.accounts.set('credit', { ...creditAccount, usedCredit: 1_000_000 });
    const { result } = renderHook(() => useDebts(UID, [], [debt], {}));

    await result.current.registerDebtPayment(debt.id!, 400_000);

    expect(M.transactionCommits).toBe(1);
    expect(M.debts.get(debt.id!)).toMatchObject({
      remainingAmount: 600_000,
      isSettled: false,
    });
    expect([...M.transactions.values()][0]).toMatchObject({
      type: 'income',
      amount: 400_000,
      accountId: 'credit',
      debtId: debt.id,
    });
    expect(M.accounts.get('credit')?.usedCredit).toBe(600_000);
  });

  it('treats an acknowledged-lost debt payment as one committed compound', async () => {
    const debt = existingDebt({ remainingAmount: 300_000, originalAmount: 300_000 });
    M.debts.set(debt.id!, { ...debt, id: undefined });
    M.accounts.set('credit', { ...creditAccount, usedCredit: 300_000 });
    M.failAfterCommitOnce = true;
    const { result } = renderHook(() => useDebts(UID, [], [debt], {}));

    await result.current.registerDebtPayment(debt.id!, 100_000);

    expect(M.transactionCommits).toBe(1);
    expect(M.transactions.size).toBe(1);
    expect(M.debts.get(debt.id!)).toMatchObject({ remainingAmount: 200_000 });
    expect(M.accounts.get('credit')?.usedCredit).toBe(200_000);
  });

  it('deduplicates an acknowledged-lost tracking-only payment without a transaction row', async () => {
    const debt = existingDebt({
      accountId: undefined,
      remainingAmount: 300_000,
      originalAmount: 300_000,
    });
    M.debts.set(debt.id!, { ...debt, id: undefined });
    M.failAfterCommitOnce = true;
    const { result } = renderHook(() => useDebts(UID, [], [debt], {}));

    await result.current.registerDebtPayment(debt.id!, 100_000);

    expect(M.transactionCommits).toBe(1);
    expect(M.transactions.size).toBe(0);
    expect(M.debts.get(debt.id!)).toMatchObject({ remainingAmount: 200_000 });
  });

  it('clamps an overpayment against the persisted balance and settles exactly once', async () => {
    const renderedDebt = existingDebt();
    M.debts.set(renderedDebt.id!, {
      ...renderedDebt,
      id: undefined,
      remainingAmount: 250_000,
    });
    M.accounts.set('credit', { ...creditAccount, usedCredit: 1_000_000 });
    const { result } = renderHook(() => useDebts(UID, [], [renderedDebt], {}));

    await result.current.registerDebtPayment(renderedDebt.id!, 400_000);

    expect(M.debts.get(renderedDebt.id!)).toMatchObject({
      remainingAmount: 0,
      isSettled: true,
      settledAt: expect.any(Date),
    });
    expect([...M.transactions.values()][0]?.amount).toBe(250_000);
    expect(M.accounts.get('credit')?.usedCredit).toBe(750_000);
  });

  it('increases card debt when a borrowed loan is paid from that card', async () => {
    const debt = existingDebt({ type: 'borrowed' });
    M.debts.set(debt.id!, { ...debt, id: undefined });
    M.accounts.set('credit', { ...creditAccount, usedCredit: 1_000_000 });
    const { result } = renderHook(() => useDebts(UID, [], [debt], {}));

    await result.current.registerDebtPayment(debt.id!, 400_000);

    expect([...M.transactions.values()][0]).toMatchObject({
      type: 'expense',
      amount: 400_000,
    });
    expect(M.accounts.get('credit')?.usedCredit).toBe(1_400_000);
  });

  it('updates only the debt for a tracking-only payment', async () => {
    const debt = existingDebt({ accountId: undefined });
    M.debts.set(debt.id!, { ...debt, id: undefined });
    const { result } = renderHook(() => useDebts(UID, [], [debt], {}));

    await result.current.registerDebtPayment(debt.id!, debt.remainingAmount);

    expect(M.transactionCommits).toBe(1);
    expect(M.transactions.size).toBe(0);
    expect(M.debts.get(debt.id!)).toMatchObject({ remainingAmount: 0, isSettled: true });
  });

  it('writes nothing when the persisted debt disappeared before payment', async () => {
    const debt = existingDebt();
    const { result } = renderHook(() => useDebts(UID, [], [debt], {}));

    await expect(result.current.registerDebtPayment(debt.id!, 100_000))
      .rejects.toThrow('ya no existe');

    expect(M.transactionCommits).toBe(0);
    expect(M.transactions.size).toBe(0);
    expect(M.accounts.get('credit')?.usedCredit).toBe(0);
  });

  it('writes nothing when the persisted associated account disappeared', async () => {
    const debt = existingDebt({ accountId: 'missing' });
    M.debts.set(debt.id!, { ...debt, id: undefined });
    const originalDebt = { ...M.debts.get(debt.id!) };
    const { result } = renderHook(() => useDebts(UID, [], [debt], {}));

    await expect(result.current.registerDebtPayment(debt.id!, 100_000))
      .rejects.toThrow('no existe');

    expect(M.transactionCommits).toBe(0);
    expect(M.transactions.size).toBe(0);
    expect(M.debts.get(debt.id!)).toEqual(originalDebt);
  });

  it('rolls back debt, payment transaction, and credit when payment commit fails', async () => {
    const debt = existingDebt();
    M.debts.set(debt.id!, { ...debt, id: undefined });
    M.accounts.set('credit', { ...creditAccount, usedCredit: 1_000_000 });
    const originalDebt = { ...M.debts.get(debt.id!) };
    M.failCommit = true;
    const { result } = renderHook(() => useDebts(UID, [], [debt], {}));

    await expect(result.current.registerDebtPayment(debt.id!, 100_000))
      .rejects.toThrow('commit rejected');

    expect(M.transactionCommits).toBe(0);
    expect(M.transactions.size).toBe(0);
    expect(M.debts.get(debt.id!)).toEqual(originalDebt);
    expect(M.accounts.get('credit')?.usedCredit).toBe(1_000_000);
  });
});
