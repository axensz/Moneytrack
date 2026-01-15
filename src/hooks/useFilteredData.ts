/**
 * 🆕 HOOK: useFilteredData
 *
 * Centraliza la lógica de filtrado de transacciones y cuentas
 * Extrae ~30 líneas de useMemo de finance-tracker.tsx
 *
 * RESPONSABILIDADES:
 * - Filtrado de transacciones por cuenta y categoría
 * - Filtrado de cuentas
 * - Cálculo de estadísticas dinámicas
 * - Etiquetas dinámicas para UI
 */

import { useMemo } from 'react';
import { useGlobalStats } from './useGlobalStats';
import type { Transaction, Account, FilterValue } from '../types/finance';

interface UseFilteredDataParams {
  transactions: Transaction[];
  accounts: Account[];
  filterAccount: FilterValue;
  filterCategory: FilterValue;
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
 * Hook para gestionar filtrado de datos y estadísticas dinámicas
 */
export function useFilteredData({
  transactions,
  accounts,
  filterAccount,
  filterCategory,
  totalBalance,
  getAccountBalance,
}: UseFilteredDataParams): FilteredDataResult {
  // Filtrar transacciones por cuenta y categoría
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // Filtro por cuenta
      if (filterAccount !== 'all' && t.accountId !== filterAccount) return false;
      // Filtro por categoría
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;
      return true;
    });
  }, [transactions, filterAccount, filterCategory]);

  // Filtrar cuentas si hay filtro activo
  const filteredAccounts = useMemo(() => {
    if (filterAccount === 'all') return accounts;
    return accounts.filter((acc) => acc.id === filterAccount);
  }, [accounts, filterAccount]);

  // Estadísticas dinámicas basadas en datos filtrados
  const dynamicStats = useGlobalStats(filteredTransactions, filteredAccounts);

  // Balance total dinámico (solo afectado por filtro de cuenta)
  const dynamicTotalBalance = useMemo(() => {
    if (filterAccount === 'all') return totalBalance;
    return getAccountBalance(filterAccount);
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
