/**
 * 🆕 HOOK: useFilteredData
 *
 * Centraliza la lógica de filtrado de transacciones y cuentas
 * Extrae ~30 líneas de useMemo de finance-tracker.tsx
 *
 * RESPONSABILIDADES:
 * - Filtrado de transacciones por cuenta, categoría y fecha
 * - Filtrado de cuentas
 * - Cálculo de estadísticas dinámicas
 * - Etiquetas dinámicas para UI
 */

import { useMemo } from 'react';
import { useGlobalStats } from './useGlobalStats';
import { CreditCardCalculator } from '../utils/balanceCalculator';
import { transactionUsesAccount } from '../utils/accountTransactions';
import type { Transaction, Account, FilterValue, DateRange } from '../types/finance';

interface UseFilteredDataParams {
  transactions: Transaction[];
  accounts: Account[];
  filterAccount: FilterValue;
  filterCategory: FilterValue;
  dateRange?: DateRange | null; // 🆕 Filtro de fecha opcional
  totalBalance: number;
  getAccountBalance: (accountId: string) => number;
}

interface FilteredDataResult {
  filteredTransactions: Transaction[];
  filteredAccounts: Account[];
  dynamicStats: ReturnType<typeof useGlobalStats>;
  dynamicTotalBalance: number;
  balanceLabel: string;
}

/**
 * Calcula el rango de fechas efectivo según el preset o custom
 */
function getEffectiveDateRange(dateRange?: DateRange | null): { startDate: Date; endDate: Date } | null {
  if (!dateRange || dateRange.preset === 'all') {
    return null;
  }

  if (dateRange.preset === 'custom' && dateRange.startDate && dateRange.endDate) {
    return { startDate: dateRange.startDate, endDate: dateRange.endDate };
  }

  // Calcular rangos según preset
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (dateRange.preset) {
    case 'today':
      return {
        startDate: today,
        endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
      };

    case 'this-week': {
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - dayOfWeek);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59);
      return { startDate: startOfWeek, endDate: endOfWeek };
    }

    case 'this-month':
      return {
        startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
      };

    case 'last-month': {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        startDate: lastMonth,
        endDate: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
      };
    }

    case 'this-year':
      return {
        startDate: new Date(now.getFullYear(), 0, 1),
        endDate: new Date(now.getFullYear(), 11, 31, 23, 59, 59)
      };

    case 'last-year': {
      const lastYear = now.getFullYear() - 1;
      return {
        startDate: new Date(lastYear, 0, 1),
        endDate: new Date(lastYear, 11, 31, 23, 59, 59)
      };
    }

    default:
      return null;
  }
}

/**
 * Hook para gestionar filtrado de datos y estadísticas dinámicas
 */
export function useFilteredData({
  transactions,
  accounts,
  filterAccount,
  filterCategory,
  dateRange,
  totalBalance,
  getAccountBalance,
}: UseFilteredDataParams): FilteredDataResult {
  // Filtrar transacciones por cuenta, categoría y fecha
  const filteredTransactions = useMemo(() => {
    const effectiveDateRange = getEffectiveDateRange(dateRange);
    const selectedAccount = filterAccount === 'all'
      ? null
      : accounts.find((acc) => acc.id === filterAccount);

    return transactions.filter((t) => {
      // Filtro por cuenta
      if (filterAccount !== 'all') {
        if (!selectedAccount || !transactionUsesAccount(t, selectedAccount)) return false;
      }

      // Filtro por categoría
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;

      // 🆕 Filtro por fecha
      if (effectiveDateRange) {
        const transactionDate = new Date(t.date);
        if (transactionDate < effectiveDateRange.startDate || transactionDate > effectiveDateRange.endDate) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, accounts, filterAccount, filterCategory, dateRange]);

  // Filtrar cuentas si hay filtro activo
  const filteredAccounts = useMemo(() => {
    if (filterAccount === 'all') return accounts;
    return accounts.filter((acc) => acc.id === filterAccount);
  }, [accounts, filterAccount]);

  // Estadísticas dinámicas basadas en datos filtrados (ingresos/gastos mensuales)
  const monthlyStats = useGlobalStats(filteredTransactions, filteredAccounts);

  // Pendientes: filtrar por cuenta si hay filtro activo
  const pendingExpenses = useMemo(() => {
    const accountsToCheck = filterAccount !== 'all'
      ? accounts.filter(acc => acc.id === filterAccount && acc.type === 'credit')
      : accounts.filter(acc => acc.type === 'credit');

    return accountsToCheck.reduce(
      (sum, account) => sum + CreditCardCalculator.calculateUsedCredit(account, transactions),
      0
    );
  }, [accounts, transactions, filterAccount]);

  const dynamicStats = useMemo(() => ({
    ...monthlyStats,
    pendingExpenses,
  }), [monthlyStats, pendingExpenses]);

  // Balance total dinámico (suma real de cuentas, excluyendo TC)
  const dynamicTotalBalance = useMemo(() => {
    if (filterAccount !== 'all') return getAccountBalance(filterAccount);
    return totalBalance;
  }, [totalBalance, filterAccount, getAccountBalance]);

  // Etiqueta dinámica para el balance
  const balanceLabel = useMemo(() => {
    if (filterAccount === 'all') return 'Balance Total';
    const account = accounts.find((acc) => acc.id === filterAccount);
    if (account?.type === 'credit') return 'Cupo Disponible';
    return 'Balance';
  }, [filterAccount, accounts]);

  return {
    filteredTransactions,
    filteredAccounts,
    dynamicStats,
    dynamicTotalBalance,
    balanceLabel,
  };
}
