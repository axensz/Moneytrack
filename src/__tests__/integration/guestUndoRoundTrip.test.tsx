import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Account, Debt, Transaction } from '../../types/finance';
import { LOAN_CATEGORY, LOAN_PAYMENT_CATEGORY } from '../../config/constants';

const remote = vi.hoisted(() => ({
  addTransaction: vi.fn(),
  addCreditPaymentAtomic: vi.fn(),
  addRecurringTransactionAtomic: vi.fn(),
  linkRecurringTransactionAtomic: vi.fn(),
  restoreTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  addAccount: vi.fn(),
  deleteAccount: vi.fn(),
  updateAccount: vi.fn(),
  addCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

vi.mock('../../contexts/FirestoreContext', () => ({
  useFirestoreData: () => ({
    transactions: [],
    accounts: [],
    categories: [],
    transactionBeneficiaries: [],
    recurringPayments: [],
    debts: [],
    budgets: [],
    savingsGoals: [],
    notifications: [],
    notificationPreferences: null,
    loading: false,
    error: null,
    hasMoreTransactions: false,
    loadingMoreTransactions: false,
    loadMoreTransactions: vi.fn(async () => undefined),
    transactionsServerSettled: true,
    transactionsHeadExhaustive: true,
    transactionsUnresolvedReason: null,
    transactionsRetrying: false,
    retryLoad: vi.fn(),
    ...remote,
  }),
}));

import { FinanceProvider, useFinance } from '../../contexts/FinanceContext';

const savings: Account = {
  id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 5_000,
};
const credit: Account = {
  id: 'cc', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0,
  creditLimit: 10_000, usedCredit: 500,
};
const row = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  type: 'expense',
  amount: 200,
  category: 'Mercado',
  description: 'Compra',
  date: new Date('2026-08-24T12:00:00.000Z'),
  createdAt: new Date('2026-08-24T12:01:00.000Z'),
  paid: true,
  accountId: 'sav',
  ...overrides,
});
const debt = (overrides: Partial<Debt> = {}): Debt => ({
  id: 'debt-1',
  personName: 'Ana',
  type: 'lent',
  originalAmount: 1_000,
  remainingAmount: 700,
  isSettled: false,
  accountId: 'sav',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const seed = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};
const wrapper = ({ children }: PropsWithChildren) => (
  <FinanceProvider userId={null}>{children}</FinanceProvider>
);
const renderGuest = () => renderHook(() => useFinance(), { wrapper });

beforeEach(() => {
  localStorage.clear();
  Object.values(remote).forEach(mock => mock.mockReset().mockResolvedValue(undefined));
});

describe('FinanceProvider — delete → undo invitado', () => {
  it.each(['expense', 'income'] as const)(
    'restaura una fila %s independiente con su identidad original',
    async (type) => {
      const snapshot = row({ type });
      seed('accounts', [savings]);
      seed('transactions', [snapshot]);
      const { result } = renderGuest();

      await act(async () => result.current.deleteTransaction(snapshot.id!));
      await waitFor(() => expect(result.current.transactions).toHaveLength(0));
      await act(async () => result.current.restoreTransaction(snapshot));

      await waitFor(() => expect(result.current.transactions).toHaveLength(1));
      expect(result.current.transactions[0]).toMatchObject({
        id: snapshot.id,
        type,
        mutationKind: 'restore',
        mutationSource: 'undo',
      });
    }
  );

  it('restaura un pago de deuda junto con remainingAmount y settlement', async () => {
    const payment = row({
      id: 'payment-1',
      type: 'income',
      amount: 300,
      category: LOAN_PAYMENT_CATEGORY,
      debtId: 'debt-1',
    });
    seed('accounts', [savings]);
    seed('transactions', [payment]);
    seed('debts', [debt()]);
    const { result } = renderGuest();

    await act(async () => result.current.deleteTransaction(payment.id!));
    await waitFor(() => {
      expect(result.current.transactions).toHaveLength(0);
      expect(result.current.debts[0]).toMatchObject({ remainingAmount: 1_000, isSettled: false });
    });

    await act(async () => result.current.restoreTransaction(payment));
    await waitFor(() => {
      expect(result.current.transactions[0]?.id).toBe(payment.id);
      expect(result.current.debts[0]).toMatchObject({ remainingAmount: 700, isSettled: false });
    });
  });

  it('borra el principal y la deuda, pero no permite recrear un debtId huérfano', async () => {
    const principal = row({
      id: 'principal-1',
      amount: 1_000,
      category: LOAN_CATEGORY,
      debtId: 'debt-1',
    });
    seed('accounts', [savings]);
    seed('transactions', [principal]);
    seed('debts', [debt({ remainingAmount: 1_000 })]);
    const { result } = renderGuest();

    await act(async () => result.current.deleteTransaction(principal.id!));
    await waitFor(() => {
      expect(result.current.transactions).toHaveLength(0);
      expect(result.current.debts).toHaveLength(0);
    });

    await expect(result.current.restoreTransaction(principal)).rejects.toThrow(/pr.stamo|deuda/i);
    expect(result.current.transactions).toHaveLength(0);
    expect(result.current.debts).toHaveLength(0);
  });

  it('no recrea una compra de tarjeta ni una sola mitad de un pago vinculado', async () => {
    const cardPurchase = row({ id: 'card-purchase', accountId: 'cc' });
    seed('accounts', [savings, credit]);
    seed('transactions', [cardPurchase]);
    const card = renderGuest();

    await act(async () => card.result.current.deleteTransaction(cardPurchase.id!));
    await expect(card.result.current.restoreTransaction(cardPurchase)).rejects.toThrow(/tarjeta/i);
    expect(card.result.current.transactions).toHaveLength(0);
    card.unmount();

    const bank = row({
      id: 'pay-bank',
      category: 'Pago Crédito',
      linkedTransactionId: 'pay-card',
    });
    const cardSide = row({
      id: 'pay-card',
      type: 'income',
      accountId: 'cc',
      category: 'Pago Crédito',
      linkedTransactionId: 'pay-bank',
    });
    seed('transactions', [bank, cardSide]);
    const linked = renderGuest();

    await act(async () => linked.result.current.deleteTransaction(bank.id!));
    await expect(linked.result.current.restoreTransaction(bank)).rejects.toThrow(/vinculado/i);
    expect(linked.result.current.transactions).toHaveLength(0);
  });
});
