/**
 * Hook para calcular el estado de cuenta de tarjetas de crédito
 * Usa cutoffDay y paymentDay para determinar el ciclo de facturación
 */

import { useMemo } from 'react';
import type { Transaction, Account } from '../types/finance';

export interface CreditCardStatement {
  account: Account;
  // Ciclo actual
  cycleStart: Date;
  cycleEnd: Date;
  paymentDueDate: Date;
  // Montos
  totalCharges: number; // Gastos del ciclo
  totalPayments: number; // Pagos realizados en el ciclo
  balance: number; // Saldo a pagar
  // Transacciones del ciclo
  cycleTransactions: Transaction[];
  // Cuotas
  installmentCharges: number; // Total en cuotas
  regularCharges: number; // Gastos de contado
}

/**
 * Calcula las fechas del ciclo de facturación actual
 */
function getCycleDates(cutoffDay: number, paymentDay: number): {
  cycleStart: Date;
  cycleEnd: Date;
  paymentDueDate: Date;
} {
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Determinar el ciclo actual basado en el día de corte
  let cycleEndMonth: number;
  let cycleEndYear: number;

  if (currentDay <= cutoffDay) {
    // Estamos antes del corte → el corte es este mes
    cycleEndMonth = currentMonth;
    cycleEndYear = currentYear;
  } else {
    // Ya pasó el corte → el próximo corte es el siguiente mes
    cycleEndMonth = currentMonth + 1;
    cycleEndYear = currentYear;
    if (cycleEndMonth > 11) {
      cycleEndMonth = 0;
      cycleEndYear++;
    }
  }

  // Fin del ciclo: día de corte del mes correspondiente
  const daysInCycleEndMonth = new Date(cycleEndYear, cycleEndMonth + 1, 0).getDate();
  const actualCutoffDay = Math.min(cutoffDay, daysInCycleEndMonth);
  const cycleEnd = new Date(cycleEndYear, cycleEndMonth, actualCutoffDay, 23, 59, 59);

  // Inicio del ciclo: día después del corte del mes anterior
  let cycleStartMonth = cycleEndMonth - 1;
  let cycleStartYear = cycleEndYear;
  if (cycleStartMonth < 0) {
    cycleStartMonth = 11;
    cycleStartYear--;
  }
  const daysInStartMonth = new Date(cycleStartYear, cycleStartMonth + 1, 0).getDate();
  const actualStartCutoff = Math.min(cutoffDay, daysInStartMonth);
  const cycleStart = new Date(cycleStartYear, cycleStartMonth, actualStartCutoff + 1, 0, 0, 0);

  // Fecha de pago: día de pago del mes siguiente al corte
  let paymentMonth = cycleEndMonth + 1;
  let paymentYear = cycleEndYear;
  if (paymentMonth > 11) {
    paymentMonth = 0;
    paymentYear++;
  }
  const daysInPaymentMonth = new Date(paymentYear, paymentMonth + 1, 0).getDate();
  const actualPaymentDay = Math.min(paymentDay, daysInPaymentMonth);
  const paymentDueDate = new Date(paymentYear, paymentMonth, actualPaymentDay);

  return { cycleStart, cycleEnd, paymentDueDate };
}

export function useCreditCardStatement(
  accounts: Account[],
  transactions: Transaction[]
): CreditCardStatement[] {
  return useMemo(() => {
    const creditAccounts = accounts.filter(
      a => a.type === 'credit' && a.cutoffDay && a.paymentDay
    );

    return creditAccounts.map(account => {
      const { cycleStart, cycleEnd, paymentDueDate } = getCycleDates(
        account.cutoffDay!,
        account.paymentDay!
      );

      // 1. Regular expenses + payments within this cycle date range.
      const inCycleTransactions = transactions.filter(t => {
        const tDate = new Date(t.date);
        const inRange = tDate >= cycleStart && tDate <= cycleEnd;
        const isCharge = t.accountId === account.id;
        const isIncomingPayment = t.type === 'transfer' && t.toAccountId === account.id;
        return inRange && (isCharge || isIncomingPayment);
      });

      // 2. Installment transactions from ANY previous cycle that are still active.
      // An installment is active in this cycle if monthsElapsed is within [0, installments).
      // We include only those whose purchase date falls BEFORE cycleStart to avoid duplicates
      // with inCycleTransactions.
      const activeInstallmentTransactions = transactions.filter(t => {
        if (t.accountId !== account.id) return false;
        if (t.type !== 'expense') return false;
        if (!t.installments || t.installments <= 1) return false;
        const tDate = new Date(t.date);
        if (tDate >= cycleStart) return false; // Already covered by inCycleTransactions
        const monthsElapsed =
          (cycleStart.getFullYear() - tDate.getFullYear()) * 12 +
          (cycleStart.getMonth() - tDate.getMonth());
        return monthsElapsed >= 0 && monthsElapsed < t.installments;
      });

      // Combine: regular cycle transactions + active installments from past cycles.
      const cycleTransactions = [...inCycleTransactions, ...activeInstallmentTransactions];

      // Calculate totals.
      // For installment expenses, use the monthly installment amount (not the full purchase amount).
      const totalCharges = cycleTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => {
          if (t.installments && t.installments > 1) {
            return sum + (t.monthlyInstallmentAmount ?? t.amount);
          }
          return sum + t.amount;
        }, 0);

      const totalPayments = inCycleTransactions
        .filter(t => t.type === 'income' || (t.type === 'transfer' && t.toAccountId === account.id))
        .reduce((sum, t) => sum + t.amount, 0);

      const installmentCharges = cycleTransactions
        .filter(t => t.type === 'expense' && t.installments && t.installments > 1)
        .reduce((sum, t) => sum + (t.monthlyInstallmentAmount ?? t.amount), 0);

      const regularCharges = inCycleTransactions
        .filter(t => t.type === 'expense' && !(t.installments && t.installments > 1))
        .reduce((sum, t) => sum + t.amount, 0);

      return {
        account,
        cycleStart,
        cycleEnd,
        paymentDueDate,
        totalCharges,
        totalPayments,
        balance: totalCharges - totalPayments,
        cycleTransactions,
        installmentCharges,
        regularCharges,
      };
    });
  }, [accounts, transactions]);
}
