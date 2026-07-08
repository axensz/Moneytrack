import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TransactionForm } from '@/components/shared/TransactionForm';
import type { NewTransaction } from '@/types/finance';

vi.mock('@/hooks/useFinanceSelectors', () => {
  const creditAccount = {
    id: 'credit-card',
    name: 'Visa',
    type: 'credit' as const,
    isDefault: true,
    initialBalance: 0,
    creditLimit: 5000000,
    cutoffDay: 15,
    paymentDay: 30,
    monthlySpendingLimit: 0,
    interestRate: 0,
    usedCredit: 0,
  };

  return {
    useAccountDomain: () => ({
      accounts: [creditAccount],
      defaultAccount: creditAccount,
    }),
    useTransactionDomain: () => ({
      transactions: [],
      balanceTransactions: [],
    }),
    useCategoryDomain: () => ({
      categories: {
        expense: ['Otro'],
        income: ['Salario'],
      },
    }),
    useBeneficiaryDomain: () => ({
      beneficiaries: ['Yo', 'Familia'],
    }),
    useRecurringDomain: () => ({
      recurringPayments: [],
    }),
  };
});

const baseTransaction: NewTransaction = {
  type: 'expense',
  amount: '10',
  category: 'Otro',
  description: '',
  date: '2026-07-08',
  paid: true,
  accountId: 'credit-card',
  toAccountId: '',
  beneficiary: '',
  hasInterest: false,
  installments: 1,
  currency: 'USD',
  exchangeRate: '',
};

function TransactionFormHarness() {
  const [newTransaction, setNewTransaction] = useState<NewTransaction>(baseTransaction);

  return (
    <TransactionForm
      isOpen
      newTransaction={newTransaction}
      setNewTransaction={setNewTransaction}
      onSubmit={() => {}}
      onCancel={() => {}}
    />
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TransactionForm TRM oficial', () => {
  it('clears the official lookup error after entering a manual TRM', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(<TransactionFormHarness />);

    fireEvent.click(screen.getByRole('button', { name: /usar oficial/i }));

    expect(await screen.findByText(/No se pudo consultar la TRM oficial/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/TRM/i), { target: { value: '4.000' } });

    await waitFor(() => {
      expect(screen.queryByText(/No se pudo consultar la TRM oficial/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Se registra en COP:/i)).toBeInTheDocument();
  });

  it('marks the rate as official only after a successful lookup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ valor: '3335.5' }],
    }));

    render(<TransactionFormHarness />);

    fireEvent.click(screen.getByRole('button', { name: /usar oficial/i }));

    expect(await screen.findByText(/TRM oficial aplicada/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/TRM/i)).toHaveValue('3.335,50');
  });
});
