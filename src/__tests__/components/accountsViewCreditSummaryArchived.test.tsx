import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import type { Account } from '../../types/finance';

/**
 * REGLA TRANSVERSAL: las cuentas ARCHIVADAS no participan en resúmenes activos.
 *
 * Este test verifica que el useMemo `creditCardSummary` de AccountsView excluye
 * las tarjetas archivadas del consolidado: el conteo "N tarjetas" y los totales
 * (cupo total / utilizado / disponible) deben contar solo las activas.
 *
 * A diferencia de los otros tests de la vista, aquí NO se mockea
 * CreditCardsConsolidatedSummary: se renderiza de verdad para leer los totales.
 */

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
    id: 'activa',
    name: 'Nu Activa',
    type: 'credit',
    isDefault: false,
    initialBalance: 0,
    creditLimit: 1_000_000,
    usedCredit: 400_000,
    order: 1,
  },
  {
    id: 'archivada',
    name: 'Rappi Archivada',
    type: 'credit',
    isDefault: false,
    initialBalance: 0,
    creditLimit: 5_000_000,
    usedCredit: 3_000_000,
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
    archiveAccount: vi.fn(async () => undefined),
    unarchiveAccount: vi.fn(async () => undefined),
    mergeCreditCards: vi.fn(async () => undefined),
    setDefaultAccount: vi.fn(async () => undefined),
    getAccountBalance: () => 0,
    getCreditUsed: (id: string) => accounts.find((a) => a.id === id)?.usedCredit ?? 0,
    getTransactionCountForAccount: () => 0,
    balancesReady: true,
    accountsLoading: false,
  }),
  useTransactionDomain: () => ({ balanceTransactions: [] }),
  useRecurringDomain: () => ({ recurringPayments: [] }),
  useDebtsDomain: () => ({ debts: [] }),
  useFormatCurrency: () => (amount: number) => `$${amount.toLocaleString('es-CO')}`,
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

// AccountCard / AccountRow / WalletCreditCard se reemplazan por stubs mínimos:
// este test solo mide el consolidado, no las filas/tarjetas individuales.
vi.mock('../../components/views/accounts/components/AccountCard', () => ({
  AccountCard: ({ account }: { account: Account }) => <div>{account.name}</div>,
}));
vi.mock('../../components/views/accounts/components/AccountRow', () => ({
  AccountRow: ({ account }: { account: Account }) => <div>{account.name}</div>,
}));
vi.mock('../../components/views/accounts/components/WalletCreditCard', () => ({
  WalletCreditCard: ({ account }: { account: Account }) => <div>{account.name}</div>,
}));
vi.mock('../../components/views/accounts/components/AvailableDistributionRing', () => ({
  AvailableDistributionRing: () => null,
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

describe('AccountsView — el consolidado de tarjetas excluye las archivadas', () => {
  it('cuenta solo las tarjetas activas en "N tarjetas" y en los totales', () => {
    render(<AccountsView />);

    // Hay dos consolidados en el DOM (compacto móvil + completo escritorio);
    // ambos deben reflejar SOLO la tarjeta activa (Nu Activa), nunca la
    // archivada (Rappi Archivada, cupo 5.000.000 / deuda 3.000.000).
    const counters = screen.getAllByText(/^1 tarjeta$/);
    expect(counters.length).toBeGreaterThan(0);

    // El badge nunca debe decir "2 tarjetas".
    expect(screen.queryByText(/^2 tarjetas$/)).not.toBeInTheDocument();

    // Los totales activos: cupo 1.000.000, utilizado 400.000, disponible 600.000.
    // La tarjeta archivada (cupo 5.000.000) NO debe aparecer en ningún total.
    expect(screen.queryByText('$5.000.000')).not.toBeInTheDocument();
    expect(screen.queryByText('$3.000.000')).not.toBeInTheDocument();

    // Al menos un consolidado muestra el cupo total activo (1.000.000).
    expect(screen.getAllByText('$1.000.000').length).toBeGreaterThan(0);
  });

  it('el subtotal de deuda de la sección Crédito excluye la archivada', () => {
    render(<AccountsView />);

    // "Deuda total" aparece como subtotal de sección (móvil y/o escritorio).
    // Debe ser 400.000 (solo la activa), nunca 3.400.000.
    const debtLabels = screen.getAllByText('Deuda total');
    expect(debtLabels.length).toBeGreaterThan(0);
    // El valor 400.000 (activa) está presente; 3.400.000 (con archivada) no.
    expect(screen.getAllByText('$400.000').length).toBeGreaterThan(0);
    expect(screen.queryByText('$3.400.000')).not.toBeInTheDocument();
  });
});
