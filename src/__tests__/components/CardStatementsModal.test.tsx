/**
 * Unit tests for CardStatementsModal component.
 *
 * **Validates: Requirements 5.9, 6.6**
 *
 * Property 14: Balance masking under hideBalances
 * For any rendered CardStatementsModal with hideBalances === true and non-empty data,
 * all monetary display slots (month totals, statement totals, paid amounts,
 * installment amounts, recurring amounts) SHALL render the mask "••••••"
 * instead of formatted currency values.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardStatementsModal } from '../../components/views/accounts/components/CardStatementsModal';
import type { MonthGroup } from '../../hooks/useCardPaymentSchedule';
import type { Account, Transaction, RecurringPayment } from '../../types/finance';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

// Mock useModalA11y to avoid DOM side-effects
vi.mock('../../hooks/useModalA11y', () => ({
  useModalA11y: () => ({ modalRef: { current: null }, onKeyDown: () => {} }),
}));

// Mock useCardPaymentSchedule to return controlled fixture data
const mockMonthGroups: MonthGroup[] = [
  {
    monthKey: '2025-07',
    label: 'julio 2025',
    total: 350000,
    isCurrent: true,
    isFuture: false,
    cards: [
      {
        cardId: 'card-1',
        cardName: 'Visa Gold',
        statementTotal: 350000,
        paidAmount: 100000,
        status: 'partial',
        installmentItems: [
          { description: 'Compra Almacén', cuota: 3, total: 12, amount: 150000 },
          { description: 'Restaurante', cuota: 1, total: 1, amount: 50000 },
        ],
        recurringItems: [
          { name: 'Netflix', amount: 45900 },
          { name: 'Spotify', amount: 16900 },
        ],
        cycleStart: new Date(2025, 5, 16),
        cycleEnd: new Date(2025, 6, 15),
        paymentDueDate: new Date(2025, 6, 5),
      },
    ],
  },
  {
    monthKey: '2025-08',
    label: 'agosto 2025',
    total: 200000,
    isCurrent: false,
    isFuture: true,
    cards: [
      {
        cardId: 'card-1',
        cardName: 'Visa Gold',
        statementTotal: 200000,
        paidAmount: 0,
        status: 'projected',
        installmentItems: [
          { description: 'Compra Almacén', cuota: 4, total: 12, amount: 150000 },
        ],
        recurringItems: [
          { name: 'Netflix', amount: 45900 },
        ],
        cycleStart: new Date(2025, 6, 16),
        cycleEnd: new Date(2025, 7, 15),
        paymentDueDate: new Date(2025, 7, 5),
      },
    ],
  },
];

const mockUseCardPaymentSchedule = vi.fn((..._args: unknown[]) => ({ months: mockMonthGroups, consolidatedProjectedTotal: 0, consolidatedTotalProjectedDebt: 0 }));

vi.mock('../../hooks/useCardPaymentSchedule', () => ({
  useCardPaymentSchedule: (...args: unknown[]) => mockUseCardPaymentSchedule(...args),
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const accounts: Account[] = [
  {
    id: 'card-1',
    name: 'Visa Gold',
    type: 'credit',
    isDefault: false,
    initialBalance: 0,
    cutoffDay: 15,
    paymentDay: 5,
  },
];

const transactions: Transaction[] = [];
const recurringPayments: RecurringPayment[] = [];

const formatCurrency = (n: number) => `$${n.toLocaleString('es-CO')}`;

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('CardStatementsModal — Property 14: Balance masking under hideBalances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders monetary amounts when hideBalances is false', () => {
    render(
      <CardStatementsModal
        isOpen={true}
        onClose={() => {}}
        accounts={accounts}
        transactions={transactions}
        recurringPayments={recurringPayments}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    // Month total should show formatted currency
    expect(screen.getByText(formatCurrency(350000))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(200000))).toBeInTheDocument();
  });

  it('masks ALL monetary amounts with "••••••" when hideBalances is true', () => {
    render(
      <CardStatementsModal
        isOpen={true}
        onClose={() => {}}
        accounts={accounts}
        transactions={transactions}
        recurringPayments={recurringPayments}
        formatCurrency={formatCurrency}
        hideBalances={true}
      />
    );

    // Month totals should be masked
    const maskedElements = screen.getAllByText('••••••');
    // At least 2 month totals should be masked
    expect(maskedElements.length).toBeGreaterThanOrEqual(2);

    // Should NOT show any formatted currency values
    expect(screen.queryByText(formatCurrency(350000))).not.toBeInTheDocument();
    expect(screen.queryByText(formatCurrency(200000))).not.toBeInTheDocument();
  });

  it('masks statement total, installment amounts, and recurring amounts when expanded with hideBalances=true', () => {
    render(
      <CardStatementsModal
        isOpen={true}
        onClose={() => {}}
        accounts={accounts}
        transactions={transactions}
        recurringPayments={recurringPayments}
        formatCurrency={formatCurrency}
        hideBalances={true}
      />
    );

    // Expand the first month row
    const monthButton = screen.getByRole('button', { name: /julio 2025/i });
    fireEvent.click(monthButton);

    // All monetary slots should be masked
    const maskedElements = screen.getAllByText('••••••');
    // Expected: 2 month totals + 1 card statement total + 2 installments + 2 recurring + partial badge text
    // The partial badge shows "pagaste •••••• de ••••••" which contains multiple masks
    expect(maskedElements.length).toBeGreaterThanOrEqual(5);

    // Verify specific amounts are NOT visible
    expect(screen.queryByText(formatCurrency(150000))).not.toBeInTheDocument();
    expect(screen.queryByText(formatCurrency(50000))).not.toBeInTheDocument();
    expect(screen.queryByText(formatCurrency(45900))).not.toBeInTheDocument();
    expect(screen.queryByText(formatCurrency(16900))).not.toBeInTheDocument();
    expect(screen.queryByText(formatCurrency(350000))).not.toBeInTheDocument();
  });

  it('shows amounts when expanded with hideBalances=false', () => {
    render(
      <CardStatementsModal
        isOpen={true}
        onClose={() => {}}
        accounts={accounts}
        transactions={transactions}
        recurringPayments={recurringPayments}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    // Expand the first month row
    const monthButton = screen.getByRole('button', { name: /julio 2025/i });
    fireEvent.click(monthButton);

    // Installment amounts should be visible
    expect(screen.getByText(formatCurrency(150000))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(50000))).toBeInTheDocument();
    // Recurring amounts should be visible
    expect(screen.getByText(formatCurrency(45900))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(16900))).toBeInTheDocument();
  });

  it('does not render modal content when isOpen is false', () => {
    render(
      <CardStatementsModal
        isOpen={false}
        onClose={() => {}}
        accounts={accounts}
        transactions={transactions}
        recurringPayments={recurringPayments}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    // BaseModal returns null when not open
    expect(screen.queryByText('julio 2025')).not.toBeInTheDocument();
  });
});


// ─── Task 4.6: Balance comparison conditional rendering ────────────────────────

describe('CardStatementsModal — Balance comparison conditional rendering', () => {
  /**
   * **Validates: Requirements 2.1, 2.5**
   *
   * Tests that the modal conditionally renders the BalanceComparisonSection
   * based on the account's `usedCredit` field.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders balance section labels when usedCredit is defined on the account', () => {
    // Mock current cycle with projectedTotal defined
    const monthsWithProjected: MonthGroup[] = [
      {
        monthKey: '2025-07',
        label: 'julio 2025',
        total: 350000,
        isCurrent: true,
        isFuture: false,
        cards: [
          {
            cardId: 'card-1',
            cardName: 'Visa Gold',
            statementTotal: 350000,
            paidAmount: 100000,
            status: 'partial',
            installmentItems: [],
            recurringItems: [],
            cycleStart: new Date(2025, 5, 16),
            cycleEnd: new Date(2025, 6, 15),
            paymentDueDate: new Date(2025, 6, 5),
            projectedTotal: 350000,
          },
        ],
      },
    ];

    mockUseCardPaymentSchedule.mockReturnValue({
      months: monthsWithProjected,
      consolidatedProjectedTotal: 350000,
      consolidatedTotalProjectedDebt: 350000,
    });

    const accountsWithUsedCredit: Account[] = [
      {
        id: 'card-1',
        name: 'Visa Gold',
        type: 'credit',
        isDefault: false,
        initialBalance: 0,
        cutoffDay: 15,
        paymentDay: 5,
        usedCredit: 500000,
      },
    ];

    render(
      <CardStatementsModal
        isOpen={true}
        onClose={() => {}}
        accounts={accountsWithUsedCredit}
        transactions={[]}
        recurringPayments={[]}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    // Expand the current month
    const monthButton = screen.getByRole('button', { name: /julio 2025/i });
    fireEvent.click(monthButton);

    // Balance comparison section labels should be visible
    expect(screen.getByText('Saldo real')).toBeInTheDocument();
    expect(screen.getByText('Proyectado')).toBeInTheDocument();
    expect(screen.getByText('Sin registrar')).toBeInTheDocument();
  });

  it('omits balance section when usedCredit is undefined on the account', () => {
    // Mock current cycle with projectedTotal defined
    const monthsWithProjected: MonthGroup[] = [
      {
        monthKey: '2025-07',
        label: 'julio 2025',
        total: 350000,
        isCurrent: true,
        isFuture: false,
        cards: [
          {
            cardId: 'card-1',
            cardName: 'Visa Gold',
            statementTotal: 350000,
            paidAmount: 100000,
            status: 'partial',
            installmentItems: [],
            recurringItems: [],
            cycleStart: new Date(2025, 5, 16),
            cycleEnd: new Date(2025, 6, 15),
            paymentDueDate: new Date(2025, 6, 5),
            projectedTotal: 350000,
          },
        ],
      },
    ];

    mockUseCardPaymentSchedule.mockReturnValue({
      months: monthsWithProjected,
      consolidatedProjectedTotal: 350000,
      consolidatedTotalProjectedDebt: 350000,
    });

    // Account WITHOUT usedCredit
    const accountsWithoutUsedCredit: Account[] = [
      {
        id: 'card-1',
        name: 'Visa Gold',
        type: 'credit',
        isDefault: false,
        initialBalance: 0,
        cutoffDay: 15,
        paymentDay: 5,
        // usedCredit is intentionally omitted (undefined)
      },
    ];

    render(
      <CardStatementsModal
        isOpen={true}
        onClose={() => {}}
        accounts={accountsWithoutUsedCredit}
        transactions={[]}
        recurringPayments={[]}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    // Expand the current month
    const monthButton = screen.getByRole('button', { name: /julio 2025/i });
    fireEvent.click(monthButton);

    // Balance comparison section labels should NOT be visible
    expect(screen.queryByText('Saldo real')).not.toBeInTheDocument();
    expect(screen.queryByText('Proyectado')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin registrar')).not.toBeInTheDocument();
  });

  it('renders balance section when consolidatedProjectedTotal is 0 (zero-charge card) but usedCredit is defined', () => {
    // Mock current cycle with projectedTotal = 0 (zero-charge card)
    const monthsWithZeroProjected: MonthGroup[] = [
      {
        monthKey: '2025-07',
        label: 'julio 2025',
        total: 0,
        isCurrent: true,
        isFuture: false,
        cards: [
          {
            cardId: 'card-1',
            cardName: 'Visa Gold',
            statementTotal: 0,
            paidAmount: 0,
            status: 'pending',
            installmentItems: [],
            recurringItems: [],
            cycleStart: new Date(2025, 5, 16),
            cycleEnd: new Date(2025, 6, 15),
            paymentDueDate: new Date(2025, 6, 5),
            projectedTotal: 0,
          },
        ],
      },
    ];

    mockUseCardPaymentSchedule.mockReturnValue({
      months: monthsWithZeroProjected,
      consolidatedProjectedTotal: 0,
      consolidatedTotalProjectedDebt: 0,
    });

    // Account WITH usedCredit defined (even though card has no charges)
    const accountsWithUsedCredit: Account[] = [
      {
        id: 'card-1',
        name: 'Visa Gold',
        type: 'credit',
        isDefault: false,
        initialBalance: 0,
        cutoffDay: 15,
        paymentDay: 5,
        usedCredit: 120000,
      },
    ];

    render(
      <CardStatementsModal
        isOpen={true}
        onClose={() => {}}
        accounts={accountsWithUsedCredit}
        transactions={[]}
        recurringPayments={[]}
        formatCurrency={formatCurrency}
        hideBalances={false}
      />
    );

    // Expand the current month
    const monthButton = screen.getByRole('button', { name: /julio 2025/i });
    fireEvent.click(monthButton);

    // Balance comparison section should still render
    expect(screen.getByText('Saldo real')).toBeInTheDocument();
    expect(screen.getByText('Proyectado')).toBeInTheDocument();
    expect(screen.getByText('Sin registrar')).toBeInTheDocument();

    // Values should reflect the zero projectedTotal
    // usedCredit(120000) appears twice: "Saldo real" and "Sin registrar" (120000 - 0 = 120000)
    const matchingValues = screen.getAllByText(formatCurrency(120000));
    expect(matchingValues).toHaveLength(2);

    // Proyectado shows $0 (also appears in month header total, so use getAllByText)
    const zeroValues = screen.getAllByText(formatCurrency(0));
    expect(zeroValues.length).toBeGreaterThanOrEqual(1);

    // Verify unrecorded value uses amber styling (warning) via data-testid
    const unrecordedEl = screen.getByTestId('unrecorded-value');
    expect(unrecordedEl).toHaveTextContent(formatCurrency(120000));
    expect(unrecordedEl.className).toContain('text-warning');
  });
});
