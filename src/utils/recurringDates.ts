/**
 * Utilidades PURAS de fechas para pagos periódicos (recurring).
 *
 * Sin React, sin Firebase: lógica reutilizable compartida entre el hook
 * `useRecurringUtils` (vista) y el `PaymentMonitor` (notificaciones), para que
 * ambos queden en paridad respecto a:
 *  - Fin de mes: el día de vencimiento se acota al último día real del mes
 *    objetivo (ej. dueDay 31 en febrero → 28/29).
 *  - Pagos anuales: el mes de vencimiento se ancla al mes en que se configuró
 *    el pago (payment.createdAt), no a enero fijo.
 *  - Ciclo de facturación: la ventana [inicio, fin) del período actual.
 */

import type { RecurringPayment } from '../types/finance';

/**
 * Centinela para "último día del mes". Se guarda como dueDay y, al acotarse con
 * `effectiveDueDay` (Math.min con el último día real), siempre resuelve al último
 * día de cualquier mes —28/29/30/31— sin lógica extra en las fechas.
 */
export const LAST_DAY_OF_MONTH = 99;

/** ¿Este dueDay representa "último día del mes"? */
export const isLastDayOfMonth = (dueDay: number): boolean => dueDay >= LAST_DAY_OF_MONTH;

/** Último día real del mes objetivo (m: 0-11). Maneja meses cortos y bisiestos. */
export const lastDayOfMonth = (y: number, m: number): number =>
  new Date(y, m + 1, 0).getDate();

/**
 * Día de vencimiento efectivo para un mes/año dados: el día configurado,
 * acotado al último día real de ese mes (ej. dueDay 31 en febrero → 28/29).
 */
export const effectiveDueDay = (dueDay: number, y: number, m: number): number =>
  Math.min(dueDay, lastDayOfMonth(y, m));

/**
 * Mes ancla de vencimiento para pagos anuales: el mes en que se configuró
 * (payment.createdAt). Si no hay createdAt, fallback al mes de referencia.
 */
export const getYearlyAnchorMonth = (
  payment: RecurringPayment,
  fallbackMonth: number
): number =>
  payment.createdAt ? new Date(payment.createdAt).getMonth() : fallbackMonth;

/**
 * Calcular próxima fecha de vencimiento (inclusiva del día de hoy: si el día
 * de vencimiento es hoy, devuelve hoy).
 *
 * - yearly: mes anclado en createdAt (#8); si no hay createdAt, se ancla al mes
 *   de la fecha de referencia. Día acotado al último día real del mes (#7).
 * - monthly: este mes si aún no pasó el día; si no, el mes siguiente. Día
 *   acotado al último día real del mes objetivo (#7).
 *
 * @param refDate Fecha de referencia (default: hoy). Permite tests deterministas.
 */
export const getNextDueDate = (
  payment: RecurringPayment,
  refDate: Date = new Date()
): Date => {
  const currentMonth = refDate.getMonth();
  const currentYear = refDate.getFullYear();

  if (payment.frequency === 'yearly') {
    // #8: anclar el mes de vencimiento al mes en que se configuró el pago.
    const anchorMonth = getYearlyAnchorMonth(payment, currentMonth);
    // #7: acotar al último día real del mes objetivo.
    const dueThisYear = new Date(
      currentYear,
      anchorMonth,
      effectiveDueDay(payment.dueDay, currentYear, anchorMonth)
    );
    if (refDate <= dueThisYear) return dueThisYear;
    const nextYear = currentYear + 1;
    return new Date(
      nextYear,
      anchorMonth,
      effectiveDueDay(payment.dueDay, nextYear, anchorMonth)
    );
  }

  // monthly — #7: acotar al último día real del mes objetivo en cada rama.
  const dueThisMonth = new Date(
    currentYear,
    currentMonth,
    effectiveDueDay(payment.dueDay, currentYear, currentMonth)
  );
  if (refDate <= dueThisMonth) return dueThisMonth;
  return new Date(
    currentYear,
    currentMonth + 1,
    effectiveDueDay(payment.dueDay, currentYear, currentMonth + 1)
  );
};

/**
 * Ventana del ciclo de facturación que contiene la fecha de referencia.
 * Devuelve [inicio, fin) donde:
 *  - fin = próximo vencimiento (exclusivo)
 *  - inicio = vencimiento del ciclo anterior (inclusivo)
 * Para 'monthly' el periodo es 1 mes; para 'yearly' el mes de vencimiento
 * se ancla en payment.createdAt (#8) y el periodo es 1 año.
 * El día se acota al último día real de cada mes (#7).
 *
 * @param refDate Fecha de referencia (default: hoy). Permite tests deterministas.
 */
export const getCycleWindow = (
  payment: RecurringPayment,
  refDate: Date = new Date()
): { start: Date; end: Date } => {
  const refYear = refDate.getFullYear();
  const refMonth = refDate.getMonth();

  if (payment.frequency === 'yearly') {
    const anchorMonth = getYearlyAnchorMonth(payment, refMonth);
    // Vencimiento de este año (en el mes ancla)
    const dueThisYear = new Date(
      refYear,
      anchorMonth,
      effectiveDueDay(payment.dueDay, refYear, anchorMonth)
    );
    if (refDate >= dueThisYear) {
      // El ciclo actual empezó en el vencimiento de este año
      const nextYear = refYear + 1;
      return {
        start: dueThisYear,
        end: new Date(
          nextYear,
          anchorMonth,
          effectiveDueDay(payment.dueDay, nextYear, anchorMonth)
        ),
      };
    }
    // El ciclo actual empezó en el vencimiento del año anterior
    const prevYear = refYear - 1;
    return {
      start: new Date(
        prevYear,
        anchorMonth,
        effectiveDueDay(payment.dueDay, prevYear, anchorMonth)
      ),
      end: dueThisYear,
    };
  }

  // monthly
  const dueThisMonth = new Date(
    refYear,
    refMonth,
    effectiveDueDay(payment.dueDay, refYear, refMonth)
  );
  if (refDate >= dueThisMonth) {
    return {
      start: dueThisMonth,
      end: new Date(
        refYear,
        refMonth + 1,
        effectiveDueDay(payment.dueDay, refYear, refMonth + 1)
      ),
    };
  }
  return {
    start: new Date(
      refYear,
      refMonth - 1,
      effectiveDueDay(payment.dueDay, refYear, refMonth - 1)
    ),
    end: dueThisMonth,
  };
};

/**
 * Clave estable que identifica el CICLO de facturación que contiene refDate.
 * Es el inicio de la ventana (`getCycleWindow().start`, el vencimiento que abrió
 * el ciclo), serializado como `YYYY-M-D`. Estable: dos fechas del mismo ciclo
 * —aunque crucen el borde de mes— dan la misma clave.
 *
 * Se estampa en `transaction.recurringCycle` cuando el usuario marca/vincula un
 * pago desde la tarjeta, para fijar el ciclo sin depender de en qué ventana cae
 * la fecha real del pago (pago anticipado/atrasado).
 */
export const cycleKey = (
  payment: RecurringPayment,
  refDate: Date = new Date()
): string => {
  const { start } = getCycleWindow(payment, refDate);
  return `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
};
