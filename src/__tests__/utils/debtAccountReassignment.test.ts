import { describe, expect, it } from 'vitest';
import { LOAN_CATEGORY, LOAN_PAYMENT_CATEGORY } from '../../config/constants';
import { buildDebtAccountReassignmentPlan } from '../../utils/debtAccountReassignment';
import type { Account, Debt, Transaction } from '../../types/finance';

const savings: Account = {
  id: 'savings',
  name: 'Ahorros',
  type: 'savings',
  isDefault: true,
  initialBalance: 0,
};

const credit = (usedCredit = 1_000): Account => ({
  id: 'credit',
  name: 'Visa',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  creditLimit: 5_000,
  usedCredit,
});

const debt = (accountId: string | undefined = 'savings'): Debt => ({
  id: 'debt-1',
  personName: 'Isabella',
  type: 'lent',
  originalAmount: 1_000,
  remainingAmount: 600,
  accountId,
  isSettled: false,
  createdAt: new Date('2026-08-01T12:00:00Z'),
});

const principal = (accountId = 'savings'): Transaction => ({
  id: 'principal',
  type: 'expense',
  amount: 1_000,
  category: LOAN_CATEGORY,
  description: 'Préstamo a Isabella',
  date: new Date('2026-08-01T12:00:00Z'),
  paid: true,
  accountId,
  debtId: 'debt-1',
});

const payment = (accountId = 'savings'): Transaction => ({
  id: 'payment',
  type: 'income',
  amount: 400,
  category: LOAN_PAYMENT_CATEGORY,
  description: 'Cobro de Isabella',
  date: new Date('2026-08-02T12:00:00Z'),
  paid: true,
  accountId,
  debtId: 'debt-1',
});

describe('buildDebtAccountReassignmentPlan', () => {
  it('moves only the principal from savings to credit', () => {
    const historicalPayment = payment();
    const plan = buildDebtAccountReassignmentPlan(
      debt(),
      [principal(), historicalPayment],
      [savings, credit(0)],
      'credit'
    );

    expect(plan.nextAccountId).toBe('credit');
    expect(plan.principal?.before.accountId).toBe('savings');
    expect(plan.principal?.after).toMatchObject({ id: 'principal', accountId: 'credit' });
    expect(plan.untouchedTransactions).toEqual([historicalPayment]);
    expect(plan.creditAdjustments).toEqual([
      { accountId: 'credit', delta: 1_000, resultingUsedCredit: 1_000 },
    ]);
  });

  it('removes the old credit effect when moving the principal to savings', () => {
    const plan = buildDebtAccountReassignmentPlan(
      debt('credit'),
      [principal('credit'), payment('credit')],
      [savings, credit(1_000)],
      'savings'
    );

    expect(plan.principal?.after?.accountId).toBe('savings');
    expect(plan.creditAdjustments).toEqual([
      { accountId: 'credit', delta: -1_000, resultingUsedCredit: 0 },
    ]);
  });

  it('deletes the principal when the association is removed', () => {
    const plan = buildDebtAccountReassignmentPlan(
      debt('credit'),
      [principal('credit'), payment('credit')],
      [credit(1_000)],
      undefined
    );

    expect(plan.nextAccountId).toBeUndefined();
    expect(plan.principal?.after).toBeUndefined();
    expect(plan.creditAdjustments[0]).toEqual({
      accountId: 'credit',
      delta: -1_000,
      resultingUsedCredit: 0,
    });
  });

  it('changes only future-payment association for a legacy debt without principal', () => {
    const historicalPayment = payment();
    const plan = buildDebtAccountReassignmentPlan(
      debt('savings'),
      [historicalPayment],
      [savings, credit(0)],
      'credit'
    );

    expect(plan.principal).toBeNull();
    expect(plan.nextAccountId).toBe('credit');
    expect(plan.untouchedTransactions).toEqual([historicalPayment]);
    expect(plan.creditAdjustments).toEqual([]);
  });

  it('rejects an ambiguous history with multiple principals', () => {
    expect(() => buildDebtAccountReassignmentPlan(
      debt(),
      [principal(), { ...principal(), id: 'principal-2' }],
      [savings, credit()],
      'credit'
    )).toThrow(/más de una operación original|revisar el historial/i);
  });

  it('rejects a move that would leave persisted credit debt negative', () => {
    expect(() => buildDebtAccountReassignmentPlan(
      debt('credit'),
      [principal('credit')],
      [savings, credit(500)],
      'savings'
    )).toThrow(/deuda negativa|no es consistente/i);
  });

  it('rejects a credit reassignment without persisted usedCredit authority', () => {
    expect(() => buildDebtAccountReassignmentPlan(
      debt(),
      [principal()],
      [savings, { ...credit(), usedCredit: undefined }],
      'credit'
    )).toThrow(/reconciliación|autoridad/i);
  });

  it('rejects missing account references instead of guessing', () => {
    expect(() => buildDebtAccountReassignmentPlan(
      debt('missing'),
      [principal('missing')],
      [savings, credit()],
      'credit'
    )).toThrow(/cuenta anterior|no existe/i);

    expect(() => buildDebtAccountReassignmentPlan(
      debt(),
      [principal()],
      [savings],
      'missing'
    )).toThrow(/cuenta nueva|no existe/i);
  });
});
