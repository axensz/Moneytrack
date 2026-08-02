import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
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

  it('refreshes the current-month flow when the local month rolls over while mounted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 31, 23, 59, 59, 999));
    try {
      const history = [
        tx('july', { type: 'income', amount: 10, category: 'Salario', date: new Date(2026, 6, 31, 12) }),
        tx('august', { type: 'income', amount: 20, category: 'Salario', date: new Date(2026, 7, 1, 12) }),
      ];
      const { result } = renderHook(() => useLedgerOverview(history, [bank], 777));

      expect(result.current.totalIncome).toBe(10);

      act(() => vi.advanceTimersByTime(1));

      expect(result.current.totalIncome).toBe(20);
    } finally { vi.useRealTimers(); }
  });

  it('rearms after an ordinary midnight so a later month-end refreshes without focus or visibility events', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 30, 23, 59, 59, 999));
    try {
      const history = [
        tx('july', { type: 'income', amount: 10, category: 'Salario', date: new Date(2026, 6, 31, 12) }),
        tx('august', { type: 'income', amount: 20, category: 'Salario', date: new Date(2026, 7, 1, 12) }),
      ];
      const { result } = renderHook(() => useLedgerOverview(history, [bank], 777));

      expect(result.current.totalIncome).toBe(10);

      act(() => vi.advanceTimersByTime(1));
      expect(result.current.totalIncome).toBe(10);

      act(() => vi.advanceTimersByTime(24 * 60 * 60 * 1000));
      expect(result.current.totalIncome).toBe(20);
    } finally { vi.useRealTimers(); }
  });

  it('refreshes the current-month flow when the app becomes visible after month rollover', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 31, 12));
    try {
      const history = [
        tx('july', { type: 'income', amount: 10, category: 'Salario', date: new Date(2026, 6, 31, 12) }),
        tx('august', { type: 'income', amount: 20, category: 'Salario', date: new Date(2026, 7, 1, 12) }),
      ];
      const { result } = renderHook(() => useLedgerOverview(history, [bank], 777));

      expect(result.current.totalIncome).toBe(10);

      vi.setSystemTime(new Date(2026, 7, 1, 12));
      act(() => document.dispatchEvent(new Event('visibilitychange')));

      expect(result.current.totalIncome).toBe(20);
    } finally { vi.useRealTimers(); }
  });

  it('cleans up its rollover timer and visibility listeners on unmount', () => {
    vi.useFakeTimers();
    const removeVisibilityListener = vi.spyOn(document, 'removeEventListener');
    const removeFocusListener = vi.spyOn(window, 'removeEventListener');
    try {
      const { unmount } = renderHook(() => useLedgerOverview([], [bank], 0));

      unmount();

      expect(removeVisibilityListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      expect(removeFocusListener).toHaveBeenCalledWith('focus', expect.any(Function));
    } finally {
      removeVisibilityListener.mockRestore();
      removeFocusListener.mockRestore();
      vi.useRealTimers();
    }
  });
});
