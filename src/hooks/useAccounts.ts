import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { useFirestore } from './useFirestore';
import { useLocalStorage } from './useLocalStorage';
import { BalanceCalculator } from '../utils/balanceCalculator';
import type { Account, Transaction } from '../types/finance';

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
  } = useFirestore(userId);

  const [localAccounts, setLocalAccounts] = useLocalStorage<Account[]>('accounts', []);
  
  // Usar Firebase si hay usuario, localStorage si no
  const accounts = userId ? firestoreAccounts : localAccounts;
  const loading = userId ? firestoreLoading : false;

  // Generar ID único para localStorage
  const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

  // Crear cuenta por defecto si no existe
  const hasCreatedDefault = useRef(false);

  useEffect(() => {
    // Solo ejecutar si no está cargando y hay cuentas disponibles (vacías o no)
    if (loading) return;

    // Si ya hay al menos una cuenta, no crear nada
    if (accounts.length > 0) return;

    // Si ya se creó la cuenta default en esta sesión, no crear otra
    if (hasCreatedDefault.current) return;

    // Marcar que se va a crear
    hasCreatedDefault.current = true;

    // Verificar que no se haya creado ya (usando un setTimeout para evitar ejecuciones múltiples)
    const timeoutId = setTimeout(() => {
      // Verificar de nuevo por si se creó mientras esperábamos
      if (accounts.length > 0) return;

      if (userId) {
        firestoreAddAccount({
          name: 'Cuenta Principal',
          type: 'savings',
          isDefault: true,
          initialBalance: 0
        });
      } else {
        const defaultAccount = {
          id: generateId(),
          name: 'Cuenta Principal',
          type: 'savings' as const,
          isDefault: true,
          initialBalance: 0,
          createdAt: new Date()
        };
        setLocalAccounts([defaultAccount]);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [userId, accounts.length, loading, firestoreAddAccount]);

  const getAccountBalance = (accountId: string): number => {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return 0;

    return BalanceCalculator.calculateAccountBalance(account, transactions);
  };

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
      await firestoreAddAccount(accountData);
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
      await firestoreUpdateAccount(id, updates);
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

    // 🔴 ELIMINACIÓN EN CASCADA: Eliminar todas las transacciones asociadas
    const relatedTransactions = transactions.filter(
      t => t.accountId === id || t.toAccountId === id
    );

    // Eliminar transacciones en paralelo
    await Promise.all(
      relatedTransactions.map(t => deleteTransactionFn(t.id!))
    );

    // Luego eliminar la cuenta
    if (userId) {
      await firestoreDeleteAccount(id);
    } else {
      setLocalAccounts(prev => prev.filter(acc => acc.id !== id));
    }
  };

  const getTransactionCountForAccount = (accountId: string): number => {
    return transactions.filter(t => t.accountId === accountId || t.toAccountId === accountId).length;
  };

  const setDefaultAccount = async (id: string) => {
    if (userId) {
      // Actualizar todas las cuentas en Firebase
      const updates = accounts.map(account => 
        updateAccount(account.id!, { isDefault: account.id === id })
      );
      await Promise.all(updates);
    } else {
      // Actualizar en localStorage
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