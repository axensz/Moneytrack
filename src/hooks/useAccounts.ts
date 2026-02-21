import { useMemo, useCallback } from 'react';
import { doc, runTransaction, collection, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useFirestoreData } from '../contexts/FirestoreContext';
import { useLocalStorage } from './useLocalStorage';
import { BalanceCalculator, CreditCardCalculator } from '../utils/balanceCalculator';
import { safeFirestoreOperation, checkNetworkConnection } from '../utils/firestoreHelpers';
import type { Account, Transaction } from '../types/finance';

// Generar ID único para localStorage (hoisted fuera del hook)
const generateId = () => Date.now().toString() + Math.random().toString(36).substring(2, 11);

export function useAccounts(
  userId: string | null,
  transactions: Transaction[],
  deleteTransactionFn: (id: string) => Promise<void>
) {
  const {
    accounts: firestoreAccounts,
    loading: firestoreLoading,
    addAccount: firestoreAddAccount,
    deleteAccount: firestoreDeleteAccount,
    updateAccount: firestoreUpdateAccount
  } = useFirestoreData();

  const [localAccounts, setLocalAccounts] = useLocalStorage<Account[]>('accounts', []);

  // Usar Firebase si hay usuario, localStorage si no
  const accounts = userId ? firestoreAccounts : localAccounts;

  // Loading es true si hay userId y Firestore aún está cargando
  // Importante: confiar en el loading de useFirestore que ahora espera a que los datos lleguen
  const loading = userId ? firestoreLoading : false;

  const getAccountBalance = useCallback((accountId: string): number => {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return 0;

    return BalanceCalculator.calculateAccountBalance(account, transactions);
  }, [accounts, transactions]);

  const getTransactionCountForAccount = useCallback((accountId: string): number => {
    return transactions.filter(t => t.accountId === accountId || t.toAccountId === accountId).length;
  }, [transactions]);

  const totalBalance = useMemo(() => {
    return BalanceCalculator.calculateTotalBalance(accounts, transactions);
  }, [accounts, transactions]);

  const addAccount = async (newAcc: Omit<Account, 'id' | 'createdAt'>) => {
    const isFirst = accounts.length === 0;
    const accountData = {
      ...newAcc,
      isDefault: isFirst
    };

    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      await safeFirestoreOperation(
        () => firestoreAddAccount(accountData),
        'addAccount',
        { maxRetries: 2 }
      );
    } else {
      const newAccount = {
        ...accountData,
        id: generateId(),
        createdAt: new Date()
      };
      setLocalAccounts(prev => [...prev, newAccount]);
    }
  };

  const updateAccount = async (id: string, updates: Partial<Account>) => {
    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      await safeFirestoreOperation(
        () => firestoreUpdateAccount(id, updates),
        'updateAccount',
        { maxRetries: 2 }
      );
    } else {
      setLocalAccounts(prev =>
        prev.map(acc => acc.id === id ? { ...acc, ...updates } : acc)
      );
    }
  };

  const deleteAccount = async (id: string) => {
    const account = accounts.find(a => a.id === id);
    if (account?.isDefault) {
      throw new Error('No puedes eliminar la cuenta por defecto');
    }

    // AUDIT-FIX: Eliminación en cascada atómica con writeBatch
    const relatedTransactions = transactions.filter(
      t => t.accountId === id || t.toAccountId === id
    );

    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      await safeFirestoreOperation(
        async () => {
          // Usar batch para atomicidad — máximo 500 operaciones por batch
          const BATCH_SIZE = 499; // 499 deletes + 1 account delete
          const txIds = relatedTransactions.map(t => t.id!);

          for (let i = 0; i < txIds.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = txIds.slice(i, i + BATCH_SIZE);
            chunk.forEach(txId => {
              batch.delete(doc(db, `users/${userId}/transactions`, txId));
            });
            // Incluir la cuenta en el último batch
            if (i + BATCH_SIZE >= txIds.length) {
              batch.delete(doc(db, `users/${userId}/accounts`, id));
            }
            await batch.commit();
          }
          // Si no hubo transacciones, eliminar solo la cuenta
          if (txIds.length === 0) {
            await firestoreDeleteAccount(id);
          }
        },
        'deleteAccount',
        { maxRetries: 2 }
      );
    } else {
      setLocalAccounts(prev => prev.filter(acc => acc.id !== id));
    }
  };

  const setDefaultAccount = async (id: string) => {
    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      await safeFirestoreOperation(
        async () => {
          // AUDIT-FIX: Usar runTransaction para atomicidad
          await runTransaction(db, async (transaction) => {
            for (const account of accounts) {
              const accountRef = doc(db, `users/${userId}/accounts`, account.id!);
              transaction.update(accountRef, { isDefault: account.id === id });
            }
          });
        },
        'setDefaultAccount',
        { maxRetries: 2 }
      );
    } else {
      setLocalAccounts(prev =>
        prev.map(acc => ({ ...acc, isDefault: acc.id === id }))
      );
    }
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
    getTransactionCountForAccount,
    totalBalance,
    defaultAccount
  };
}