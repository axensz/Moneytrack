import { useMemo, useCallback } from 'react';
import { useFirestoreData } from '../contexts/FirestoreContext';
import { useLocalStorage } from './useLocalStorage';
import { BalanceCalculator } from '../utils/balanceCalculator';
import { safeFirestoreOperation, checkNetworkConnection } from '../utils/firestoreHelpers';
import { generateId } from '../utils/formatters';
import { transactionUsesAccount } from '../utils/accountTransactions';
import { getCreditCardUsedCredit } from '../utils/accountStrategies';
import { deleteAccountCascade, mergeCreditCardsOrchestrated, setDefaultAccountAtomic } from './firestore/accountOrchestration';
import type { Account, Transaction, RecurringPayment, Debt } from '../types/finance';

export type MergeCreditCardsDestination = Pick<Account, 'name'> & Partial<Omit<Account, 'id' | 'name' | 'type' | 'createdAt'>> & {
  id?: string;
};

export interface MergeCreditCardsParams {
  sourceAccountIds: string[];
  destination: MergeCreditCardsDestination;
}

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
    const account = accounts.find(a => a.id === accountId);
    if (!account) return 0;
    return transactions.filter(t => transactionUsesAccount(t, account)).length;
  }, [accounts, transactions]);

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

    if (userId) {
      await deleteAccountCascade(
        userId,
        id,
        {
          accounts: firestoreAccounts,
          recurringPayments: firestoreRecurringPayments,
          debts: firestoreDebts,
        },
        options
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

    // Validar que todas las tarjetas pertenezcan al mismo banco
    const allCardsForBankCheck = [...sourceAccounts.filter(Boolean) as Account[]];
    if (existingDestination) allCardsForBankCheck.push(existingDestination);

    const bankIds = allCardsForBankCheck
      .map(account => account.bankAccountId)
      .filter((id): id is string => id != null);

    if (bankIds.length === 0) {
      throw new Error('Las tarjetas deben estar asociadas a una cuenta bancaria para poder unificarse');
    }

    const uniqueBanks = new Set(bankIds);
    if (uniqueBanks.size > 1) {
      throw new Error('Solo se pueden unificar tarjetas de crédito del mismo banco');
    }

    // Si alguna tiene banco y otra no, también es inconsistente
    if (bankIds.length < allCardsForBankCheck.length) {
      throw new Error('Solo se pueden unificar tarjetas de crédito del mismo banco (algunas tarjetas no tienen banco asignado)');
    }

    const sourceHadDefault = sourceAccounts.some(account => account?.isDefault);
    const shouldMakeDestinationDefault = destination.isDefault ?? existingDestination?.isDefault ?? sourceHadDefault;
    const destinationId = destination.id ?? generateId();

    // Consolidar el cupo utilizado: la deuda del destino pasa a ser la suma de la
    // deuda de TODAS las tarjetas unificadas (destino + orígenes), ya que sus
    // transacciones se reapuntan al destino. Sin esto la deuda de las tarjetas
    // origen se perdería al eliminarlas. Se prefiere el valor persistido; si una
    // tarjeta aún no lo tiene, se calcula desde sus transacciones en memoria.
    const cardsToConsolidate = [existingDestination, ...sourceAccounts].filter(
      (account): account is Account => Boolean(account)
    );
    const mergedUsedCredit = cardsToConsolidate.reduce(
      (sum, account) =>
        sum +
        (account.usedCredit != null
          ? Math.max(0, account.usedCredit)
          : getCreditCardUsedCredit(account, transactions)),
      0
    );

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
      usedCredit: mergedUsedCredit,
    };

    const migrateAccountReference = (accountId?: string): string | undefined => (
      accountId && sourceIdSet.has(accountId) ? destinationId : accountId
    );

    if (userId) {
      await mergeCreditCardsOrchestrated(userId, {
        destinationId,
        destinationAccount,
        existingDestination,
        shouldMakeDestinationDefault,
        sourceIdSet,
        uniqueSourceIds,
        accounts,
        transactions,
        recurringPayments: firestoreRecurringPayments,
        debts: firestoreDebts,
      });
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
        accountId: migrateAccountReference(payment.accountId) ?? payment.accountId,
      })));

      setLocalDebts(prev => prev.map(debt => ({
        ...debt,
        accountId: migrateAccountReference(debt.accountId) ?? debt.accountId,
      })));
    }
  };

  const setDefaultAccount = async (id: string) => {
    if (userId) {
      await setDefaultAccountAtomic(userId, id, accounts);
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