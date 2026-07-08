import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBudgetRecommendations } from '../../hooks/useBudgetRecommendations';
import { BALANCE_ADJUSTMENT_CATEGORY, CREDIT_PAYMENT_CATEGORY, LOAN_CATEGORY, TRANSFER_CATEGORY } from '../../config/constants';
import type { Budget, Transaction } from '../../types/finance';

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  type: 'expense',
  amount: 0,
  category: 'Otros',
  description: 'Test',
  date: new Date('2026-06-10'),
  paid: true,
  accountId: 'acc-1',
  ...overrides,
});

const budgets: Budget[] = [];

describe('useBudgetRecommendations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('recomienda solo sobre transacciones reales pagadas del mes anterior', () => {
    const transactions: Transaction[] = [
      tx({ type: 'income', amount: 3_000_000, category: 'Salario' }),
      tx({ amount: 900_000, category: 'Alimentación' }),
      tx({ amount: 999_999, category: 'Compras Personales', paid: false }),
      tx({ amount: 500_000, category: CREDIT_PAYMENT_CATEGORY }),
      tx({ amount: 400_000, category: BALANCE_ADJUSTMENT_CATEGORY }),
      tx({ amount: 300_000, category: LOAN_CATEGORY }),
      tx({ type: 'transfer', amount: 200_000, category: TRANSFER_CATEGORY }),
    ];

    const { result } = renderHook(() => useBudgetRecommendations(transactions, budgets));

    expect(result.current!.totalLastMonth).toBe(900_000);
    expect(result.current!.recommendations).toHaveLength(1);
    expect(result.current!.recommendations[0]).toMatchObject({
      category: 'Alimentación',
      suggestedLimit: 810_000,
      reason: 'Esencial — meta de ahorro 10%',
    });
  });

  it('usa la clasificación compartida aunque la categoría venga sin tilde', () => {
    const transactions: Transaction[] = [
      tx({ type: 'income', amount: 1_000_000, category: 'Salario' }),
      tx({ amount: 100_000, category: 'Educacion' }),
    ];

    const { result } = renderHook(() => useBudgetRecommendations(transactions, budgets));

    expect(result.current!.rule503020.needs).toBe(100_000);
    expect(result.current!.rule503020.wants).toBe(0);
    expect(result.current!.recommendations[0]).toMatchObject({
      category: 'Educacion',
      suggestedLimit: 105_000,
      reason: 'Gasto fijo — margen del 5%',
    });
  });
});
