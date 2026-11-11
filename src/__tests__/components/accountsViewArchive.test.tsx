import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../../types/finance';

const state = vi.hoisted(() => ({
  archiveAccount: vi.fn(async () => undefined),
  unarchiveAccount: vi.fn(async () => undefined),
}));

const accounts: Account[] = [
  {
    id: 'bank',
    name: 'Bancolombia',
    type: 'savings',
    isDefault: true,
    initialBalance: 0,
    order: 0,
  },
  {
    id: 'platino',
    name: 'Platino',
    type: 'credit',
    isDefault: false,
    initialBalance: 0,
    creditLimit: 2_000_000,
    usedCredit: 0,
    order: 1,
  },
  {
    id: 'gold',
    name: 'Gold',
    type: 'credit',
    isDefault: false,
    initialBalance: 0,
    creditLimit: 1_000_000,
    usedCredit: 0,
    archived: true,
    archivedAt: new Date('2026-01-01'),
    order: 2,
  },
];

vi.mock('../../hooks/useFinanceSelectors', () => ({
  useAccountDomain: () => ({
    accounts,
    addAccount: vi.fn(async () => undefined),
    updateAccount: vi.fn(async () => undefined),
    deleteAccount: vi.fn(async () => undefined),
    archiveAccount: state.archiveAccount,
    unarchiveAccount: state.unarchiveAccount,
    mergeCreditCards: vi.fn(async () => undefined),
    setDefaultAccount: vi.fn(async () => undefined),
    getAccountBalance: () => 0,
    getCreditUsed: () => 0,
    getTransactionCountForAccount: () => 176,
    balancesReady: true,
    accountsLoading: false,
  }),
  useTransactionDomain: () => ({ balanceTransactions: [] }),
  useRecurringDomain: () => ({ recurringPayments: [] }),
  useDebtsDomain: () => ({ debts: [] }),
  useFormatCurrency: () => (amount: number) => `$${amount}`,
}));

vi.mock('../../contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: false }),
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

// AccountCard real-ish: expone nombre + botones de archivar/desarchivar para
// poder verificar qué cuentas se renderizan y en qué sección.
vi.mock('../../components/views/accounts/components/AccountCard', () => ({
  AccountCard: ({
    account,
    onArchive,
    onUnarchive,
  }: {
    account: Account;
    onArchive?: () => void;
    onUnarchive?: () => void;
  }) => (
    <div data-testid={`card-${account.id}`}>
      <span>{account.name}</span>
      {onArchive && (
        <button type="button" onClick={onArchive}>archive-{account.id}</button>
      )}
      {onUnarchive && (
        <button type="button" onClick={onUnarchive}>unarchive-{account.id}</button>
      )}
    </div>
  ),
}));

// Las archivadas usan la fila resumida (no AccountCard): mismo contrato para el
// test, nombre + acción de desarchivar.
vi.mock('../../components/views/accounts/components/ArchivedAccountRow', () => ({
  ArchivedAccountRow: ({
    account,
    onUnarchive,
  }: {
    account: Account;
    onUnarchive: () => void;
  }) => (
    <li data-testid={`card-${account.id}`}>
      <span>{account.name}</span>
      <button type="button" onClick={onUnarchive}>unarchive-{account.id}</button>
    </li>
  ),
}));

vi.mock('../../components/views/accounts/components/PaymentInstrumentsSection', () => ({
  PaymentInstrumentsSection: () => null,
}));
vi.mock('../../components/views/accounts/components/MergeCreditCardsModal', () => ({
  MergeCreditCardsModal: () => null,
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

describe('AccountsView — cuentas archivadas', () => {
  it('excluye la cuenta archivada de la lista principal', () => {
    render(<AccountsView />);

    // Las activas se muestran; Gold (archivada) no aparece como tarjeta de la lista.
    expect(screen.getByTestId('card-bank')).toBeInTheDocument();
    expect(screen.getByTestId('card-platino')).toBeInTheDocument();
    expect(screen.queryByTestId('card-gold')).not.toBeInTheDocument();
  });

  it('muestra la cuenta archivada al expandir la sección y permite desarchivarla', async () => {
    render(<AccountsView />);

    // La sección arranca colapsada: Gold sigue oculta.
    expect(screen.queryByTestId('card-gold')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cuentas archivadas/i }));

    // Ahora Gold aparece en la sección de archivadas con su acción de desarchivar.
    expect(screen.getByTestId('card-gold')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'unarchive-gold' }));

    await waitFor(() => expect(state.unarchiveAccount).toHaveBeenCalledWith('gold'));
  });

  it('archiva una cuenta activa desde la lista principal', async () => {
    render(<AccountsView />);

    fireEvent.click(screen.getByRole('button', { name: 'archive-platino' }));

    await waitFor(() => expect(state.archiveAccount).toHaveBeenCalledWith('platino'));
  });
});
