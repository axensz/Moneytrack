import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { StatsCards } from '../../components/shared/StatsCards';
import { UIPreferencesProvider, useUIPreferences } from '../../contexts/UIPreferencesContext';

const defaultProps = {
  totalBalance: 100,
  totalIncome: 20,
  totalExpenses: 5,
  pendingExpenses: 10,
  formatCurrency: (value: number) => `$${value}`,
};

function PreferenceValue() {
  const { hideBalances } = useUIPreferences();
  return <output aria-label="Estado de privacidad">{String(hideBalances)}</output>;
}

function renderStats(overrides: Partial<React.ComponentProps<typeof StatsCards>> = {}) {
  return render(
    <UIPreferencesProvider>
      <StatsCards {...defaultProps} {...overrides} />
      <PreferenceValue />
    </UIPreferencesProvider>,
  );
}

describe('StatsCards', () => {
  beforeEach(() => localStorage.removeItem('moneytrack_hide_values'));

  it('shows the general overview with explicit scopes', () => {
    renderStats();

    expect(screen.getByText('Resumen general')).toBeInTheDocument();
    expect(screen.getByText('Saldo actual')).toBeInTheDocument();
    expect(screen.getByText(/Ingresos.*mes actual/)).toBeInTheDocument();
    expect(screen.getByText(/Gastos.*mes actual/)).toBeInTheDocument();
    expect(screen.getByText(/Pendiente actual.*tarjetas de crédito/)).toBeInTheDocument();
    expect(screen.getByTitle(/Crédito usado actual.*no en Gastos/)).toBeInTheDocument();
  });

  it('owns the global privacy action and masks every overview value immediately', () => {
    renderStats();

    const toggle = screen.getByRole('button', { name: 'Ocultar valores' });
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveClass('h-11', 'w-11');
    expect(screen.getByRole('status', { name: 'Estado de privacidad' })).toHaveTextContent('false');

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Mostrar valores' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('••••••')).toHaveLength(4);
    expect(screen.getByRole('status', { name: 'Estado de privacidad' })).toHaveTextContent('true');
  });

  it('preserves the shared privacy preference when the overview remounts', () => {
    const firstRender = renderStats();

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar valores' }));
    expect(localStorage.getItem('moneytrack_hide_values')).toBe('true');
    firstRender.unmount();

    renderStats();

    expect(screen.getByRole('button', { name: 'Mostrar valores' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('••••••')).toHaveLength(4);
  });

  it('keeps the privacy action operable while the balance is settling', () => {
    renderStats({ balanceSettling: true });

    expect(screen.getByText('Calculando…')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Ocultar valores' });
    fireEvent.click(toggle);

    expect(screen.getByText('Calculando…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mostrar valores' })).toBeEnabled();
  });
});
