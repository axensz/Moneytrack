/**
 * useFinancialPlan — Plan financiero con análisis multi-mes,
 * score financiero y proyección de ahorro.
 *
 * No persiste ingreso declarado (solo en sesión/state).
 * Analiza desde el mes de inicio configurado.
 */

import { useMemo } from 'react';
import type { RecurringPayment, Transaction } from '../types/finance';
import { classifyBudgetCategory, type BudgetCategoryGroup, isRealBudgetTransaction } from '../utils/budgetPlanning';
import { cycleKey, effectiveDueDay, getCycleWindow, getYearlyAnchorMonth } from '../utils/recurringDates';

// ============ TIPOS ============

export interface PlanConfig {
  startMonth: string; // 'YYYY-MM' (ej: '2026-06')
  declaredIncome: number; // ingreso mensual declarado en sesión (no se persiste)
}

export interface MonthSummary {
  key: string; // 'YYYY-MM'
  label: string;
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number; // %
}

export interface FinancialScore {
  total: number; // 0-100
  breakdown: {
    savingsRate: number; // 0-30 pts
    consistency: number; // 0-25 pts
    needsRatio: number; // 0-25 pts
    debtControl: number; // 0-20 pts
  };
  level: 'excelente' | 'bueno' | 'regular' | 'crítico';
}

export interface SavingsProjection {
  currentMonthly: number;
  projectedMonthly: number;
  in3Months: number;
  in6Months: number;
  in12Months: number;
  monthsToEmergencyFund: number | null; // 3 meses de gastos
}

export interface Rule503020 {
  needs: number;
  needsPct: number;
  wants: number;
  wantsPct: number;
  savings: number;
  savingsPct: number;
}

export interface PlanGap {
  current: number;
  target: number;
  difference: number;
  status: 'ok' | 'over' | 'under';
}

export interface PlanTopDriver {
  category: string;
  group: BudgetCategoryGroup;
  spent: number;
  pctOfIncome: number;
  suggestedReduction: number;
}

export interface PlanActionItem {
  kind: 'increase_savings' | 'reduce_need' | 'reduce_want';
  label: string;
  message: string;
  amount: number;
  category?: string;
}

export interface RecurringForecastItem {
  id: string;
  name: string;
  category: string;
  group: BudgetCategoryGroup;
  amount: number;
  dueDate: Date;
  daysUntilDue: number;
  status: 'overdue' | 'soon' | 'scheduled';
}

export interface RecurringMonthForecast {
  monthLabel: string;
  scheduledAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  projectedExpenses: number;
  projectedSavings: number;
  projectedSavingsRate: number;
  projectedNeeds: number;
  projectedWants: number;
  projectedNeedsPct: number;
  projectedWantsPct: number;
  projectedSavingsGap: PlanGap;
  items: RecurringForecastItem[];
}

export interface EmergencyFund {
  liquidBalance: number;     // saldo líquido actual (efectivo + ahorros)
  monthlyExpenses: number;   // gasto mensual de referencia
  coverageMonths: number;    // cuántos meses cubres con lo que YA tienes
  target3m: number;          // mínimo recomendado (3 meses de gasto)
  target6m: number;          // ideal (6 meses de gasto)
  monthsTo3m: number | null; // meses para llegar al mínimo a tu ritmo (0 = ya; null = no ahorras)
  monthsTo6m: number | null;
  status: 'none' | 'building' | 'covered' | 'ideal'; // <1m / 1-3m / 3-6m / >=6m
}

export interface CreditUtilization {
  used: number;
  limit: number;
  ratio: number; // 0-1 (used/limit)
}

export interface NextStep {
  dimension: 'savingsRate' | 'consistency' | 'needsRatio' | 'debtControl';
  label: string;
  message: string;
}

/** Datos vivos que el plan toma de otros dominios (saldos, tarjetas). */
export interface PlanContext {
  liquidBalance?: number; // efectivo + ahorros (NO crédito)
  creditUtilization?: CreditUtilization | null;
  recurringPayments?: RecurringPayment[];
}

export interface FinancialPlan {
  months: MonthSummary[];
  currentMonth: MonthSummary | null;
  score: FinancialScore;
  projection: SavingsProjection;
  rule503020: Rule503020;
  needsGap: PlanGap;
  wantsGap: PlanGap;
  savingsGap: PlanGap;
  topDrivers: PlanTopDriver[];
  actionItems: PlanActionItem[];
  recurringForecast: RecurringMonthForecast;
  analysisIsEstimated: boolean;
  analysisLabel: string;
  emergencyFund: EmergencyFund;
  creditUtilization: CreditUtilization | null;
  nextStep: NextStep | null;
  healthLevel: 'excelente' | 'bueno' | 'regular' | 'crítico';
  avgMonthlyExpenses: number;
  avgMonthlySavings: number;
  trend: 'improving' | 'stable' | 'declining';
}

// ============ HOOK ============

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildSpendingGap(current: number, target: number): PlanGap {
  const overBy = current - target;
  return {
    current,
    target,
    difference: Math.abs(overBy),
    status: overBy > 0 ? 'over' : 'ok',
  };
}

function buildSavingsGap(current: number, target: number): PlanGap {
  const missing = target - current;
  return {
    current,
    target,
    difference: Math.abs(missing),
    status: missing > 0 ? 'under' : 'ok',
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_RECURRING_PAYMENTS: RecurringPayment[] = [];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function recurringDueDateForMonth(payment: RecurringPayment, year: number, month: number): Date | null {
  if (!payment.isActive) return null;
  if (payment.frequency === 'yearly' && getYearlyAnchorMonth(payment, month) !== month) return null;
  return new Date(year, month, effectiveDueDay(payment.dueDay, year, month));
}

function isRecurringPaidForCycle(
  payment: RecurringPayment,
  transactions: Transaction[],
  referenceDate: Date,
): boolean {
  if (!payment.id) return false;
  const targetKey = cycleKey(payment, referenceDate);
  const { start, end } = getCycleWindow(payment, referenceDate);
  const startMs = start.getTime();
  const endMs = end.getTime();

  return transactions.some(t => {
    if (!t.paid || t.recurringPaymentId !== payment.id) return false;
    if (t.recurringCycle) return t.recurringCycle === targetKey;
    const time = new Date(t.date).getTime();
    return time >= startMs && time < endMs;
  });
}

export function useFinancialPlan(
  transactions: Transaction[],
  config: PlanConfig | null,
  context: PlanContext = {},
): FinancialPlan | null {
  const { liquidBalance = 0, creditUtilization = null, recurringPayments = EMPTY_RECURRING_PAYMENTS } = context;
  return useMemo(() => {
    if (!config || !config.declaredIncome || config.declaredIncome <= 0) return null;

    const { startMonth, declaredIncome } = config;
    const [startYear, startMo] = startMonth.split('-').map(Number);
    const startDate = new Date(startYear, startMo - 1, 1);
    const now = new Date();

    // Filtrar transacciones reales pagadas desde el mes de inicio.
    const relevantTx = transactions.filter(t => {
      if (!isRealBudgetTransaction(t)) return false;
      const d = new Date(t.date);
      return d >= startDate;
    });

    if (!relevantTx.some(t => t.type === 'expense')) return null;

    // Generar resumen por mes
    const monthsMap = new Map<string, { income: number; expenses: number; needs: number; wants: number }>();

    // Inicializar meses desde inicio hasta ahora
    const cursor = new Date(startYear, startMo - 1, 1);
    while (cursor <= now) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      monthsMap.set(key, { income: 0, expenses: 0, needs: 0, wants: 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    relevantTx.forEach(t => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthsMap.get(key);
      if (!entry) return;
      if (t.type === 'income') entry.income += t.amount;
      else if (t.type === 'expense') {
        entry.expenses += t.amount;
        if (classifyBudgetCategory(t.category) === 'need') entry.needs += t.amount;
        else entry.wants += t.amount;
      }
    });

    const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const months: MonthSummary[] = Array.from(monthsMap.entries()).map(([key, data]) => {
      const income = data.income || declaredIncome;
      const savings = income - data.expenses;
      const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0;
      const [y, m] = key.split('-');
      return {
        key,
        label: `${MONTHS_SHORT[parseInt(m) - 1]} ${y.slice(2)}`,
        income,
        expenses: data.expenses,
        savings,
        savingsRate,
      };
    });

    const currentKey = monthKeyOf(now);
    const currentMonth = months.find(m => m.key === currentKey) || null;

    // Meses completados con gasto real. Si el plan empezo en un mes anterior
    // vacio y solo hay movimientos actuales, usamos el mes actual como estimado.
    const completedMonths = months.filter(m => m.key !== currentKey && m.expenses > 0);
    const numCompleted = completedMonths.length;
    const analysisMonths = numCompleted > 0
      ? completedMonths
      : (currentMonth && currentMonth.expenses > 0 ? [currentMonth] : []);
    if (analysisMonths.length === 0) return null;
    const analysisMonthKeys = new Set(analysisMonths.map(m => m.key));
    const analysisIsEstimated = numCompleted === 0;
    const analysisLabel = analysisIsEstimated
      ? 'Mes actual (estimado)'
      : `${numCompleted} ${numCompleted === 1 ? 'mes completo' : 'meses completos'}`;
    const monthsForAvg = Math.max(1, analysisMonths.length);

    const avgMonthlyExpenses = analysisMonths.reduce((s, m) => s + m.expenses, 0) / monthsForAvg;

    const avgMonthlySavings = analysisMonths.reduce((s, m) => s + m.savings, 0) / monthsForAvg;

    // Regla 50/30/20 (basado en meses completados o actual)
    const totalNeeds = Array.from(monthsMap.entries())
      .filter(([k]) => analysisMonthKeys.has(k))
      .reduce((s, [, d]) => s + d.needs, 0);
    const totalWants = Array.from(monthsMap.entries())
      .filter(([k]) => analysisMonthKeys.has(k))
      .reduce((s, [, d]) => s + d.wants, 0);

    // Para porcentajes, usar siempre declaredIncome como referencia
    const avgNeeds = totalNeeds / monthsForAvg;
    const avgWants = totalWants / monthsForAvg;

    const rule503020: Rule503020 = {
      needs: avgNeeds,
      needsPct: declaredIncome > 0 ? Math.round((avgNeeds / declaredIncome) * 100) : 0,
      wants: avgWants,
      wantsPct: declaredIncome > 0 ? Math.round((avgWants / declaredIncome) * 100) : 0,
      savings: avgMonthlySavings,
      savingsPct: declaredIncome > 0 ? Math.round((avgMonthlySavings / declaredIncome) * 100) : 0,
    };

    const needsTarget = declaredIncome * 0.5;
    const wantsTarget = declaredIncome * 0.3;
    const savingsTarget = declaredIncome * 0.2;
    const needsGap = buildSpendingGap(rule503020.needs, needsTarget);
    const wantsGap = buildSpendingGap(rule503020.wants, wantsTarget);
    const savingsGap = buildSavingsGap(rule503020.savings, savingsTarget);

    const currentMonthData = monthsMap.get(currentKey) || { income: 0, expenses: 0, needs: 0, wants: 0 };
    const today = startOfDay(now);
    const currentYear = now.getFullYear();
    const currentMonthIndex = now.getMonth();
    const dueRecurringPayments = recurringPayments
      .map(payment => ({ payment, dueDate: recurringDueDateForMonth(payment, currentYear, currentMonthIndex) }))
      .filter((entry): entry is { payment: RecurringPayment; dueDate: Date } => Boolean(entry.dueDate));

    const recurringItems: RecurringForecastItem[] = dueRecurringPayments
      .filter(({ payment }) => !isRecurringPaidForCycle(payment, transactions, now))
      .map(({ payment, dueDate }) => {
        const dueDay = startOfDay(dueDate);
        const daysUntilDue = Math.ceil((dueDay.getTime() - today.getTime()) / DAY_MS);
        const group = classifyBudgetCategory(payment.category);
        const status: RecurringForecastItem['status'] =
          daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 7 ? 'soon' : 'scheduled';
        return {
          id: payment.id || `${payment.name}-${payment.category}-${payment.dueDay}`,
          name: payment.name,
          category: payment.category,
          group,
          amount: payment.amount,
          dueDate,
          daysUntilDue,
          status,
        };
      })
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || b.amount - a.amount);

    const pendingAmount = recurringItems.reduce((sum, item) => sum + item.amount, 0);
    const overdueAmount = recurringItems
      .filter(item => item.status === 'overdue')
      .reduce((sum, item) => sum + item.amount, 0);
    const pendingNeeds = recurringItems
      .filter(item => item.group === 'need')
      .reduce((sum, item) => sum + item.amount, 0);
    const pendingWants = recurringItems
      .filter(item => item.group === 'want')
      .reduce((sum, item) => sum + item.amount, 0);
    const projectedExpenses = currentMonthData.expenses + pendingAmount;
    const projectedNeeds = currentMonthData.needs + pendingNeeds;
    const projectedWants = currentMonthData.wants + pendingWants;
    const projectedSavings = declaredIncome - projectedExpenses;
    const recurringForecast: RecurringMonthForecast = {
      monthLabel: now.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }),
      scheduledAmount: dueRecurringPayments.reduce((sum, { payment }) => sum + payment.amount, 0),
      pendingAmount,
      overdueAmount,
      projectedExpenses,
      projectedSavings,
      projectedSavingsRate: declaredIncome > 0 ? Math.round((projectedSavings / declaredIncome) * 100) : 0,
      projectedNeeds,
      projectedWants,
      projectedNeedsPct: declaredIncome > 0 ? Math.round((projectedNeeds / declaredIncome) * 100) : 0,
      projectedWantsPct: declaredIncome > 0 ? Math.round((projectedWants / declaredIncome) * 100) : 0,
      projectedSavingsGap: buildSavingsGap(projectedSavings, savingsTarget),
      items: recurringItems,
    };

    const categoryTotals = new Map<string, { spent: number; group: BudgetCategoryGroup }>();
    relevantTx
      .filter(t => t.type === 'expense' && analysisMonthKeys.has(monthKeyOf(new Date(t.date))))
      .forEach(t => {
        const group = classifyBudgetCategory(t.category);
        const current = categoryTotals.get(t.category) || { spent: 0, group };
        categoryTotals.set(t.category, { spent: current.spent + t.amount, group });
      });

    const gapForGroup = (group: BudgetCategoryGroup) =>
      group === 'need'
        ? (needsGap.status === 'over' ? needsGap.difference : 0)
        : (wantsGap.status === 'over' ? wantsGap.difference : 0);

    const categorySummaries: PlanTopDriver[] = Array.from(categoryTotals.entries())
      .map(([category, data]) => ({
        category,
        group: data.group,
        spent: data.spent / monthsForAvg,
        pctOfIncome: declaredIncome > 0 ? Math.round(((data.spent / monthsForAvg) / declaredIncome) * 100) : 0,
        suggestedReduction: Math.min(data.spent / monthsForAvg, gapForGroup(data.group)),
      }))
      .sort((a, b) => b.spent - a.spent);

    const topDrivers: PlanTopDriver[] = categorySummaries
      .filter(d => d.suggestedReduction > 0)
      .sort((a, b) => b.suggestedReduction - a.suggestedReduction || b.spent - a.spent);

    const topNeed = categorySummaries.find(d => d.group === 'need');
    const topWant = categorySummaries.find(d => d.group === 'want');
    const actionItems: PlanActionItem[] = [];
    if (savingsGap.status === 'under') {
      actionItems.push({
        kind: 'increase_savings',
        label: topWant ? `Libera ahorro desde ${topWant.category}` : 'Aparta ahorro primero',
        message: topWant
          ? 'Recorta primero el gasto discrecional más grande para acercarte al 20% de ahorro.'
          : 'Separa este monto apenas recibas tu ingreso para acercarte al 20% de ahorro.',
        amount: topWant ? Math.min(savingsGap.difference, topWant.spent) : savingsGap.difference,
        category: topWant?.category,
      });
    }
    if (needsGap.status === 'over' && topNeed) {
      actionItems.push({
        kind: 'reduce_need',
        label: `Ajusta ${topNeed.category}`,
        message: 'Esta necesidad explica la mayor parte del exceso frente al 50% ideal.',
        amount: Math.min(needsGap.difference, topNeed.spent),
        category: topNeed.category,
      });
    }
    if (wantsGap.status === 'over' && topWant) {
      actionItems.push({
        kind: 'reduce_want',
        label: `Recorta ${topWant.category}`,
        message: 'Este gusto es el mejor candidato para recuperar margen este mes.',
        amount: Math.min(wantsGap.difference, topWant.spent),
        category: topWant.category,
      });
    }
    actionItems.sort((a, b) => b.amount - a.amount);

    // Score financiero (0-100)
    // 1. Ahorro (0-30): 20%+ = 30, 10-20% = 20, 0-10% = 10, <0 = 0
    const savingsRatePts = rule503020.savingsPct >= 20 ? 30
      : rule503020.savingsPct >= 10 ? 20
      : rule503020.savingsPct > 0 ? 10 : 0;

    // 2. Consistencia (0-25): % de meses con ahorro positivo
    const positiveSavingsMonths = completedMonths.filter(m => m.savings > 0).length;
    const consistencyPts = numCompleted > 0
      ? Math.round((positiveSavingsMonths / numCompleted) * 25)
      : (currentMonth && currentMonth.savings > 0 ? 25 : 0);

    // 3. Necesidades bajo control (0-25): <=50% = 25, <=60% = 15, >60% = 5
    const needsRatioPts = rule503020.needsPct <= 50 ? 25
      : rule503020.needsPct <= 60 ? 15 : 5;

    // 4. Control de deuda/gastos (0-20): gastos < ingreso = 20, gastos <= 110% = 10, más = 0
    const expenseRatio = declaredIncome > 0 ? avgMonthlyExpenses / declaredIncome : 1;
    const debtControlPts = expenseRatio <= 1 ? 20
      : expenseRatio <= 1.1 ? 10 : 0;

    const totalScore = savingsRatePts + consistencyPts + needsRatioPts + debtControlPts;
    const level = totalScore >= 80 ? 'excelente'
      : totalScore >= 60 ? 'bueno'
      : totalScore >= 40 ? 'regular' : 'crítico';

    const score: FinancialScore = {
      total: totalScore,
      breakdown: {
        savingsRate: savingsRatePts,
        consistency: consistencyPts,
        needsRatio: needsRatioPts,
        debtControl: debtControlPts,
      },
      level,
    };

    // Proyección de ahorro: usa meses completos o, si aún no existen, el mes
    // actual marcado como estimado.
    const reliableMonthlyExpenses = avgMonthlyExpenses;
    const reliableMonthlySavings = declaredIncome - reliableMonthlyExpenses;
    const monthlySavingsForProjection = Math.max(0, reliableMonthlySavings);

    // Fondo de emergencia: 3 meses (mínimo) a 6 meses (ideal) de gasto. Se mide
    // contra el saldo líquido que el usuario YA tiene (efectivo + ahorros), NO
    // desde cero: a quien ya lo tiene cubierto no se le pide ahorrar de nuevo.
    // monthsTo*: 0 = ya alcanzado; null = no hay ahorro mensual para llegar.
    const liquidForFund = Math.max(0, liquidBalance);
    const target3m = reliableMonthlyExpenses * 3;
    const target6m = reliableMonthlyExpenses * 6;
    const coverageMonths = reliableMonthlyExpenses > 0 ? liquidForFund / reliableMonthlyExpenses : 0;
    const monthsToReach = (remaining: number): number | null =>
      remaining <= 0 ? 0
        : monthlySavingsForProjection > 0 ? Math.ceil(remaining / monthlySavingsForProjection)
        : null;
    const emergencyFund: EmergencyFund = {
      liquidBalance: liquidForFund,
      monthlyExpenses: reliableMonthlyExpenses,
      coverageMonths,
      target3m,
      target6m,
      monthsTo3m: monthsToReach(Math.max(0, target3m - liquidForFund)),
      monthsTo6m: monthsToReach(Math.max(0, target6m - liquidForFund)),
      status: coverageMonths >= 6 ? 'ideal'
        : coverageMonths >= 3 ? 'covered'
        : coverageMonths >= 1 ? 'building' : 'none',
    };

    const projection: SavingsProjection = {
      currentMonthly: numCompleted > 0 ? avgMonthlySavings : monthlySavingsForProjection,
      projectedMonthly: monthlySavingsForProjection,
      in3Months: monthlySavingsForProjection * 3,
      in6Months: monthlySavingsForProjection * 6,
      in12Months: monthlySavingsForProjection * 12,
      monthsToEmergencyFund: emergencyFund.monthsTo3m,
    };

    // Tendencia (comparar últimos 2 meses completados)
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (completedMonths.length >= 2) {
      const last = completedMonths[completedMonths.length - 1];
      const prev = completedMonths[completedMonths.length - 2];
      if (last.savingsRate > prev.savingsRate + 5) trend = 'improving';
      else if (last.savingsRate < prev.savingsRate - 5) trend = 'declining';
    }

    // Siguiente paso: la dimensión del score con menor avance relativo (pts/max)
    // se traduce en una acción concreta. Convierte el número pasivo en un "haz X".
    // null si el score es perfecto (no hay punto flojo que señalar).
    const NEXT_STEP: Record<NextStep['dimension'], { label: string; message: string }> = {
      savingsRate: { label: 'Ahorro', message: 'Tu ahorro es el punto más flojo. Aumenta tu tasa de ahorro recortando gastos no esenciales antes de fin de mes.' },
      consistency: { label: 'Consistencia', message: 'Ahorras de forma irregular. Aparta un monto fijo apenas recibes tu ingreso, antes de gastar.' },
      needsRatio: { label: 'Necesidades', message: 'Tus necesidades superan el 50% ideal. Revisa los fijos grandes (vivienda, servicios) o renegocia tarifas.' },
      debtControl: { label: 'Control', message: 'Estás gastando casi todo lo que ingresas. Deja un margen mensual para no terminar endeudándote.' },
    };
    const dims = [
      { dimension: 'savingsRate' as const, pts: savingsRatePts, max: 30 },
      { dimension: 'consistency' as const, pts: consistencyPts, max: 25 },
      { dimension: 'needsRatio' as const, pts: needsRatioPts, max: 25 },
      { dimension: 'debtControl' as const, pts: debtControlPts, max: 20 },
    ];
    const weakest = dims.reduce((a, b) => (b.pts / b.max < a.pts / a.max ? b : a));
    const nextStep: NextStep | null = totalScore >= 100
      ? null
      : { dimension: weakest.dimension, ...NEXT_STEP[weakest.dimension] };

    return {
      months,
      currentMonth,
      score,
      projection,
      rule503020,
      needsGap,
      wantsGap,
      savingsGap,
      topDrivers,
      actionItems: actionItems.slice(0, 3),
      recurringForecast,
      analysisIsEstimated,
      analysisLabel,
      emergencyFund,
      creditUtilization,
      nextStep,
      healthLevel: level,
      avgMonthlyExpenses,
      avgMonthlySavings,
      trend,
    };
  }, [transactions, config, liquidBalance, creditUtilization, recurringPayments]);
}
