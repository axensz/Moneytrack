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
import { getCreditCardUsedCredit } from '../utils/accountStrategies';
import { transactionUsesAccount } from '../utils/accountTransactions';
import { getDateRangeFromPreset } from '../utils/dateUtils';
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
function getEffectiveDateRange(dateRange?: DateRange | null): { startDate: Date | null; endDate: Date | null } | null {
  if (!dateRange || dateRange.preset === 'all') {
    return null;
  }

  if (dateRange.preset === 'custom') {
    // startDate se normaliza a 00:00:00 para INCLUIR las transacciones del propio
    // día de inicio (ahora que las transacciones tienen hora real). Sin esto, una
    // transacción del día de inicio a las 09:00 quedaba excluida porque su hora era
    // menor que la hora del startDate. Iguala lo que ya hace useTransactionsView (#19).
    const startDate = dateRange.startDate ? new Date(dateRange.startDate) : null;
    startDate?.setHours(0, 0, 0, 0);

    const endDate = dateRange.endDate ? new Date(dateRange.endDate) : null;
    endDate?.setHours(23, 59, 59, 999);

    return {
      startDate,
      endDate
    };
  }

  const { start, end } = getDateRangeFromPreset(dateRange.preset);
  return { startDate: start, endDate: end };
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
        if (effectiveDateRange.startDate && transactionDate < effectiveDateRange.startDate) {
          return false;
        }
        if (effectiveDateRange.endDate && transactionDate > effectiveDateRange.endDate) {
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
      (sum, account) => sum + getCreditCardUsedCredit(account, transactions),
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
