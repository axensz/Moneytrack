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
import { findAccountForTransaction } from '../utils/accountTransactions';
import { SPECIAL_CATEGORIES } from '../config/constants';
import type { Account, Transaction } from '../types/finance';

/**
 * Una transacción cuenta como ingreso/gasto "real" del usuario solo si NO es un
 * movimiento interno (transferencia entre cuentas o pago/ajuste de tarjeta).
 * Mantiene consistencia con useStatsData, useBudgets y buildFinancialContext.
 */
function isRealMovement(t: Transaction): boolean {
  if (t.type === 'transfer') return false;
  return !SPECIAL_CATEGORIES.adjustmentCategories.includes(t.category);
}

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
    // Solo movimientos reales: excluye transferencias y pagos/ajustes de tarjeta.
    // Antes estos pagos inflaban ingresos (ingreso a la TC) y gastos (gasto espejo
    // del banco), produciendo cifras distintas a las de los charts y presupuestos.
    const realTransactions = transactions.filter(isRealMovement);
    const paidTransactions = realTransactions.filter(t => t.paid);

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
    const unpaidTCExpenses = realTransactions
      .filter(t => {
        // Debe ser un gasto no pagado
        if (t.type !== 'expense' || t.paid) return false;

        // Debe pertenecer a una tarjeta de crédito
        const account = findAccountForTransaction(accounts, t.accountId);
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