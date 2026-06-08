import { useMemo, useCallback } from 'react';
import { doc, runTransaction, collection, writeBatch, getDocs, query, where, increment } from 'firebase/firestore';
import type { DocumentReference } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useFirestoreData } from '../contexts/FirestoreContext';
import { useLocalStorage } from './useLocalStorage';
import { BalanceCalculator, CreditCardCalculator } from '../utils/balanceCalculator';
import { safeFirestoreOperation, checkNetworkConnection } from '../utils/firestoreHelpers';
import { generateId } from '../utils/formatters';
import { transactionUsesAccount } from '../utils/accountTransactions';
import { creditDeltasByAccount } from '../utils/creditDeltas';
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
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      // Find recurring payments and debts linked to this account
      const relatedRecurring = firestoreRecurringPayments.filter(p => p.accountId === id);
      const relatedDebts = firestoreDebts.filter(d => d.accountId === id);

      await safeFirestoreOperation(
        async () => {
          const BATCH_LIMIT = 490; // Leave room for account + recurring + debts + credit reversals
          const recurringIds = relatedRecurring.map(p => p.id!);
          const debtIds = relatedDebts.map(d => d.id!);

          // Consultar Firestore (no solo memoria) por TODAS las transacciones que
          // referencian la cuenta, tanto como origen (accountId) como destino
          // (toAccountId), y deduplicar por id. Esto garantiza que la reversión de
          // usedCredit cubra transacciones que aún no estén en el estado en memoria.
          const txCollection = collection(db, `users/${userId}/transactions`);
          const txDeletes = new Map<string, Transaction>();
          if (!options.preserveTransactions) {
            const [bySource, byDestination] = await Promise.all([
              getDocs(query(txCollection, where('accountId', '==', id))),
              getDocs(query(txCollection, where('toAccountId', '==', id))),
            ]);
            [...bySource.docs, ...byDestination.docs].forEach(snap => {
              txDeletes.set(snap.id, { id: snap.id, ...(snap.data() as Transaction) });
            });
          }

          // Acumular las reversiones de usedCredit por cuenta TC afectada,
          // EXCLUYENDO la cuenta que se está borrando (su usedCredit desaparece
          // junto con la cuenta). Para una transferencia que pagaba ESTA TC no hay
          // nada que revertir (la cuenta se borra); pero un gasto/transfer que
          // tocaba OTRA TC sí debe revertirse.
          const creditReversals = new Map<string, number>();
          for (const tx of txDeletes.values()) {
            const deltas = creditDeltasByAccount(tx, firestoreAccounts);
            for (const [accId, delta] of deltas) {
              if (accId === id) continue;
              creditReversals.set(accId, (creditReversals.get(accId) ?? 0) + delta);
            }
          }

          const allDeletes = [
            ...Array.from(txDeletes.keys()).map(txId => doc(db, `users/${userId}/transactions`, txId)),
            ...recurringIds.map(rId => doc(db, `users/${userId}/recurringPayments`, rId)),
            ...debtIds.map(dId => doc(db, `users/${userId}/debts`, dId)),
          ];

          const creditUpdates = Array.from(creditReversals.entries())
            .filter(([, totalDelta]) => totalDelta !== 0)
            .map(([accId, totalDelta]) => ({ accId, totalDelta }));

          // Operaciones totales: borrados + reversiones de crédito + el account.
          const totalOps = allDeletes.length + creditUpdates.length + 1;

          if (totalOps === 1) {
            // Nada que cascada: solo borrar la cuenta.
            await firestoreDeleteAccount(id);
            return;
          }

          // Acumular operaciones en writeBatch respetando BATCH_LIMIT.
          let batch = writeBatch(db);
          let opCount = 0;
          const flush = async () => {
            if (opCount > 0) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
            }
          };
          const enqueue = async (fn: (b: ReturnType<typeof writeBatch>) => void) => {
            if (opCount >= BATCH_LIMIT) await flush();
            fn(batch);
            opCount++;
          };

          for (const ref of allDeletes) {
            await enqueue(b => b.delete(ref));
          }
          for (const { accId, totalDelta } of creditUpdates) {
            await enqueue(b =>
              b.update(doc(db, `users/${userId}/accounts`, accId), {
                usedCredit: increment(-totalDelta),
              })
            );
          }
          // El borrado de la cuenta va al final.
          await enqueue(b => b.delete(doc(db, `users/${userId}/accounts`, id)));
          await flush();
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
          : CreditCardCalculator.calculateUsedCredit(account, transactions)),
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