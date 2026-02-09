/**
 * Hook para operaciones CRUD de pagos periódicos
 * Soporta Firebase (usuario autenticado) y localStorage (modo invitado)
 */

import { useCallback } from 'react';
import { collection, doc, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { RecurringPayment } from '../../types/finance';

interface UseRecurringCRUDReturn {
  addRecurringPayment: (
    payment: Omit<RecurringPayment, 'id' | 'createdAt'>
  ) => Promise<void>;
  updateRecurringPayment: (
    id: string,
    updates: Partial<RecurringPayment>
  ) => Promise<void>;
  deleteRecurringPayment: (id: string) => Promise<void>;
}

/**
 * Genera un ID único para localStorage
 */
const generateId = () =>
  Date.now().toString() + Math.random().toString(36).substring(2, 11);

export function useRecurringCRUD(
  userId: string | null,
  setLocalPayments: (
    updater: (prev: RecurringPayment[]) => RecurringPayment[]
  ) => void
): UseRecurringCRUDReturn {
  const addRecurringPayment = useCallback(
    async (payment: Omit<RecurringPayment, 'id' | 'createdAt'>) => {
      if (userId) {
        await addDoc(collection(db, `users/${userId}/recurringPayments`), {
          ...payment,
          createdAt: new Date(),
        });
      } else {
        const newPayment: RecurringPayment = {
          ...payment,
          id: generateId(),
          createdAt: new Date(),
        };
        setLocalPayments((prev) => [...prev, newPayment]);
      }
    },
    [userId, setLocalPayments]
  );

  const updateRecurringPayment = useCallback(
    async (id: string, updates: Partial<RecurringPayment>) => {
      if (userId) {
        const cleanUpdates = Object.fromEntries(
          Object.entries(updates).filter(([, value]) => value !== undefined)
        );
        await updateDoc(
          doc(db, `users/${userId}/recurringPayments`, id),
          cleanUpdates
        );
      } else {
        setLocalPayments((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
        );
      }
    },
    [userId, setLocalPayments]
  );

  const deleteRecurringPayment = useCallback(
    async (id: string) => {
      if (userId) {
        await deleteDoc(doc(db, `users/${userId}/recurringPayments`, id));
      } else {
        setLocalPayments((prev) => prev.filter((p) => p.id !== id));
      }
    },
    [userId, setLocalPayments]
  );

  return {
    addRecurringPayment,
    updateRecurringPayment,
    deleteRecurringPayment,
  };
}
