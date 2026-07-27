import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TabNavigation } from '../../components/layout/TabNavigation';
import { FinanceViewRouter } from '../../components/layout/FinanceViewRouter';
import { TransactionsView } from '../../components/views/transactions/TransactionsView';
import { UIPreferencesProvider } from '../../contexts/UIPreferencesContext';
import type { ViewType } from '../../types/finance';

vi.mock('../../hooks/useFinanceSelectors', () => ({
  useTransactionDomain: () => ({
    transactions: [], balanceTransactions: [], deleteTransaction: vi.fn(), updateTransaction: vi.fn(),
    hasMoreTransactions: false, loadingMoreTransactions: false, loadMoreTransactions: vi.fn(),
  }),
  useAccountDomain: () => ({ accounts: [], balancesReady: true, totalBalance: 0 }),
  useBeneficiaryDomain: () => ({ beneficiaries: [] }),
  useCategoryDomain: () => ({ categories: { income: [], expense: [] } }),
  useRecurringDomain: () => ({ recurringPayments: [] }),
  useFormatCurrency: () => (value: number) => `$${value}`,
}));

vi.mock('../../components/views/transactions/hooks/useTransactionsView', () => ({
  useTransactionsView: () => ({
    filteredTransactions: [], filteredBalanceTransactions: [], isMetadataFiltersActive: false,
    showDatePicker: false, setShowDatePicker: vi.fn(), searchQuery: '', setSearchQuery: vi.fn(),
    editingTransaction: null, editForm: null, setEditForm: vi.fn(), startEditTransaction: vi.fn(),
    handleSaveEdit: vi.fn(), handleCancelEdit: vi.fn(), expandedTransaction: null, toggleExpand: vi.fn(),
    handleDeleteTransaction: vi.fn(), clearFilters: vi.fn(), getRecurringPaymentName: vi.fn(),
    getAccountForTransaction: vi.fn(),
  }),
}));

vi.mock('../../hooks/useCSVExport', () => ({ useCSVExport: () => ({ exportTransactionsCSV: vi.fn() }) }));
vi.mock('../../components/views/accounts/AccountsView', () => ({ AccountsView: () => <div>Cuentas</div> }));

function FinanceShell({ initialView }: { initialView: ViewType }) {
  return (
    <UIPreferencesProvider>
      <TabNavigation view={initialView} setView={() => {}} />
      <FinanceViewRouter
        view={initialView}
        pendingBudgetDraft={null}
        onBudgetDraftApplied={() => {}}
        onOpenFinancialPlan={() => {}}
        onUseBudgetSuggestion={() => {}}
        transactionsPanel={(
          <TransactionsView
            showForm={false}
            setShowForm={() => {}}
            filterCategory="all"
            setFilterCategory={() => {}}
            filterAccount="all"
            setFilterAccount={() => {}}
            dateRangePreset="this-month"
            setDateRangePreset={() => {}}
            customStartDate=""
            setCustomStartDate={() => {}}
            customEndDate=""
            setCustomEndDate={() => {}}
          />
        )}
      />
    </UIPreferencesProvider>
  );
}

describe('ledger overview placement', () => {
  it('follows primary navigation and stays inside transactions', () => {
    render(<FinanceShell initialView="transactions" />);

    expect(screen.getByTestId('primary-navigation').compareDocumentPosition(
      screen.getByTestId('ledger-overview'),
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('transactions-panel')).toContainElement(screen.getByTestId('ledger-overview'));
  });

  it.each<ViewType>(['recurring', 'stats', 'accounts', 'debts', 'budgets', 'financial-plan', 'goals'])(
    'does not render the overview in %s',
    (view) => {
      render(<FinanceShell initialView={view} />);
      expect(screen.queryByTestId('ledger-overview')).not.toBeInTheDocument();
    },
  );
});
