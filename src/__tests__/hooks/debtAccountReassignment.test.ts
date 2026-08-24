import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOAN_CATEGORY, LOAN_PAYMENT_CATEGORY } from '../../config/constants';
import type { Account, Debt, Transaction } from '../../types/finance';

type Data = Record<string, unknown>;
type Ref = { __path: string; __id: string; id: string };

const M = vi.hoisted(() => ({
  accounts: new Map<string, Data>(),
  debts: new Map<string, Data>(),
  transactions: new Map<string, Data>(),
  committed: [] as Array<{ op: 'update' | 'delete' | 'set'; ref: Ref; data?: Data; options?: Data }>,
  lockAcquireCalls: 0,
  lockRenewCalls: 0,
  lockReleaseCalls: 0,
  renewShouldFail: false,
  commitShouldFail: false,
}));

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));
vi.mock('../../utils/firestoreHelpers', () => ({
  checkNetworkConnection: () => true,
  safeFirestoreOperation: (operation: () => Promise<unknown>) => operation(),
  stripUndefined: (value: Data) => value,
}));
vi.mock('../../hooks/firestore/accountOrchestration', () => ({
  createAccountOperationId: () => 'reassign:test',
  createAccountOperationRelease: (id: string, kind: string) => ({
    accountOperationLock: { id, kind, releasedAt: new Date() },
  }),
  acquireAccountOperationLock: async () => { M.lockAcquireCalls += 1; },
  renewAccountOperationLock: async () => {
    M.lockRenewCalls += 1;
    if (M.renewShouldFail) throw new Error('lease perdido');
  },
  releaseAccountOperationLock: async () => { M.lockReleaseCalls += 1; },
  assertAtomicBatchCapacity: (_name: string, writes: number) => {
    if (writes > 40) throw new Error('límite atómico');
  },
}));
vi.mock('../../hooks/firestore/transactionPaginationCache', () => ({
  publishTransactionCacheMutation: vi.fn(),
}));

const ref = (path: string, id: string): Ref => ({ __path: path, __id: id, id });
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __path: path }),
  doc: (first: { __path?: string }, path?: string, id?: string) =>
    typeof path === 'string' ? ref(path, id as string) : ref(first.__path as string, 'auto'),
  query: (collectionRef: { __path: string }) => collectionRef,
  where: () => ({}),
  orderBy: () => ({}),
  onSnapshot: () => () => undefined,
  getDocFromServer: async (documentRef: Ref) => {
    const data = M.debts.get(documentRef.__id);
    return { exists: () => Boolean(data), data: () => data ?? {} };
  },
  getDocsFromServer: async (collectionRef: { __path: string }) => {
    const store = collectionRef.__path.endsWith('/accounts') ? M.accounts : M.transactions;
    return {
      docs: [...store.entries()].map(([id, data]) => ({ id, data: () => data })),
    };
  },
  writeBatch: () => {
    const staged: typeof M.committed = [];
    return {
      update: (documentRef: Ref, data: Data) => staged.push({ op: 'update', ref: documentRef, data }),
      delete: (documentRef: Ref) => staged.push({ op: 'delete', ref: documentRef }),
      set: (documentRef: Ref, data: Data, options?: Data) => staged.push({ op: 'set', ref: documentRef, data, options }),
      commit: async () => {
        if (M.commitShouldFail) throw new Error('batch rejected');
        M.committed.push(...staged);
      },
    };
  },
  increment: (value: number) => ({ __increment: value }),
  deleteField: () => ({ __deleteField: true }),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  runTransaction: vi.fn(),
}));

import { useDebts } from '../../hooks/useDebts';

const UID = 'owner';
const savings: Account = { id: 'savings', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 };
const credit: Account = { id: 'credit', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0, usedCredit: 0, creditLimit: 5_000_000 };
const debt: Debt = { id: 'debt-1', personName: 'Laura', type: 'lent', originalAmount: 1_000_000, remainingAmount: 600_000, accountId: 'savings', isSettled: false };
const principal: Transaction = { id: 'principal', type: 'expense', amount: 1_000_000, category: LOAN_CATEGORY, description: 'Préstamo a Laura', date: new Date(), paid: true, accountId: 'savings', debtId: debt.id };
const payment: Transaction = { id: 'payment', type: 'income', amount: 400_000, category: LOAN_PAYMENT_CATEGORY, description: 'Cobro de Laura', date: new Date(), paid: true, accountId: 'savings', debtId: debt.id };

const seed = (debtData: Debt = debt, linked: Transaction[] = [principal, payment], accounts: Account[] = [savings, credit]) => {
  M.debts.set(debtData.id!, { ...debtData, id: undefined });
  linked.forEach(transaction => M.transactions.set(transaction.id!, { ...transaction, id: undefined }));
  accounts.forEach(account => M.accounts.set(account.id!, { ...account, id: undefined }));
};

const renderDebts = () => renderHook(() => useDebts(UID, [], [debt], {})).result;
const writesFor = (path: string, id: string) => M.committed.filter(write => write.ref.__path.endsWith(path) && write.ref.__id === id);

beforeEach(() => {
  M.accounts.clear();
  M.debts.clear();
  M.transactions.clear();
  M.committed.length = 0;
  M.lockAcquireCalls = 0;
  M.lockRenewCalls = 0;
  M.lockReleaseCalls = 0;
  M.renewShouldFail = false;
  M.commitShouldFail = false;
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('useDebts.reassignDebtAccount', () => {
  it('moves the principal and credit effect while leaving historical payments untouched', async () => {
    seed();
    const result = renderDebts();

    await result.current.reassignDebtAccount('debt-1', 'credit');

    expect(writesFor('/debts', 'debt-1')[0].data?.accountId).toBe('credit');
    expect(writesFor('/transactions', 'principal')[0].data).toEqual({ accountId: 'credit' });
    expect(writesFor('/transactions', 'payment')).toEqual([]);
    expect(writesFor('/accounts', 'credit')[0].data?.usedCredit).toEqual({ __increment: 1_000_000 });
    const release = writesFor('users', UID)[0];
    expect(release.data?.accountOperationLock).toMatchObject({ id: 'reassign:test', kind: 'reassign-debt-account' });
    expect(release.options).toEqual({ mergeFields: ['accountOperationLock'] });
  });

  it('removes the principal and its credit effect when selecting Sin cuenta', async () => {
    const creditDebt = { ...debt, accountId: 'credit' };
    seed(creditDebt, [{ ...principal, accountId: 'credit' }, { ...payment, accountId: 'credit' }], [{ ...credit, usedCredit: 1_000_000 }]);
    const result = renderDebts();

    await result.current.reassignDebtAccount('debt-1', undefined);

    expect(writesFor('/debts', 'debt-1')[0].data?.accountId).toEqual({ __deleteField: true });
    expect(writesFor('/transactions', 'principal')[0].op).toBe('delete');
    expect(writesFor('/accounts', 'credit')[0].data?.usedCredit).toEqual({ __increment: -1_000_000 });
  });

  it('moves the principal from credit to savings and releases the old card effect', async () => {
    const creditDebt = { ...debt, accountId: 'credit' };
    seed(creditDebt, [{ ...principal, accountId: 'credit' }, { ...payment, accountId: 'credit' }], [savings, { ...credit, usedCredit: 1_000_000 }]);
    const result = renderDebts();

    await result.current.reassignDebtAccount('debt-1', 'savings');

    expect(writesFor('/transactions', 'principal')[0].data).toEqual({ accountId: 'savings' });
    expect(writesFor('/accounts', 'credit')[0].data?.usedCredit).toEqual({ __increment: -1_000_000 });
  });

  it('changes only the debt when a legacy history has no principal', async () => {
    seed(debt, [payment]);
    const result = renderDebts();

    await result.current.reassignDebtAccount('debt-1', 'credit');

    expect(writesFor('/debts', 'debt-1')[0].data).toEqual({ accountId: 'credit' });
    expect(writesFor('/transactions', 'payment')).toEqual([]);
    expect(writesFor('/accounts', 'credit')).toEqual([]);
  });

  it('rejects ambiguous or negative-credit histories without staging a batch', async () => {
    seed(debt, [principal, { ...principal, id: 'principal-2' }]);
    const ambiguous = renderDebts();
    await expect(ambiguous.current.reassignDebtAccount('debt-1', 'credit')).rejects.toThrow(/historial/i);
    expect(M.committed).toEqual([]);

    M.transactions.clear();
    M.accounts.clear();
    M.transactions.set('principal', { ...principal, accountId: 'credit', id: undefined });
    M.accounts.set('credit', { ...credit, usedCredit: 500_000, id: undefined });
    M.accounts.set('savings', { ...savings, id: undefined });
    M.debts.set('debt-1', { ...debt, accountId: 'credit', id: undefined });
    await expect(ambiguous.current.reassignDebtAccount('debt-1', 'savings')).rejects.toThrow(/negativa|consistente/i);
    expect(M.committed).toEqual([]);
  });

  it('writes nothing and releases the lease after a lost lease or rejected batch', async () => {
    seed();
    const result = renderDebts();
    M.renewShouldFail = true;
    await expect(result.current.reassignDebtAccount('debt-1', 'credit')).rejects.toThrow('lease perdido');
    expect(M.committed).toEqual([]);
    expect(M.lockReleaseCalls).toBe(1);

    M.renewShouldFail = false;
    M.commitShouldFail = true;
    await expect(result.current.reassignDebtAccount('debt-1', 'credit')).rejects.toThrow('batch rejected');
    expect(M.committed).toEqual([]);
    expect(M.lockReleaseCalls).toBe(2);
  });
});
