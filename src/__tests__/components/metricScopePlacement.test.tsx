import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TabNavigation } from '../../components/layout/TabNavigation';
import { FinanceViewRouter } from '../../components/layout/FinanceViewRouter';
import { TransactionsView } from '../../components/views/transactions/TransactionsView';
import { UIPreferencesProvider } from '../../contexts/UIPreferencesContext';
import { BalanceCalculator } from '../../utils/balanceCalculator';
import type { Account, Transaction, ViewType } from '../../types/finance';

const mockFinanceState = vi.hoisted(() => ({
  accounts: [] as Account[],
  transactions: [] as Transaction[],
  totalBalance: 0,
}));

vi.mock('../../hooks/useFinanceSelectors', () => ({
  useTransactionDomain: () => ({
    transactions: mockFinanceState.transactions, balanceTransactions: mockFinanceState.transactions, deleteTransaction: vi.fn(), updateTransaction: vi.fn(),
    hasMoreTransactions: false, loadingMoreTransactions: false, loadMoreTransactions: vi.fn(),
  }),
  useAccountDomain: () => ({
    accounts: mockFinanceState.accounts,
    balancesReady: true,
    totalBalance: mockFinanceState.totalBalance,
    getAccountBalance: (id: string) => {
      const account = mockFinanceState.accounts.find((account) => account.id === id);
      return account ? BalanceCalculator.calculateAccountBalance(account, mockFinanceState.transactions) : 0;
    },
  }),
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
vi.mock('../../components/views/stats/StatsView', () => ({ StatsView: () => <div>Estadísticas</div> }));
vi.mock('../../components/views/accounts/AccountsView', () => ({ AccountsView: () => <div>Cuentas</div> }));
vi.mock('../../components/views/recurring/RecurringPaymentsView', () => ({ RecurringPaymentsView: () => <div>Periódicos</div> }));
vi.mock('../../components/views/debts/DebtsView', () => ({ DebtsView: () => <div>Deudas</div> }));
vi.mock('../../components/views/budgets/BudgetsView', () => ({ BudgetsView: () => <div>Presupuestos</div> }));
vi.mock('../../components/views/financial-plan/FinancialPlanView', () => ({ FinancialPlanView: () => <div>Plan financiero</div> }));
vi.mock('../../components/views/goals/GoalsView', () => ({ GoalsView: () => <div>Metas</div> }));

function FinanceShell({ initialView, filterAccount = 'all' }: { initialView: ViewType; filterAccount?: string }) {
  return (
    <UIPreferencesProvider>
      <TabNavigation view={initialView} setView={() => {}} />
      <FinanceViewRouter
        view={initialView}
        pendingBudgetDraft={null}
        onBudgetDraftApplied={() => {}}
        onGoToTransactions={() => {}}
        onOpenFinancialPlan={() => {}}
        onUseBudgetSuggestion={() => {}}
        onViewMounted={() => {}}
        transactionsPanel={(
          <TransactionsView
            showForm={false}
            setShowForm={() => {}}
            filterCategory="all"
            setFilterCategory={() => {}}
            filterAccount={filterAccount}
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
  beforeEach(() => {
    mockFinanceState.accounts = [];
    mockFinanceState.transactions = [];
    mockFinanceState.totalBalance = 0;
  });

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

  it('shows pending debt only for the selected account', () => {
    mockFinanceState.accounts = [
      { id: 'bank', name: 'Banco', type: 'savings', initialBalance: 0, isDefault: true },
      { id: 'visa', name: 'Visa', type: 'credit', initialBalance: 0, isDefault: false, creditLimit: 1_000 },
      { id: 'mastercard', name: 'Mastercard', type: 'credit', initialBalance: 0, isDefault: false, creditLimit: 2_000 },
    ];
    mockFinanceState.transactions = [
      { id: 'visa-debt', type: 'expense', amount: 200, category: 'Compras', description: '', date: new Date(), paid: false, accountId: 'visa' },
      { id: 'mastercard-debt', type: 'expense', amount: 350, category: 'Compras', description: '', date: new Date(), paid: false, accountId: 'mastercard' },
    ];

    render(<FinanceShell initialView="transactions" filterAccount="visa" />);

    const pendingCard = screen.getByText('Pendiente').closest('div.col-span-2');
    expect(pendingCard).not.toBeNull();
    expect(within(pendingCard as HTMLElement).getByText('$200')).toBeInTheDocument();
  });

  it('shows the asset-only total for all accounts (excludes credit cards) and switches to the selected account using complete history', () => {
    mockFinanceState.accounts = [
      { id: 'bank', name: 'Banco', type: 'savings', initialBalance: 1_000, isDefault: true },
      { id: 'cash', name: 'Efectivo', type: 'cash', initialBalance: 50, isDefault: false },
      { id: 'visa', name: 'Visa', type: 'credit', initialBalance: 0, isDefault: false, creditLimit: 1_000, usedCredit: 200 },
      { id: 'mastercard', name: 'Mastercard', type: 'credit', initialBalance: 0, isDefault: false, creditLimit: 2_000, usedCredit: 350 },
    ];
    mockFinanceState.transactions = [
      { id: 'old-income', type: 'income', amount: 500, category: 'Salario', description: '', date: new Date(2025, 0, 1), paid: true, accountId: 'bank' },
      { id: 'expense', type: 'expense', amount: 25, category: 'Compras', description: '', date: new Date(), paid: true, accountId: 'bank' },
    ];
    mockFinanceState.totalBalance = 1_525;

    const { rerender } = render(<FinanceShell initialView="transactions" />);
    const balanceCard = () => within(screen.getByText('Saldo actual').closest('.card-balance') as HTMLElement);
    // "Todas las cuentas" muestra solo activos (banco + efectivo); las TC quedan excluidas.
    expect(balanceCard().getByText('$1525')).toBeInTheDocument();

    for (const [filterAccount, expected] of [
      ['visa', '$800'], ['mastercard', '$1650'], ['bank', '$1475'],
      ['cash', '$50'], ['missing', '$0'], ['all', '$1525'],
    ]) {
      rerender(<FinanceShell initialView="transactions" filterAccount={filterAccount} />);
      expect(balanceCard().getByText(expected)).toBeInTheDocument();
    }

    // Cambiar el crédito usado de una TC no altera el saldo actual de "todas las cuentas":
    // las TC no cuentan como activo.
    mockFinanceState.accounts = mockFinanceState.accounts.map((account) =>
      account.id === 'visa' ? { ...account, usedCredit: 325 } : account,
    );
    rerender(<FinanceShell initialView="transactions" filterAccount="visa" />);
    expect(balanceCard().getByText('$675')).toBeInTheDocument();
    rerender(<FinanceShell initialView="transactions" />);
    expect(balanceCard().getByText('$1525')).toBeInTheDocument();
  });
});
