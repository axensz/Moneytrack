import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatsCards } from '../../components/shared/StatsCards';

vi.mock('../../contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: false, setHideBalances: vi.fn() }),
}));

describe('StatsCards', () => {
  it('shows the general overview with explicit scopes', () => {
    render(
      <StatsCards
        totalBalance={100}
        totalIncome={20}
        totalExpenses={5}
        pendingExpenses={10}
        formatCurrency={(value) => `$${value}`}
      />,
    );

    expect(screen.getByText('Resumen general')).toBeInTheDocument();
    expect(screen.getByText('Saldo actual')).toBeInTheDocument();
    expect(screen.getByText(/Ingresos.*mes actual/)).toBeInTheDocument();
    expect(screen.getByText(/Gastos.*mes actual/)).toBeInTheDocument();
    expect(screen.getByText(/Pendiente actual.*tarjetas de crédito/)).toBeInTheDocument();
    expect(screen.getByTitle(/Crédito usado actual.*no en Gastos/)).toBeInTheDocument();
  });
});
