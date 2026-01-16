/**
 * 🟡 HOOK REFACTORIZADO: useTransactions
 *
 * CAMBIOS:
 * ❌ Eliminada lógica duplicada de cálculo de estadísticas (líneas 15-42)
 * ✅ Ahora solo maneja operaciones CRUD de transacciones (responsabilidad única)
 * ✅ Las estadísticas se calculan en useGlobalStats (DRY)
 * ✅ Usa localStorage para usuarios no autenticados
 *
 * RESPONSABILIDAD: Gestión de transacciones (CRUD + operaciones)
 */

import { useFirestore } from './useFirestore';
import { useLocalStorage } from './useLocalStorage';
import type { Transaction } from '../types/finance';

export function useTransactions(userId: string | null) {
  const {
    transactions: firestoreTransactions,
    loading: firestoreLoading,
    addTransaction: firestoreAddTransaction,
    deleteTransaction: firestoreDeleteTransaction,
    updateTransaction: firestoreUpdateTransaction
  } = useFirestore(userId);

  const [localTransactions, setLocalTransactions] = useLocalStorage<Transaction[]>('transactions', []);

  // Usar Firebase si hay usuario, localStorage si no
  // Firestore ya viene ordenado por fecha DESC, solo ordenamos localStorage
  const transactions = userId 
    ? firestoreTransactions 
    : [...localTransactions].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      });

  const loading = userId ? firestoreLoading : false;

  // Generar ID único para localStorage
  const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

  const addTransaction = async (transaction: Omit<Transaction, 'id' | 'createdAt'>) => {
    if (userId) {
      await firestoreAddTransaction(transaction);
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
      await firestoreDeleteTransaction(id);
    } else {
      setLocalTransactions(prev => prev.filter(t => t.id !== id));
    }
  };

  const togglePaid = async (id: string) => {
    const transaction = transactions.find(t => t.id === id);
    if (transaction) {
      if (userId) {
        await firestoreUpdateTransaction(id, { paid: !transaction.paid });
      } else {
        setLocalTransactions(prev =>
          prev.map(t => t.id === id ? { ...t, paid: !t.paid } : t)
        );
      }
    }
  };

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    if (userId) {
      await firestoreUpdateTransaction(id, updates);
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
    deleteTransaction,
    togglePaid,
    updateTransaction
  };
}