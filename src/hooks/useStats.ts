import { useMemo } from 'react';
import { APP_CONFIG, STATS_CONFIG } from '../config/constants';
import type { Transaction, MonthlyStats, YearlyStats, CategoryStats } from '../types/finance';

export function useStats(transactions: Transaction[]) {
  const monthlyData = useMemo((): MonthlyStats[] => {
    const monthlyStats: Record<string, MonthlyStats> = {};

    transactions.filter(t => t.paid && t.type !== 'transfer').forEach(t => {
      const month = new Date(t.date).toLocaleDateString(APP_CONFIG.locale, {
        year: 'numeric',
        month: 'short'
      });

      if (!monthlyStats[month]) {
        monthlyStats[month] = { month, ingresos: 0, gastos: 0, neto: 0 };
      }

      if (t.type === 'income') {
        monthlyStats[month].ingresos += t.amount;
      } else if (t.type === 'expense') {
        monthlyStats[month].gastos += t.amount;
      }

      monthlyStats[month].neto = monthlyStats[month].ingresos - monthlyStats[month].gastos;
    });

    return Object.values(monthlyStats)
      .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
      .slice(-STATS_CONFIG.monthlyDataLimit);
  }, [transactions]);

  const yearlyData = useMemo((): YearlyStats[] => {
    const yearlyStats: Record<string, YearlyStats> = {};

    transactions.filter(t => t.paid && t.type !== 'transfer').forEach(t => {
      const year = new Date(t.date).getFullYear().toString();

      if (!yearlyStats[year]) {
        yearlyStats[year] = { año: year, ingresos: 0, gastos: 0 };
      }

      if (t.type === 'income') {
        yearlyStats[year].ingresos += t.amount;
      } else if (t.type === 'expense') {
        yearlyStats[year].gastos += t.amount;
      }
    });

    return Object.values(yearlyStats)
      .sort((a, b) => parseInt(a.año) - parseInt(b.año));
  }, [transactions]);

  const categoryData = useMemo((): CategoryStats[] => {
    const categoryStats: Record<string, number> = {};

    transactions.filter(t => t.paid && t.type === 'expense').forEach(t => {
      if (!categoryStats[t.category]) {
        categoryStats[t.category] = 0;
      }
      categoryStats[t.category] += t.amount;
    });

    return Object.entries(categoryStats)
      .map(([name, value]): CategoryStats => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  return {
    monthlyData,
    yearlyData,
    categoryData
  };
}