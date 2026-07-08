import { describe, expect, it } from 'vitest';
import {
  addMonthsClamped,
  getDebtNextPaymentInfo,
  getNextMonthlyPaymentDate,
} from '../../utils/debtPaymentSchedule';
import type { Debt } from '../../types/finance';

const makeDebt = (overrides: Partial<Debt> = {}): Debt => ({
  id: 'd1',
  personName: 'Laura',
  type: 'lent',
  originalAmount: 1_000_000,
  remainingAmount: 1_000_000,
  isSettled: false,
  ...overrides,
});

describe('debtPaymentSchedule', () => {
  it('calcula el proximo pago mensual del mes actual si el dia no paso', () => {
    const date = getNextMonthlyPaymentDate(15, new Date(2026, 6, 8));
    expect(date).toEqual(new Date(2026, 6, 15));
  });

  it('salta al siguiente mes si el dia mensual ya paso', () => {
    const date = getNextMonthlyPaymentDate(15, new Date(2026, 6, 16));
    expect(date).toEqual(new Date(2026, 7, 15));
  });

  it('clampa dias largos al ultimo dia del mes', () => {
    const date = getNextMonthlyPaymentDate(31, new Date(2026, 1, 20));
    expect(date).toEqual(new Date(2026, 1, 28));
  });

  it('usa una fecha directa futura como excepcion puntual del dia mensual', () => {
    const debt = makeDebt({
      expectedPaymentDay: 15,
      nextPaymentDate: new Date(2026, 10, 30),
    });

    const info = getDebtNextPaymentInfo(debt, new Date(2026, 6, 8));
    expect(info?.source).toBe('direct');
    expect(info?.isOneTimeOverride).toBe(true);
    expect(info?.date).toEqual(new Date(2026, 10, 30));
    expect(info?.expectedPaymentDay).toBe(15);
  });

  it('vuelve al dia mensual cuando la excepcion puntual ya paso', () => {
    const debt = makeDebt({
      expectedPaymentDay: 15,
      nextPaymentDate: new Date(2026, 10, 30),
    });

    const info = getDebtNextPaymentInfo(debt, new Date(2026, 11, 1));
    expect(info?.source).toBe('monthly');
    expect(info?.isOneTimeOverride).toBe(false);
    expect(info?.date).toEqual(new Date(2026, 11, 15));
  });

  it('mantiene vencida una fecha directa sin dia mensual', () => {
    const debt = makeDebt({ nextPaymentDate: new Date(2026, 6, 1) });

    const info = getDebtNextPaymentInfo(debt, new Date(2026, 6, 8));
    expect(info?.source).toBe('direct');
    expect(info?.isOverdue).toBe(true);
  });

  it('crea fechas por meses preservando el dia posible del mes origen', () => {
    expect(addMonthsClamped(new Date(2026, 6, 31), 1)).toEqual(new Date(2026, 7, 31));
    expect(addMonthsClamped(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28));
  });
});
