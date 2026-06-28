/**
 * useRecurringPayments — pagos periódicos: subscripción en tiempo real a Firestore
 * (o localStorage en modo invitado), operaciones CRUD y utilidades de cálculo.
 *
 * Antes estaba partido en un compositor + recurring/{useRecurringSubscription,
 * useRecurringCRUD} (+ barrel). El compositor no añadía lógica, así que se fusionó
 * la subscripción y el CRUD aquí. `useRecurringUtils` (cómputo puro y testeable)
 * sigue en su propio archivo.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebaseDb';
import { logger } from '../utils/logger';
import { safeFirestoreOperation, checkNetworkConnection, stripUndefined } from '../utils/firestoreHelpers';
import { generateId } from '../utils/formatters';
import { useLocalStorage } from './useLocalStorage';
import { useRecurringUtils } from './recurring/useRecurringUtils';
import type { Transaction, RecurringPayment } from '../types/finance';

export function useRecurringPayments(
  userId: string | null,
  transactions: Transaction[],
  externalPayments?: RecurringPayment[]
) {
  // LocalStorage para modo invitado.
  const [localPayments, setLocalPayments] = useLocalStorage<RecurringPayment[]>('recurringPayments', []);

  // ── Subscripción Firestore (se omite si los datos vienen por externalPayments) ──
  const subscriptionUserId = externalPayments !== undefined ? null : userId;
  const [firestorePayments, setFirestorePayments] = useState<RecurringPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!subscriptionUserId) {
      setFirestorePayments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const paymentsRef = collection(db, `users/${subscriptionUserId}/recurringPayments`);
    const paymentsQuery = query(paymentsRef, orderBy('dueDay', 'asc'));

    const unsubscribe = onSnapshot(
      paymentsQuery,
      (snapshot) => {
        const paymentsData = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          lastPaidDate: d.data().lastPaidDate?.toDate() || null,
          createdAt: d.data().createdAt?.toDate() || new Date(),
        })) as RecurringPayment[];
        setFirestorePayments(paymentsData);
        setLoading(false);
      },
      (err) => {
        logger.error('Error en pagos recurrentes', err);
        setError(new Error(`Error al cargar pagos recurrentes: ${err.message}`));
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [subscriptionUserId]);

  // Datos externos si se proveen; si no, Firestore (autenticado) o localStorage (invitado).
  const recurringPayments = externalPayments ?? (userId ? firestorePayments : localPayments);

  // ── CRUD: Firestore (autenticado) o localStorage (invitado) ──
  const addRecurringPayment = useCallback(
    async (payment: Omit<RecurringPayment, 'id' | 'createdAt'>) => {
      if (userId) {
        if (!checkNetworkConnection()) throw new Error('Sin conexión a internet');
        await safeFirestoreOperation(
          () => addDoc(collection(db, `users/${userId}/recurringPayments`), { ...payment, createdAt: new Date() }),
          'addRecurringPayment',
          { maxRetries: 2 }
        );
      } else {
        const newPayment: RecurringPayment = { ...payment, id: generateId(), createdAt: new Date() };
        setLocalPayments((prev) => [...prev, newPayment]);
      }
    },
    [userId, setLocalPayments]
  );

  const updateRecurringPayment = useCallback(
    async (id: string, updates: Partial<RecurringPayment>) => {
      if (userId) {
        if (!checkNetworkConnection()) throw new Error('Sin conexión a internet');
        const cleanUpdates = stripUndefined(updates);
        await safeFirestoreOperation(
          () => updateDoc(doc(db, `users/${userId}/recurringPayments`, id), cleanUpdates),
          'updateRecurringPayment',
          { maxRetries: 2 }
        );
      } else {
        setLocalPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
      }
    },
    [userId, setLocalPayments]
  );

  const deleteRecurringPayment = useCallback(
    async (id: string) => {
      if (userId) {
        if (!checkNetworkConnection()) throw new Error('Sin conexión a internet');
        await safeFirestoreOperation(
          () => deleteDoc(doc(db, `users/${userId}/recurringPayments`, id)),
          'deleteRecurringPayment',
          { maxRetries: 2 }
        );
      } else {
        setLocalPayments((prev) => prev.filter((p) => p.id !== id));
      }
    },
    [userId, setLocalPayments]
  );

  // ── Utilidades y estadísticas (cómputo puro) ──
  const {
    isPaidForMonth,
    getPaymentTransactionForMonth,
    getNextDueDate,
    getDaysUntilDue,
    getDaysOverdue,
    isOverdue,
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
    getDaysOverdue,
    isOverdue,
    getPaymentHistory,
    stats,
  };
}
