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
import { getCreditCardUsedCredit } from '../utils/accountStrategies';
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
  /**
   * Gastos NO pagados de tarjetas de crédito. Ya NO se incluye en totalExpenses
   * (ver #20: pertenece a 'Pendientes'). Se expone para compatibilidad con
   * consumidores que aún dependan de este desglose.
   */
  unpaidTCExpenses: number;
}

/**
 * Hook para calcular estadísticas globales de la aplicación
 *
 * LÓGICA DE CÁLCULO:
 *
 * 1. TOTAL INGRESOS:
 *    - Suma de todos los ingresos PAGADOS
 *
 * 2. TOTAL GASTOS (gasto EFECTIVO):
 *    - Gastos PAGADOS (todas las cuentas)
 *    (Una compra en TC impaga NO cuenta aquí: es deuda, pertenece a 'Pendientes'.
 *     Antes se sumaba unpaidTCExpenses y la misma compra aparecía a la vez en
 *     'Gastos' y en 'Pendientes' → doble presentación. Ver #20.)
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

    // 2.2 Gastos NO pagados de tarjetas de crédito.
    // Se mantiene calculado para compatibilidad (se expone en GlobalStats), pero
    // YA NO se suma a totalExpenses: una compra TC impaga es deuda y se refleja en
    // 'Pendientes' (pendingExpenses, vía usedCredit). Sumarla a 'Gastos' duplicaba
    // la presentación de la misma compra en ambas cards (#20).
    const unpaidTCExpenses = realTransactions
      .filter(t => {
        // Debe ser un gasto no pagado
        if (t.type !== 'expense' || t.paid) return false;

        // Debe pertenecer a una tarjeta de crédito
        const account = findAccountForTransaction(accounts, t.accountId);
        return account?.type === 'credit';
      })
      .reduce((sum, t) => sum + t.amount, 0);

    // 'Gastos' = gasto EFECTIVO (solo lo pagado). La compra TC impaga vive en
    // 'Pendientes', no aquí, para evitar la doble presentación (#20).
    const totalExpenses = paidExpenses;

    // ✅ 3. CALCULAR GASTOS PENDIENTES (deuda de tarjetas de crédito)
    // Usa la API viva de cupo utilizado (estrategia de TC).
    const pendingExpenses = accounts
      .filter(acc => acc.type === 'credit')
      .reduce(
        (sum, account) => sum + getCreditCardUsedCredit(account, transactions),
        0
      );

    return {
      totalIncome,
      totalExpenses,
      pendingExpenses,
      unpaidTCExpenses
    };
  }, [transactions, accounts]);
}