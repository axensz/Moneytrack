import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  filterTransactionsForView,
  useTransactionsView,
} from '../../components/views/transactions/hooks/useTransactionsView';
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
  it('aplica los mismos filtros de cuenta, categoría, fecha y búsqueda al listado y al historial', () => {
    const options = {
      accounts: [account],
      recurringPayments: [],
      filterCategory: 'Comida',
      filterAccount: 'account-1',
      searchQuery: '  MERCADO  ',
      dateRangePreset: 'custom' as const,
      customStartDate: '2026-07-01',
      customEndDate: '2026-07-31',
    };
    const matchVisible: Transaction = {
      id: 'match-visible', type: 'expense', amount: 10_000, category: 'Comida',
      description: 'Mercado semanal', date: new Date('2026-07-01T00:00:00.000'),
      paid: true, accountId: account.id!, createdAt: new Date('2026-07-01T00:00:00.000'),
    };
    const matchHistorical: Transaction = {
      ...matchVisible, id: 'match-historical', date: new Date('2026-07-31T23:59:59.999'),
    };
    const juneMatch: Transaction = {
      ...matchVisible, id: 'june-match', date: new Date('2026-06-30T23:59:59.999'),
    };
    const augustMatch: Transaction = {
      ...matchVisible, id: 'august-match', date: new Date('2026-08-01T00:00:00.000'),
    };
    const wrongCategory: Transaction = {
      ...matchVisible, id: 'wrong-category', category: 'Otros',
    };
    const wrongAccount: Transaction = {
      ...matchVisible, id: 'wrong-account', accountId: 'account-2',
    };
    const nonMatchingSearch: Transaction = {
      ...matchVisible, id: 'non-matching-search', description: 'PanaderÃ­a semanal',
    };
    const visible = [
      matchVisible,
      juneMatch,
      augustMatch,
      wrongCategory,
      wrongAccount,
      nonMatchingSearch,
    ];
    const fullHistory = [...visible, matchHistorical];

    expect(filterTransactionsForView(visible, options).map((item) => item.id)).toEqual(['match-visible']);
    expect(filterTransactionsForView(fullHistory, options).map((item) => item.id)).toEqual([
      'match-visible',
      'match-historical',
    ]);
  });

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
