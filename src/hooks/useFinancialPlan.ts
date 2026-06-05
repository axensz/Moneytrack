/**
 * useFinancialPlan — Plan financiero con análisis multi-mes,
 * score financiero y proyección de ahorro.
 *
 * No persiste ingreso declarado (solo en sesión/state).
 * Analiza desde el mes de inicio configurado.
 */

import { useMemo } from 'react';
import type { Transaction } from '../types/finance';
import { SPECIAL_CATEGORIES } from '../config/constants';

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

export interface FinancialPlan {
  months: MonthSummary[];
  currentMonth: MonthSummary | null;
  score: FinancialScore;
  projection: SavingsProjection;
  rule503020: Rule503020;
  healthLevel: 'excelente' | 'bueno' | 'regular' | 'crítico';
  avgMonthlyExpenses: number;
  avgMonthlySavings: number;
  trend: 'improving' | 'stable' | 'declining';
}

// ============ CLASIFICACIÓN ============

const NEEDS_SET = new Set([
  'servicios', 'vivienda', 'salud', 'educación',
  'alimentación', 'transporte', 'arriendo', 'seguros',
  'internet', 'teléfono', 'suscripciones',
]);

function isNeed(cat: string): boolean {
  return NEEDS_SET.has(cat.toLowerCase());
}

// ============ HOOK ============

export function useFinancialPlan(
  transactions: Transaction[],
  config: PlanConfig | null,
): FinancialPlan | null {
  return useMemo(() => {
    if (!config || !config.declaredIncome || config.declaredIncome <= 0) return null;

    const { startMonth, declaredIncome } = config;
    const [startYear, startMo] = startMonth.split('-').map(Number);
    const startDate = new Date(startYear, startMo - 1, 1);
    const now = new Date();

    // Filtrar transacciones reales desde el mes de inicio
    const excluded = new Set(SPECIAL_CATEGORIES.adjustmentCategories);
    const relevantTx = transactions.filter(t => {
      if (excluded.has(t.category)) return false;
      if (t.type === 'transfer') return false;
      const d = new Date(t.date);
      return d >= startDate;
    });

    if (relevantTx.length === 0) return null;

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
        if (isNeed(t.category)) entry.needs += t.amount;
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

    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentMonth = months.find(m => m.key === currentKey) || null;

    // Meses completados (excluir mes actual para promedios)
    const completedMonths = months.filter(m => m.key !== currentKey);
    const numCompleted = completedMonths.length;

    // Si solo hay mes actual (incompleto), prorratear al mes completo
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const prorationFactor = dayOfMonth > 1 ? daysInMonth / dayOfMonth : 1;

    const avgMonthlyExpenses = numCompleted > 0
      ? completedMonths.reduce((s, m) => s + m.expenses, 0) / numCompleted
      : (currentMonth?.expenses || 0) * prorationFactor;

    const avgMonthlySavings = numCompleted > 0
      ? completedMonths.reduce((s, m) => s + m.savings, 0) / numCompleted
      : declaredIncome - (currentMonth?.expenses || 0) * prorationFactor;

    // Regla 50/30/20 (basado en meses completados o actual)
    const analysisMonths = numCompleted > 0 ? completedMonths : (currentMonth ? [currentMonth] : []);
    const totalNeeds = Array.from(monthsMap.entries())
      .filter(([k]) => numCompleted > 0 ? k !== currentKey : true)
      .reduce((s, [, d]) => s + d.needs, 0);
    const totalWants = Array.from(monthsMap.entries())
      .filter(([k]) => numCompleted > 0 ? k !== currentKey : true)
      .reduce((s, [, d]) => s + d.wants, 0);
    const periodExpenses = numCompleted > 0
      ? completedMonths.reduce((s, m) => s + m.expenses, 0)
      : (currentMonth?.expenses || 0);
    const periodIncome = numCompleted > 0
      ? completedMonths.reduce((s, m) => s + m.income, 0)
      : (currentMonth?.income || declaredIncome);

    const rule503020: Rule503020 = {
      needs: totalNeeds / Math.max(1, analysisMonths.length),
      needsPct: periodIncome > 0 ? Math.round((totalNeeds / periodIncome) * 100) : 0,
      wants: totalWants / Math.max(1, analysisMonths.length),
      wantsPct: periodIncome > 0 ? Math.round((totalWants / periodIncome) * 100) : 0,
      savings: avgMonthlySavings,
      savingsPct: declaredIncome > 0 ? Math.round((avgMonthlySavings / declaredIncome) * 100) : 0,
    };

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

    // Proyección de ahorro
    const monthlyExpenses3m = avgMonthlyExpenses * 3; // fondo emergencia
    const projectedMonthlySavings = declaredIncome - avgMonthlyExpenses;
    const projection: SavingsProjection = {
      currentMonthly: avgMonthlySavings,
      projectedMonthly: projectedMonthlySavings,
      in3Months: projectedMonthlySavings * 3,
      in6Months: projectedMonthlySavings * 6,
      in12Months: projectedMonthlySavings * 12,
      monthsToEmergencyFund: projectedMonthlySavings > 0
        ? Math.ceil(monthlyExpenses3m / projectedMonthlySavings)
        : null,
    };

    // Tendencia (comparar últimos 2 meses completados)
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (completedMonths.length >= 2) {
      const last = completedMonths[completedMonths.length - 1];
      const prev = completedMonths[completedMonths.length - 2];
      if (last.savingsRate > prev.savingsRate + 5) trend = 'improving';
      else if (last.savingsRate < prev.savingsRate - 5) trend = 'declining';
    }

    return {
      months,
      currentMonth,
      score,
      projection,
      rule503020,
      healthLevel: level,
      avgMonthlyExpenses,
      avgMonthlySavings,
      trend,
    };
  }, [transactions, config]);
}
