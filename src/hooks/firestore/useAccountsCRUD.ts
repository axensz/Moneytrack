/**
 * Hook para operaciones CRUD de cuentas
 */

import { useCallback } from 'react';
import { collection, doc, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Account } from '../../types/finance';

interface UseAccountsCRUDReturn {
  addAccount: (account: Omit<Account, 'id'>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
}

/**
 * Hook para CRUD de cuentas
 */
export function useAccountsCRUD(userId: string | null): UseAccountsCRUDReturn {
  const addAccount = useCallback(
    async (account: Omit<Account, 'id'>) => {
      if (!userId) return;

      // Forzar initialBalance = 0 para tarjetas de crédito
      const accountData = { ...account };
      if (accountData.type === 'credit') {
        accountData.initialBalance = 0;
      }

      const cleanAccount = Object.fromEntries(
        Object.entries(accountData).filter(([, value]) => value !== undefined)
      );
      await addDoc(collection(db, `users/${userId}/accounts`), {
        ...cleanAccount,
        createdAt: new Date(),
      });
    },
    [userId]
  );

  const deleteAccount = useCallback(
    async (id: string) => {
      if (!userId) return;
      await deleteDoc(doc(db, `users/${userId}/accounts`, id));
    },
    [userId]
  );

  const updateAccount = useCallback(
    async (id: string, updates: Partial<Account>) => {
      if (!userId) return;

      // Prevenir que se cambie initialBalance de tarjetas de crédito
      const updatesData = { ...updates };
      if (updatesData.type === 'credit') {
        updatesData.initialBalance = 0;
      }

      const cleanUpdates = Object.fromEntries(
        Object.entries(updatesData).filter(([, value]) => value !== undefined)
      );
      await updateDoc(doc(db, `users/${userId}/accounts`, id), cleanUpdates);
    },
    [userId]
  );

  return {
    addAccount,
    deleteAccount,
    updateAccount,
  };
}
