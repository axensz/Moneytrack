import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialDebtFormData, getDebtFormFinancials } from '../../components/views/debts/utils/debtForm';
import type { Account, Transaction } from '../../types/finance';

const card: Account = { id: 'card', name: 'Nu', type: 'credit', initialBalance: 0, isDefault: false, interestRate: 12.682503013196978 };
const form = () => ({ ...createInitialDebtFormData(), originalAmount: '1000', accountId: 'card' });

describe('cálculo fijo del interés del préstamo', () => {
  it('convierte un porcentaje total con coma decimal en dinero', () => {
    expect(getDebtFormFinancials({ ...form(), interestMode: 'percentage', interestValue: '2,5' }, [], [])).toMatchObject({ originalAmount: 1000, totalInterestAmount: 25, remainingAmount: 1025, interestRate: 2.5 });
  });
  it('conserva un importe fijo sin convertirlo en porcentaje', () => {
    expect(getDebtFormFinancials({ ...form(), interestMode: 'fixed', interestValue: '150' }, [], [])).toMatchObject({ totalInterestAmount: 150, remainingAmount: 1150 });
  });
  it('usa la tasa E.A. de la tarjeta con cuotas mensuales (1% mensual, dos cuotas)', () => {
    const result = getDebtFormFinancials({ ...form(), interestMode: 'card', installments: 2 }, [card], []);
    expect(result).toMatchObject({ totalInterestAmount: 15.02, remainingAmount: 1015.02, installments: 2, monthlyInstallmentAmount: 507.51 });
    card.interestRate = 24;
    expect(result.interestRate).toBe(12.682503013196978);
    card.interestRate = 12.682503013196978;
  });
  it('mantiene una cuota sin intereses según la regla de las tarjetas', () => {
    expect(getDebtFormFinancials({ ...form(), interestMode: 'card', installments: 1 }, [card], [])).toMatchObject({ totalInterestAmount: 0, remainingAmount: 1000 });
  });
  it.each(['-1', 'Infinity', 'NaN', '', '201'])('rechaza un porcentaje inválido: %s', value => {
    expect(() => getDebtFormFinancials({ ...form(), interestMode: 'percentage', interestValue: value }, [], [])).toThrow();
  });
  it('requiere una tasa configurada en la tarjeta', () => {
    expect(() => getDebtFormFinancials({ ...form(), interestMode: 'card' }, [{ ...card, interestRate: undefined }], [])).toThrow(/tasa/i);
  });
  it('conserva las cuotas del origen al estimar interés con la tasa de tarjeta', () => {
    const source: Transaction = { id: 'source', type: 'expense', amount: 1000, category: 'Otros', description: 'Compra', date: new Date(), paid: true, accountId: 'card', installments: 1, hasInterest: false };
    expect(getDebtFormFinancials({ ...form(), existingTransactionId: 'source', interestMode: 'card', installments: 3 }, [card], [source])).toMatchObject({ installments: 1, totalInterestAmount: 0, remainingAmount: 1000, monthlyInstallmentAmount: 1000 });
  });
});

describe('interés mensual del formulario', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-09T17:00:00-05:00')); });
  afterEach(() => vi.useRealTimers());
  const monthly = () => ({ ...form(), lentDate: '2026-09-16', interestMode: 'percentage' as const, interestValue: '2,5', interestAccrual: 'monthly' as const, interestCutoffDay: '15' });

  it('mantiene el interés al registrar como opción inicial', () => {
    expect(createInitialDebtFormData().interestAccrual).toBe('upfront');
  });

  it('agrega solo cortes vencidos sobre el capital original y guarda el próximo corte', () => {
    expect(getDebtFormFinancials(monthly(), [], [])).toMatchObject({
      originalAmount: 1000, totalInterestAmount: 25, remainingAmount: 1025,
      interestAccrual: 'monthly', interestRate: 2.5, interestCutoffDay: 15,
      nextInterestDate: new Date('2026-11-15T00:00:00-05:00'),
    });
  });

  it('usa el corte y la tasa de tarjeta aunque la compra sea a una cuota', () => {
    expect(getDebtFormFinancials({ ...monthly(), interestMode: 'card', installments: 1 }, [{ ...card, cutoffDay: 15 }], [])).toMatchObject({
      interestMode: 'card', interestAccrual: 'monthly', interestRate: card.interestRate,
      interestCutoffDay: 15, totalInterestAmount: 10, remainingAmount: 1010,
    });
  });

  it('conserva capital, fecha, tasa y cuotas de origen sin anticipar su interés financiado', () => {
    const source: Transaction = { id: 'source', type: 'expense', amount: 2000, category: 'Otros', description: 'Compra', date: new Date('2026-09-16T12:00:00-05:00'), paid: true, accountId: 'card', installments: 3, hasInterest: true, interestRate: card.interestRate, totalInterestAmount: 99, monthlyInstallmentAmount: 699.67 };
    expect(getDebtFormFinancials({ ...monthly(), originalAmount: '5000', lentDate: '2026-01-01', existingTransactionId: 'source', interestMode: 'card' }, [{ ...card, interestRate: 50, cutoffDay: 15 }], [source])).toMatchObject({
      originalAmount: 2000, accountId: 'card', lentDate: source.date, installments: 3,
      monthlyInstallmentAmount: 699.67, interestRate: source.interestRate,
      interestAccrual: 'monthly', totalInterestAmount: 20, remainingAmount: 2020,
      nextInterestDate: new Date('2026-11-15T00:00:00-05:00'),
    });
  });

  it('exige un día de corte configurado para la tarjeta', () => {
    expect(() => getDebtFormFinancials({ ...monthly(), interestMode: 'card' }, [card], [])).toThrow(/corte/i);
  });

  it.each(['', '0', '32', '15.5', 'NaN'])('rechaza un día de corte manual inválido: %s', interestCutoffDay => {
    expect(() => getDebtFormFinancials({ ...monthly(), interestCutoffDay }, [], [])).toThrow(/corte/i);
  });

  it.each(['fixed', 'none'] as const)('rechaza modalidad mensual para %s', interestMode => {
    expect(() => getDebtFormFinancials({ ...monthly(), interestMode }, [], [])).toThrow(/mensual/i);
  });
});
