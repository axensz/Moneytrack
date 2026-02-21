/**
 * Hook para gestión de préstamos/deudas
 * Soporta Firebase (usuario autenticado) y localStorage (modo invitado)
 *
 * FLUJO:
 * - Prestar dinero → crea Debt tipo 'lent' + gasto en la cuenta
 * - Recibir pago → registra ingreso + reduce remainingAmount
 * - Pago completo → isSettled = true
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useLocalStorage } from './useLocalStorage';
import { logger } from '../utils/logger';
import { safeFirestoreOperation, checkNetworkConnection } from '../utils/firestoreHelpers';
import type { Debt, Transaction } from '../types/finance';

const generateId = () => Date.now().toString() + Math.random().toString(36).substring(2, 11);

export function useDebts(userId: string | null, transactions: Transaction[]) {
  // Firestore state
  const [firestoreDebts, setFirestoreDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);

  // LocalStorage for guest mode
  const [localDebts, setLocalDebts] = useLocalStorage<Debt[]>('debts', []);

  // Firestore subscription
  useEffect(() => {
    if (!userId) {
      setFirestoreDebts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const debtsRef = collection(db, `users/${userId}/debts`);
    const debtsQuery = query(debtsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      debtsQuery,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          settledAt: doc.data().settledAt?.toDate() || null,
        })) as Debt[];
        setFirestoreDebts(data);
        setLoading(false);
      },
      (err) => {
        logger.error('Error en deudas', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  const debts = userId ? firestoreDebts : localDebts;

  // CRUD Operations
  const addDebt = useCallback(async (debt: Omit<Debt, 'id' | 'createdAt'>) => {
    // Limpiar campos undefined antes de enviar a Firestore
    const cleanDebt = Object.fromEntries(
      Object.entries(debt).filter(([, v]) => v !== undefined)
    );

    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      await safeFirestoreOperation(
        () => addDoc(collection(db, `users/${userId}/debts`), {
          ...cleanDebt,
          createdAt: new Date(),
        }),
        'addDebt',
        { maxRetries: 2 }
      );
    } else {
      const newDebt: Debt = { ...debt, id: generateId(), createdAt: new Date() };
      setLocalDebts(prev => [newDebt, ...prev]);
    }
  }, [userId, setLocalDebts]);

  const updateDebt = useCallback(async (id: string, updates: Partial<Debt>) => {
    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined)
      );

      await safeFirestoreOperation(
        () => updateDoc(doc(db, `users/${userId}/debts`, id), cleanUpdates),
        'updateDebt',
        { maxRetries: 2 }
      );
    } else {
      setLocalDebts(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    }
  }, [userId, setLocalDebts]);

  const deleteDebt = useCallback(async (id: string) => {
    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      await safeFirestoreOperation(
        () => deleteDoc(doc(db, `users/${userId}/debts`, id)),
        'deleteDebt',
        { maxRetries: 2 }
      );
    } else {
      setLocalDebts(prev => prev.filter(d => d.id !== id));
    }
  }, [userId, setLocalDebts]);

  // Register a payment against a debt
  const registerDebtPayment = useCallback(async (debtId: string, amount: number) => {
    const debt = debts.find(d => d.id === debtId);
    if (!debt) return;

    const newRemaining = Math.max(0, debt.remainingAmount - amount);
    const isSettled = newRemaining === 0;

    await updateDebt(debtId, {
      remainingAmount: newRemaining,
      isSettled,
      ...(isSettled ? { settledAt: new Date() } : {}),
    });
  }, [debts, updateDebt]);

  // Modify debt balance (add or subtract from original amount)
  const modifyDebtBalance = useCallback(async (
    debtId: string,
    amount: number,
    operation: 'add' | 'subtract'
  ) => {
    const debt = debts.find(d => d.id === debtId);
    if (!debt) {
      throw new Error('Préstamo no encontrado');
    }

    if (debt.isSettled) {
      throw new Error('No puedes modificar un préstamo ya saldado');
    }

    let newOriginalAmount: number;
    let newRemainingAmount: number;

    if (operation === 'add') {
      newOriginalAmount = debt.originalAmount + amount;
      newRemainingAmount = debt.remainingAmount + amount;
    } else {
      // Subtract
      if (amount > debt.remainingAmount) {
        throw new Error('No puedes restar más del saldo pendiente');
      }
      newOriginalAmount = debt.originalAmount - amount;
      newRemainingAmount = debt.remainingAmount - amount;
    }

    // Check if debt becomes settled
    const isSettled = newRemainingAmount === 0;

    await updateDebt(debtId, {
      originalAmount: newOriginalAmount,
      remainingAmount: newRemainingAmount,
      isSettled,
      ...(isSettled ? { settledAt: new Date() } : {}),
    });
  }, [debts, updateDebt]);

  // Get transactions linked to a specific debt
  const getDebtTransactions = useCallback((debtId: string): Transaction[] => {
    return transactions.filter(t => t.debtId === debtId);
  }, [transactions]);

  // Stats
  const stats = useMemo(() => {
    const activeDebts = debts.filter(d => !d.isSettled);
    const lent = activeDebts.filter(d => d.type === 'lent');
    const borrowed = activeDebts.filter(d => d.type === 'borrowed');

    return {
      totalLent: lent.reduce((sum, d) => sum + d.remainingAmount, 0),
      totalBorrowed: borrowed.reduce((sum, d) => sum + d.remainingAmount, 0),
      activeLentCount: lent.length,
      activeBorrowedCount: borrowed.length,
      settledCount: debts.filter(d => d.isSettled).length,
      totalCount: debts.length,
    };
  }, [debts]);

  return {
    debts,
    loading,
    addDebt,
    updateDebt,
    deleteDebt,
    registerDebtPayment,
    modifyDebtBalance,
    getDebtTransactions,
    stats,
  };
}
