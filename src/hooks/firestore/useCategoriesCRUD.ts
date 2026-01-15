/**
 * Hook para operaciones CRUD de categorías
 */

import { useCallback } from 'react';
import { collection, doc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Category } from '../../types/finance';

interface UseCategoriesCRUDReturn {
  addCategory: (category: Omit<Category, 'id'>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
}

/**
 * Hook para CRUD de categorías
 */
export function useCategoriesCRUD(
  userId: string | null
): UseCategoriesCRUDReturn {
  const addCategory = useCallback(
    async (category: Omit<Category, 'id'>) => {
      if (!userId) return;
      await addDoc(collection(db, `users/${userId}/categories`), category);
    },
    [userId]
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      if (!userId) return;
      await deleteDoc(doc(db, `users/${userId}/categories`, id));
    },
    [userId]
  );

  return {
    addCategory,
    deleteCategory,
  };
}
