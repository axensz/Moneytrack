import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLedgerOverview } from '../../hooks/useGlobalStats';
import { useTransactionsView } from '../../components/views/transactions/hooks/useTransactionsView';
import type { Account, DateRangePreset, Transaction } from '../../types/finance';

const accounts: Account[] = [
  { id: 'a', name: 'Cuenta A', type: 'savings', initialBalance: 0, isDefault: true },
  { id: 'b', name: 'Cuenta B', type: 'savings', initialBalance: 0, isDefault: false },
];

const transaction = (id: string, overrides: Partial<Transaction>): Transaction => ({
  id,
  type: 'expense',
  amount: 10,
  category: 'Comida',
  description: 'Mercado',
  date: new Date(2026, 6, 15, 12),
  paid: true,
  accountId: 'a',
  ...overrides,
});

const history = [
  transaction('income', { type: 'income', amount: 100, category: 'Salario', description: 'Nómina' }),
  transaction('account-b', { accountId: 'b', amount: 20 }),
  transaction('other-category', { category: 'Transporte', amount: 30 }),
  transaction('other-date', { date: new Date(2026, 6, 10, 12), amount: 40, description: 'Panadería' }),
  transaction('matching', { amount: 10 }),
];

function FilterScopeHarness() {
  const [filterAccount, setFilterAccount] = React.useState('all');
  const [filterCategory, setFilterCategory] = React.useState('all');
  const [dateRangePreset, setDateRangePreset] = React.useState<DateRangePreset>('all');
  const [customStartDate, setCustomStartDate] = React.useState('');
  const [customEndDate, setCustomEndDate] = React.useState('');
  const overview = useLedgerOverview(history, accounts, 1_000);
  const view = useTransactionsView({
    transactions: history,
    balanceTransactions: history,
    balancesReady: true,
    accounts,
    recurringPayments: [],
    filterAccount,
    filterCategory,
    dateRangePreset,
    setDateRangePreset,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    deleteTransaction: vi.fn(async () => undefined),
    updateTransaction: vi.fn(async () => undefined),
  });
  const reset = () => {
    setFilterAccount('all');
    setFilterCategory('all');
    setDateRangePreset('all');
    setCustomStartDate('');
    setCustomEndDate('');
    view.setSearchQuery('');
  };

  return (
    <>
      <output data-testid="overview">{`${overview.totalBalance}|${overview.totalIncome}|${overview.totalExpenses}|${overview.pendingExpenses}`}</output>
      <output data-testid="visible-results">{view.filteredTransactions.length}</output>
      <button type="button" onClick={() => { reset(); setFilterAccount('a'); }}>Cuenta</button>
      <button type="button" onClick={() => { reset(); setFilterCategory('Comida'); }}>Categoría</button>
      <button type="button" onClick={() => { reset(); setDateRangePreset('custom'); setCustomStartDate('2026-07-15'); setCustomEndDate('2026-07-15'); }}>Fecha</button>
      <button type="button" onClick={() => { reset(); view.setSearchQuery('MERCADO'); }}>Búsqueda</button>
    </>
  );
}

afterEach(() => vi.useRealTimers());

describe('Transaction filter scope', () => {
  it('keeps the rendered overview stable while each real Transaction criterion changes the visible result', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 20, 12));
    render(<FilterScopeHarness />);

    const overview = screen.getByTestId('overview');
    expect(overview).toHaveTextContent('1000|100|100|0');
    expect(screen.getByTestId('visible-results')).toHaveTextContent('5');

    for (const [label, expectedCount] of [['Cuenta', '4'], ['Categoría', '3'], ['Fecha', '4'], ['Búsqueda', '3']] as const) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(screen.getByTestId('visible-results')).toHaveTextContent(expectedCount);
      expect(overview).toHaveTextContent('1000|100|100|0');
    }
  });
});
