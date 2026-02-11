/**
 * Hook para gestión de categorías
 * 
 * Usa Firebase cuando hay usuario autenticado, localStorage en modo guest.
 * Convierte entre formato plano (Category[]) de Firebase y formato
 * agrupado (Categories) para compatibilidad con la UI.
 */

import { useCallback, useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { useFirestoreData } from '../contexts/FirestoreContext';
import { DEFAULT_CATEGORIES, ERROR_MESSAGES } from '../config/constants';
import type { Categories, Transaction, Category } from '../types/finance';

export function useCategories(transactions: Transaction[], userId?: string | null) {
  // Firebase categories (array plano de Category)
  const { 
    categories: firestoreCategories,
    addCategory: firestoreAddCategory,
    deleteCategory: firestoreDeleteCategory
  } = useFirestoreData();

  // LocalStorage categories (formato agrupado)
  const [localCategories, setLocalCategories] = useLocalStorage<Categories>('financeCategories', {
    expense: [...DEFAULT_CATEGORIES.expense],
    income: [...DEFAULT_CATEGORIES.income]
  });

  // Convertir Firebase (Category[]) a formato UI (Categories)
  // Siempre incluye las categorías por defecto + las creadas por el usuario en Firestore
  const categories = useMemo((): Categories => {
    if (userId) {
      const firestoreExpense = firestoreCategories
        .filter(c => c.type === 'expense')
        .map(c => c.name);
      const firestoreIncome = firestoreCategories
        .filter(c => c.type === 'income')
        .map(c => c.name);

      // Merge: defaults + custom (sin duplicados)
      const expense: string[] = [...DEFAULT_CATEGORIES.expense];
      firestoreExpense.forEach(name => {
        if (!expense.includes(name)) expense.push(name);
      });

      const income: string[] = [...DEFAULT_CATEGORIES.income];
      firestoreIncome.forEach(name => {
        if (!income.includes(name)) income.push(name);
      });

      return { expense, income };
    }

    return localCategories;
  }, [userId, firestoreCategories, localCategories]);

  const addCategory = useCallback(async (type: 'expense' | 'income', name: string) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      throw new Error(ERROR_MESSAGES.EMPTY_CATEGORY_NAME);
    }

    if (categories[type].includes(trimmedName)) {
      throw new Error(ERROR_MESSAGES.DUPLICATE_CATEGORY);
    }

    if (userId) {
      await firestoreAddCategory({ type, name: trimmedName });
    } else {
      setLocalCategories(prev => ({
        ...prev,
        [type]: [...prev[type], trimmedName]
      }));
    }
  }, [userId, categories, firestoreAddCategory, setLocalCategories]);

  const deleteCategory = useCallback(async (type: 'expense' | 'income', category: string) => {
    if (transactions.some(t => t.category === category)) {
      throw new Error(ERROR_MESSAGES.DELETE_CATEGORY_WITH_TRANSACTIONS);
    }

    if (userId) {
      // Encontrar el ID de la categoría en Firestore
      const categoryToDelete = firestoreCategories.find(
        c => c.type === type && c.name === category
      );
      if (categoryToDelete?.id) {
        await firestoreDeleteCategory(categoryToDelete.id);
      }
    } else {
      setLocalCategories(prev => ({
        ...prev,
        [type]: prev[type].filter(c => c !== category)
      }));
    }
  }, [userId, transactions, firestoreCategories, firestoreDeleteCategory, setLocalCategories]);

  return {
    categories,
    addCategory,
    deleteCategory
  };
}