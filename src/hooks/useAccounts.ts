import { useMemo, useCallback } from 'react';
import { doc, runTransaction, collection, writeBatch, getDocs, getDoc, updateDoc, query, where, deleteField } from 'firebase/firestore';
import type { DocumentReference } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useFirestoreData } from '../contexts/FirestoreContext';
import { useLocalStorage } from './useLocalStorage';
import { BalanceCalculator } from '../utils/balanceCalculator';
import { safeFirestoreOperation, checkNetworkConnection, stripUndefined } from '../utils/firestoreHelpers';
import { generateId } from '../utils/formatters';
import { transactionUsesAccount, getAccountReferenceIds } from '../utils/accountTransactions';
import { getCreditCardUsedCredit } from '../utils/accountStrategies';
import { creditDeltasByAccount, reconcileUsedCredit } from '../utils/creditDeltas';
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

      // #23: TC asociadas a la cuenta que se borra (bankAccountId === id). NO se
      // borran: solo se les limpia el bankAccountId colgante para que vuelvan a
      // aparecer como TC de nivel superior en vez de quedar huérfanas referenciando
      // una cuenta inexistente.
      const orphanedCardIds = firestoreAccounts
        .filter(a => a.type === 'credit' && a.bankAccountId === id && a.id && a.id !== id)
        .map(a => a.id!);

      await safeFirestoreOperation(
        async () => {
          const BATCH_LIMIT = 490; // Leave room for account + recurring + debts
          const recurringIds = relatedRecurring.map(p => p.id!);
          const debtIds = relatedDebts.map(d => d.id!);

          // Consultar Firestore (no solo memoria) por TODAS las transacciones que
          // referencian la cuenta, tanto como origen (accountId) como destino
          // (toAccountId), y deduplicar por id. Esto garantiza que la reconciliación
          // de usedCredit cubra transacciones que aún no estén en el estado en memoria.
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

          // Identificar el conjunto de TC AFECTADAS por el borrado: cuentas tipo
          // credit, distintas de la que se borra, que estas transacciones tocaban
          // (gasto/ingreso por accountId, o transferencia por toAccountId). NO se
          // calcula aquí ningún delta de reversión: la deuda se reconcilia DESPUÉS
          // recomputando usedCredit desde las transacciones sobrevivientes.
          const affectedCardIds = new Set<string>();
          for (const tx of txDeletes.values()) {
            const deltas = creditDeltasByAccount(tx, firestoreAccounts);
            for (const accId of deltas.keys()) {
              if (accId === id) continue; // la TC que se borra desaparece con su usedCredit
              affectedCardIds.add(accId);
            }
          }

          const allDeletes = [
            ...Array.from(txDeletes.keys()).map(txId => doc(db, `users/${userId}/transactions`, txId)),
            ...recurringIds.map(rId => doc(db, `users/${userId}/recurringPayments`, rId)),
            ...debtIds.map(dId => doc(db, `users/${userId}/debts`, dId)),
          ];

          // Operaciones totales del borrado: borrados + limpieza de TC huérfanas
          // (#23) + el account.
          const totalOps = allDeletes.length + orphanedCardIds.length + 1;

          if (totalOps === 1) {
            // Nada que cascada: solo borrar la cuenta.
            await firestoreDeleteAccount(id);
            return;
          }

          // FASE 1 — Borrado. Acumular operaciones en writeBatch respetando
          // BATCH_LIMIT. Solo borrados (tx + recurrentes + deudas + la cuenta);
          // sin tocar usedCredit de otras TC aquí.
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
          // #23: limpiar el bankAccountId colgante de las TC asociadas en el mismo
          // flujo de borrado (mismo esquema multi-batch). Se hace ANTES de borrar la
          // cuenta; usar deleteField() las devuelve a TC de nivel superior.
          for (const cardId of orphanedCardIds) {
            await enqueue(b => b.update(
              doc(db, `users/${userId}/accounts`, cardId),
              { bankAccountId: deleteField() }
            ));
          }
          // El borrado de la cuenta va al final.
          await enqueue(b => b.delete(doc(db, `users/${userId}/accounts`, id)));
          await flush();

          // FASE 2 — Reconciliación de usedCredit de las TC afectadas.
          //
          // Por qué reconciliar con SET (valor recomputado) y no revertir con
          // increment(-delta) dentro del batch: el borrado puede requerir varios
          // batches (>490 ops) y un writeBatch multi-batch NO es atómico. Si un
          // increment(-delta) se aplica y luego otro batch falla — o se reintenta
          // la operación completa — el increment se aplicaría de nuevo y corrompería
          // la deuda (doble resta). Recomputar usedCredit = max(0, suma de deltas de
          // las transacciones SOBREVIVIENTES) es idempotente: reejecutar deleteAccount
          // o reintentar tras un fallo parcial siempre converge al valor correcto,
          // porque no depende del estado previo del campo.
          for (const cardId of affectedCardIds) {
            const cardRef = doc(db, `users/${userId}/accounts`, cardId);
            const cardSnap = await getDoc(cardRef);
            if (!cardSnap.exists()) continue; // la TC ya no existe: nada que reconciliar

            // Si la TC es una tarjeta fusionada, las transacciones pueden
            // referenciarla por cualquiera de sus mergedAccountIds además del id
            // literal. Reconciliar contra TODAS las referencias para no subestimar
            // usedCredit (mismas referencias que usa el recompute de display).
            const cardAccount = { id: cardId, ...(cardSnap.data() as Omit<Account, 'id'>) } as Account;
            const referenceIds = getAccountReferenceIds(cardAccount);

            const queries = referenceIds.flatMap(refId => [
              getDocs(query(txCollection, where('accountId', '==', refId))),
              getDocs(query(txCollection, where('toAccountId', '==', refId))),
            ]);
            const snapshots = await Promise.all(queries);
            const survivors = new Map<string, Transaction>();
            snapshots.forEach(snapshot => {
              snapshot.docs.forEach(snap => {
                survivors.set(snap.id, { id: snap.id, ...(snap.data() as Transaction) });
              });
            });

            // Reconciliación pura (idempotente): suma getCreditDelta sobre todas
            // las referencias de la TC, clampea a >= 0 y redondea centavos.
            const usedCredit = reconcileUsedCredit(
              referenceIds,
              Array.from(survivors.values())
            );

            await updateDoc(cardRef, { usedCredit });
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
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      await safeFirestoreOperation(
        async () => {
          const BATCH_LIMIT = 490;
          const accountCollection = collection(db, `users/${userId}/accounts`);
          const operations: BatchOperation[] = [];

          const destinationData = stripUndefined({
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

            const updates = stripUndefined({
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