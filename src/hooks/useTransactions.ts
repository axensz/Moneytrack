import { useMemo } from 'react';
import { useFirestore } from './useFirestore';
import type { Transaction } from '../types/finance';

export function useTransactions(userId: string | null) {
  const { 
    transactions, 
    loading, 
    addTransaction: firestoreAddTransaction,
    deleteTransaction: firestoreDeleteTransaction,
    updateTransaction 
  } = useFirestore(userId);

  // Estadísticas calculadas
  const stats = useMemo(() => {
    const paidTransactions = transactions.filter(t => t.paid);
    
    const totalIncome = paidTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalExpenses = paidTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const pendingExpenses = transactions
      .filter(t => t.type === 'expense' && !t.paid)
      .reduce((sum, t) => sum + t.amount, 0);
    
    return { totalIncome, totalExpenses, pendingExpenses };
  }, [transactions]);

  const addTransaction = async (transaction: Omit<Transaction, 'id' | 'createdAt'>) => {
    await firestoreAddTransaction(transaction);
  };

  const deleteTransaction = async (id: string) => {
    await firestoreDeleteTransaction(id);
  };

  const togglePaid = async (id: string) => {
    const transaction = transactions.find(t => t.id === id);
    if (transaction) {
      await updateTransaction(id, { paid: !transaction.paid });
    }
  };

  const duplicateTransaction = async (transaction: Transaction) => {
    const { id, createdAt, ...transactionData } = transaction;
    await addTransaction({
      ...transactionData,
      date: new Date(),
      paid: false
    });
  };

  return {
    transactions,
    loading,
    stats,
    addTransaction,
    deleteTransaction,
    togglePaid,
    duplicateTransaction
  };
}