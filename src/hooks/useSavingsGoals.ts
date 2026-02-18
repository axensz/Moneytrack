/**
 * Hook para gestión de metas de ahorro
 * Soporta Firebase (usuario autenticado) y localStorage (modo invitado)
 *
 * FLUJO:
 * - Crear meta: nombre, monto objetivo, fecha límite opcional
 * - Agregar ahorro: incrementa currentAmount manualmente
 * - Completar: cuando currentAmount >= targetAmount → isCompleted = true
 * - Tracking: progreso %, monto mensual sugerido para alcanzar la meta
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useLocalStorage } from './useLocalStorage';
import { logger } from '../utils/logger';
import type { SavingsGoal } from '../types/finance';

const generateId = () => Date.now().toString() + Math.random().toString(36).substring(2, 11);

export interface GoalStatus {
  goal: SavingsGoal;
  percentage: number;
  remaining: number;
  suggestedMonthly: number | null; // null if no targetDate
  daysRemaining: number | null;
  isOverdue: boolean;
}

export function useSavingsGoals(userId: string | null) {
  const [firestoreGoals, setFirestoreGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [localGoals, setLocalGoals] = useLocalStorage<SavingsGoal[]>('savingsGoals', []);

  // Firestore subscription
  useEffect(() => {
    if (!userId) {
      setFirestoreGoals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const goalsRef = collection(db, `users/${userId}/savingsGoals`);
    const goalsQuery = query(goalsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      goalsQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
          targetDate: docSnap.data().targetDate?.toDate() || null,
          createdAt: docSnap.data().createdAt?.toDate() || new Date(),
          completedAt: docSnap.data().completedAt?.toDate() || null,
        })) as SavingsGoal[];
        setFirestoreGoals(data);
        setLoading(false);
      },
      (err) => {
        logger.error('Error en metas de ahorro', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  const goals = userId ? firestoreGoals : localGoals;

  // CRUD
  const addGoal = useCallback(async (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => {
    // Limpiar campos undefined antes de enviar a Firestore
    const cleanGoal = Object.fromEntries(
      Object.entries(goal).filter(([, v]) => v !== undefined)
    );

    if (userId) {
      await addDoc(collection(db, `users/${userId}/savingsGoals`), {
        ...cleanGoal,
        createdAt: new Date(),
      });
    } else {
      const newGoal: SavingsGoal = { ...goal, id: generateId(), createdAt: new Date() };
      setLocalGoals(prev => [newGoal, ...prev]);
    }
  }, [userId, setLocalGoals]);

  const updateGoal = useCallback(async (id: string, updates: Partial<SavingsGoal>) => {
    if (userId) {
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined)
      );
      await updateDoc(doc(db, `users/${userId}/savingsGoals`, id), cleanUpdates);
    } else {
      setLocalGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
    }
  }, [userId, setLocalGoals]);

  const deleteGoal = useCallback(async (id: string) => {
    if (userId) {
      await deleteDoc(doc(db, `users/${userId}/savingsGoals`, id));
    } else {
      setLocalGoals(prev => prev.filter(g => g.id !== id));
    }
  }, [userId, setLocalGoals]);

  // Add savings to a goal
  const addSavings = useCallback(async (goalId: string, amount: number) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    const newCurrent = goal.currentAmount + amount;
    const isCompleted = newCurrent >= goal.targetAmount;

    await updateGoal(goalId, {
      currentAmount: newCurrent,
      isCompleted,
      ...(isCompleted ? { completedAt: new Date() } : {}),
    });
  }, [goals, updateGoal]);

  // Calculate goal statuses
  const goalStatuses = useMemo((): GoalStatus[] => {
    const now = new Date();

    return goals.map(goal => {
      const percentage = goal.targetAmount > 0
        ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
        : 0;
      const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);

      let suggestedMonthly: number | null = null;
      let daysRemaining: number | null = null;
      let isOverdue = false;

      if (goal.targetDate && !goal.isCompleted) {
        const targetDate = new Date(goal.targetDate);
        const diffMs = targetDate.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        isOverdue = daysRemaining < 0;

        if (daysRemaining > 0 && remaining > 0) {
          const monthsRemaining = Math.max(1, Math.ceil(daysRemaining / 30));
          suggestedMonthly = Math.ceil(remaining / monthsRemaining);
        }
      }

      return { goal, percentage, remaining, suggestedMonthly, daysRemaining, isOverdue };
    });
  }, [goals]);

  // Stats
  const stats = useMemo(() => {
    const active = goals.filter(g => !g.isCompleted);
    const completed = goals.filter(g => g.isCompleted);
    const totalTarget = active.reduce((sum, g) => sum + g.targetAmount, 0);
    const totalSaved = active.reduce((sum, g) => sum + g.currentAmount, 0);

    return {
      activeCount: active.length,
      completedCount: completed.length,
      totalTarget,
      totalSaved,
      overallPercentage: totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0,
    };
  }, [goals]);

  return {
    goals,
    loading,
    addGoal,
    updateGoal,
    deleteGoal,
    addSavings,
    goalStatuses,
    stats,
  };
}
