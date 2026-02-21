/**
 * 🟡 HOOK REFACTORIZADO: useTransactions
 *
 * CAMBIOS:
 * ❌ Eliminada lógica duplicada de cálculo de estadísticas (líneas 15-42)
 * ✅ Ahora solo maneja operaciones CRUD de transacciones (responsabilidad única)
 * ✅ Las estadísticas se calculan en useGlobalStats (DRY)
 * ✅ Usa localStorage para usuarios no autenticados
 * ✅ Integrado soporte para cola offline (PWA)
 *
 * RESPONSABILIDAD: Gestión de transacciones (CRUD + operaciones)
 */

import { useMemo } from 'react';
import { useFirestoreData } from '../contexts/FirestoreContext';
import { useLocalStorage } from './useLocalStorage';
import { useOfflineQueue } from './useOfflineQueue';
import { withOfflineSupport } from '../lib/offlineFirestore';
import type { Transaction } from '../types/finance';

// Generar ID único para localStorage (hoisted fuera del hook)
const generateId = () => Date.now().toString() + Math.random().toString(36).substring(2, 11);

export function useTransactions(userId: string | null) {
  const {
    transactions: firestoreTransactions,
    loading: firestoreLoading,
    addTransaction: firestoreAddTransaction,
    addCreditPaymentAtomic: firestoreAddCreditPaymentAtomic,
    deleteTransaction: firestoreDeleteTransaction,
    updateTransaction: firestoreUpdateTransaction
  } = useFirestoreData();

  const [localTransactions, setLocalTransactions] = useLocalStorage<Transaction[]>('transactions', []);
  const offlineQueue = useOfflineQueue();

  // Usar Firebase si hay usuario, localStorage si no
  // Firestore ya viene ordenado por fecha DESC, solo ordenamos localStorage
  const transactions = useMemo(() => {
    if (userId) return firestoreTransactions;
    return [...localTransactions].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });
  }, [userId, firestoreTransactions, localTransactions]);

  const loading = userId ? firestoreLoading : false;

  const addTransaction = async (transaction: Omit<Transaction, 'id' | 'createdAt'>) => {
    if (userId) {
      await withOfflineSupport(
        () => firestoreAddTransaction(transaction),
        {
          type: 'create',
          collection: 'transactions',
          data: transaction
        },
        offlineQueue
      );
    } else {
      const newTransaction: Transaction = {
        ...transaction,
        id: generateId(),
        createdAt: new Date()
      };
      setLocalTransactions(prev => [newTransaction, ...prev]);
    }
  };

  const deleteTransaction = async (id: string) => {
    if (userId) {
      await withOfflineSupport(
        () => firestoreDeleteTransaction(id),
        {
          type: 'delete',
          collection: 'transactions',
          data: { id }
        },
        offlineQueue
      );
    } else {
      setLocalTransactions(prev => prev.filter(t => t.id !== id));
    }
  };

  const togglePaid = async (id: string) => {
    const transaction = transactions.find(t => t.id === id);
    if (transaction) {
      if (userId) {
        await withOfflineSupport(
          () => firestoreUpdateTransaction(id, { paid: !transaction.paid }),
          {
            type: 'update',
            collection: 'transactions',
            data: { id, paid: !transaction.paid }
          },
          offlineQueue
        );
      } else {
        setLocalTransactions(prev =>
          prev.map(t => t.id === id ? { ...t, paid: !t.paid } : t)
        );
      }
    }
  };

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    if (userId) {
      await withOfflineSupport(
        () => firestoreUpdateTransaction(id, updates),
        {
          type: 'update',
          collection: 'transactions',
          data: { id, ...updates }
        },
        offlineQueue
      );
    } else {
      setLocalTransactions(prev =>
        prev.map(t => t.id === id ? { ...t, ...updates } : t)
      );
    }
  };

  return {
    transactions,
    loading,
    addTransaction,
    addCreditPaymentAtomic: firestoreAddCreditPaymentAtomic,
    deleteTransaction,
    togglePaid,
    updateTransaction
  };
}