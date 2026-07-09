import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TransactionForm } from '@/components/shared/TransactionForm';
import type { Account, NewTransaction } from '@/types/finance';

const mocks = vi.hoisted(() => ({
  account: null as Account | null,
}));

vi.mock('@/hooks/useFinanceSelectors', () => ({
  useAccountDomain: () => ({
    accounts: mocks.account ? [mocks.account] : [],
    defaultAccount: mocks.account,
  }),
  useTransactionDomain: () => ({
    transactions: [],
    balanceTransactions: [],
  }),
  useCategoryDomain: () => ({
    categories: {
      expense: ['Alimentación'],
      income: ['Salario'],
    },
  }),
  useBeneficiaryDomain: () => ({
    beneficiaries: ['Titular', 'Familia'],
  }),
  useRecurringDomain: () => ({
    recurringPayments: [],
  }),
}));

const cashAccount: Account = {
  id: 'cash-account',
  name: 'Efectivo',
  type: 'cash',
  initialBalance: 0,
  isDefault: true,
  creditLimit: 0,
  cutoffDay: 0,
  paymentDay: 0,
  monthlySpendingLimit: 0,
  interestRate: 0,
};

const creditAccount: Account = {
  ...cashAccount,
  id: 'credit-account',
  name: 'Visa',
  type: 'credit',
  creditLimit: 5_000_000,
};

const baseTransaction: NewTransaction = {
  type: 'expense',
  amount: '',
  category: '',
  description: '',
  date: '2026-07-09',
  paid: true,
  accountId: 'cash-account',
  toAccountId: '',
  beneficiary: '',
  hasInterest: false,
  installments: 1,
  currency: 'COP',
  exchangeRate: '',
};

function TransactionFormHarness({ accountId = cashAccount.id }: { accountId?: string }) {
  const [newTransaction, setNewTransaction] = useState<NewTransaction>({
    ...baseTransaction,
    accountId: accountId ?? '',
  });

  return (
    <TransactionForm
      isOpen
      newTransaction={newTransaction}
      setNewTransaction={setNewTransaction}
      onSubmit={() => {}}
      onSubmitAndContinue={() => {}}
      onCancel={() => {}}
    />
  );
}

describe('TransactionForm compacto', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T12:00:00'));
    mocks.account = cashAccount;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deja los detalles opcionales plegados en un gasto habitual', () => {
    render(<TransactionFormHarness />);

    expect(screen.getByLabelText('Monto')).toBeInTheDocument();
    expect(screen.getByLabelText('Categoría')).toBeInTheDocument();
    expect(screen.getByLabelText('Cuenta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar y continuar' })).toHaveAttribute(
      'title',
      'Agregar y seguir ingresando (mantiene cuenta y fecha)'
    );

    const detailsButton = screen.getByRole('button', { name: /Más detalles/i });
    expect(detailsButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Hoy')).toBeInTheDocument();
    expect(screen.getByLabelText(/Descripción/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Persona / Beneficiario')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Descripción/i), { target: { value: 'Compra semanal' } });
    expect(detailsButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(detailsButton);

    expect(detailsButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument();
    expect(screen.getByLabelText('Persona / Beneficiario')).toBeInTheDocument();
  });

  it('pliega la configuración de cuotas hasta que se necesita', () => {
    mocks.account = creditAccount;
    render(<TransactionFormHarness accountId={creditAccount.id} />);

    const installmentsButton = screen.getByRole('button', { name: /Configuración de cuotas/i });
    expect(installmentsButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText(/Número de cuotas/i)).not.toBeInTheDocument();

    fireEvent.click(installmentsButton);

    expect(installmentsButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText(/Número de cuotas/i)).toBeInTheDocument();
  });
});
