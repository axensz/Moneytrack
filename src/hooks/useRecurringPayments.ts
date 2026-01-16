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
  transactions: Transaction[]
) {
  // LocalStorage para modo invitado
  const [localPayments, setLocalPayments] = useLocalStorage<RecurringPayment[]>(
    'recurringPayments',
    []
  );

  // Subscripción a Firestore
  const { firestorePayments, loading, error } = useRecurringSubscription(userId);

  // Usar Firebase si hay usuario, localStorage si no
  const recurringPayments = userId ? firestorePayments : localPayments;

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
