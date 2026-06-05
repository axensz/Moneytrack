import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGlobalStats } from '../../hooks/useGlobalStats';
import { CREDIT_PAYMENT_CATEGORY, BALANCE_ADJUSTMENT_CATEGORY, TRANSFER_CATEGORY } from '../../config/constants';
import type { Account, Transaction } from '../../types/finance';

const savings: Account = {
  id: 'bank', name: 'Banco', type: 'savings', isDefault: true, initialBalance: 0,
};
const card: Account = {
  id: 'tc', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0,
  creditLimit: 5_000_000, usedCredit: 0,
};

const tx = (o: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  type: 'expense', amount: 0, category: 'Otros', description: '',
  date: new Date('2026-06-01'), paid: true, accountId: 'bank', ...o,
});

describe('useGlobalStats', () => {
  it('excludes transfers and card payments from income/expense totals (F2)', () => {
    const transactions: Transaction[] = [
      tx({ type: 'income', amount: 1_000_000, category: 'Salario' }),
      tx({ type: 'expense', amount: 200_000, category: 'Alimentación' }),
      // Pago de TC: ingreso a la tarjeta + gasto espejo del banco → NO son reales
      tx({ type: 'income', amount: 300_000, category: CREDIT_PAYMENT_CATEGORY, accountId: 'tc' }),
      tx({ type: 'expense', amount: 300_000, category: CREDIT_PAYMENT_CATEGORY, accountId: 'bank' }),
      // Transferencia entre cuentas
      tx({ type: 'transfer', amount: 500_000, category: TRANSFER_CATEGORY, toAccountId: 'tc' }),
      // Ajuste de saldo
      tx({ type: 'expense', amount: 50_000, category: BALANCE_ADJUSTMENT_CATEGORY }),
    ];

    const { result } = renderHook(() => useGlobalStats(transactions, [savings, card]));

    // Solo el salario real
    expect(result.current.totalIncome).toBe(1_000_000);
    // Solo el gasto real de alimentación (sin pago de TC ni ajuste)
    expect(result.current.totalExpenses).toBe(200_000);
  });

  it('counts unpaid credit card purchases as expenses but ignores card payments', () => {
    const transactions: Transaction[] = [
      tx({ type: 'expense', amount: 400_000, category: 'Compras Personales', accountId: 'tc', paid: false }),
      tx({ type: 'income', amount: 100_000, category: CREDIT_PAYMENT_CATEGORY, accountId: 'tc' }),
    ];

    const { result } = renderHook(() => useGlobalStats(transactions, [savings, card]));

    // La compra no pagada en TC cuenta como gasto; el pago de TC no
    expect(result.current.totalExpenses).toBe(400_000);
    expect(result.current.totalIncome).toBe(0);
  });
});
