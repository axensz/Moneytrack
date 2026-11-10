/**
 * Hook para gestión de presupuestos mensuales por categoría
 * Soporta Firebase (usuario autenticado) y localStorage (modo invitado)
 *
 * FLUJO:
 * - Crear presupuesto: define límite mensual para una categoría
 * - Tracking: compara gastos del mes actual vs límite
 * - Alertas: calcula % de uso y estado (ok, warning, exceeded)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebaseDb';
import { useLocalStorage } from './useLocalStorage';
import { logger } from '../utils/logger';
import { generateId, roundMoney } from '../utils/formatters';
import { checkNetworkConnection, safeFirestoreOperation, stripUndefined } from '../utils/firestoreHelpers';
import type { Budget, Transaction } from '../types/finance';
import { SPECIAL_CATEGORIES } from '../config/constants';

export interface BudgetStatus {
  budget: Budget;
  spent: number;
  remaining: number;
  percentage: number;
  status: 'ok' | 'warning' | 'exceeded';
}

export function useBudgets(userId: string | null, transactions: Transaction[], externalBudgets?: Budget[]) {
  const [firestoreBudgets, setFirestoreBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [localBudgets, setLocalBudgets] = useLocalStorage<Budget[]>('budgets', []);
  const hasExternalBudgets = externalBudgets !== undefined;

  // Firestore subscription — skip if data provided externally (centralized)
  useEffect(() => {
    if (hasExternalBudgets) {
      setLoading(false);
      return;
    }
    if (!userId) {
      setFirestoreBudgets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const budgetsRef = collection(db, `users/${userId}/budgets`);
    const budgetsQuery = query(budgetsRef);

    const unsubscribe = onSnapshot(
      budgetsQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
          createdAt: docSnap.data().createdAt?.toDate() || new Date(),
        })) as Budget[];
        setFirestoreBudgets(data);
        setLoading(false);
      },
      (err) => {
        logger.error('Error en presupuestos', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, hasExternalBudgets]);

  const budgets = externalBudgets ?? (userId ? firestoreBudgets : localBudgets);

  // CRUD
  const addBudget = useCallback(async (budget: Omit<Budget, 'id' | 'createdAt'>) => {
    if (budgets.some(existing => existing.category === budget.category)) {
      throw new Error('Ya existe un presupuesto para esta categoría');
    }

    const cleanBudget = stripUndefined(budget);
    if (userId) {
      if (!checkNetworkConnection()) throw new Error('Sin conexión a internet');
      await safeFirestoreOperation(
        () => addDoc(collection(db, `users/${userId}/budgets`), {
          ...cleanBudget,
          createdAt: new Date(),
        }),
        'addBudget',
        { maxRetries: 2, retryRecoverableErrors: true }
      );
    } else {
      const newBudget: Budget = { ...budget, id: generateId(), createdAt: new Date() };
      setLocalBudgets(prev => [...prev, newBudget]);
    }
  }, [userId, budgets, setLocalBudgets]);

  const updateBudget = useCallback(async (id: string, updates: Partial<Budget>) => {
    if (userId) {
      if (!checkNetworkConnection()) throw new Error('Sin conexión a internet');
      const cleanUpdates = stripUndefined(updates);
      await safeFirestoreOperation(
        () => updateDoc(doc(db, `users/${userId}/budgets`, id), cleanUpdates),
        'updateBudget',
        { maxRetries: 2, retryRecoverableErrors: true }
      );
    } else {
      setLocalBudgets(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    }
  }, [userId, setLocalBudgets]);

  const deleteBudget = useCallback(async (id: string) => {
    if (userId) {
      if (!checkNetworkConnection()) throw new Error('Sin conexión a internet');
      await safeFirestoreOperation(
        () => deleteDoc(doc(db, `users/${userId}/budgets`, id)),
        'deleteBudget',
        { maxRetries: 2, retryRecoverableErrors: true }
      );
    } else {
      setLocalBudgets(prev => prev.filter(b => b.id !== id));
    }
  }, [userId, setLocalBudgets]);

  // Calculate budget status for current month
  const budgetStatuses = useMemo((): BudgetStatus[] => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Get expenses for current month (only paid, exclude special categories)
    const monthlyExpenses = transactions.filter(t => {
      const tDate = new Date(t.date);
      return (
        t.type === 'expense' &&
        t.paid &&
        tDate.getMonth() === currentMonth &&
        tDate.getFullYear() === currentYear &&
        !SPECIAL_CATEGORIES.adjustmentCategories.includes(t.category)
      );
    });

    return budgets
      .filter(b => b.isActive)
      .map(budget => {
        const spent = roundMoney(
          monthlyExpenses
            .filter(t => t.category === budget.category)
            .reduce((sum, t) => sum + t.amount, 0)
        );

        const remaining = Math.max(0, roundMoney(budget.monthlyLimit - spent));
        const percentage = budget.monthlyLimit > 0
          ? Math.round((spent / budget.monthlyLimit) * 100)
          : 0;

        let status: 'ok' | 'warning' | 'exceeded';
        if (percentage >= 100) {
          status = 'exceeded';
        } else if (percentage >= 80) {
          status = 'warning';
        } else {
          status = 'ok';
        }

        return { budget, spent, remaining, percentage, status };
      })
      .sort((a, b) => b.percentage - a.percentage); // Most used first
  }, [budgets, transactions]);

  // Overall stats
  const stats = useMemo(() => {
    const active = budgetStatuses.length;
    const exceeded = budgetStatuses.filter(s => s.status === 'exceeded').length;
    const warning = budgetStatuses.filter(s => s.status === 'warning').length;
    const totalBudgeted = budgetStatuses.reduce((sum, s) => sum + s.budget.monthlyLimit, 0);
    const totalSpent = budgetStatuses.reduce((sum, s) => sum + s.spent, 0);

    return { active, exceeded, warning, totalBudgeted, totalSpent };
  }, [budgetStatuses]);

  return {
    budgets,
    loading,
    addBudget,
    updateBudget,
    deleteBudget,
    budgetStatuses,
    stats,
  };
}
