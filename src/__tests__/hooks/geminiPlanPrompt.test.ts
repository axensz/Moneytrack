/**
 * buildPlanPrompt — el fondo de emergencia tiene 3 estados. `monthsTo3m === 0`
 * significa YA cubierto; un check de truthiness lo leía como "insuficiente" y le
 * daba a la IA lo contrario de la realidad. Regresión de ese backward-compat break.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFinancialPlan, type PlanConfig } from '../../hooks/useFinancialPlan';
import { buildPlanPrompt } from '../../lib/geminiPlan';
import type { Transaction } from '../../types/finance';

const monthsAgo = (n: number): Date => {
  const d = new Date();
  d.setDate(15);
  d.setMonth(d.getMonth() - n);
  return d;
};
const ym = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const makeTx = (o: Partial<Transaction>): Transaction => ({
  id: 'tx', type: 'expense', amount: 500_000, category: 'Alimentación',
  description: 'Test', date: monthsAgo(1), paid: true, accountId: 'acc-1', ...o,
});

const config: PlanConfig = { startMonth: ym(monthsAgo(2)), declaredIncome: 1_000_000 };

describe('buildPlanPrompt — fondo de emergencia en el prompt de IA', () => {
  it('con el fondo YA cubierto NO dice "insuficiente"; dice "YA cubierto"', () => {
    const txs = [
      makeTx({ id: 'a', date: monthsAgo(2), amount: 500_000 }),
      makeTx({ id: 'b', date: monthsAgo(1), amount: 500_000 }),
    ];
    // liquidBalance 1,5M = mínimo (3 meses de 500k) → monthsTo3m === 0.
    const { result } = renderHook(() => useFinancialPlan(txs, config, { liquidBalance: 1_500_000 }));
    const prompt = buildPlanPrompt(result.current!, config);
    expect(result.current!.projection.monthsToEmergencyFund).toBe(0);
    expect(prompt).toContain('YA cubierto');
    expect(prompt).not.toContain('insuficiente');
    expect(prompt).not.toContain('sin ahorro');
  });

  it('sin ahorro mensual (gasto > ingreso) lo dice explícitamente', () => {
    const txs = [
      makeTx({ id: 'a', date: monthsAgo(2), amount: 1_200_000, category: 'Entretenimiento' }),
      makeTx({ id: 'b', date: monthsAgo(1), amount: 1_200_000, category: 'Entretenimiento' }),
    ];
    const { result } = renderHook(() => useFinancialPlan(txs, config, { liquidBalance: 0 }));
    const prompt = buildPlanPrompt(result.current!, config);
    expect(result.current!.emergencyFund.monthsTo3m).toBeNull();
    expect(prompt).toContain('sin ahorro mensual');
  });
});
