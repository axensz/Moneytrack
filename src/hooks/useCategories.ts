import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { DEFAULT_CATEGORIES, ERROR_MESSAGES } from '../config/constants';
import type { Categories, Transaction } from '../types/finance';

export function useCategories(transactions: Transaction[]) {
  const [categories, setCategories] = useLocalStorage<Categories>('financeCategories', {
    expense: [...DEFAULT_CATEGORIES.expense],
    income: [...DEFAULT_CATEGORIES.income]
  });

  const addCategory = useCallback((type: 'expense' | 'income', name: string) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      throw new Error(ERROR_MESSAGES.EMPTY_CATEGORY_NAME);
    }

    if (categories[type].includes(trimmedName)) {
      throw new Error(ERROR_MESSAGES.DUPLICATE_CATEGORY);
    }

    setCategories(prev => ({
      ...prev,
      [type]: [...prev[type], trimmedName]
    }));
  }, [categories, setCategories]);

  const deleteCategory = useCallback((type: 'expense' | 'income', category: string) => {
    if (transactions.some(t => t.category === category)) {
      throw new Error(ERROR_MESSAGES.DELETE_CATEGORY_WITH_TRANSACTIONS);
    }

    setCategories(prev => ({
      ...prev,
      [type]: prev[type].filter(c => c !== category)
    }));
  }, [transactions, setCategories]);

  return {
    categories,
    addCategory,
    deleteCategory
  };
}