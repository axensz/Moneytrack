import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DebtCard } from '../../components/views/debts/components/DebtCard';
import type { Account, Debt } from '../../types/finance';
import { createEmptyPaymentScheduleForm } from '../../components/views/debts/utils/paymentScheduleForm';

const creditCard: Account = {
  id: 'card-platino',
  name: 'Platino',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  interestRate: 28.32,
  cutoffDay: 30,
};

const baseProps = {
  formatCurrency: (n: number) => `$ ${n.toLocaleString('es-CO')}`,
  onOpenPayment: vi.fn(),
  onDelete: vi.fn(),
  onChangeAccount: vi.fn(),
  showBalanceModifier: null,
  setShowBalanceModifier: vi.fn(),
  modifierAmount: '',
  setModifierAmount: vi.fn(),
  modifierOperation: 'add' as const,
  setModifierOperation: vi.fn(),
  onModifyBalance: vi.fn(),
  onForgive: vi.fn(),
  showForgive: null,
  setShowForgive: vi.fn(),
  showPaymentScheduleForm: null,
  paymentScheduleForm: createEmptyPaymentScheduleForm(),
  setPaymentScheduleForm: vi.fn(),
  onOpenPaymentSchedule: vi.fn(),
  onSavePaymentSchedule: vi.fn(),
  setShowPaymentScheduleForm: vi.fn(),
};

describe('DebtCard presentación visual limpia con y sin interés', () => {
  it('muestra la barra de progreso siempre que hay un monto total mayor a cero, incluso al 0% pagado', () => {
    const debt: Debt = {
      id: 'debt-1',
      personName: 'Garces',
      description: 'Ingles',
      type: 'lent',
      originalAmount: 1592400,
      remainingAmount: 1592400,
      totalInterestAmount: 0,
      interestMode: 'card',
      interestRate: 28.32,
      interestAccrual: 'monthly',
      interestCutoffDay: 30,
      installments: 12,
      isSettled: false,
      accountId: 'card-platino',
      nextInterestDate: new Date('2026-11-30T00:00:00-05:00'),
    };

    render(<DebtCard {...baseProps} debt={debt} account={creditCard} />);

    // Barra de progreso presente al 0% pagado
    expect(screen.getByText('0% pagado')).toBeInTheDocument();
    expect(screen.getByText('Faltan $ 1.592.400')).toBeInTheDocument();

    // Línea de tarjeta compacta con cuotas y tasa
    expect(screen.getByText(/Tarjeta:/)).toBeInTheDocument();
    expect(screen.getByText('Platino')).toBeInTheDocument();
    expect(screen.getAllByText(/12 cuotas/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/28,32% E.A./).length).toBeGreaterThanOrEqual(1);

    // Chip de próximo corte en la fila de badges con el color estándar sky
    const cutoffBadge = screen.getByText(/Próximo corte: 30\/11\/2026/);
    expect(cutoffBadge).toBeInTheDocument();
    expect(cutoffBadge).toHaveClass('bg-sky-50');

    // Desglose de interés colapsado por defecto (dentro de <details>)
    expect(screen.getByText('Ver desglose de interés')).toBeInTheDocument();
  });

  it('mantiene la apariencia simple para préstamos sin interés', () => {
    const savingsAccount: Account = {
      id: 'bancolombia',
      name: 'Bancolombia',
      type: 'savings',
      isDefault: true,
      initialBalance: 0,
    };

    const debt: Debt = {
      id: 'debt-2',
      personName: 'Isabella',
      description: 'Samsung S26 Ultra',
      type: 'lent',
      originalAmount: 4649900,
      remainingAmount: 3099936,
      isSettled: false,
      accountId: 'bancolombia',
    };

    render(<DebtCard {...baseProps} debt={debt} account={savingsAccount} />);

    // Barra de progreso con porcentaje pagado y restante
    expect(screen.getByText('33% pagado')).toBeInTheDocument();
    expect(screen.getByText('Faltan $ 3.099.936')).toBeInTheDocument();

    // Solo muestra la cuenta sin botón de desglose de interés
    expect(screen.getByText(/Cuenta:/)).toBeInTheDocument();
    expect(screen.getByText('Bancolombia')).toBeInTheDocument();
    expect(screen.queryByText('Ver desglose de interés')).not.toBeInTheDocument();
  });
});
