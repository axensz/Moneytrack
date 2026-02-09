/**
 * Hook para utilidades de cálculo de pagos periódicos
 * - Verificar si está pagado
 * - Calcular próximo vencimiento
 * - Estadísticas
 */

import { useMemo, useCallback } from 'react';
import type { RecurringPayment, Transaction } from '../../types/finance';

interface RecurringStats {
  total: number;
  active: number;
  paidThisMonth: number;
  pendingThisMonth: number;
  totalMonthlyAmount: number;
  totalYearlyAmount: number;
  upcomingPayments: RecurringPayment[];
}

interface UseRecurringUtilsReturn {
  isPaidForMonth: (paymentId: string, month?: Date) => boolean;
  getPaymentTransactionForMonth: (
    paymentId: string,
    month?: Date
  ) => Transaction | undefined;
  getNextDueDate: (payment: RecurringPayment) => Date;
  getDaysUntilDue: (payment: RecurringPayment) => number;
  getPaymentHistory: (paymentId: string, limit?: number) => Transaction[];
  stats: RecurringStats;
}

export function useRecurringUtils(
  recurringPayments: RecurringPayment[],
  transactions: Transaction[]
): UseRecurringUtilsReturn {
  /**
   * Pre-computed lookup: month key → Set of paid recurringPaymentIds
   * Reduces isPaidForMonth from O(N) per call to O(1) after O(N) setup
   */
  const paidPaymentsByMonth = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const t of transactions) {
      if (!t.recurringPaymentId) continue;
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(t.recurringPaymentId);
    }
    return map;
  }, [transactions]);

  /**
   * Verificar si un pago periódico está pagado para un mes específico
   * O(1) lookup gracias al mapa pre-computado
   */
  const isPaidForMonth = useCallback(
    (paymentId: string, month: Date = new Date()): boolean => {
      const key = `${month.getFullYear()}-${month.getMonth()}`;
      return paidPaymentsByMonth.get(key)?.has(paymentId) ?? false;
    },
    [paidPaymentsByMonth]
  );

  /**
   * Pre-computed lookup: month key → Map of paymentId → Transaction
   * Used by getPaymentTransactionForMonth for O(1) lookups
   */
  const paymentTransactionsByMonth = useMemo(() => {
    const map = new Map<string, Map<string, Transaction>>();
    for (const t of transactions) {
      if (!t.recurringPaymentId) continue;
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!map.has(key)) map.set(key, new Map());
      // Keep the latest transaction for each payment in that month
      map.get(key)!.set(t.recurringPaymentId, t);
    }
    return map;
  }, [transactions]);

  /**
   * Obtener la transacción asociada a un pago para un mes
   */
  const getPaymentTransactionForMonth = useCallback(
    (paymentId: string, month: Date = new Date()): Transaction | undefined => {
      const key = `${month.getFullYear()}-${month.getMonth()}`;
      return paymentTransactionsByMonth.get(key)?.get(paymentId);
    },
    [paymentTransactionsByMonth]
  );

  /**
   * Calcular próxima fecha de vencimiento
   */
  const getNextDueDate = useCallback((payment: RecurringPayment): Date => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const dueDay = Math.min(payment.dueDay, 28); // Evitar problemas con meses cortos

    let dueDate = new Date(currentYear, currentMonth, dueDay);

    // Si ya pasó este mes, calcular para el siguiente período
    if (today > dueDate) {
      if (payment.frequency === 'monthly') {
        dueDate = new Date(currentYear, currentMonth + 1, dueDay);
      } else {
        dueDate = new Date(currentYear + 1, currentMonth, dueDay);
      }
    }

    return dueDate;
  }, []);

  /**
   * Calcular días hasta el vencimiento
   */
  const getDaysUntilDue = useCallback(
    (payment: RecurringPayment): number => {
      const dueDate = getNextDueDate(payment);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = dueDate.getTime() - today.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    },
    [getNextDueDate]
  );

  /**
   * Obtener historial de pagos para un pago periódico
   */
  const getPaymentHistory = useCallback(
    (paymentId: string, limit: number = 12): Transaction[] => {
      return transactions
        .filter((t) => t.recurringPaymentId === paymentId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, limit);
    },
    [transactions]
  );

  /**
   * Estadísticas de pagos periódicos
   */
  const stats = useMemo(() => {
    const activePayments = recurringPayments.filter((p) => p.isActive);
    const now = new Date();

    const paidThisMonth = activePayments.filter((p) =>
      isPaidForMonth(p.id!, now)
    ).length;
    const pendingThisMonth = activePayments.length - paidThisMonth;

    const totalMonthlyAmount = activePayments
      .filter((p) => p.frequency === 'monthly')
      .reduce((sum, p) => sum + p.amount, 0);

    const totalYearlyAmount = activePayments
      .filter((p) => p.frequency === 'yearly')
      .reduce((sum, p) => sum + p.amount, 0);

    // Pagos próximos a vencer (en los próximos 7 días)
    const upcomingPayments = activePayments.filter((p) => {
      const daysUntil = getDaysUntilDue(p);
      return daysUntil >= 0 && daysUntil <= 7 && !isPaidForMonth(p.id!, now);
    });

    return {
      total: recurringPayments.length,
      active: activePayments.length,
      paidThisMonth,
      pendingThisMonth,
      totalMonthlyAmount,
      totalYearlyAmount,
      upcomingPayments,
    };
  }, [recurringPayments, isPaidForMonth, getDaysUntilDue]);

  return {
    isPaidForMonth,
    getPaymentTransactionForMonth,
    getNextDueDate,
    getDaysUntilDue,
    getPaymentHistory,
    stats,
  };
}
