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
import { DEFAULT_CATEGORIES, ERROR_MESSAGES, SPECIAL_CATEGORIES, TRANSFER_CATEGORY } from '../config/constants';
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
  // + las que existen en transacciones pero no están registradas formalmente
  const categories = useMemo((): Categories => {
    // Categorías especiales que no deben aparecer en el modal
    const excludedCategories = new Set<string>([
      TRANSFER_CATEGORY,
      ...SPECIAL_CATEGORIES.adjustmentCategories,
    ]);

    // Extraer categorías de transacciones existentes
    const transactionExpenseCategories = new Set<string>();
    const transactionIncomeCategories = new Set<string>();
    transactions.forEach(t => {
      if (excludedCategories.has(t.category)) return;
      if (t.type === 'expense') transactionExpenseCategories.add(t.category);
      else if (t.type === 'income') transactionIncomeCategories.add(t.category);
    });

    if (userId) {
      const firestoreExpense = firestoreCategories
        .filter(c => c.type === 'expense')
        .map(c => c.name);
      const firestoreIncome = firestoreCategories
        .filter(c => c.type === 'income')
        .map(c => c.name);

      // Merge: defaults + firestore + transacciones (sin duplicados)
      const expense: string[] = [...DEFAULT_CATEGORIES.expense];
      firestoreExpense.forEach(name => {
        if (!expense.includes(name)) expense.push(name);
      });
      transactionExpenseCategories.forEach(name => {
        if (!expense.includes(name)) expense.push(name);
      });

      const income: string[] = [...DEFAULT_CATEGORIES.income];
      firestoreIncome.forEach(name => {
        if (!income.includes(name)) income.push(name);
      });
      transactionIncomeCategories.forEach(name => {
        if (!income.includes(name)) income.push(name);
      });

      return { expense, income };
    }

    // Modo local: también incluir categorías de transacciones
    const expense = [...localCategories.expense];
    transactionExpenseCategories.forEach(name => {
      if (!expense.includes(name)) expense.push(name);
    });
    const income = [...localCategories.income];
    transactionIncomeCategories.forEach(name => {
      if (!income.includes(name)) income.push(name);
    });

    return { expense, income };
  }, [userId, firestoreCategories, localCategories, transactions]);

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