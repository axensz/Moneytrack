/**
 * useTransactionsView — búsqueda insensible a acentos (#tx-search) y rango custom
 * con fechas invertidas (#tx-range).
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Account, Transaction } from '../../types/finance';

vi.mock('../../utils/toastHelpers', () => ({
  showToast: { error: vi.fn(), success: vi.fn() },
}));

import { useTransactionsView } from '../../components/views/transactions/hooks/useTransactionsView';

const savings: Account = { id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 };

type Params = Parameters<typeof useTransactionsView>[0];

const makeParams = (overrides: Record<string, unknown> = {}): Params => {
  const transactions = (overrides.transactions as Transaction[]) ?? [];
  return {
    transactions,
    accounts: [savings],
    recurringPayments: [],
    filterCategory: 'all',
    filterAccount: 'all',
    dateRangePreset: 'all',
    setDateRangePreset: vi.fn(),
    customStartDate: '',
    setCustomStartDate: vi.fn(),
    customEndDate: '',
    setCustomEndDate: vi.fn(),
    deleteTransaction: vi.fn(async () => {}),
    updateTransaction: vi.fn(async () => {}),
    balanceTransactions: transactions,
    balancesReady: true,
    ...overrides,
  } as Params;
};

const tx = (id: string, o: Partial<Transaction> = {}): Transaction => ({
  id, type: 'expense', amount: 1000, category: 'Otros', description: '',
  date: new Date('2026-06-15T12:00:00'), paid: true, accountId: 'sav', ...o,
});

describe('useTransactionsView — búsqueda y rango', () => {
  it('la búsqueda ignora acentos: "alimentacion" encuentra "Alimentación" (#tx-search)', () => {
    const params = makeParams({ transactions: [tx('a1', { category: 'Alimentación' }), tx('b1', { category: 'Transporte' })] });
    const { result } = renderHook(() => useTransactionsView(params));

    act(() => result.current.setSearchQuery('alimentacion'));

    expect(result.current.filteredTransactions.map(t => t.id)).toEqual(['a1']);
  });

  it('rango custom con fechas invertidas (Desde > Hasta) intercambia en vez de devolver 0 (#tx-range)', () => {
    const params = makeParams({
      transactions: [tx('m1', { date: new Date('2026-06-15T12:00:00') })],
      dateRangePreset: 'custom',
      customStartDate: '2026-06-20', // Desde POSTERIOR a Hasta
      customEndDate: '2026-06-10',
    });
    const { result } = renderHook(() => useTransactionsView(params));

    // 2026-06-15 cae dentro del rango [10, 20] tras intercambiar.
    expect(result.current.filteredTransactions.map(t => t.id)).toEqual(['m1']);
  });
});
