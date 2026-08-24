/**
 * useAccounts.deleteAccount en modo INVITADO (#accounts-1).
 *
 * Antes, borrar una cuenta en modo invitado solo la quitaba del array y dejaba
 * transacciones/deudas/recurrentes huérfanas, el bankAccountId colgante de las
 * TC asociadas y, si era la cuenta por defecto, al usuario sin default. Ahora
 * replica el cascade autenticado.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Account, Transaction, Debt, RecurringPayment } from '../../types/finance';

// Modo invitado: firebase no se usa, pero los módulos deben resolver.
vi.mock('../../lib/firebaseDb', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), collection: vi.fn(), query: vi.fn(), where: vi.fn(),
  getDocs: vi.fn(), getDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
  writeBatch: vi.fn(), runTransaction: vi.fn(), deleteField: vi.fn(),
}));
vi.mock('../../contexts/FirestoreContext', () => ({
  useFirestoreData: () => ({
    accounts: [], recurringPayments: [], debts: [], loading: false,
    addAccount: vi.fn(), updateAccount: vi.fn(),
  }),
}));

import { useAccounts } from '../../hooks/useAccounts';
import { useGuestLedger } from '../../hooks/useGuestLedger';
import { readGuestLedgerEnvelope } from '../../utils/guestLedger';

const seed = () => {
  localStorage.setItem('accounts', JSON.stringify([
    { id: 'a', name: 'A', type: 'savings', isDefault: true, initialBalance: 0 },
    { id: 'b', name: 'B', type: 'savings', isDefault: false, initialBalance: 0 },
    { id: 'card', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0, creditLimit: 1_000_000, bankAccountId: 'a' },
  ] as Account[]));
  localStorage.setItem('transactions', JSON.stringify([
    { id: 't1', type: 'expense', amount: 10, category: 'x', description: '', date: new Date(), paid: true, accountId: 'a' },
    { id: 't2', type: 'transfer', amount: 20, category: 'x', description: '', date: new Date(), paid: true, accountId: 'b', toAccountId: 'a' },
    { id: 't3', type: 'expense', amount: 30, category: 'x', description: '', date: new Date(), paid: true, accountId: 'b' },
  ] as Transaction[]));
  localStorage.setItem('debts', JSON.stringify([
    { id: 'd1', personName: 'Uno', type: 'borrowed', originalAmount: 10, remainingAmount: 10, isSettled: false, accountId: 'a' },
    { id: 'd2', personName: 'Dos', type: 'borrowed', originalAmount: 20, remainingAmount: 20, isSettled: false, accountId: 'b' },
  ] as Debt[]));
  localStorage.setItem('recurringPayments', JSON.stringify([
    { id: 'r1', name: 'Servicio', amount: 5, category: 'Servicios', dueDay: 1, frequency: 'monthly', isActive: true, accountId: 'a' },
  ] as RecurringPayment[]));
};

beforeEach(() => localStorage.clear());

describe('useAccounts.deleteAccount — modo invitado (#accounts-1)', () => {
  it('borra en cascada: sin huérfanos, limpia bankAccountId y reasigna la default', async () => {
    seed();
    const { result } = renderHook(() => useAccounts(null, [], vi.fn()));
    await waitFor(() => expect(result.current.accounts).toHaveLength(3));

    // allowDefaultDelete: la UI bloquea borrar la default; lo forzamos para
    // ejercitar también la reasignación de default (red de seguridad del cascade).
    await act(async () => { await result.current.deleteAccount('a', { allowDefaultDelete: true }); });

    const ledger = readGuestLedgerEnvelope().data;
    const { accounts, transactions: txs, debts, recurringPayments: recurring } = ledger;

    // Cuenta borrada; no quedan referencias colgantes.
    expect(accounts.find(a => a.id === 'a')).toBeUndefined();
    expect(txs.map(t => t.id)).toEqual(['t3']); // t1 (accountId=a) y t2 (toAccountId=a) eliminadas
    expect(debts.map(d => d.id)).toEqual(['d2']);
    expect(recurring).toHaveLength(0);

    // TC asociada: bankAccountId colgante limpiado.
    expect(accounts.find(a => a.id === 'card')?.bankAccountId).toBeUndefined();

    // Invariante de default: exactamente una, ya no la borrada.
    expect(accounts.filter(a => a.isDefault)).toHaveLength(1);
    expect(accounts.find(a => a.isDefault)?.id).toBe('b');
  });

  it('preserva transacciones ajenas creadas despues de montar los hooks', async () => {
    localStorage.setItem('accounts', JSON.stringify([
      { id: 'bank', name: 'Banco', type: 'savings', isDefault: true, initialBalance: 0 },
      { id: 'card', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0, creditLimit: 1_000_000 },
    ] as Account[]));

    const accountsHook = renderHook(() => useAccounts(null, [], vi.fn()));
    const transactionStore = renderHook(() => useGuestLedger());
    await waitFor(() => expect(accountsHook.result.current.accounts).toHaveLength(2));

    await act(async () => {
      await transactionStore.result.current.mutate(draft => {
        draft.transactions = [
          { id: 'card-payment', linkedTransactionId: 'bank-payment', type: 'income', amount: 100, category: 'Pago Crédito', description: '', date: new Date(), paid: true, accountId: 'card' },
          { id: 'bank-payment', linkedTransactionId: 'card-payment', type: 'expense', amount: 100, category: 'Pago Crédito', description: '', date: new Date(), paid: true, accountId: 'bank' },
          { id: 'bank-income', type: 'income', amount: 500, category: 'x', description: '', date: new Date(), paid: true, accountId: 'bank' },
        ];
      }, { operationId: 'seed-concurrent-transactions' });
    });

    await act(async () => { await accountsHook.result.current.deleteAccount('card'); });

    const persisted = readGuestLedgerEnvelope().data.transactions;
    expect(persisted.map(transaction => transaction.id)).toEqual(['bank-income']);
    expect(transactionStore.result.current.transactions.map(transaction => transaction.id)).toEqual(['bank-income']);
  });
});

describe('useAccounts.updateAccount — saldo objetivo en modo invitado', () => {
  it('aplica el objetivo exacto con un ajuste auditable y protege el saldo inicial', async () => {
    const account: Account = {
      id: 'savings',
      name: 'Ahorros',
      type: 'savings',
      isDefault: true,
      initialBalance: 100,
    };
    const transactions: Transaction[] = [{
      id: 'income-1',
      type: 'income',
      amount: 50,
      category: 'Otros',
      description: 'Seed',
      date: new Date('2026-08-24T12:00:00-05:00'),
      paid: true,
      accountId: 'savings',
    }];
    localStorage.setItem('accounts', JSON.stringify([account]));
    localStorage.setItem('transactions', JSON.stringify(transactions));

    const { result } = renderHook(() => useAccounts(null, transactions, vi.fn()));
    await waitFor(() => expect(result.current.accounts).toHaveLength(1));

    await act(async () => {
      await result.current.updateAccount(
        'savings',
        { name: 'Ahorro principal', initialBalance: 999_999 },
        { targetBalance: 120 }
      );
    });

    const persistedLedger = readGuestLedgerEnvelope().data;
    const persistedAccounts = persistedLedger.accounts;
    const persistedTransactions = persistedLedger.transactions;

    expect(persistedAccounts[0]).toMatchObject({
      name: 'Ahorro principal',
      initialBalance: 100,
    });
    expect(persistedTransactions).toHaveLength(2);
    expect(persistedTransactions[1]).toMatchObject({
      type: 'expense',
      amount: 30,
      accountId: 'savings',
      mutationKind: 'balance-adjustment',
      mutationSource: 'account',
      expectedBefore: 150,
      targetBalance: 120,
    });
  });

  it('keeps both account and transaction collections unchanged when persistence fails', async () => {
    const account: Account = {
      id: 'savings', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 100,
    };
    localStorage.setItem('accounts', JSON.stringify([account]));
    const { result } = renderHook(() => useAccounts(null, [], vi.fn()));
    await waitFor(() => expect(result.current.accounts).toHaveLength(1));
    const rawBefore = localStorage.getItem('moneytrack_guest_ledger_v1');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    await expect(act(async () => {
      await result.current.updateAccount('savings', { name: 'No persistido' }, { targetBalance: 80 });
    })).rejects.toThrow();

    expect(readGuestLedgerEnvelope().data.accounts[0].name).toBe('Ahorros');
    expect(readGuestLedgerEnvelope().data.transactions).toEqual([]);
    expect(localStorage.getItem('moneytrack_guest_ledger_v1')).toBe(rawBefore);
  });
});

describe('useAccounts.mergeCreditCards — deuda objetivo en modo invitado', () => {
  it('fusiona referencias y agrega un único ajuste hacia la deuda exacta', async () => {
    const guestAccounts: Account[] = [
      { id: 'bank', name: 'Banco', type: 'savings', isDefault: true, initialBalance: 0 },
      {
        id: 'source', name: 'Visa 1', type: 'credit', isDefault: false,
        initialBalance: 0, creditLimit: 1_000, usedCredit: 300, bankAccountId: 'bank',
      },
      {
        id: 'destination', name: 'Visa 2', type: 'credit', isDefault: false,
        initialBalance: 0, creditLimit: 2_000, usedCredit: 200, bankAccountId: 'bank',
      },
    ];
    const guestTransactions: Transaction[] = [
      {
        id: 'source-expense', type: 'expense', amount: 300, category: 'Compras',
        description: '', date: new Date(), paid: true, accountId: 'source',
      },
      {
        id: 'destination-expense', type: 'expense', amount: 200, category: 'Compras',
        description: '', date: new Date(), paid: true, accountId: 'destination',
      },
    ];
    localStorage.setItem('accounts', JSON.stringify(guestAccounts));
    localStorage.setItem('transactions', JSON.stringify(guestTransactions));

    const { result } = renderHook(() => useAccounts(null, guestTransactions, vi.fn()));
    await waitFor(() => expect(result.current.accounts).toHaveLength(3));

    await act(async () => {
      await result.current.mergeCreditCards({
        sourceAccountIds: ['source'],
        destination: { id: 'destination', name: 'Visa 2' },
        desiredDebt: 400,
      });
    });

    const persistedLedger = readGuestLedgerEnvelope().data;
    const persistedAccounts = persistedLedger.accounts;
    const persistedTransactions = persistedLedger.transactions;
    expect(persistedAccounts.some(account => account.id === 'source')).toBe(false);
    expect(persistedAccounts.find(account => account.id === 'destination')).toMatchObject({
      usedCredit: 400,
      mergedAccountIds: ['source'],
    });
    expect(persistedTransactions).toHaveLength(3);
    expect(persistedTransactions.find(transaction => transaction.id === 'source-expense'))
      .toMatchObject({ accountId: 'destination' });
    expect(persistedTransactions[2]).toMatchObject({
      type: 'income',
      amount: 100,
      accountId: 'destination',
      mutationKind: 'balance-adjustment',
      expectedBefore: 500,
      targetBalance: 400,
    });
  });
});
