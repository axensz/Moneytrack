import { describe, it, expect } from 'vitest';
import type { Debt } from '../../types/finance';

/**
 * Standalone version of the registerDebtPayment clamp logic (#24).
 *
 * El monto que se mueve a la cuenta debe estar clampado a lo que la deuda justifica
 * (min(amount, remainingAmount)) ANTES de crear la transacción, para no mover más
 * dinero del que la deuda respalda al sobrepagar. El saldo restante y el monto
 * posteado deben quedar consistentes entre sí.
 */
function computeDebtPayment(debt: Debt, amount: number): {
  effectiveAmount: number;
  newRemaining: number;
  isSettled: boolean;
  posts: boolean;
} {
  const effectiveAmount = Math.min(amount, debt.remainingAmount);
  const newRemaining = Math.max(0, debt.remainingAmount - effectiveAmount);
  const isSettled = newRemaining === 0;
  // Solo se postea transacción cuando hay cuenta asociada y monto efectivo > 0.
  const posts = !!debt.accountId && effectiveAmount > 0;
  return { effectiveAmount, newRemaining, isSettled, posts };
}

describe('registerDebtPayment clamp (#24)', () => {
  const createDebt = (overrides?: Partial<Debt>): Debt => ({
    id: 'debt-1',
    personName: 'Juan',
    type: 'lent',
    originalAmount: 1000,
    remainingAmount: 1000,
    isSettled: false,
    accountId: 'acc-1',
    createdAt: new Date(),
    ...overrides,
  });

  it('posts the exact amount on a partial payment', () => {
    const result = computeDebtPayment(createDebt(), 300);
    expect(result.effectiveAmount).toBe(300);
    expect(result.newRemaining).toBe(700);
    expect(result.isSettled).toBe(false);
    expect(result.posts).toBe(true);
  });

  it('clamps an overpayment to the remaining amount', () => {
    const debt = createDebt({ remainingAmount: 500 });
    const result = computeDebtPayment(debt, 800);
    // Se mueve solo lo que la deuda justifica, no los 800 crudos.
    expect(result.effectiveAmount).toBe(500);
    expect(result.newRemaining).toBe(0);
    expect(result.isSettled).toBe(true);
    expect(result.posts).toBe(true);
  });

  it('settles exactly when paying the full remaining amount', () => {
    const debt = createDebt({ remainingAmount: 1000 });
    const result = computeDebtPayment(debt, 1000);
    expect(result.effectiveAmount).toBe(1000);
    expect(result.newRemaining).toBe(0);
    expect(result.isSettled).toBe(true);
  });

  it('does not post a transaction when the debt is already settled (no money moves)', () => {
    const debt = createDebt({ remainingAmount: 0, isSettled: true });
    const result = computeDebtPayment(debt, 200);
    expect(result.effectiveAmount).toBe(0);
    expect(result.newRemaining).toBe(0);
    expect(result.posts).toBe(false);
  });

  it('does not post when there is no associated account', () => {
    const debt = createDebt({ accountId: undefined });
    const result = computeDebtPayment(debt, 300);
    // El saldo igual se reduce, pero no se mueve dinero en ninguna cuenta.
    expect(result.effectiveAmount).toBe(300);
    expect(result.newRemaining).toBe(700);
    expect(result.posts).toBe(false);
  });

  it('clamps a borrowed-debt overpayment the same way', () => {
    const debt = createDebt({ type: 'borrowed', remainingAmount: 250 });
    const result = computeDebtPayment(debt, 1000);
    expect(result.effectiveAmount).toBe(250);
    expect(result.newRemaining).toBe(0);
    expect(result.isSettled).toBe(true);
  });
});
