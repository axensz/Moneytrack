import { describe, it, expect } from 'vitest';
import {
  convertAnnualToMonthlyRate,
  calculateMonthlyInstallment,
  calculateInterest,
  validateInterestConfig,
} from '../../utils/interestCalculator';

// ─── convertAnnualToMonthlyRate ────────────────────────────────────

describe('convertAnnualToMonthlyRate', () => {
  it('converts 23.99% E.A. to ~1.8% monthly', () => {
    const monthly = convertAnnualToMonthlyRate(23.99);
    expect(monthly).toBeCloseTo(0.0181, 3);
  });

  it('returns 0 for 0% annual rate', () => {
    expect(convertAnnualToMonthlyRate(0)).toBe(0);
  });

  it('throws on negative rate', () => {
    expect(() => convertAnnualToMonthlyRate(-1)).toThrow('Tasa anual inválida');
  });

  it('throws on rate above 200%', () => {
    expect(() => convertAnnualToMonthlyRate(201)).toThrow('Tasa anual inválida');
  });

  it('accepts boundary rate 200%', () => {
    expect(() => convertAnnualToMonthlyRate(200)).not.toThrow();
  });
});

// ─── calculateMonthlyInstallment ───────────────────────────────────

describe('calculateMonthlyInstallment', () => {
  it('returns principal when installments = 1', () => {
    expect(calculateMonthlyInstallment(1_000_000, 0.018, 1)).toBe(1_000_000);
  });

  it('returns principal / n when rate = 0', () => {
    expect(calculateMonthlyInstallment(1_200_000, 0, 12)).toBe(100_000);
  });

  it('calculates French amortization correctly for 12 installments', () => {
    // $1,000,000 at ~1.8% monthly for 12 months
    const installment = calculateMonthlyInstallment(1_000_000, 0.018, 12);
    // Expected ~ $92,400 – $93,000 range (depends on exact rate)
    expect(installment).toBeGreaterThan(90_000);
    expect(installment).toBeLessThan(95_000);
  });

  it('throws on non-positive principal', () => {
    expect(() => calculateMonthlyInstallment(0, 0.018, 12)).toThrow('mayor a 0');
    expect(() => calculateMonthlyInstallment(-100, 0.018, 12)).toThrow('mayor a 0');
  });

  it('throws on less than 1 installment', () => {
    expect(() => calculateMonthlyInstallment(1000, 0.018, 0)).toThrow('al menos 1');
  });

  it('throws on negative monthly rate', () => {
    expect(() => calculateMonthlyInstallment(1000, -0.01, 12)).toThrow('negativa');
  });
});

// ─── calculateInterest ─────────────────────────────────────────────

describe('calculateInterest', () => {
  it('returns no interest when hasInterest is false', () => {
    const result = calculateInterest(500_000, 23.99, 6, false);

    expect(result.totalInterestAmount).toBe(0);
    expect(result.totalAmount).toBe(500_000);
    expect(result.monthlyInstallmentAmount).toBeCloseTo(500_000 / 6, 1);
    expect(result.effectiveAnnualRate).toBe(23.99);
  });

  it('forces no interest when installments = 1 regardless of hasInterest', () => {
    const result = calculateInterest(1_000_000, 23.99, 1, true);

    expect(result.totalInterestAmount).toBe(0);
    expect(result.totalAmount).toBe(1_000_000);
    expect(result.monthlyInstallmentAmount).toBe(1_000_000);
  });

  it('calculates interest for 12 installments', () => {
    const result = calculateInterest(1_000_000, 23.99, 12, true);

    expect(result.totalInterestAmount).toBeGreaterThan(0);
    expect(result.totalAmount).toBeGreaterThan(1_000_000);
    expect(result.monthlyInstallmentAmount).toBeGreaterThan(0);
    // Total = monthly * 12
    expect(result.totalAmount).toBeCloseTo(
      result.monthlyInstallmentAmount * 12,
      0
    );
  });

  it('preserves effectiveAnnualRate snapshot', () => {
    const result = calculateInterest(100_000, 28.5, 6, true);
    expect(result.effectiveAnnualRate).toBe(28.5);
  });

  it('more installments = more total interest', () => {
    const r6 = calculateInterest(1_000_000, 23.99, 6, true);
    const r12 = calculateInterest(1_000_000, 23.99, 12, true);
    const r24 = calculateInterest(1_000_000, 23.99, 24, true);

    expect(r12.totalInterestAmount).toBeGreaterThan(r6.totalInterestAmount);
    expect(r24.totalInterestAmount).toBeGreaterThan(r12.totalInterestAmount);
  });
});

// ─── validateInterestConfig ────────────────────────────────────────

describe('validateInterestConfig', () => {
  it('validates a correct config', () => {
    const result = validateInterestConfig(500_000, 23.99, 12);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails on non-positive principal', () => {
    const result = validateInterestConfig(0, 23.99, 12);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('mayor a 0'))).toBe(true);
  });

  it('fails on out-of-range annual rate', () => {
    const negative = validateInterestConfig(1000, -5, 12);
    expect(negative.valid).toBe(false);

    const tooHigh = validateInterestConfig(1000, 250, 12);
    expect(tooHigh.valid).toBe(false);
  });

  it('fails on out-of-range installments', () => {
    const zero = validateInterestConfig(1000, 20, 0);
    expect(zero.valid).toBe(false);

    const over60 = validateInterestConfig(1000, 20, 61);
    expect(over60.valid).toBe(false);
  });

  it('warns on non-standard installment count', () => {
    const result = validateInterestConfig(1000, 20, 5); // 5 is not standard
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('no estándar'))).toBe(true);
  });

  it('accepts standard installment counts', () => {
    for (const n of [1, 3, 6, 12, 24, 36]) {
      const result = validateInterestConfig(1000, 20, n);
      expect(result.valid).toBe(true);
    }
  });
});
