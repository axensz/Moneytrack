import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLedgerOverview } from '../../hooks/useGlobalStats';
import { useCSVExport } from '../../hooks/useCSVExport';
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
  const { exportTransactionsCSV } = useCSVExport();
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
      <output data-testid="csv-results">{view.filteredBalanceTransactions.length}</output>
      <button type="button" onClick={() => exportTransactionsCSV(view.filteredBalanceTransactions, accounts)}>Exportar CSV real</button>
      <button type="button" onClick={() => { reset(); setFilterAccount('a'); }}>Cuenta</button>
      <button type="button" onClick={() => { reset(); setFilterCategory('Comida'); }}>Categoría</button>
      <button type="button" onClick={() => { reset(); setDateRangePreset('custom'); setCustomStartDate('2026-07-15'); setCustomEndDate('2026-07-15'); }}>Fecha</button>
      <button type="button" onClick={() => { reset(); view.setSearchQuery('MERCADO'); }}>Búsqueda</button>
      <button type="button" onClick={() => {
        reset();
        setFilterAccount('a');
        setFilterCategory('Comida');
        setDateRangePreset('custom');
        setCustomStartDate('2026-07-15');
        setCustomEndDate('2026-07-15');
        view.setSearchQuery('MERCADO');
      }}>Todos</button>
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Transaction filter scope', () => {
  it('keeps the rendered overview stable while each real Transaction criterion changes the visible result', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 20, 12));
    render(<FilterScopeHarness />);

    const overview = screen.getByTestId('overview');
    expect(overview).toHaveTextContent('1000|100|100|0');
    expect(screen.getByTestId('visible-results')).toHaveTextContent('5');
    expect(screen.getByTestId('csv-results')).toHaveTextContent('5');

    for (const [label, expectedCount] of [['Cuenta', '4'], ['Categoría', '3'], ['Fecha', '4'], ['Búsqueda', '3'], ['Todos', '1']] as const) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(screen.getByTestId('visible-results')).toHaveTextContent(expectedCount);
      expect(screen.getByTestId('csv-results')).toHaveTextContent(expectedCount);
      expect(overview).toHaveTextContent('1000|100|100|0');
    }
  });

  it('exports the actual filtered CSV without changing the General overview', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 20, 12));
    class CapturedBlob {
      readonly text: string;

      constructor(parts: unknown[]) {
        this.text = parts.join('');
      }
    }
    const blobs: CapturedBlob[] = [];
    const createObjectURL = vi.fn((blob: CapturedBlob) => {
      blobs.push(blob);
      return 'blob:csv';
    });
    vi.stubGlobal('Blob', CapturedBlob);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<FilterScopeHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV real' }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const csv = blobs[0].text;
    expect(csv).toContain('Mercado');
    expect(csv).not.toContain('NÃ³mina');
    expect(csv).not.toContain('PanaderÃ­a');
    expect(screen.getByTestId('overview')).toHaveTextContent('1000|100|100|0');
  });
});
