import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../../types/finance';
import { StatsView } from '../../components/views/stats/StatsView';
import { UIPreferencesProvider } from '../../contexts/UIPreferencesContext';

const selectorState = vi.hoisted(() => ({
  transactions: [] as Transaction[],
  balanceTransactions: [] as Transaction[],
}));

vi.mock('../../hooks/useFinanceSelectors', () => ({
  useTransactionDomain: () => selectorState,
  useAccountDomain: () => ({ accounts: [] }),
  useFormatCurrency: () => (value: number) => `$${value}`,
}));

function renderView(onGoToTransactions = vi.fn()) {
  return {
    onGoToTransactions,
    ...render(
      <UIPreferencesProvider>
        <StatsView onGoToTransactions={onGoToTransactions} />
      </UIPreferencesProvider>
    ),
  };
}

describe('estados de Estadísticas', () => {
  beforeEach(() => {
    selectorState.transactions = [];
    selectorState.balanceTransactions = [];
  });

  it('muestra una sola explicación accionable cuando no existe historial', () => {
    const { onGoToTransactions } = renderView();

    expect(screen.getAllByText(/los gráficos aparecerán al registrar movimientos/i)).toHaveLength(1);
    const action = screen.getByRole('button', { name: 'Ir a Transacciones' });
    fireEvent.click(action);
    expect(onGoToTransactions).toHaveBeenCalledOnce();

    expect(screen.queryByText(/no hay movimientos en los últimos 6 meses/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no hay datos de gastos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/aún no hay datos por año/i)).not.toBeInTheDocument();
  });

  it('decide con el historial completo y conserva los cuatro gráficos descritos', () => {
    selectorState.balanceTransactions = [{
      id: 'history-only',
      type: 'expense',
      amount: 100,
      category: 'Comida',
      description: 'Mercado',
      date: new Date(2026, 6, 15),
      paid: true,
      accountId: 'account',
    }];

    renderView();

    expect(screen.queryByRole('button', { name: 'Ir a Transacciones' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /flujo de caja de los últimos 6 meses/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /comparación mensual de ingresos y gastos en los últimos 6 meses/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /distribución de gastos por categoría/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /tendencia anual de ingresos y gastos/i })).toBeInTheDocument();
  });
});
