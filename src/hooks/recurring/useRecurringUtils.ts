/**
 * Hook para utilidades de cálculo de pagos periódicos
 * - Verificar si está pagado
 * - Calcular próximo vencimiento
 * - Estadísticas
 */

import { useMemo, useCallback } from 'react';
import type { RecurringPayment, Transaction } from '../../types/finance';
import {
  effectiveDueDay,
  getYearlyAnchorMonth,
  getNextDueDate as computeNextDueDate,
  getCycleWindow as computeCycleWindow,
} from '../../utils/recurringDates';

interface RecurringStats {
  total: number;
  active: number;
  paidThisMonth: number;
  pendingThisMonth: number;
  totalMonthlyAmount: number;
  totalYearlyAmount: number;
  upcomingPayments: RecurringPayment[];
  overduePayments: RecurringPayment[];
}

interface UseRecurringUtilsReturn {
  isPaidForMonth: (paymentId: string, month?: Date) => boolean;
  getPaymentTransactionForMonth: (
    paymentId: string,
    month?: Date
  ) => Transaction | undefined;
  getNextDueDate: (payment: RecurringPayment) => Date;
  getDaysUntilDue: (payment: RecurringPayment) => number;
  getDaysOverdue: (payment: RecurringPayment) => number;
  isOverdue: (payment: RecurringPayment) => boolean;
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
   * Pre-computed lookup: recurringPaymentId → transactions de ese pago,
   * ordenadas por fecha asc. Alimenta la detección por ventana de ciclo
   * (mismas transacciones que paidPaymentsByMonth / paymentTransactionsByMonth).
   */
  const transactionsByPaymentId = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of transactions) {
      if (!t.recurringPaymentId) continue;
      if (!map.has(t.recurringPaymentId)) map.set(t.recurringPaymentId, []);
      map.get(t.recurringPaymentId)!.push(t);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    return map;
  }, [transactions]);

  /**
   * Mapa de pagos por id, para resolver frequency/dueDay/createdAt desde isPaidForMonth.
   */
  const paymentsById = useMemo(() => {
    const map = new Map<string, RecurringPayment>();
    for (const p of recurringPayments) {
      if (p.id) map.set(p.id, p);
    }
    return map;
  }, [recurringPayments]);

  /**
   * Ventana del ciclo de facturación que contiene la fecha de referencia.
   * Devuelve [inicio, fin) donde:
   *  - fin = próximo vencimiento (exclusivo)
   *  - inicio = vencimiento del ciclo anterior (inclusivo)
   * Para 'monthly' el periodo es 1 mes; para 'yearly' el mes de vencimiento
   * se ancla en payment.createdAt (#8) y el periodo es 1 año.
   * El día se acota al último día real de cada mes (#7).
   */
  const getCycleWindow = useCallback(
    (payment: RecurringPayment, reference: Date): { start: Date; end: Date } =>
      computeCycleWindow(payment, reference),
    []
  );

  /**
   * Verificar si un pago periódico está pagado para el CICLO de facturación
   * que contiene la fecha de referencia (#9).
   *
   * En vez de agrupar por mes calendario, detecta cualquier transacción del
   * pago cuya fecha caiga dentro de la ventana [vencimientoAnterior, próximoVencimiento).
   * Así un pago anticipado o atrasado cuenta para el ciclo correcto.
   *
   * Si no se puede resolver el pago (id desconocido), cae al comportamiento
   * previo por mes calendario para no romper consumidores.
   */
  const isPaidForMonth = useCallback(
    (paymentId: string, month: Date = new Date()): boolean => {
      const payment = paymentsById.get(paymentId);
      if (!payment) {
        const key = `${month.getFullYear()}-${month.getMonth()}`;
        return paidPaymentsByMonth.get(key)?.has(paymentId) ?? false;
      }

      const list = transactionsByPaymentId.get(paymentId);
      if (!list || list.length === 0) return false;

      const { start, end } = getCycleWindow(payment, month);
      const startMs = start.getTime();
      const endMs = end.getTime();

      return list.some((t) => {
        const tMs = new Date(t.date).getTime();
        return tMs >= startMs && tMs < endMs;
      });
    },
    [paymentsById, transactionsByPaymentId, getCycleWindow, paidPaymentsByMonth]
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
  const getNextDueDate = useCallback(
    (payment: RecurringPayment): Date => computeNextDueDate(payment),
    []
  );

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
   * Calcular días de atraso de un pago.
   * A diferencia de getNextDueDate (que adelanta al siguiente período cuando el
   * día ya pasó), esto mira la fecha programada del período ACTUAL: si ya pasó y
   * el pago no se ha registrado este mes, está vencido.
   * Devuelve 0 si está al día o ya pagado.
   */
  const getDaysOverdue = useCallback(
    (payment: RecurringPayment): number => {
      const today = new Date();
      if (isPaidForMonth(payment.id!, today)) return 0;

      today.setHours(0, 0, 0, 0);
      const year = today.getFullYear();
      const month = today.getMonth();

      // Fecha programada del ciclo ACTUAL.
      // - yearly: en el mes ancla (#8); sólo está vencido si el mes ancla ya
      //   inició su periodo este año (mes/día ya pasaron).
      // - monthly: este mes.
      // El día se acota al último día real del mes objetivo (#7).
      let scheduled: Date;
      if (payment.frequency === 'yearly') {
        const anchorMonth = getYearlyAnchorMonth(payment, month);
        scheduled = new Date(
          year,
          anchorMonth,
          effectiveDueDay(payment.dueDay, year, anchorMonth)
        );
      } else {
        scheduled = new Date(year, month, effectiveDueDay(payment.dueDay, year, month));
      }

      if (today <= scheduled) return 0;
      const diffTime = today.getTime() - scheduled.getTime();
      return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    },
    [isPaidForMonth]
  );

  const isOverdue = useCallback(
    (payment: RecurringPayment): boolean => getDaysOverdue(payment) > 0,
    [getDaysOverdue]
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

    // Pendiente este mes: no pagado en su ciclo Y que venza este mes o ya esté
    // vencido. Antes era activos−pagados, que contaba como pendiente un pago
    // ANUAL cuyo vencimiento cae en otro mes (inflaba el badge todo el año).
    const pendingThisMonth = activePayments.filter((p) => {
      if (isPaidForMonth(p.id!, now)) return false;
      if (getDaysOverdue(p) > 0) return true;
      const due = getNextDueDate(p);
      return due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear();
    }).length;

    // Costo mensual EQUIVALENTE: mensuales + anuales prorrateados (/12). Antes
    // solo sumaba mensuales, así que un pago anual aportaba $0 al "Total/Mes" y
    // su costo quedaba invisible (totalYearlyAmount no se muestra en la UI).
    const totalMonthlyAmount = activePayments.reduce(
      (sum, p) => sum + (p.frequency === 'yearly' ? p.amount / 12 : p.amount),
      0
    );

    const totalYearlyAmount = activePayments
      .filter((p) => p.frequency === 'yearly')
      .reduce((sum, p) => sum + p.amount, 0);

    // Pagos vencidos (día programado ya pasó este mes y no se han pagado)
    const overduePayments = activePayments.filter((p) => getDaysOverdue(p) > 0);

    // Pagos próximos a vencer (en los próximos 7 días, no vencidos)
    const upcomingPayments = activePayments.filter((p) => {
      const daysUntil = getDaysUntilDue(p);
      return daysUntil >= 0 && daysUntil <= 7 && !isPaidForMonth(p.id!, now) && getDaysOverdue(p) === 0;
    });

    return {
      total: recurringPayments.length,
      active: activePayments.length,
      paidThisMonth,
      pendingThisMonth,
      totalMonthlyAmount,
      totalYearlyAmount,
      upcomingPayments,
      overduePayments,
    };
  }, [recurringPayments, isPaidForMonth, getDaysUntilDue, getDaysOverdue, getNextDueDate]);

  return {
    isPaidForMonth,
    getPaymentTransactionForMonth,
    getNextDueDate,
    getDaysUntilDue,
    getDaysOverdue,
    isOverdue,
    getPaymentHistory,
    stats,
  };
}
