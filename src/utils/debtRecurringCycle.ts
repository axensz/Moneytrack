/**
 * Utilidades PURAS para préstamos con pagos periódicos (cuota fija mensual).
 *
 * Reutilizan la maquinaria de ciclos de recurringDates.ts tratando la deuda como
 * un pago periódico MENSUAL cuyo día de vencimiento es `expectedPaymentDay`. Así
 * la clave del ciclo (`debtCycleKey`) es estable a través del borde de mes y se
 * acota a fin de mes igual que los pagos periódicos normales.
 *
 * Sin React, sin Firebase: lógica compartida entre el hook (writer) y la UI.
 */

import type { Debt, RecurringPayment, Transaction } from '../types/finance';
import { normalizePaymentDay } from './debtPaymentSchedule';
import { cycleKey } from './recurringDates';

/**
 * Construye un pago periódico sintético MENSUAL a partir de la deuda, usando
 * `expectedPaymentDay` como día de vencimiento. Devuelve null si la deuda no
 * tiene un día de cuota válido (1-31).
 */
const toMonthlyRecurring = (
  debt: Pick<Debt, 'id' | 'expectedPaymentDay' | 'createdAt'>,
): RecurringPayment | null => {
  const dueDay = normalizePaymentDay(debt.expectedPaymentDay);
  if (!dueDay) return null;
  return {
    id: debt.id,
    name: 'debt-cycle',
    amount: 0,
    category: '',
    dueDay,
    frequency: 'monthly',
    isActive: true,
    createdAt: debt.createdAt,
  };
};

/**
 * Clave estable del ciclo de cuota que contiene `date` (default: ahora), con el
 * formato 'YYYY-M-D' de `cycleKey`. Devuelve null si la deuda no tiene un día de
 * cuota válido (sin periodicidad no hay ciclo que estampar).
 */
export const debtCycleKey = (
  debt: Pick<Debt, 'id' | 'expectedPaymentDay' | 'createdAt'>,
  date: Date = new Date(),
): string | null => {
  const recurring = toMonthlyRecurring(debt);
  if (!recurring) return null;
  return cycleKey(recurring, date);
};

/**
 * ¿Esta transacción salda el ciclo indicado de la deuda? Un ciclo está pagado si
 * existe una transacción del préstamo (mismo debtId) con ese `recurringCycle`.
 * Análogo a recurringTransactionSatisfiesCycleKey, pero por debtId.
 */
export const debtTransactionSatisfiesCycle = (
  debt: Pick<Debt, 'id'>,
  transaction: Transaction,
  cycle: string,
): boolean => {
  if (!debt.id || !cycle) return false;
  return (
    transaction.debtId === debt.id
    && transaction.paid === true
    && transaction.recurringCycle === cycle
  );
};
