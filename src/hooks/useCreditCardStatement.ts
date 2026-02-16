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

      // Filter transactions for this account in the current cycle
      const cycleTransactions = transactions.filter(t => {
        const tDate = new Date(t.date);
        return t.accountId === account.id && tDate >= cycleStart && tDate <= cycleEnd;
      });

      // Calculate totals
      const totalCharges = cycleTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      const totalPayments = cycleTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

      const installmentCharges = cycleTransactions
        .filter(t => t.type === 'expense' && t.installments && t.installments > 1)
        .reduce((sum, t) => sum + (t.monthlyInstallmentAmount || t.amount), 0);

      const regularCharges = totalCharges - cycleTransactions
        .filter(t => t.type === 'expense' && t.installments && t.installments > 1)
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
