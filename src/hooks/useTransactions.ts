/**
 * 🟡 HOOK REFACTORIZADO: useTransactions
 *
 * CAMBIOS:
 * ❌ Eliminada lógica duplicada de cálculo de estadísticas (líneas 15-42)
 * ✅ Ahora solo maneja operaciones CRUD de transacciones (responsabilidad única)
 * ✅ Las estadísticas se calculan en useGlobalStats (DRY)
 * ✅ Usa localStorage para usuarios no autenticados
 * ✅ Offline gestionado nativamente por Firestore (persistentLocalCache): lectura
 *    offline disponible; las escrituras requieren conexión y fallan con un error
 *    claro (la cola custom anterior escribía a un path denegado y nunca sincronizaba).
 *
 * RESPONSABILIDAD: Gestión de transacciones (CRUD + operaciones)
 */

import { useMemo } from 'react';
import { useFirestoreData } from '../contexts/FirestoreContext';
import { useLocalStorage } from './useLocalStorage';
import { generateId } from '../utils/formatters';
import { ensureDate } from '../utils/dateUtils';
import type { Transaction } from '../types/finance';

/**
 * Orden de la lista de transacciones: fecha descendente y, como DESEMPATE,
 * createdAt descendente (lo recién creado primero).
 *
 * Por qué el desempate: las transacciones se registran con una fecha sin hora
 * (parseDateFromInput → medianoche local), así que todas las del MISMO día
 * comparten timestamp y Firestore las devuelve en orden de doc-id (aparente
 * "desorden"). createdAt (instante real de creación) las ordena de forma
 * estable sin necesidad de un índice compuesto en Firestore —que además
 * excluiría documentos sin createdAt.
 */
export function byDateThenCreatedDesc(a: Transaction, b: Transaction): number {
  const dateDiff = ensureDate(b.date).getTime() - ensureDate(a.date).getTime();
  if (dateDiff !== 0) return dateDiff;
  // Fallback estable: sin createdAt → al final del grupo del día.
  const createdA = a.createdAt ? ensureDate(a.createdAt).getTime() : 0;
  const createdB = b.createdAt ? ensureDate(b.createdAt).getTime() : 0;
  return createdB - createdA;
}

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

  // Usar Firebase si hay usuario, localStorage si no.
  // Firestore ya viene ordenado por fecha DESC; reordenamos con el desempate por
  // createdAt para que las transacciones del mismo día no aparezcan en desorden.
  const transactions = useMemo(() => {
    const base = userId ? firestoreTransactions : localTransactions;
    return [...base].sort(byDateThenCreatedDesc);
  }, [userId, firestoreTransactions, localTransactions]);

  const loading = userId ? firestoreLoading : false;

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

  // Pago de TC atómico (par ingreso-a-TC + gasto-en-origen). En modo invitado la
  // versión Firestore hace no-op (if(!userId)return) → el invitado "pagaba" la TC
  // sin que se escribiera nada (pérdida silenciosa). Paridad: crear ambas tx en
  // localStorage. (#tx-1)
  const addCreditPaymentAtomic = async (
    creditTx: Omit<Transaction, 'id' | 'createdAt'>,
    sourceTx: Omit<Transaction, 'id' | 'createdAt'>
  ) => {
    if (userId) {
      await firestoreAddCreditPaymentAtomic(creditTx, sourceTx);
    } else {
      const now = new Date();
      const credit: Transaction = { ...creditTx, id: generateId(), createdAt: now };
      const source: Transaction = { ...sourceTx, id: generateId(), createdAt: now };
      setLocalTransactions(prev => [credit, source, ...prev]);
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
    addCreditPaymentAtomic,
    deleteTransaction,
    togglePaid,
    updateTransaction
  };
}