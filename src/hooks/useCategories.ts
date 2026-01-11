import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import type { Categories, Transaction } from '../types/finance';

const defaultCategories: Categories = {
  expense: ['Alimentación', 'Transporte', 'Servicios', 'Vivienda', 'Salud', 'Entretenimiento', 'Educación', 'Otros'],
  income: ['Salario', 'Freelance', 'Inversiones', 'Otros']
};

export function useCategories(transactions: Transaction[]) {
  const [categories, setCategories] = useLocalStorage<Categories>('financeCategories', defaultCategories);

  const addCategory = useCallback((type: 'expense' | 'income', name: string) => {
    const trimmedName = name.trim();
    
    if (!trimmedName) {
      throw new Error('El nombre de la categoría no puede estar vacío');
    }
    
    if (categories[type].includes(trimmedName)) {
      throw new Error('Esta categoría ya existe');
    }

    setCategories(prev => ({
      ...prev,
      [type]: [...prev[type], trimmedName]
    }));
  }, [categories, setCategories]);

  const deleteCategory = useCallback((type: 'expense' | 'income', category: string) => {
    if (transactions.some(t => t.category === category)) {
      throw new Error('No puedes eliminar una categoría con transacciones');
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