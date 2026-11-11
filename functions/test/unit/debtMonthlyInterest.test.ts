import { describe, expect, it } from 'vitest';
import { calculateMonthlyInterestCharge, getFirstInterestDate, getMonthlyInterestAccrual } from '../../src/shared/debtMonthlyInterest.js';

const debt = {
  originalAmount: 1_000_000,
  remainingAmount: 600_000,
  isSettled: false,
  totalInterestAmount: 20_000,
  interestAccrual: 'monthly' as const,
  interestMode: 'percentage' as const,
  interestRate: 2,
  interestCutoffDay: 31,
  nextInterestDate: new Date('2026-01-31T05:00:00Z'),
};

describe('monthly loan interest', () => {
  it('charges a monthly percentage on original principal after partial payments', () => {
    expect(calculateMonthlyInterestCharge(1_000_000, 'percentage', 2)).toBe(20_000);
    expect(getMonthlyInterestAccrual(debt, new Date('2026-01-31T05:00:00Z'))).toEqual({
      totalInterestAmount: 40_000,
      remainingAmount: 620_000,
      nextInterestDate: new Date('2026-02-28T05:00:00Z'),
    });
  });

  it('converts card effective annual rate to a monthly charge with cent precision', () => {
    expect(calculateMonthlyInterestCharge(1_000_000, 'card', 26.8241794562545)).toBe(20_000);
    expect(calculateMonthlyInterestCharge(1_000_000, 'card', 24)).toBe(18_087.58);
  });

  it.each([
    ['2026-01-30T23:00:00-05:00', 31, '2026-01-31T05:00:00.000Z'],
    ['2026-01-31T00:00:00-05:00', 31, '2026-02-28T05:00:00.000Z'],
    ['2026-02-28', 31, '2026-03-31T05:00:00.000Z'],
    ['2028-02-28', 31, '2028-02-29T05:00:00.000Z'],
    ['2026-02-01T02:00:00Z', 31, '2026-02-28T05:00:00.000Z'],
    ['2026-12-31', 1, '2027-01-01T05:00:00.000Z'],
  ])('uses the first cut strictly after the origin day %s', (origin, cutoff, expected) => {
    expect(getFirstInterestDate(origin, cutoff).toISOString()).toBe(expected);
  });

  it('accepts Date and Firestore Timestamp values without depending on Firebase', () => {
    expect(getFirstInterestDate(new Date('2026-01-31T05:00:00Z'), 31).toISOString()).toBe('2026-02-28T05:00:00.000Z');
    expect(getFirstInterestDate({ toDate: () => new Date('2026-01-31T05:00:00Z') }, 31).toISOString()).toBe('2026-02-28T05:00:00.000Z');
    expect(getMonthlyInterestAccrual({ ...debt, nextInterestDate: { toDate: () => debt.nextInterestDate } }, new Date('2026-01-31T05:00:00Z'))?.remainingAmount).toBe(620_000);
  });

  it('recovers missed cuts using the original cutoff after February without compounding', () => {
    const result = getMonthlyInterestAccrual(debt, new Date('2026-03-31T05:00:00Z'));
    expect(result).toEqual({ totalInterestAmount: 80_000, remainingAmount: 660_000, nextInterestDate: new Date('2026-04-30T05:00:00Z') });
    expect(getMonthlyInterestAccrual({ ...debt, ...result! }, new Date('2026-03-31T05:00:00Z'))).toBeNull();
  });

  it('waits until midnight Bogota on the cut date', () => {
    expect(getMonthlyInterestAccrual(debt, new Date('2026-01-31T04:59:59Z'))).toBeNull();
  });

  it('advances a due zero-rate loan without adding interest', () => {
    expect(getMonthlyInterestAccrual({ ...debt, interestRate: 0 }, new Date('2026-03-31T05:00:00Z'))).toEqual({
      totalInterestAmount: 20_000, remainingAmount: 600_000, nextInterestDate: new Date('2026-04-30T05:00:00Z'),
    });
  });

  it.each([
    { isSettled: true }, { remainingAmount: 0 }, { interestAccrual: undefined },
    { interestAccrual: 'upfront' }, { interestMode: 'fixed' }, { interestRate: -2 },
    { nextInterestDate: 'invalid' }, { interestCutoffDay: 32 }, { totalInterestAmount: Number.NaN },
  ])('does not accrue settled, legacy or invalid debts: %o', override => {
    expect(getMonthlyInterestAccrual({ ...debt, ...override } as typeof debt, new Date('2026-03-31T05:00:00Z'))).toBeNull();
  });

  it('refuses an invalid monthly charge', () => {
    expect(() => calculateMonthlyInterestCharge(1_000_000_001, 'percentage', 2)).toThrow(RangeError);
    expect(() => calculateMonthlyInterestCharge(1_000_000_000, 'percentage', 101)).toThrow(RangeError);
  });

  it('blocks a payment preflight instead of silently skipping overdue interest above the loan limit', () => {
    const mostlyPaid = { ...debt, originalAmount: 999_000_000, remainingAmount: 1_000, totalInterestAmount: 0, interestRate: 1 };
    expect(() => getMonthlyInterestAccrual(mostlyPaid, new Date('2026-01-31T05:00:00Z')))
      .toThrow(new RangeError('El interés acumulado supera el límite del préstamo'));
  });

  it('reports due interest that exceeds a stored money limit as an error', () => {
    const nearlyFull = { ...debt, originalAmount: 500_000_000, remainingAmount: 999_000_000, totalInterestAmount: 499_000_000 };
    expect(() => getMonthlyInterestAccrual(nearlyFull, new Date('2026-01-31T05:00:00Z'))).toThrow(RangeError);
    expect(() => getMonthlyInterestAccrual({ ...debt, originalAmount: 1_000_000_000, interestRate: 200 }, new Date('2026-01-31T05:00:00Z')))
      .toThrow(new RangeError('El interés acumulado supera el límite del préstamo'));
  });

  it('rejects invalid origins and cutoff days', () => {
    expect(() => getFirstInterestDate('invalid', 31)).toThrow(RangeError);
    expect(() => getFirstInterestDate('2026-02-31', 31)).toThrow(RangeError);
    expect(() => getFirstInterestDate('2026-01-01', 0)).toThrow(RangeError);
  });
});
