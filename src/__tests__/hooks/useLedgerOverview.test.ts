import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { CREDIT_PAYMENT_CATEGORY, LOAN_CATEGORY } from '../../config/constants';
import { useLedgerOverview } from '../../hooks/useGlobalStats';
import type { Account, Transaction } from '../../types/finance';

const bank: Account = { id: 'bank', name: 'Banco', type: 'savings', initialBalance: 0, isDefault: true };
const card: Account = { id: 'card', name: 'Visa', type: 'credit', initialBalance: 0, isDefault: false, creditLimit: 1_000_000 };
const tx = (id: string, overrides: Partial<Transaction>): Transaction => ({
  id, type: 'expense', amount: 100, category: 'Compras', description: id,
  date: new Date('2026-07-15T12:00:00'), paid: true, accountId: 'bank', ...overrides,
});

describe('useLedgerOverview', () => {
  it('uses the month for real flow and complete history for balance and credit debt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12));
    try {
      const history = [
        tx('june', { type: 'income', amount: 900, category: 'Salario', date: new Date(2026, 5, 30, 23, 59, 59, 999) }),
        tx('start', { type: 'income', amount: 100, category: 'Salario', date: new Date(2026, 6, 1, 0, 0, 0, 0) }),
        tx('end', { amount: 40, date: new Date(2026, 6, 31, 23, 59, 59, 999) }),
        tx('august', { amount: 500, date: new Date(2026, 7, 1, 0, 0, 0, 0) }),
        tx('transfer', { type: 'transfer', amount: 30, category: 'Transferencia' }),
        tx('payment', { amount: 30, category: CREDIT_PAYMENT_CATEGORY }),
        tx('loan', { amount: 30, category: LOAN_CATEGORY }),
        tx('unpaid-card', { amount: 200, accountId: 'card', paid: false }),
      ];
      const { result } = renderHook(() => useLedgerOverview(history, [bank, card], 777));
      expect(result.current).toEqual({ totalBalance: 777, totalIncome: 100, totalExpenses: 40, pendingExpenses: 200 });
    } finally { vi.useRealTimers(); }
  });
});
