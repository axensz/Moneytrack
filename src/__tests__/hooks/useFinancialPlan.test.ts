/**
 * useFinancialPlan — fondo de emergencia desde el saldo líquido REAL (no desde
 * cero), "siguiente paso" según la dimensión más floja del score, y passthrough
 * de utilización de tarjetas. Regresión del bug en que `monthsToEmergencyFund`
 * ignoraba el saldo que el usuario ya tenía.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFinancialPlan, type PlanConfig } from '../../hooks/useFinancialPlan';
import { BALANCE_ADJUSTMENT_CATEGORY, CREDIT_PAYMENT_CATEGORY, LOAN_CATEGORY, TRANSFER_CATEGORY } from '../../config/constants';
import { cycleKey } from '../../utils/recurringDates';
import type { RecurringPayment, Transaction } from '../../types/finance';

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

const makeRecurring = (overrides: Partial<RecurringPayment>): RecurringPayment => ({
  id: 'rp-1',
  name: 'Internet',
  amount: 120_000,
  category: 'Servicios',
  accountId: 'acc-1',
  dueDay: 20,
  frequency: 'monthly',
  isActive: true,
  createdAt: monthsAgo(3),
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

describe('useFinancialPlan — base accionable 50/30/20', () => {
  it('ignora movimientos impagos, transferencias y categorías internas', () => {
    const oneMonthConfig: PlanConfig = { startMonth: ym(monthsAgo(1)), declaredIncome: 1_000_000 };
    const txs: Transaction[] = [
      makeTx({ id: 'real', date: monthsAgo(1), amount: 500_000, category: 'Alimentación', paid: true }),
      makeTx({ id: 'unpaid', date: monthsAgo(1), amount: 900_000, category: 'Alimentación', paid: false }),
      makeTx({ id: 'transfer', date: monthsAgo(1), amount: 700_000, type: 'transfer', category: TRANSFER_CATEGORY }),
      makeTx({ id: 'credit', date: monthsAgo(1), amount: 600_000, category: CREDIT_PAYMENT_CATEGORY }),
      makeTx({ id: 'adjust', date: monthsAgo(1), amount: 400_000, category: BALANCE_ADJUSTMENT_CATEGORY }),
      makeTx({ id: 'loan', date: monthsAgo(1), amount: 300_000, category: LOAN_CATEGORY }),
    ];

    const { result } = renderHook(() => useFinancialPlan(txs, oneMonthConfig, { liquidBalance: 0 }));

    expect(result.current!.avgMonthlyExpenses).toBe(500_000);
    expect(result.current!.rule503020.needs).toBe(500_000);
    expect(result.current!.rule503020.needsPct).toBe(50);
  });

  it('calcula brechas exactas y la categoría principal que explica el exceso', () => {
    const txs: Transaction[] = [
      makeTx({ id: 'need-a', date: monthsAgo(2), amount: 600_000, category: 'Alimentación' }),
      makeTx({ id: 'want-a', date: monthsAgo(2), amount: 250_000, category: 'Entretenimiento' }),
      makeTx({ id: 'need-b', date: monthsAgo(1), amount: 600_000, category: 'Alimentación' }),
      makeTx({ id: 'want-b', date: monthsAgo(1), amount: 250_000, category: 'Entretenimiento' }),
    ];

    const { result } = renderHook(() => useFinancialPlan(txs, config, { liquidBalance: 0 }));
    const plan = result.current!;

    expect(plan.needsGap).toMatchObject({ status: 'over', difference: 100_000, target: 500_000 });
    expect(plan.wantsGap).toMatchObject({ status: 'ok', difference: 50_000, target: 300_000 });
    expect(plan.savingsGap).toMatchObject({ status: 'under', difference: 50_000, target: 200_000 });
    expect(plan.topDrivers[0]).toMatchObject({
      category: 'Alimentación',
      group: 'need',
      spent: 600_000,
      suggestedReduction: 100_000,
    });
    expect(plan.actionItems[0]).toMatchObject({
      kind: 'reduce_need',
      amount: 100_000,
    });
    expect(plan.actionItems.some(item => item.amount === 50_000)).toBe(true);
  });

  it('no genera plan cuando solo hay movimientos internos', () => {
    const txs: Transaction[] = [
      makeTx({ id: 'transfer', date: monthsAgo(1), amount: 700_000, type: 'transfer', category: TRANSFER_CATEGORY }),
      makeTx({ id: 'credit', date: monthsAgo(1), amount: 600_000, category: CREDIT_PAYMENT_CATEGORY }),
      makeTx({ id: 'loan', date: monthsAgo(1), amount: 300_000, category: LOAN_CATEGORY }),
    ];

    const { result } = renderHook(() => useFinancialPlan(txs, config, { liquidBalance: 0 }));

    expect(result.current).toBeNull();
  });

  it('usa el mes actual como estimado cuando todavía no hay meses completos', () => {
    const now = new Date();
    const currentConfig: PlanConfig = { startMonth: ym(now), declaredIncome: 1_000_000 };
    const txs: Transaction[] = [
      makeTx({ id: 'current', date: now, amount: 300_000, category: 'Educacion' }),
    ];

    const { result } = renderHook(() => useFinancialPlan(txs, currentConfig, { liquidBalance: 0 }));

    expect(result.current!.analysisIsEstimated).toBe(true);
    expect(result.current!.analysisLabel).toContain('estimado');
    expect(result.current!.avgMonthlyExpenses).toBe(300_000);
    expect(result.current!.rule503020.needs).toBe(300_000);
  });

  it('no promedia meses anteriores vacios cuando solo hay datos del mes actual', () => {
    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const currentConfig: PlanConfig = { startMonth: ym(previousMonth), declaredIncome: 1_000_000 };
    const txs: Transaction[] = [
      makeTx({ id: 'current', date: now, amount: 450_000, category: 'Alimentacion' }),
    ];

    const { result } = renderHook(() => useFinancialPlan(txs, currentConfig, { liquidBalance: 0 }));

    expect(result.current!.analysisIsEstimated).toBe(true);
    expect(result.current!.analysisLabel).toContain('estimado');
    expect(result.current!.avgMonthlyExpenses).toBe(450_000);
    expect(result.current!.rule503020.needs).toBe(450_000);
  });

  it('proyecta pagos periodicos pendientes del mes sin registrarlos como pagados', () => {
    const now = new Date();
    const recurring = makeRecurring({ dueDay: now.getDate(), amount: 120_000, category: 'Servicios' });

    const { result } = renderHook(() =>
      useFinancialPlan(baseTxs, config, {
        liquidBalance: 0,
        recurringPayments: [recurring],
      }),
    );

    expect(result.current!.recurringForecast.pendingAmount).toBe(120_000);
    expect(result.current!.recurringForecast.projectedExpenses).toBe(120_000);
    expect(result.current!.recurringForecast.projectedNeeds).toBe(120_000);
    expect(result.current!.recurringForecast.items[0]).toMatchObject({
      name: 'Internet',
      category: 'Servicios',
      amount: 120_000,
      status: 'soon',
    });
  });

  it('no duplica un pago periodico ya pagado o vinculado al ciclo actual', () => {
    const now = new Date();
    const recurring = makeRecurring({ dueDay: now.getDate(), amount: 120_000, category: 'Servicios' });
    const txs: Transaction[] = [
      ...baseTxs,
      makeTx({
        id: 'paid-recurring',
        date: now,
        amount: 120_000,
        category: 'Servicios',
        recurringPaymentId: recurring.id,
        recurringCycle: cycleKey(recurring, now),
      }),
    ];

    const { result } = renderHook(() =>
      useFinancialPlan(txs, config, {
        liquidBalance: 0,
        recurringPayments: [recurring],
      }),
    );

    expect(result.current!.recurringForecast.pendingAmount).toBe(0);
    expect(result.current!.recurringForecast.items).toHaveLength(0);
    expect(result.current!.recurringForecast.projectedExpenses).toBe(120_000);
  });
});
