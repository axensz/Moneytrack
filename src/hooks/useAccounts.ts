import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Account, Transaction } from '../types/finance';

export function useAccounts(transactions: Transaction[]) {
  // Consulta reactiva de todas las cuentas
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];

  // Inicializar cuenta por defecto
  useLiveQuery(async () => {
    const count = await db.accounts.count();
    if (count === 0) {
      await db.accounts.add({
        name: 'Cuenta Principal',
        type: 'savings',
        isDefault: true,
        initialBalance: 0,
        createdAt: new Date()
      });
    }
  });

  const getAccountBalance = (accountId: number) => {
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

  const totalBalance = useLiveQuery(async () => {
    const allAccounts = await db.accounts.toArray();
    return allAccounts.reduce((sum, acc) => sum + getAccountBalance(acc.id!), 0);
  }) ?? 0;

  const addAccount = async (newAcc: Omit<Account, 'id' | 'createdAt'>) => {
    const count = await db.accounts.count();
    await db.accounts.add({
      ...newAcc,
      isDefault: count === 0,
      createdAt: new Date()
    });
  };

  const updateAccount = async (id: number, updates: Partial<Account>) => {
    await db.accounts.update(id, updates);
  };

  const deleteAccount = async (id: number) => {
    const account = await db.accounts.get(id);
    if (account?.isDefault) {
      throw new Error('No puedes eliminar la cuenta por defecto');
    }
    
    const hasTransactions = await db.transactions
      .where('accountId').equals(id)
      .or('toAccountId').equals(id)
      .count();
    
    if (hasTransactions > 0) {
      throw new Error('No puedes eliminar una cuenta con transacciones');
    }
    
    await db.accounts.delete(id);
  };

  const setDefaultAccount = async (id: number) => {
    await db.transaction('rw', db.accounts, async () => {
      await db.accounts.toCollection().modify({ isDefault: false });
      await db.accounts.update(id, { isDefault: true });
    });
  };

  const defaultAccount = accounts.find(a => a.isDefault);

  return {
    accounts,
    addAccount,
    updateAccount,
    deleteAccount,
    setDefaultAccount,
    getAccountBalance,
    totalBalance,
    defaultAccount
  };
}