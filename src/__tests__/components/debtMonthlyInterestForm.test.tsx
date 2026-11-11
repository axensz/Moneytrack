import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewDebtForm } from '../../components/views/debts/components/NewDebtForm';
import { DebtFinancialDetails } from '../../components/views/debts/components/DebtFinancialDetails';
import { createInitialDebtFormData } from '../../components/views/debts/utils/debtForm';
import { createEmptyPaymentScheduleForm } from '../../components/views/debts/utils/paymentScheduleForm';
import type { Account, Debt, Transaction } from '../../types/finance';

const card: Account = { id: 'card', name: 'Nu', type: 'credit', isDefault: false, initialBalance: 0, interestRate: 24, cutoffDay: 15 };

function Form({ transactions = [] }: { transactions?: Transaction[] }) {
  const [formData, setFormData] = useState({ ...createInitialDebtFormData(), originalAmount: '1000', lentDate: '2026-11-01' });
  const [paymentSchedule, setPaymentSchedule] = useState(createEmptyPaymentScheduleForm());
  return <NewDebtForm accounts={[card]} transactions={transactions} errors={{}} formData={formData} setFormData={setFormData} paymentSchedule={paymentSchedule} setPaymentSchedule={setPaymentSchedule} isSubmitting={false} onCancel={vi.fn()} onSubmit={vi.fn()} />;
}

describe('elección de interés mensual', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-09T12:00:00-05:00')); });
  afterEach(() => vi.useRealTimers());

  it('explica la base original y muestra cuota de interés, acumulado y próximo corte', () => {
    render(<Form />);
    fireEvent.change(screen.getByLabelText('Interés'), { target: { value: 'percentage' } });
    expect(screen.getByLabelText('Cuándo agregar el interés')).toHaveValue('upfront');
    fireEvent.change(screen.getByLabelText('Cuándo agregar el interés'), { target: { value: 'monthly' } });
    fireEvent.change(screen.getByLabelText('Porcentaje mensual (%)'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Día de corte del interés'), { target: { value: '15' } });
    expect(screen.getByText(/sobre el capital original/i)).toBeInTheDocument();
    expect(screen.getByText('Interés agregado hasta hoy')).toBeInTheDocument();
    expect(screen.getByText('Interés por cada corte')).toBeInTheDocument();
    expect(screen.getByText('Próximo corte')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Interés'), { target: { value: 'fixed' } });
    expect(screen.queryByLabelText('Cuándo agregar el interés')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Monto del interés')).toBeInTheDocument();
  });

  it('permite elegir mensual para una transacción que ya tiene financiación', () => {
    const transaction: Transaction = { id: 'source', type: 'expense', amount: 2000, category: 'Otros', description: 'Compra Ana', date: new Date('2026-11-01T12:00:00-05:00'), paid: true, accountId: 'card', installments: 3, hasInterest: true, interestRate: 12, totalInterestAmount: 99 };
    render(<Form transactions={[transaction]} />);
    fireEvent.change(screen.getByLabelText('Transacción existente (opcional)'), { target: { value: 'source' } });
    fireEvent.change(screen.getByLabelText('Cuándo agregar el interés'), { target: { value: 'monthly' } });
    expect(screen.getByText(/Día 15 de cada mes/)).toBeInTheDocument();
    expect(screen.getByText(/12% E.A./)).toBeInTheDocument();
    expect(screen.getByText(/3 cuotas/)).toBeInTheDocument();
    expect(screen.getByLabelText('Monto')).toBeDisabled();
    expect(screen.getByLabelText(/Cuenta asociada/)).toBeDisabled();
  });

  it('oculta importes mensuales con el mismo formato privado del saldo', () => {
    const debt: Debt = { personName: 'Ana', type: 'lent', originalAmount: 1000, remainingAmount: 1020, totalInterestAmount: 20, interestMode: 'percentage', interestRate: 2, interestAccrual: 'monthly', interestCutoffDay: 15, nextInterestDate: new Date('2026-11-15T00:00:00-05:00'), isSettled: false };
    const { rerender } = render(<DebtFinancialDetails debt={debt} formatAmount={() => '••••'} />);
    expect(screen.getByText(/sobre el capital original/i)).toBeInTheDocument();
    expect(screen.getByText(/Próximo corte:/)).toBeInTheDocument();
    expect(screen.getAllByText('••••').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(/\$1[.,]000/)).not.toBeInTheDocument();
    rerender(<DebtFinancialDetails debt={{ ...debt, isSettled: true }} formatAmount={() => '••••'} />);
    expect(screen.queryByText(/Próximo corte:/)).not.toBeInTheDocument();
  });
});
