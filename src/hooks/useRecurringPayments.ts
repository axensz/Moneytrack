/**
 * 🔄 HOOK: useRecurringPayments
 *
 * Gestiona pagos periódicos (suscripciones, servicios recurrentes)
 * - CRUD de pagos periódicos
 * - Detección de estado de pago mensual
 * - Cálculo de próximo vencimiento
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { RecurringPayment, Transaction } from '../types/finance';
import { useLocalStorage } from './useLocalStorage';

export function useRecurringPayments(userId: string | null, transactions: Transaction[]) {
  const [firestorePayments, setFirestorePayments] = useState<RecurringPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [localPayments, setLocalPayments] = useLocalStorage<RecurringPayment[]>('recurringPayments', []);

  // Escuchar pagos periódicos de Firestore
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const paymentsRef = collection(db, `users/${userId}/recurringPayments`);
    const paymentsQuery = query(paymentsRef, orderBy('dueDay', 'asc'));

    const unsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
      const paymentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        lastPaidDate: doc.data().lastPaidDate?.toDate() || null,
        createdAt: doc.data().createdAt?.toDate() || new Date()
      })) as RecurringPayment[];
      setFirestorePayments(paymentsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  // Usar Firebase si hay usuario, localStorage si no
  const recurringPayments = userId ? firestorePayments : localPayments;

  // Generar ID único para localStorage
  const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

  // CRUD Operations
  const addRecurringPayment = async (payment: Omit<RecurringPayment, 'id' | 'createdAt'>) => {
    if (userId) {
      await addDoc(collection(db, `users/${userId}/recurringPayments`), {
        ...payment,
        createdAt: new Date()
      });
    } else {
      const newPayment: RecurringPayment = {
        ...payment,
        id: generateId(),
        createdAt: new Date()
      };
      setLocalPayments(prev => [...prev, newPayment]);
    }
  };

  const updateRecurringPayment = async (id: string, updates: Partial<RecurringPayment>) => {
    if (userId) {
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, value]) => value !== undefined)
      );
      await updateDoc(doc(db, `users/${userId}/recurringPayments`, id), cleanUpdates);
    } else {
      setLocalPayments(prev =>
        prev.map(p => p.id === id ? { ...p, ...updates } : p)
      );
    }
  };

  const deleteRecurringPayment = async (id: string) => {
    if (userId) {
      await deleteDoc(doc(db, `users/${userId}/recurringPayments`, id));
    } else {
      setLocalPayments(prev => prev.filter(p => p.id !== id));
    }
  };

  /**
   * 🔍 Verificar si un pago periódico está pagado para un mes específico
   */
  const isPaidForMonth = useCallback((paymentId: string, month: Date = new Date()): boolean => {
    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);

    return transactions.some(t => 
      t.recurringPaymentId === paymentId &&
      new Date(t.date) >= startOfMonth &&
      new Date(t.date) <= endOfMonth
    );
  }, [transactions]);

  /**
   * 🔍 Obtener la transacción asociada a un pago para un mes
   */
  const getPaymentTransactionForMonth = useCallback((paymentId: string, month: Date = new Date()): Transaction | undefined => {
    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);

    return transactions.find(t => 
      t.recurringPaymentId === paymentId &&
      new Date(t.date) >= startOfMonth &&
      new Date(t.date) <= endOfMonth
    );
  }, [transactions]);

  /**
   * 📅 Calcular próxima fecha de vencimiento
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
   * ⏰ Calcular días hasta el vencimiento
   */
  const getDaysUntilDue = useCallback((payment: RecurringPayment): number => {
    const dueDate = getNextDueDate(payment);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = dueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }, [getNextDueDate]);

  /**
   * 📊 Estadísticas de pagos periódicos
   */
  const stats = useMemo(() => {
    const activePayments = recurringPayments.filter(p => p.isActive);
    const now = new Date();

    const paidThisMonth = activePayments.filter(p => isPaidForMonth(p.id!, now)).length;
    const pendingThisMonth = activePayments.length - paidThisMonth;
    
    const totalMonthlyAmount = activePayments
      .filter(p => p.frequency === 'monthly')
      .reduce((sum, p) => sum + p.amount, 0);

    const totalYearlyAmount = activePayments
      .filter(p => p.frequency === 'yearly')
      .reduce((sum, p) => sum + p.amount, 0);

    // Pagos próximos a vencer (en los próximos 7 días)
    const upcomingPayments = activePayments.filter(p => {
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
      upcomingPayments
    };
  }, [recurringPayments, isPaidForMonth, getDaysUntilDue]);

  /**
   * 🔄 Obtener historial de pagos para un pago periódico
   */
  const getPaymentHistory = useCallback((paymentId: string, limit: number = 12): Transaction[] => {
    return transactions
      .filter(t => t.recurringPaymentId === paymentId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  }, [transactions]);

  return {
    recurringPayments,
    loading,
    addRecurringPayment,
    updateRecurringPayment,
    deleteRecurringPayment,
    isPaidForMonth,
    getPaymentTransactionForMonth,
    getNextDueDate,
    getDaysUntilDue,
    getPaymentHistory,
    stats
  };
}
