import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ balancesReady: false }));

vi.mock('../../hooks/useFinanceSelectors', () => ({
  useRecurringDomain: () => ({
    recurringPayments: [],
    addRecurringPayment: vi.fn(async () => undefined),
    updateRecurringPayment: vi.fn(async () => undefined),
    deleteRecurringPayment: vi.fn(async () => undefined),
    isPaidForMonth: () => false,
    getNextDueDate: () => new Date(),
    getDaysUntilDue: () => 0,
    getDaysOverdue: () => 0,
    getPaymentHistory: () => [],
    recurringStats: {
      total: 0,
      active: 0,
      paidThisMonth: 0,
      pendingThisMonth: 0,
      totalMonthlyAmount: 0,
      totalYearlyAmount: 0,
      upcomingPayments: [],
      overduePayments: [],
    },
  }),
  useAccountDomain: () => ({ accounts: [], defaultAccount: null }),
  useCategoryDomain: () => ({ categories: { expense: [], income: [] } }),
  useFormatCurrency: () => (amount: number) => `$${amount}`,
  useTransactionDomain: () => ({
    transactions: [],
    balanceTransactions: [],
    balancesReady: state.balancesReady,
    addTransaction: vi.fn(async () => undefined),
    updateTransaction: vi.fn(async () => undefined),
    deleteTransaction: vi.fn(async () => undefined),
  }),
}));

vi.mock('../../contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: false }),
}));

import { RecurringPaymentsView } from '../../components/views/recurring/RecurringPaymentsView';

describe('RecurringPaymentsView authority readiness', () => {
  beforeEach(() => {
    state.balancesReady = false;
  });

  it('shows a settling state instead of unpaid statistics until complete history is ready', () => {
    const { rerender } = render(<RecurringPaymentsView />);

    expect(screen.getByRole('status')).toHaveTextContent(/historial completo|calculando/i);
    expect(screen.queryByText('Pagos activos')).not.toBeInTheDocument();

    state.balancesReady = true;
    rerender(<RecurringPaymentsView />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Pagos activos')).toBeInTheDocument();
  });
});
