import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatsView } from '../../components/views/stats/StatsView';
import { UIPreferencesProvider } from '../../contexts/UIPreferencesContext';

vi.mock('../../hooks/useFinanceSelectors', () => ({
  useTransactionDomain: () => ({
    transactions: [{
      id: 'visible-transaction-only', type: 'expense', amount: 20, category: 'Comida', description: 'Actual',
      date: new Date(2026, 6, 15), paid: true, accountId: 'account',
    }],
    balanceTransactions: [
      {
        id: 'history-only', type: 'expense', amount: 100, category: 'Comida', description: 'Histórico',
        date: new Date(2020, 0, 15), paid: true, accountId: 'account',
      },
      {
        id: 'visible-transaction-only', type: 'expense', amount: 20, category: 'Comida', description: 'Actual',
        date: new Date(2026, 6, 15), paid: true, accountId: 'account',
      },
    ],
  }),
  useAccountDomain: () => ({ accounts: [{ id: 'account', name: 'Cuenta', type: 'savings', initialBalance: 0, isDefault: true }] }),
  useFormatCurrency: () => (value: number) => `$${value}`,
}));

describe('StatsView scopes', () => {
  it('shows real period labels and keeps complete-history charts independent from the Transaction result', () => {
    render(<UIPreferencesProvider><StatsView onGoToTransactions={() => {}} /></UIPreferencesProvider>);

    expect(screen.getAllByText('Últimos 6 meses').length).toBeGreaterThan(0);
    expect(screen.getByText('Historial completo por año')).toBeInTheDocument();
    expect(screen.getByText('Historial completo')).toBeInTheDocument();
    expect(screen.getByText('2020')).toBeInTheDocument();
  });
});
