/**
 * useFinancialPlan — fondo de emergencia desde el saldo líquido REAL (no desde
 * cero), "siguiente paso" según la dimensión más floja del score, y passthrough
 * de utilización de tarjetas. Regresión del bug en que `monthsToEmergencyFund`
 * ignoraba el saldo que el usuario ya tenía.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFinancialPlan, type PlanConfig } from '../../hooks/useFinancialPlan';
import type { Transaction } from '../../types/finance';

// Mes (YYYY-MM) y fecha (día 15) a N meses del actual — el día 15 siempre existe.
const monthsAgo = (n: number): Date => {
  const d = new Date();
  d.setDate(15);
  d.setMonth(d.getMonth() - n);
  return d;
};
const ym = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx',
  type: 'expense',
  amount: 500_000,
  category: 'Alimentación',
  description: 'Test',
  date: monthsAgo(1),
  paid: true,
  accountId: 'acc-1',
  ...overrides,
});

// Escenario base: inicia hace 2 meses; 2 meses COMPLETADOS con 500k de gasto
// cada uno. Ingreso declarado 1M → gasto mensual fiable 500k, ahorro 500k/mes.
// → fondo mínimo (3 meses) = 1,5M; ideal (6 meses) = 3M.
const config: PlanConfig = { startMonth: ym(monthsAgo(2)), declaredIncome: 1_000_000 };
const baseTxs: Transaction[] = [
  makeTx({ id: 'a', date: monthsAgo(2), amount: 500_000, category: 'Alimentación' }),
  makeTx({ id: 'b', date: monthsAgo(1), amount: 500_000, category: 'Alimentación' }),
];

describe('useFinancialPlan — fondo de emergencia desde saldo real', () => {
  it('con saldo líquido = mínimo (1,5M) ya cubre 3 meses y monthsTo3m = 0', () => {
    const { result } = renderHook(() =>
      useFinancialPlan(baseTxs, config, { liquidBalance: 1_500_000 }),
    );
    const ef = result.current!.emergencyFund;
    expect(ef.coverageMonths).toBe(3);
    expect(ef.status).toBe('covered');
    expect(ef.monthsTo3m).toBe(0);
    expect(ef.monthsTo6m).toBe(3); // faltan 1,5M a 500k/mes
    // El bug que arregla: la proyección ya NO pide ahorrar para un fondo que existe.
    expect(result.current!.projection.monthsToEmergencyFund).toBe(0);
  });

  it('sin saldo líquido, pide 3 meses de ahorro para el mínimo', () => {
    const { result } = renderHook(() =>
      useFinancialPlan(baseTxs, config, { liquidBalance: 0 }),
    );
    const ef = result.current!.emergencyFund;
    expect(ef.coverageMonths).toBe(0);
    expect(ef.status).toBe('none');
    expect(ef.monthsTo3m).toBe(3); // 1,5M / 500k
  });

  it('con saldo ≥ 6 meses de gasto, el estado es "ideal"', () => {
    const { result } = renderHook(() =>
      useFinancialPlan(baseTxs, config, { liquidBalance: 3_000_000 }),
    );
    expect(result.current!.emergencyFund.status).toBe('ideal');
    expect(result.current!.emergencyFund.monthsTo6m).toBe(0);
  });

  it('sin contexto (llamada de 2 args) no rompe: saldo 0, estado "none"', () => {
    const { result } = renderHook(() => useFinancialPlan(baseTxs, config));
    expect(result.current!.emergencyFund.liquidBalance).toBe(0);
    expect(result.current!.emergencyFund.status).toBe('none');
    expect(result.current!.creditUtilization).toBeNull();
  });
});

describe('useFinancialPlan — siguiente paso y utilización', () => {
  it('señala "Ahorro" como siguiente paso cuando es la dimensión más floja', () => {
    // Gasto 950k/mes (categoría no-necesidad) → ahorro 5%: savingsRate es lo más bajo.
    const txs: Transaction[] = [
      makeTx({ id: 'a', date: monthsAgo(2), amount: 950_000, category: 'Entretenimiento' }),
      makeTx({ id: 'b', date: monthsAgo(1), amount: 950_000, category: 'Entretenimiento' }),
    ];
    const { result } = renderHook(() => useFinancialPlan(txs, config, { liquidBalance: 0 }));
    expect(result.current!.score.total).toBeLessThan(100);
    expect(result.current!.nextStep?.dimension).toBe('savingsRate');
    expect(result.current!.nextStep?.message.toLowerCase()).toContain('ahorro');
  });

  it('devuelve la utilización de tarjetas tal cual se le pasa', () => {
    const util = { used: 300_000, limit: 1_000_000, ratio: 0.3 };
    const { result } = renderHook(() =>
      useFinancialPlan(baseTxs, config, { liquidBalance: 0, creditUtilization: util }),
    );
    expect(result.current!.creditUtilization).toEqual(util);
  });
});
