import { describe, expect, it } from 'vitest';
import type { RecurringPayment, Transaction } from '../../types/finance';
import {
  getRecurringLinkCandidates,
  isRecurringCycleKeyForPayment,
  recurringTransactionSatisfiesCycle,
} from '../../utils/recurringPayments';
import { cycleKey } from '../../utils/recurringDates';

const payment: RecurringPayment = {
  id: 'rent',
  name: 'Arriendo',
  amount: 1_200_000,
  category: 'Vivienda',
  dueDay: 5,
  frequency: 'monthly',
  isActive: true,
};

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  type: 'expense',
  amount: payment.amount,
  category: payment.category,
  description: payment.name,
  date: new Date(2026, 5, 6),
  paid: true,
  accountId: 'cash',
  recurringPaymentId: payment.id,
  ...overrides,
});

describe('recurringTransactionSatisfiesCycle', () => {
  const reference = new Date(2026, 5, 15);

  it('requires paid=true even when the explicit cycle matches', () => {
    expect(recurringTransactionSatisfiesCycle(
      payment,
      transaction({ paid: false, recurringCycle: cycleKey(payment, reference) }),
      reference,
    )).toBe(false);
  });

  it('accepts an explicit matching cycle regardless of the transaction date', () => {
    expect(recurringTransactionSatisfiesCycle(
      payment,
      transaction({
        date: new Date(2024, 0, 1),
        recurringCycle: cycleKey(payment, reference),
      }),
      reference,
    )).toBe(true);
  });

  it('uses the date window only for historical rows without recurringCycle', () => {
    expect(recurringTransactionSatisfiesCycle(
      payment,
      transaction({ recurringCycle: undefined, date: new Date(2026, 5, 6) }),
      reference,
    )).toBe(true);
    expect(recurringTransactionSatisfiesCycle(
      payment,
      transaction({ recurringCycle: undefined, date: new Date(2026, 4, 1) }),
      reference,
    )).toBe(false);
  });

  it('matches a historical annual row against the explicit annual window', () => {
    const annual = {
      ...payment,
      frequency: 'yearly' as const,
      dueDay: 15,
      createdAt: new Date(2020, 0, 15),
    };
    const targetCycle = cycleKey(annual, new Date(2026, 6, 1));

    expect(recurringTransactionSatisfiesCycle(
      annual,
      transaction({
        recurringCycle: undefined,
        date: new Date(2026, 11, 20),
      }),
      new Date(2026, 6, 1),
    )).toBe(true);
    expect(isRecurringCycleKeyForPayment(annual, targetCycle)).toBe(true);
    expect(isRecurringCycleKeyForPayment(annual, '2026-5-15')).toBe(false);
  });
});

describe('getRecurringLinkCandidates', () => {
  it('returns only paid expenses that are unlinked or belong to another cycle of the same payment', () => {
    const reference = new Date(2026, 5, 15);
    const currentCycle = cycleKey(payment, reference);
    const priorCycle = cycleKey(payment, new Date(2026, 4, 15));
    const candidates = getRecurringLinkCandidates([
      transaction({ id: 'pending', paid: false, recurringPaymentId: undefined }),
      transaction({ id: 'income', type: 'income', recurringPaymentId: undefined }),
      transaction({ id: 'other-payment', recurringPaymentId: 'utilities' }),
      transaction({ id: 'already-current', recurringCycle: currentCycle }),
      transaction({ id: 'prior', recurringCycle: priorCycle, date: new Date(2026, 5, 10) }),
      transaction({ id: 'unlinked', recurringPaymentId: undefined, date: new Date(2026, 5, 12) }),
    ], payment, reference);

    expect(candidates.map((candidate) => candidate.id)).toEqual(['unlinked', 'prior']);
  });
});
