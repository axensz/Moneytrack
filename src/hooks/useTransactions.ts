import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Transaction } from '../types/finance';

export function useTransactions() {
  // Consulta reactiva de todas las transacciones
  const transactions = useLiveQuery(() => 
    db.transactions.orderBy('date').reverse().toArray()
  ) ?? [];

  // Estadísticas calculadas reactivamente
  const stats = useLiveQuery(async () => {
    const allTransactions = await db.transactions.toArray();
    const paidTransactions = allTransactions.filter(t => t.paid);
    
    const totalIncome = paidTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalExpenses = paidTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const pendingExpenses = allTransactions
      .filter(t => t.type === 'expense' && !t.paid)
      .reduce((sum, t) => sum + t.amount, 0);
    
    return { totalIncome, totalExpenses, pendingExpenses };
  }) ?? { totalIncome: 0, totalExpenses: 0, pendingExpenses: 0 };

  const addTransaction = async (transaction: Omit<Transaction, 'id' | 'createdAt'>) => {
    await db.transactions.add({
      ...transaction,
      createdAt: new Date()
    });
  };

  const deleteTransaction = async (id: number) => {
    await db.transactions.delete(id);
  };

  const togglePaid = async (id: number) => {
    const transaction = await db.transactions.get(id);
    if (transaction) {
      await db.transactions.update(id, { paid: !transaction.paid });
    }
  };

  const duplicateTransaction = async (transaction: Transaction) => {
    const { id, createdAt, ...transactionData } = transaction;
    await addTransaction({
      ...transactionData,
      date: new Date(), // Fecha actual
      paid: false
    });
  };

  return {
    transactions,
    stats,
    addTransaction,
    deleteTransaction,
    togglePaid,
    duplicateTransaction
  };
}