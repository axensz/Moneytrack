/**
 * 🆕 REFACTORED: useRecurringPayments
 *
 * Hook compositor que combina los módulos de pagos recurrentes.
 * Mantiene la misma API pública para compatibilidad.
 *
 * ARQUITECTURA:
 * - useRecurringSubscription: Listener en tiempo real
 * - useRecurringCRUD: Operaciones de escritura
 * - useRecurringUtils: Cálculos y estadísticas
 */

import { useRecurringSubscription, useRecurringCRUD, useRecurringUtils } from './recurring';
import { useLocalStorage } from './useLocalStorage';
import type { Transaction, RecurringPayment } from '../types/finance';

export function useRecurringPayments(
  userId: string | null,
  transactions: Transaction[],
  externalPayments?: RecurringPayment[]
) {
  // LocalStorage para modo invitado
  const [localPayments, setLocalPayments] = useLocalStorage<RecurringPayment[]>(
    'recurringPayments',
    []
  );

  // Subscripción a Firestore — skip if data provided externally
  const { firestorePayments, loading, error } = useRecurringSubscription(
    externalPayments !== undefined ? null : userId
  );

  // Use external data if provided, otherwise Firestore or localStorage
  const recurringPayments = externalPayments ?? (userId ? firestorePayments : localPayments);

  // Operaciones CRUD
  const { addRecurringPayment, updateRecurringPayment, deleteRecurringPayment } =
    useRecurringCRUD(userId, setLocalPayments);

  // Utilidades y estadísticas
  const {
    isPaidForMonth,
    getPaymentTransactionForMonth,
    getNextDueDate,
    getDaysUntilDue,
    getPaymentHistory,
    stats,
  } = useRecurringUtils(recurringPayments, transactions);

  return {
    // Data
    recurringPayments,
    loading,
    error,
    // CRUD
    addRecurringPayment,
    updateRecurringPayment,
    deleteRecurringPayment,
    // Utils
    isPaidForMonth,
    getPaymentTransactionForMonth,
    getNextDueDate,
    getDaysUntilDue,
    getPaymentHistory,
    stats,
  };
}
