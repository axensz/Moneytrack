import { describe, expect, it, vi } from 'vitest';
import type { Debt, Transaction } from '../../types/finance';
import { LOAN_CATEGORY, LOAN_PAYMENT_CATEGORY } from '../../config/constants';
import { executeDebtAwareTransactionDelete } from '../../utils/debtAwareTransactionDelete';

const row = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1', type: 'expense', amount: 200, category: 'Otros', description: 'x',
  date: new Date('2026-08-24'), paid: true, accountId: 'sav', ...overrides,
});
const debt: Debt = {
  id: 'debt-1', personName: 'Ana', type: 'lent', originalAmount: 1_000,
  remainingAmount: 700, isSettled: false, accountId: 'sav', createdAt: new Date(),
};

describe('executeDebtAwareTransactionDelete', () => {
  it('routes an authenticated principal through the debt cascade even with stale empty debts', async () => {
    const principal = row({ debtId: 'debt-1', category: LOAN_CATEGORY });
    const deleteTransaction = vi.fn();
    const deleteDebt = vi.fn(async () => undefined);

    const deleted = await executeDebtAwareTransactionDelete('tx-1', {
      userId: 'user-1', transactions: [principal], debts: [],
      deleteTransaction, deleteDebt, updateDebt: vi.fn(),
    });

    expect(deleteDebt).toHaveBeenCalledWith('debt-1');
    expect(deleteTransaction).not.toHaveBeenCalled();
    expect(deleted).toBe(principal);
  });

  it('lets the authenticated writer use server authority for a payment when local debts are stale', async () => {
    const stale = row({ debtId: 'debt-1', category: LOAN_PAYMENT_CATEGORY });
    const authoritative = { ...stale, amount: 250 };
    const deleteTransaction = vi.fn(async () => authoritative);
    const updateDebt = vi.fn();

    const deleted = await executeDebtAwareTransactionDelete('tx-1', {
      userId: 'user-1', transactions: [stale], debts: [],
      deleteTransaction, deleteDebt: vi.fn(), updateDebt,
    });

    expect(deleted).toBe(authoritative);
    expect(updateDebt).not.toHaveBeenCalled();
  });

  it('fails closed for an orphan guest debt row', async () => {
    const payment = row({ debtId: 'debt-1', category: LOAN_PAYMENT_CATEGORY });
    const deleteTransaction = vi.fn();

    await expect(executeDebtAwareTransactionDelete('tx-1', {
      userId: null, transactions: [payment], debts: [],
      deleteTransaction, deleteDebt: vi.fn(), updateDebt: vi.fn(),
    })).rejects.toThrow(/concilia|deuda asociada/i);
    expect(deleteTransaction).not.toHaveBeenCalled();
  });

  it('uses the deleted guest payment snapshot to reopen the debt', async () => {
    const stale = row({
      type: 'income', amount: 200, debtId: 'debt-1', category: LOAN_PAYMENT_CATEGORY,
    });
    const authoritative = { ...stale, amount: 250 };
    const updateDebt = vi.fn(async () => undefined);

    const deleted = await executeDebtAwareTransactionDelete('tx-1', {
      userId: null, transactions: [stale], debts: [debt],
      deleteTransaction: vi.fn(async () => authoritative),
      deleteDebt: vi.fn(), updateDebt,
    });

    expect(deleted).toBe(authoritative);
    expect(updateDebt).toHaveBeenCalledWith('debt-1', {
      remainingAmount: 950,
      isSettled: false,
      settledAt: undefined,
    });
  });
});
