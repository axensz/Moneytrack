/**
 * F2-stats-paid — useStatsData ahora exige `t.paid` (truthy), igual que
 * useGlobalStats. Antes los gráficos sumaban compras impagas (p. ej. una compra
 * de TC pendiente), mostrando una cifra distinta a la card "Gastos". Este test
 * de regresión FALLA con el código viejo (que solo filtraba adjustmentCategories)
 * y PASA con el nuevo (que además exige t.paid). Audit F-stats-charts.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStatsData } from '../../components/views/stats/hooks/useStatsData';
import { LOAN_CATEGORY, LOAN_PAYMENT_CATEGORY } from '../../config/constants';
import type { Transaction } from '../../types/finance';

// Fecha dentro de los últimos 6 meses para que entre en monthlyData.
const recentDate = (): Date => {
  const d = new Date();
  d.setDate(15); // día seguro dentro del mes en curso
  return d;
};

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx-1',
  type: 'expense',
  amount: 100_000,
  category: 'Alimentación',
  description: 'Test',
  date: recentDate(),
  paid: true,
  accountId: 'acc-1',
  ...overrides,
});

// Suma todos los `gastos` de los puntos mensuales.
const sumMonthlyGastos = (data: { gastos: number }[]) =>
  data.reduce((acc, p) => acc + p.gastos, 0);

const sumYearlyGastos = (data: { gastos: number }[]) =>
  data.reduce((acc, p) => acc + p.gastos, 0);

const categoryValue = (data: { name: string; value: number }[], name: string) =>
  data.find((c) => c.name === name)?.value ?? 0;

describe('useStatsData — filtra transacciones impagas (F2-stats-paid)', () => {
  it('NO suma un gasto con paid:false en monthlyData/yearlyData/categoryData', () => {
    const txs = [
      makeTx({ id: 'paid', amount: 100_000, paid: true, category: 'Alimentación' }),
      makeTx({ id: 'unpaid', amount: 999_999, paid: false, category: 'Alimentación' }),
    ];
    const { result } = renderHook(() => useStatsData(txs));

    // Solo el gasto pagado (100_000) debe contar; el impago (999_999) se excluye.
    expect(sumMonthlyGastos(result.current.monthlyData)).toBe(100_000);
    expect(sumYearlyGastos(result.current.yearlyData)).toBe(100_000);
    expect(categoryValue(result.current.categoryData, 'Alimentación')).toBe(100_000);
  });

  it('SÍ suma el MISMO gasto cuando paid:true', () => {
    const txs = [makeTx({ id: 'p', amount: 250_000, paid: true, category: 'Transporte' })];
    const { result } = renderHook(() => useStatsData(txs));

    expect(sumMonthlyGastos(result.current.monthlyData)).toBe(250_000);
    expect(sumYearlyGastos(result.current.yearlyData)).toBe(250_000);
    expect(categoryValue(result.current.categoryData, 'Transporte')).toBe(250_000);
  });

  it('NO suma un ingreso impago (paid:false) en monthlyData/yearlyData', () => {
    const txs = [
      makeTx({ id: 'inc-paid', type: 'income', amount: 500_000, paid: true }),
      makeTx({ id: 'inc-unpaid', type: 'income', amount: 777_777, paid: false }),
    ];
    const { result } = renderHook(() => useStatsData(txs));

    const sumMonthlyIngresos = result.current.monthlyData.reduce((a, p) => a + p.ingresos, 0);
    const sumYearlyIngresos = result.current.yearlyData.reduce((a, p) => a + p.ingresos, 0);
    expect(sumMonthlyIngresos).toBe(500_000);
    expect(sumYearlyIngresos).toBe(500_000);
  });

  it('sigue excluyendo categorías de ajuste (p. ej. "Ajuste") aunque estén pagas', () => {
    const txs = [
      makeTx({ id: 'real', amount: 100_000, paid: true, category: 'Alimentación' }),
      makeTx({ id: 'adj', amount: 50_000, paid: true, category: 'Ajuste' }),
    ];
    const { result } = renderHook(() => useStatsData(txs));

    // El ajuste pagado NO debe aparecer en ningún agregado.
    expect(sumMonthlyGastos(result.current.monthlyData)).toBe(100_000);
    expect(sumYearlyGastos(result.current.yearlyData)).toBe(100_000);
    expect(categoryValue(result.current.categoryData, 'Ajuste')).toBe(0);
    expect(categoryValue(result.current.categoryData, 'Alimentación')).toBe(100_000);
  });

  it('excluye préstamos y cobros de los gráficos (#10: movimiento interno)', () => {
    const txs = [
      makeTx({ id: 'real', type: 'expense', amount: 100_000, paid: true, category: 'Alimentación' }),
      // Prestar: expense 'Préstamo' (mueve saldo, no es gasto real) → fuera de los gráficos.
      makeTx({ id: 'loan', type: 'expense', amount: 1_000_000, paid: true, category: LOAN_CATEGORY }),
      // Cobrar préstamo: income 'Cobro Préstamo' → fuera de los gráficos.
      makeTx({ id: 'collect', type: 'income', amount: 400_000, paid: true, category: LOAN_PAYMENT_CATEGORY }),
    ];
    const { result } = renderHook(() => useStatsData(txs));

    // Gastos: solo alimentación; el préstamo de 1M no infla el gráfico.
    expect(sumMonthlyGastos(result.current.monthlyData)).toBe(100_000);
    expect(categoryValue(result.current.categoryData, LOAN_CATEGORY)).toBe(0);
    // Ingresos: el cobro de préstamo no cuenta.
    const sumMonthlyIngresos = result.current.monthlyData.reduce((a, p) => a + p.ingresos, 0);
    expect(sumMonthlyIngresos).toBe(0);
  });
});
