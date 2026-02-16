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
import { db } from '../lib/firebase';
import { useLocalStorage } from './useLocalStorage';
import { logger } from '../utils/logger';
import type { Budget, Transaction } from '../types/finance';
import { SPECIAL_CATEGORIES } from '../config/constants';

const generateId = () => Date.now().toString() + Math.random().toString(36).substring(2, 11);

export interface BudgetStatus {
  budget: Budget;
  spent: number;
  remaining: number;
  percentage: number;
  status: 'ok' | 'warning' | 'exceeded';
}

export function useBudgets(userId: string | null, transactions: Transaction[]) {
  const [firestoreBudgets, setFirestoreBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [localBudgets, setLocalBudgets] = useLocalStorage<Budget[]>('budgets', []);

  // Firestore subscription
  useEffect(() => {
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
  }, [userId]);

  const budgets = userId ? firestoreBudgets : localBudgets;

  // CRUD
  const addBudget = useCallback(async (budget: Omit<Budget, 'id' | 'createdAt'>) => {
    if (userId) {
      await addDoc(collection(db, `users/${userId}/budgets`), {
        ...budget,
        createdAt: new Date(),
      });
    } else {
      const newBudget: Budget = { ...budget, id: generateId(), createdAt: new Date() };
      setLocalBudgets(prev => [...prev, newBudget]);
    }
  }, [userId, setLocalBudgets]);

  const updateBudget = useCallback(async (id: string, updates: Partial<Budget>) => {
    if (userId) {
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined)
      );
      await updateDoc(doc(db, `users/${userId}/budgets`, id), cleanUpdates);
    } else {
      setLocalBudgets(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    }
  }, [userId, setLocalBudgets]);

  const deleteBudget = useCallback(async (id: string) => {
    if (userId) {
      await deleteDoc(doc(db, `users/${userId}/budgets`, id));
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
        const spent = monthlyExpenses
          .filter(t => t.category === budget.category)
          .reduce((sum, t) => sum + t.amount, 0);

        const remaining = Math.max(0, budget.monthlyLimit - spent);
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
