import { useMemo } from 'react';
import type { Transaction } from '../../../../types/finance';

interface MonthlyDataPoint {
  month: string;
  ingresos: number;
  gastos: number;
}

interface YearlyDataPoint {
  año: string;
  ingresos: number;
  gastos: number;
}

interface CategoryDataPoint {
  name: string;
  value: number;
}

interface StatsData {
  monthlyData: MonthlyDataPoint[];
  yearlyData: YearlyDataPoint[];
  categoryData: CategoryDataPoint[];
}

/**
 * Hook para procesar y agregar datos de transacciones en formatos
 * útiles para visualización en gráficos.
 * 
 * Extrae y memoriza:
 * - Datos mensuales (últimos 6 meses)
 * - Datos anuales (todos los años disponibles)
 * - Distribución por categoría de gastos
 */
export const useStatsData = (transactions: Transaction[]): StatsData => {
  const monthlyData = useMemo(() => computeMonthlyData(transactions), [transactions]);
  const yearlyData = useMemo(() => computeYearlyData(transactions), [transactions]);
  const categoryData = useMemo(() => computeCategoryData(transactions), [transactions]);

  return { monthlyData, yearlyData, categoryData };
};

// ==================== Funciones de cálculo ====================

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function computeMonthlyData(transactions: Transaction[]): MonthlyDataPoint[] {
  const monthlyMap = new Map<string, { income: number; expense: number }>();

  // Inicializar últimos 6 meses
  const today = new Date();
  for (let i = 5; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(key, { income: 0, expense: 0 });
  }

  // Agregar transacciones
  transactions.forEach((t) => {
    const date = new Date(t.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (monthlyMap.has(key)) {
      const entry = monthlyMap.get(key)!;
      if (t.type === 'income') {
        entry.income += t.amount;
      } else if (t.type === 'expense') {
        entry.expense += t.amount;
      }
    }
  });

  // Convertir a array
  return Array.from(monthlyMap.entries()).map(([key, data]) => {
    const [year, month] = key.split('-');
    return {
      month: `${MONTHS_SHORT[parseInt(month) - 1]} ${year.slice(2)}`,
      ingresos: data.income,
      gastos: data.expense,
    };
  });
}

function computeYearlyData(transactions: Transaction[]): YearlyDataPoint[] {
  const yearlyMap = new Map<number, { income: number; expense: number }>();

  transactions.forEach((t) => {
    const year = new Date(t.date).getFullYear();
    if (!yearlyMap.has(year)) {
      yearlyMap.set(year, { income: 0, expense: 0 });
    }
    const entry = yearlyMap.get(year)!;
    if (t.type === 'income') {
      entry.income += t.amount;
    } else if (t.type === 'expense') {
      entry.expense += t.amount;
    }
  });

  return Array.from(yearlyMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, data]) => ({
      año: year.toString(),
      ingresos: data.income,
      gastos: data.expense,
    }));
}

function computeCategoryData(transactions: Transaction[]): CategoryDataPoint[] {
  const categoryMap = new Map<string, number>();

  transactions
    .filter((t) => t.type === 'expense')
    .forEach((t) => {
      const current = categoryMap.get(t.category) || 0;
      categoryMap.set(t.category, current + t.amount);
    });

  return Array.from(categoryMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
