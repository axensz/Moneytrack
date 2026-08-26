import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../../types/finance';

const state = vi.hoisted(() => ({
  mergeCreditCards: vi.fn(async () => undefined),
  addTransaction: vi.fn(async () => undefined),
  updateAccount: vi.fn(async () => undefined),
  paymentManagerRenders: [] as Array<{
    userId: string | null;
    accountId?: string;
    isOpen?: boolean;
  }>,
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
  AccountCard: ({
    account,
    onMerge,
    onManagePaymentInstruments,
  }: {
    account: Account;
    onMerge?: () => void;
    onManagePaymentInstruments?: () => void;
  }) => (
    <div>
      <span>{account.name}</span>
      {onMerge && (
        <button type="button" onClick={onMerge}>
          merge-{account.id}
        </button>
      )}
      {onManagePaymentInstruments && (
        <button
          type="button"
          onClick={onManagePaymentInstruments}
        >
          mobile-media-{account.id}
        </button>
      )}
    </div>
  ),
}));

vi.mock('../../components/views/accounts/components/PaymentInstrumentsSection', () => ({
  PaymentInstrumentsSection: ({
    userId,
    accountId,
    isOpen,
    onClose,
  }: {
    userId: string | null;
    accountId?: string;
    isOpen?: boolean;
    onClose?: () => void;
  }) => {
    state.paymentManagerRenders.push({ userId, accountId, isOpen });
    return isOpen ? (
      <div role="dialog" aria-label={`payment-manager-${accountId ?? 'global'}`}>
        <button type="button" onClick={onClose}>close-payment-manager</button>
      </div>
    ) : null;
  },
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
  state.paymentManagerRenders = [];
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

describe('AccountsView — medios de pago en contexto', () => {
  it('opens one account-scoped modal and removes it on close', () => {
    render(<AccountsView userId="owner" />);

    expect(screen.queryByRole('dialog', { name: /payment-manager-/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'mobile-media-bank' }));

    expect(screen.getByRole('dialog', { name: 'payment-manager-bank' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'payment-manager-global' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'close-payment-manager' }));
    expect(screen.queryByRole('dialog', { name: /payment-manager-/i })).not.toBeInTheDocument();
  });

  it('closes the selected account context when the authenticated user changes', () => {
    const { rerender } = render(<AccountsView userId="owner" />);
    fireEvent.click(screen.getByRole('button', { name: 'mobile-media-bank' }));
    expect(screen.getByRole('dialog', { name: 'payment-manager-bank' })).toBeInTheDocument();

    rerender(<AccountsView userId="other-owner" />);

    expect(screen.queryByRole('dialog', { name: /payment-manager-/i })).not.toBeInTheDocument();
    expect(state.paymentManagerRenders).not.toContainEqual({
      userId: 'other-owner',
      accountId: 'bank',
      isOpen: true,
    });
  });
});
