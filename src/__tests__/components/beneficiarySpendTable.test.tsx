import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BeneficiarySpendTable } from '../../components/views/stats/components/BeneficiarySpendTable';
import type { Transaction } from '../../types/finance';

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx',
  type: 'expense',
  amount: 100_000,
  category: 'Alimentación',
  description: 'Test',
  date: new Date(),
  paid: true,
  accountId: 'bancolombia',
  ...overrides,
});

describe('BeneficiarySpendTable', () => {
  it('por defecto muestra el mes actual y solo cuenta personas seleccionadas distintas de Yo', () => {
    const currentMonth = new Date();
    const lastYear = new Date(currentMonth.getFullYear() - 1, currentMonth.getMonth(), 15);

    render(
      <BeneficiarySpendTable
        transactions={[
          tx({ id: 'empty', amount: 100_000, date: currentMonth, beneficiary: '' }),
          tx({ id: 'yo', amount: 200_000, date: currentMonth, beneficiary: 'Yo' }),
          tx({ id: 'ana-current', amount: 300_000, date: currentMonth, beneficiary: 'Ana' }),
          tx({ id: 'ana-old', amount: 900_000, date: lastYear, beneficiary: 'Ana' }),
        ]}
        formatCurrency={(amount) => `$${amount}`}
      />
    );

    expect(screen.getByLabelText('Intervalo de gastos por persona')).toHaveValue('this-month');
    expect(screen.getAllByText('Ana').length).toBeGreaterThan(0);
    expect(screen.queryByText('Yo')).not.toBeInTheDocument();
    expect(screen.queryByText('Bancolombia')).not.toBeInTheDocument();
    expect(screen.getAllByText('$300000').length).toBeGreaterThan(0);
    expect(screen.queryByText('$1200000')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Intervalo de gastos por persona'), {
      target: { value: 'all' },
    });

    expect(screen.getAllByText('$1200000').length).toBeGreaterThan(0);
  });
});
