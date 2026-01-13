/**
 * 🟡 HOOK CENTRALIZADO DE ESTADÍSTICAS GLOBALES
 *
 * Elimina duplicidad de lógica de cálculo de estadísticas que anteriormente
 * estaba repetida en:
 * - finance-tracker.tsx (líneas 42-68)
 * - useTransactions.ts (líneas 16-41)
 *
 * PRINCIPIOS APLICADOS:
 * ✅ DRY (Don't Repeat Yourself)
 * ✅ Single Responsibility Principle
 * ✅ Separation of Concerns
 */

import { useMemo } from 'react';
import { CreditCardCalculator } from '../utils/balanceCalculator';
import type { Account, Transaction } from '../types/finance';

export interface GlobalStats {
  totalIncome: number;
  totalExpenses: number;
  pendingExpenses: number;
}

/**
 * Hook para calcular estadísticas globales de la aplicación
 *
 * LÓGICA DE CÁLCULO:
 *
 * 1. TOTAL INGRESOS:
 *    - Suma de todos los ingresos PAGADOS
 *
 * 2. TOTAL GASTOS:
 *    - Gastos PAGADOS (todas las cuentas)
 *    - + Gastos NO PAGADOS de tarjetas de crédito
 *    (Los gastos en TC se consideran "hechos" aunque no estén pagados)
 *
 * 3. GASTOS PENDIENTES:
 *    - Cupo utilizado de todas las tarjetas de crédito
 *    (Deuda total por pagar)
 *
 * @param transactions - Lista de todas las transacciones
 * @param accounts - Lista de todas las cuentas
 * @returns Objeto con estadísticas globales
 */
export function useGlobalStats(
  transactions: Transaction[],
  accounts: Account[]
): GlobalStats {
  return useMemo(() => {
    // ✅ 1. CALCULAR TOTAL DE INGRESOS (solo pagados)
    const paidTransactions = transactions.filter(t => t.paid);

    const totalIncome = paidTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    // ✅ 2. CALCULAR TOTAL DE GASTOS

    // 2.1 Gastos pagados (todas las cuentas)
    const paidExpenses = paidTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    // 2.2 Gastos NO pagados de tarjetas de crédito
    // Estos se consideran "efectuados" aunque no estén marcados como pagados
    // porque ya consumen el cupo de la tarjeta
    const unpaidTCExpenses = transactions
      .filter(t => {
        // Debe ser un gasto no pagado
        if (t.type !== 'expense' || t.paid) return false;

        // Debe pertenecer a una tarjeta de crédito
        const account = accounts.find(acc => acc.id === t.accountId);
        return account?.type === 'credit';
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpenses = paidExpenses + unpaidTCExpenses;

    // ✅ 3. CALCULAR GASTOS PENDIENTES (deuda de tarjetas de crédito)
    // Usa la nueva lógica corregida de CreditCardCalculator
    const pendingExpenses = accounts
      .filter(acc => acc.type === 'credit')
      .reduce(
        (sum, account) => sum + CreditCardCalculator.calculateUsedCredit(account, transactions),
        0
      );

    return {
      totalIncome,
      totalExpenses,
      pendingExpenses
    };
  }, [transactions, accounts]);
}

/**
 * 🆕 Hook para estadísticas por periodo
 * Útil para gráficas y reportes mensuales/anuales
 *
 * @param transactions - Lista de transacciones
 * @param accounts - Lista de cuentas
 * @param startDate - Fecha inicio del periodo
 * @param endDate - Fecha fin del periodo
 * @returns Estadísticas del periodo especificado
 */
export function useStatsForPeriod(
  transactions: Transaction[],
  accounts: Account[],
  startDate: Date,
  endDate: Date
): GlobalStats {
  // Filtrar transacciones del periodo
  const periodTransactions = useMemo(() => {
    return transactions.filter(t => {
      const transactionDate = t.date instanceof Date ? t.date : new Date(t.date);
      return transactionDate >= startDate && transactionDate <= endDate;
    });
  }, [transactions, startDate, endDate]);

  // Reutilizar la lógica del hook principal
  return useGlobalStats(periodTransactions, accounts);
}

/**
 * 🆕 Hook para balance neto (ingresos - gastos)
 * Útil para mostrar si el periodo fue positivo o negativo
 */
export function useNetBalance(
  transactions: Transaction[],
  accounts: Account[]
): number {
  const stats = useGlobalStats(transactions, accounts);
  return stats.totalIncome - stats.totalExpenses;
}
