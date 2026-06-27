/**
 * Unit tests for BalanceComparisonSection component.
 *
 * Validates: Requirements 2.2, 2.3, 2.4, 2.6, 2.7
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BalanceComparisonSection } from './BalanceComparisonSection';

const formatCurrency = (n: number) => `$${n.toLocaleString('es-CO')}`;

describe('BalanceComparisonSection', () => {
  it('renders all three labels: Saldo real, Proyectado, Sin registrar', () => {
    render(
      <BalanceComparisonSection
        usedCredit={500000}
        projectedTotal={350000}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    expect(screen.getByText('Saldo real')).toBeInTheDocument();
    expect(screen.getByText('Proyectado')).toBeInTheDocument();
    expect(screen.getByText('Sin registrar')).toBeInTheDocument();
  });

  it('displays formatted currency values when hideBalances is false', () => {
    render(
      <BalanceComparisonSection
        usedCredit={500000}
        projectedTotal={350000}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    expect(screen.getByText(formatCurrency(500000))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(350000))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(150000))).toBeInTheDocument();
  });

  it('masks all values with "------" when hideBalances is true', () => {
    render(
      <BalanceComparisonSection
        usedCredit={500000}
        projectedTotal={350000}
        formatCurrency={formatCurrency}
        hideBalances={true}
      />
    );

    const masks = screen.getAllByText('------');
    expect(masks).toHaveLength(3);

    // No formatted currency should be visible
    expect(screen.queryByText(formatCurrency(500000))).not.toBeInTheDocument();
    expect(screen.queryByText(formatCurrency(350000))).not.toBeInTheDocument();
    expect(screen.queryByText(formatCurrency(150000))).not.toBeInTheDocument();
  });

  it('applies amber/warning style when unrecorded amount > 0', () => {
    render(
      <BalanceComparisonSection
        usedCredit={500000}
        projectedTotal={350000}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    const unrecordedEl = screen.getByTestId('unrecorded-value');
    expect(unrecordedEl.className).toContain('text-warning');
  });

  it('applies neutral style when unrecorded amount is 0', () => {
    render(
      <BalanceComparisonSection
        usedCredit={350000}
        projectedTotal={350000}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    const unrecordedEl = screen.getByTestId('unrecorded-value');
    expect(unrecordedEl.className).toContain('text-foreground');
    expect(unrecordedEl.className).not.toContain('text-warning');
  });

  it('applies neutral style when unrecorded amount is negative', () => {
    render(
      <BalanceComparisonSection
        usedCredit={200000}
        projectedTotal={350000}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    const unrecordedEl = screen.getByTestId('unrecorded-value');
    expect(unrecordedEl.className).toContain('text-foreground');
    expect(unrecordedEl.className).not.toContain('text-warning');
  });

  it('computes Sin registrar as usedCredit - projectedTotal', () => {
    render(
      <BalanceComparisonSection
        usedCredit={1000000}
        projectedTotal={750000}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    // 1000000 - 750000 = 250000
    expect(screen.getByText(formatCurrency(250000))).toBeInTheDocument();
  });
});

describe('BalanceComparisonSection — "Al día" indicator', () => {
  it('shows "Al día" badge when usedCredit = 0', () => {
    render(
      <BalanceComparisonSection
        usedCredit={0}
        projectedTotal={0}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    const badge = screen.getByTestId('up-to-date-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Al día');

    // Should NOT render comparison rows
    expect(screen.queryByTestId('unrecorded-value')).toBeNull();
  });

  it('shows "Al día" badge when usedCredit = 5000 (boundary)', () => {
    render(
      <BalanceComparisonSection
        usedCredit={5000}
        projectedTotal={3000}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    const badge = screen.getByTestId('up-to-date-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Al día');

    // Should NOT render comparison rows
    expect(screen.queryByTestId('unrecorded-value')).toBeNull();
  });

  it('shows comparison rows when usedCredit = 5001 (just above threshold)', () => {
    render(
      <BalanceComparisonSection
        usedCredit={5001}
        projectedTotal={3000}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    // Should NOT show "Al día" badge
    expect(screen.queryByTestId('up-to-date-badge')).toBeNull();

    // Should show comparison rows
    expect(screen.getByTestId('unrecorded-value')).toBeInTheDocument();
    expect(screen.getByText('Saldo real')).toBeInTheDocument();
    expect(screen.getByText('Sin registrar')).toBeInTheDocument();
  });

  it('shows "Al día" badge for usedCredit = 772 (Gold real case)', () => {
    render(
      <BalanceComparisonSection
        usedCredit={772}
        projectedTotal={0}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    const badge = screen.getByTestId('up-to-date-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Al día');

    // Should NOT render comparison rows
    expect(screen.queryByTestId('unrecorded-value')).toBeNull();
  });

  it('still shows "Al día" badge when hideBalances is true', () => {
    render(
      <BalanceComparisonSection
        usedCredit={772}
        projectedTotal={0}
        formatCurrency={formatCurrency}
        hideBalances={true}
      />
    );

    // Badge should still render — it's a status indicator, not a monetary value
    const badge = screen.getByTestId('up-to-date-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Al día');

    // Should NOT show masked values or comparison rows
    expect(screen.queryByTestId('unrecorded-value')).toBeNull();
    expect(screen.queryByText('------')).not.toBeInTheDocument();
  });
});
