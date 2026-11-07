import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { Account, NewTransaction } from '@/types/finance';

// ──────────────────────────────────────────────────────────────────────────
// Suite 1: el selector de cuenta del formulario de transacciones EXCLUYE las
// cuentas archivadas al crear, pero conserva la que ya está seleccionada.
// ──────────────────────────────────────────────────────────────────────────

const txMocks = vi.hoisted(() => ({
  accounts: [] as Account[],
  defaultAccount: null as Account | null,
}));

vi.mock('@/hooks/useFinanceSelectors', () => ({
  useAccountDomain: () => ({
    accounts: txMocks.accounts,
    defaultAccount: txMocks.defaultAccount,
  }),
  useTransactionDomain: () => ({ transactions: [], balanceTransactions: [] }),
  useCategoryDomain: () => ({
    categories: { expense: ['Alimentación'], income: ['Salario'] },
  }),
  useBeneficiaryDomain: () => ({ beneficiaries: [] }),
  useRecurringDomain: () => ({ recurringPayments: [] }),
}));

import { TransactionForm } from '@/components/shared/TransactionForm';

const activeAccount: Account = {
  id: 'activa',
  name: 'Bancolombia',
  type: 'savings',
  initialBalance: 0,
  isDefault: true,
};

const archivedAccount: Account = {
  id: 'gold',
  name: 'Gold',
  type: 'credit',
  initialBalance: 0,
  isDefault: false,
  creditLimit: 1_000_000,
  usedCredit: 0,
  archived: true,
  archivedAt: new Date('2026-01-01'),
};

const baseTransaction: NewTransaction = {
  type: 'expense',
  amount: '',
  category: '',
  description: '',
  date: '2026-07-09',
  paid: true,
  accountId: 'activa',
  toAccountId: '',
  beneficiary: '',
  hasInterest: false,
  installments: 1,
  currency: 'COP',
  exchangeRate: '',
};

function TxHarness({ accountId = 'activa' }: { accountId?: string }) {
  const [newTransaction, setNewTransaction] = useState<NewTransaction>({
    ...baseTransaction,
    accountId,
  });
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

describe('TransactionForm — las cuentas archivadas no son seleccionables al crear', () => {
  beforeEach(() => {
    txMocks.accounts = [activeAccount, archivedAccount];
    txMocks.defaultAccount = activeAccount;
  });

  it('el selector de cuenta omite la cuenta archivada', () => {
    render(<TxHarness />);
    const select = screen.getByLabelText('Cuenta') as HTMLSelectElement;
    const options = within(select).getAllByRole('option').map(o => o.textContent?.trim());
    expect(options.some(label => label?.includes('Bancolombia'))).toBe(true);
    expect(options.some(label => label?.includes('Gold'))).toBe(false);
  });

  it('conserva la cuenta archivada si la transacción ya apunta a ella (edición histórica)', () => {
    render(<TxHarness accountId="gold" />);
    const select = screen.getByLabelText('Cuenta') as HTMLSelectElement;
    const options = within(select).getAllByRole('option').map(o => o.textContent?.trim());
    // Al estar seleccionada, la cuenta archivada sigue visible para no romper el movimiento.
    expect(options.some(label => label?.includes('Gold'))).toBe(true);
  });
});
