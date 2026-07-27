import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTransactionsView } from '../../components/views/transactions/hooks/useTransactionsView';
import type { Account, Transaction } from '../../types/finance';

const account: Account = {
  id: 'account-1',
  name: 'Cuenta principal',
  type: 'savings',
  initialBalance: 0,
  isDefault: true,
};

function transaction(id: string, category: string): Transaction {
  return {
    id,
    type: 'expense',
    amount: 10_000,
    category,
    description: id,
    date: new Date('2026-07-01T12:00:00'),
    paid: true,
    accountId: account.id!,
    createdAt: new Date('2026-07-01T12:00:00'),
  };
}

describe('useTransactionsView - alcance del export', () => {
  it('aplica los filtros al historial completo, no solo a las 500 recientes', () => {
    const paginated = Array.from({ length: 500 }, (_, index) =>
      transaction(`recent-${index}`, 'Otros')
    );
    const historicalMatch = transaction('historical-match', 'Comida');

    const { result } = renderHook(() =>
      useTransactionsView({
        transactions: paginated,
        balanceTransactions: [...paginated, historicalMatch],
        balancesReady: true,
        accounts: [account],
        recurringPayments: [],
        filterCategory: 'Comida',
        filterAccount: 'all',
        dateRangePreset: 'all',
        setDateRangePreset: vi.fn(),
        customStartDate: '',
        setCustomStartDate: vi.fn(),
        customEndDate: '',
        setCustomEndDate: vi.fn(),
        deleteTransaction: vi.fn(async () => undefined),
        updateTransaction: vi.fn(async () => undefined),
      })
    );

    expect(result.current.filteredTransactions).toEqual([]);
    expect(result.current.filteredBalanceTransactions.map((item) => item.id)).toEqual([
      'historical-match',
    ]);
  });
});
