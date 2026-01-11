import { useMemo, useEffect } from 'react';
import { useFirestore } from './useFirestore';
import type { Account, Transaction } from '../types/finance';

export function useAccounts(userId: string | null, transactions: Transaction[]) {
  const { 
    accounts, 
    loading,
    addAccount: firestoreAddAccount,
    deleteAccount: firestoreDeleteAccount,
    updateAccount: firestoreUpdateAccount 
  } = useFirestore(userId);

  // Crear cuenta por defecto si no existe y hay usuario
  useEffect(() => {
    if (userId && accounts.length === 0 && !loading) {
      firestoreAddAccount({
        name: 'Cuenta Principal',
        type: 'savings',
        isDefault: true,
        initialBalance: 0
      });
    }
  }, [userId, accounts.length, loading, firestoreAddAccount]);

  const getAccountBalance = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return 0;

    const accountTx = transactions.filter(t => t.paid);
    let balance = account.initialBalance;

    if (account.type === 'credit') {
      accountTx.forEach(t => {
        if (t.accountId === accountId) {
          if (t.type === 'expense') balance -= t.amount;
          if (t.type === 'income') balance += t.amount;
          if (t.type === 'transfer') balance -= t.amount;
        }
        if (t.toAccountId === accountId && t.type === 'transfer') {
          balance += t.amount;
        }
      });
      return (account.creditLimit || 0) + balance;
    } else {
      accountTx.forEach(t => {
        if (t.accountId === accountId) {
          if (t.type === 'income') balance += t.amount;
          if (t.type === 'expense') balance -= t.amount;
          if (t.type === 'transfer') balance -= t.amount;
        }
        if (t.toAccountId === accountId && t.type === 'transfer') {
          balance += t.amount;
        }
      });
      return balance;
    }
  };

  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + getAccountBalance(acc.id!), 0);
  }, [accounts, transactions]);

  const addAccount = async (newAcc: Omit<Account, 'id' | 'createdAt'>) => {
    const isFirst = accounts.length === 0;
    await firestoreAddAccount({
      ...newAcc,
      isDefault: isFirst
    });
  };

  const updateAccount = async (id: string, updates: Partial<Account>) => {
    await firestoreUpdateAccount(id, updates);
  };

  const deleteAccount = async (id: string) => {
    const account = accounts.find(a => a.id === id);
    if (account?.isDefault) {
      throw new Error('No puedes eliminar la cuenta por defecto');
    }
    
    const hasTransactions = transactions.some(t => t.accountId === id || t.toAccountId === id);
    if (hasTransactions) {
      throw new Error('No puedes eliminar una cuenta con transacciones');
    }
    
    await firestoreDeleteAccount(id);
  };

  const setDefaultAccount = async (id: string) => {
    // Actualizar todas las cuentas
    const updates = accounts.map(account => 
      updateAccount(account.id!, { isDefault: account.id === id })
    );
    await Promise.all(updates);
  };

  const defaultAccount = accounts.find(a => a.isDefault);

  return {
    accounts,
    loading,
    addAccount,
    updateAccount,
    deleteAccount,
    setDefaultAccount,
    getAccountBalance,
    totalBalance,
    defaultAccount
  };
}