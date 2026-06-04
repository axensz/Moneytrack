import { useMemo, useCallback } from 'react';
import { doc, runTransaction, collection, writeBatch } from 'firebase/firestore';
import type { DocumentReference } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useFirestoreData } from '../contexts/FirestoreContext';
import { useLocalStorage } from './useLocalStorage';
import { BalanceCalculator, CreditCardCalculator } from '../utils/balanceCalculator';
import { safeFirestoreOperation, checkNetworkConnection } from '../utils/firestoreHelpers';
import { generateId } from '../utils/formatters';
import type { Account, Transaction, RecurringPayment, Debt } from '../types/finance';

export type MergeCreditCardsDestination = Pick<Account, 'name'> & Partial<Omit<Account, 'id' | 'name' | 'type' | 'createdAt'>> & {
  id?: string;
};

export interface MergeCreditCardsParams {
  sourceAccountIds: string[];
  destination: MergeCreditCardsDestination;
}

type BatchOperation = {
  type: 'set' | 'update' | 'delete';
  ref: DocumentReference;
  data?: Record<string, unknown>;
};

const cleanUndefinedFields = <T extends Record<string, unknown>>(data: T): Partial<T> => {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
};

export function useAccounts(
  userId: string | null,
  transactions: Transaction[],
  deleteTransactionFn: (id: string) => Promise<void>
) {
  const {
    accounts: firestoreAccounts,
    recurringPayments: firestoreRecurringPayments,
    debts: firestoreDebts,
    loading: firestoreLoading,
    addAccount: firestoreAddAccount,
    deleteAccount: firestoreDeleteAccount,
    updateAccount: firestoreUpdateAccount
  } = useFirestoreData();

  const [localAccounts, setLocalAccounts] = useLocalStorage<Account[]>('accounts', []);
  const [, setLocalTransactions] = useLocalStorage<Transaction[]>('transactions', []);
  const [, setLocalRecurringPayments] = useLocalStorage<RecurringPayment[]>('recurringPayments', []);
  const [, setLocalDebts] = useLocalStorage<Debt[]>('debts', []);

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

  const deleteAccount = async (id: string, options: { preserveTransactions?: boolean; allowDefaultDelete?: boolean } = {}) => {
    const account = accounts.find(a => a.id === id);
    if (account?.isDefault && !options.allowDefaultDelete) {
      throw new Error('No puedes eliminar la cuenta por defecto');
    }

    // Cascade: transactions, recurring payments, and debts linked to this account
    const relatedTransactions = options.preserveTransactions
      ? []
      : transactions.filter(t => t.accountId === id || t.toAccountId === id);

    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      // Find recurring payments and debts linked to this account
      const relatedRecurring = firestoreRecurringPayments.filter(p => p.accountId === id);
      const relatedDebts = firestoreDebts.filter(d => d.accountId === id);

      await safeFirestoreOperation(
        async () => {
          const BATCH_LIMIT = 490; // Leave room for account + recurring + debts
          const txIds = relatedTransactions.map(t => t.id!);
          const recurringIds = relatedRecurring.map(p => p.id!);
          const debtIds = relatedDebts.map(d => d.id!);
          const allDeletes = [
            ...txIds.map(txId => doc(db, `users/${userId}/transactions`, txId)),
            ...recurringIds.map(rId => doc(db, `users/${userId}/recurringPayments`, rId)),
            ...debtIds.map(dId => doc(db, `users/${userId}/debts`, dId)),
          ];

          for (let i = 0; i < allDeletes.length; i += BATCH_LIMIT) {
            const batch = writeBatch(db);
            const chunk = allDeletes.slice(i, i + BATCH_LIMIT);
            chunk.forEach(ref => batch.delete(ref));
            // Include the account in the last batch
            if (i + BATCH_LIMIT >= allDeletes.length) {
              batch.delete(doc(db, `users/${userId}/accounts`, id));
            }
            await batch.commit();
          }
          // If nothing to cascade, just delete the account
          if (allDeletes.length === 0) {
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

  const mergeCreditCards = async ({ sourceAccountIds, destination }: MergeCreditCardsParams) => {
    const uniqueSourceIds = Array.from(new Set(sourceAccountIds.filter(Boolean)));

    if (uniqueSourceIds.length === 0) {
      throw new Error('Debes seleccionar al menos una tarjeta de crédito origen');
    }

    if (destination.id && uniqueSourceIds.includes(destination.id)) {
      throw new Error('La tarjeta destino no puede ser también una tarjeta origen');
    }

    const sourceIdSet = new Set(uniqueSourceIds);
    const sourceAccounts = uniqueSourceIds.map(id => accounts.find(account => account.id === id));
    const missingSourceId = uniqueSourceIds.find((_, index) => !sourceAccounts[index]);
    if (missingSourceId) {
      throw new Error(`La cuenta origen ${missingSourceId} no existe`);
    }

    const nonCreditSource = sourceAccounts.find(account => account?.type !== 'credit');
    if (nonCreditSource) {
      throw new Error(`La cuenta origen ${nonCreditSource.name} no es una tarjeta de crédito`);
    }

    const existingDestination = destination.id
      ? accounts.find(account => account.id === destination.id)
      : undefined;

    if (destination.id && !existingDestination) {
      throw new Error(`La cuenta destino ${destination.id} no existe`);
    }

    if (existingDestination && existingDestination.type !== 'credit') {
      throw new Error(`La cuenta destino ${existingDestination.name} no es una tarjeta de crédito`);
    }

    const sourceHadDefault = sourceAccounts.some(account => account?.isDefault);
    const shouldMakeDestinationDefault = destination.isDefault ?? existingDestination?.isDefault ?? sourceHadDefault;
    const destinationId = destination.id ?? generateId();
    const destinationAccount: Account = {
      ...(existingDestination ?? {
        id: destinationId,
        type: 'credit' as const,
        initialBalance: 0,
        createdAt: new Date(),
        isDefault: shouldMakeDestinationDefault,
      }),
      ...destination,
      id: destinationId,
      type: 'credit',
      initialBalance: 0,
      isDefault: shouldMakeDestinationDefault,
      createdAt: existingDestination?.createdAt ?? new Date(),
    };

    const migrateAccountReference = (accountId?: string): string | undefined => (
      accountId && sourceIdSet.has(accountId) ? destinationId : accountId
    );

    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      await safeFirestoreOperation(
        async () => {
          const BATCH_LIMIT = 490;
          const accountCollection = collection(db, `users/${userId}/accounts`);
          const operations: BatchOperation[] = [];

          const destinationData = cleanUndefinedFields({
            ...destinationAccount,
            id: undefined,
          } as Record<string, unknown>);
          operations.push({
            type: existingDestination ? 'update' : 'set',
            ref: doc(accountCollection, destinationId),
            data: destinationData,
          });

          if (shouldMakeDestinationDefault) {
            accounts
              .filter(account => account.id && account.id !== destinationId && !sourceIdSet.has(account.id) && account.isDefault)
              .forEach(account => {
                operations.push({
                  type: 'update',
                  ref: doc(db, `users/${userId}/accounts`, account.id!),
                  data: { isDefault: false },
                });
              });
          }

          transactions.forEach(transactionItem => {
            if (!transactionItem.id) return;

            const updates = cleanUndefinedFields({
              accountId: migrateAccountReference(transactionItem.accountId),
              toAccountId: migrateAccountReference(transactionItem.toAccountId),
            });

            if (updates.accountId !== transactionItem.accountId || updates.toAccountId !== transactionItem.toAccountId) {
              operations.push({
                type: 'update',
                ref: doc(db, `users/${userId}/transactions`, transactionItem.id),
                data: updates,
              });
            }
          });

          firestoreRecurringPayments.forEach(payment => {
            if (!payment.id || !payment.accountId || !sourceIdSet.has(payment.accountId)) return;

            operations.push({
              type: 'update',
              ref: doc(db, `users/${userId}/recurringPayments`, payment.id),
              data: { accountId: destinationId },
            });
          });

          firestoreDebts.forEach(debt => {
            if (!debt.id || !debt.accountId || !sourceIdSet.has(debt.accountId)) return;

            operations.push({
              type: 'update',
              ref: doc(db, `users/${userId}/debts`, debt.id),
              data: { accountId: destinationId },
            });
          });

          uniqueSourceIds.forEach(sourceId => {
            operations.push({
              type: 'delete',
              ref: doc(db, `users/${userId}/accounts`, sourceId),
            });
          });

          for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
            const batch = writeBatch(db);
            operations.slice(i, i + BATCH_LIMIT).forEach(operation => {
              if (operation.type === 'delete') {
                batch.delete(operation.ref);
              } else if (operation.type === 'set') {
                batch.set(operation.ref, operation.data ?? {});
              } else {
                batch.update(operation.ref, operation.data ?? {});
              }
            });
            await batch.commit();
          }
        },
        'mergeCreditCards',
        { maxRetries: 2 }
      );
    } else {
      setLocalAccounts(prev => {
        const existingLocalDestination = prev.find(account => account.id === destination.id);
        const localDestinationAccount: Account = {
          ...(existingLocalDestination ?? destinationAccount),
          ...destinationAccount,
          createdAt: existingLocalDestination?.createdAt ?? destinationAccount.createdAt,
        };

        const withoutSourcesAndDestination = prev.filter(account =>
          account.id !== destinationId && (!account.id || !sourceIdSet.has(account.id))
        );

        return [
          ...withoutSourcesAndDestination.map(account => ({
            ...account,
            isDefault: shouldMakeDestinationDefault ? false : account.isDefault,
          })),
          localDestinationAccount,
        ];
      });

      setLocalTransactions(prev => prev.map(transactionItem => ({
        ...transactionItem,
        accountId: migrateAccountReference(transactionItem.accountId) ?? transactionItem.accountId,
        toAccountId: migrateAccountReference(transactionItem.toAccountId),
      })));

      setLocalRecurringPayments(prev => prev.map(payment => ({
        ...payment,
        accountId: migrateAccountReference(payment.accountId),
      })));

      setLocalDebts(prev => prev.map(debt => ({
        ...debt,
        accountId: migrateAccountReference(debt.accountId),
      })));
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
    mergeCreditCards,
    setDefaultAccount,
    getAccountBalance,
    getTransactionCountForAccount,
    totalBalance,
    defaultAccount
  };
}