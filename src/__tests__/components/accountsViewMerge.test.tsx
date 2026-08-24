import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../../types/finance';

const state = vi.hoisted(() => ({
  mergeCreditCards: vi.fn(async () => undefined),
  addTransaction: vi.fn(async () => undefined),
  updateAccount: vi.fn(async () => undefined),
}));

const accounts: Account[] = [
  {
    id: 'bank',
    name: 'Banco',
    type: 'savings',
    isDefault: true,
    initialBalance: 0,
    order: 0,
  },
  {
    id: 'cc1',
    name: 'Visa 1',
    type: 'credit',
    isDefault: false,
    initialBalance: 0,
    creditLimit: 1_000_000,
    usedCredit: 300_000,
    bankAccountId: 'bank',
    order: 1,
  },
  {
    id: 'cc2',
    name: 'Visa 2',
    type: 'credit',
    isDefault: false,
    initialBalance: 0,
    creditLimit: 2_000_000,
    usedCredit: 200_000,
    bankAccountId: 'bank',
    order: 2,
  },
];

vi.mock('../../hooks/useFinanceSelectors', () => ({
  useAccountDomain: () => ({
    accounts,
    addAccount: vi.fn(async () => undefined),
    updateAccount: state.updateAccount,
    deleteAccount: vi.fn(async () => undefined),
    mergeCreditCards: state.mergeCreditCards,
    setDefaultAccount: vi.fn(async () => undefined),
    getAccountBalance: () => 0,
    getCreditUsed: (id: string) => accounts.find(account => account.id === id)?.usedCredit ?? 0,
    getTransactionCountForAccount: () => 0,
    balancesReady: true,
    accountsLoading: false,
  }),
  useTransactionDomain: () => ({
    addTransaction: state.addTransaction,
    balanceTransactions: [],
  }),
  useRecurringDomain: () => ({ recurringPayments: [] }),
  useDebtsDomain: () => ({ debts: [] }),
  useFormatCurrency: () => (amount: number) => `$${amount}`,
}));

vi.mock('../../hooks/useCardPaymentSchedule', () => ({
  useCardPaymentSchedule: () => [],
}));

vi.mock('../../utils/creditCardOptimizer', () => ({
  buildCreditCardUsagePlans: () => [],
}));

vi.mock('../../components/views/accounts/hooks/useDragAndDrop', () => ({
  useDragAndDrop: () => ({
    draggedAccountId: null,
    dragOverAccountId: null,
    touchCurrentY: null,
    touchStartY: null,
    moveAccount: vi.fn(),
    handleDragStart: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
    handleDragEnd: vi.fn(),
    handleTouchStart: vi.fn(),
    handleTouchMove: vi.fn(),
    handleTouchEnd: vi.fn(),
  }),
}));

vi.mock('../../components/views/accounts/hooks/useAccountForm', () => ({
  useAccountForm: () => ({
    showAccountForm: false,
    isSubmitting: false,
    editingAccount: null,
    openCreateForm: vi.fn(),
    openEditForm: vi.fn(),
  }),
}));

vi.mock('../../components/views/accounts/components/AccountCard', () => ({
  AccountCard: ({ account, onMerge }: { account: Account; onMerge?: () => void }) => (
    <div>
      <span>{account.name}</span>
      {onMerge && (
        <button type="button" onClick={onMerge}>
          merge-{account.id}
        </button>
      )}
    </div>
  ),
}));

vi.mock('../../components/views/accounts/components/MergeCreditCardsModal', () => ({
  MergeCreditCardsModal: ({
    isOpen,
    onDesiredDebtChange,
    onConfirm,
  }: {
    isOpen: boolean;
    onDesiredDebtChange: (value: string) => void;
    onConfirm: () => void;
  }) => isOpen ? (
    <div>
      <button type="button" onClick={() => onDesiredDebtChange('250000')}>
        set-desired-debt
      </button>
      <button type="button" onClick={onConfirm}>
        confirm-merge
      </button>
    </div>
  ) : null,
}));

vi.mock('../../components/views/accounts/components/AccountFormModal', () => ({
  AccountFormModal: () => null,
}));
vi.mock('../../components/views/accounts/components/DeleteConfirmModal', () => ({
  DeleteConfirmModal: () => null,
}));
vi.mock('../../components/views/accounts/components/CreditCardsConsolidatedSummary', () => ({
  CreditCardsConsolidatedSummary: () => null,
}));
vi.mock('../../components/views/accounts/components/CreditCardOptimizerModal', () => ({
  CreditCardOptimizerModal: () => null,
}));
vi.mock('../../components/views/accounts/components/CardStatementsModal', () => ({
  CardStatementsModal: () => null,
}));
vi.mock('../../utils/toastHelpers', () => ({
  showToast: { success: vi.fn(), error: vi.fn() },
}));

import { AccountsView } from '../../components/views/accounts/AccountsView';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AccountsView — fusión con deuda objetivo', () => {
  it('entrega el objetivo al dominio y no crea una transacción en segunda fase', async () => {
    render(<AccountsView />);

    fireEvent.click(screen.getByRole('button', { name: 'merge-cc1' }));
    fireEvent.click(screen.getByRole('button', { name: 'set-desired-debt' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm-merge' }));

    await waitFor(() => expect(state.mergeCreditCards).toHaveBeenCalledWith({
      sourceAccountIds: ['cc1'],
      destination: {
        id: 'cc2',
        name: 'Visa 2',
        creditLimit: 3_000_000,
        isDefault: false,
      },
      desiredDebt: 250_000,
    }));
    expect(state.addTransaction).not.toHaveBeenCalled();
  });

  it('sin objetivo explícito deja que el servidor conserve la deuda reconciliada', async () => {
    render(<AccountsView />);

    fireEvent.click(screen.getByRole('button', { name: 'merge-cc1' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm-merge' }));

    await waitFor(() => expect(state.mergeCreditCards).toHaveBeenCalledWith(
      expect.objectContaining({ desiredDebt: undefined })
    ));
    expect(state.addTransaction).not.toHaveBeenCalled();
  });
});
