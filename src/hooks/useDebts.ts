/**
 * Hook para gestión de préstamos/deudas
 * Soporta Firebase (usuario autenticado) y localStorage (modo invitado)
 *
 * FLUJO (cuando la deuda tiene una cuenta asociada):
 * - Prestar dinero (lent)    → crea Debt + GASTO en la cuenta (sale el dinero)
 * - Pedir prestado (borrowed)→ crea Debt + INGRESO en la cuenta (entra el dinero)
 * - Recibir pago de un lent  → INGRESO en la cuenta + reduce remainingAmount
 * - Pagar un borrowed        → GASTO en la cuenta + reduce remainingAmount
 * - Pago completo            → isSettled = true
 * - Eliminar deuda           → elimina también sus transacciones vinculadas (debtId)
 *
 * Si la deuda NO tiene cuenta asociada, funciona como simple seguimiento sin
 * afectar saldos (comportamiento histórico).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  updateDoc,
  doc,
  getDocsFromServer,
  getDocFromServer,
  where,
  writeBatch,
  increment,
  deleteField,
} from 'firebase/firestore';
import { db } from '../lib/firebaseDb';
import { useLocalStorage } from './useLocalStorage';
import { logger } from '../utils/logger';
import { safeFirestoreOperation, checkNetworkConnection, stripUndefined } from '../utils/firestoreHelpers';
import { generateId } from '../utils/formatters';
import { creditDeltasByAccount } from '../utils/creditDeltas';
import { LOAN_CATEGORY, LOAN_PAYMENT_CATEGORY } from '../config/constants';
import type { Debt, Transaction, Account } from '../types/finance';
import {
  acquireAccountOperationLock,
  assertAtomicBatchCapacity,
  createAccountOperationId,
  createAccountOperationRelease,
  releaseAccountOperationLock,
  renewAccountOperationLock,
} from './firestore/accountOrchestration';
import { publishTransactionCacheMutation } from './firestore/transactionPaginationCache';
import { buildDebtAccountReassignmentPlan } from '../utils/debtAccountReassignment';

interface DebtTransactionOps {
  addTransaction?: (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
  deleteTransaction?: (id: string) => Promise<void>;
  updateTransaction?: (id: string, updates: Partial<Transaction>) => Promise<void>;
  accounts?: Account[];
}

export function useDebts(
  userId: string | null,
  transactions: Transaction[],
  externalDebts?: Debt[],
  txOps: DebtTransactionOps = {}
) {
  const { addTransaction, deleteTransaction, updateTransaction, accounts: operationAccounts = [] } = txOps;
  // Firestore state
  const [firestoreDebts, setFirestoreDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);

  // LocalStorage for guest mode
  const [localDebts, setLocalDebts] = useLocalStorage<Debt[]>('debts', []);
  const hasExternalDebts = externalDebts !== undefined;

  // Firestore subscription — skip if data provided externally (centralized)
  useEffect(() => {
    if (hasExternalDebts) {
      setLoading(false);
      return;
    }
    if (!userId) {
      setFirestoreDebts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const debtsRef = collection(db, `users/${userId}/debts`);
    const debtsQuery = query(debtsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      debtsQuery,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          settledAt: doc.data().settledAt?.toDate() || null,
          lentDate: doc.data().lentDate?.toDate() || undefined,
          dueDate: doc.data().dueDate?.toDate() || undefined,
          nextPaymentDate: doc.data().nextPaymentDate?.toDate() || undefined,
        })) as Debt[];
        setFirestoreDebts(data);
        setLoading(false);
      },
      (err) => {
        logger.error('Error en deudas', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, hasExternalDebts]);

  const debts = externalDebts ?? (userId ? firestoreDebts : localDebts);

  // CRUD Operations
  const addDebt = useCallback(async (debt: Omit<Debt, 'id' | 'createdAt'>) => {
    // Limpiar campos undefined antes de enviar a Firestore
    const cleanDebt = stripUndefined(debt);

    let debtId: string;
    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      const debtRef = doc(collection(db, `users/${userId}/debts`));
      debtId = debtRef.id;
      const createdAt = new Date();
      let createdTransaction: Transaction | null = null;

      await safeFirestoreOperation(
        () => runTransaction(db, async firestoreTransaction => {
          const transactionData = debt.accountId
            ? {
                type: debt.type === 'lent' ? 'expense' as const : 'income' as const,
                amount: debt.originalAmount,
                category: LOAN_CATEGORY,
                description: debt.type === 'lent'
                  ? `Préstamo a ${debt.personName}`
                  : `Préstamo de ${debt.personName}`,
                date: createdAt,
                paid: true,
                accountId: debt.accountId,
                debtId,
              }
            : null;
          const accountRef = transactionData
            ? doc(db, `users/${userId}/accounts`, transactionData.accountId)
            : null;
          const accountSnapshot = accountRef
            ? await firestoreTransaction.get(accountRef)
            : null;

          if (accountRef && !accountSnapshot?.exists()) {
            throw new Error('La cuenta asociada al préstamo no existe');
          }

          firestoreTransaction.set(debtRef, {
            ...cleanDebt,
            createdAt,
          });

          if (transactionData && accountRef && accountSnapshot) {
            const transactionRef = doc(collection(db, `users/${userId}/transactions`));
            const account = {
              id: transactionData.accountId,
              ...(accountSnapshot.data() as Omit<Account, 'id'>),
            } as Account;
            const deltas = creditDeltasByAccount(transactionData, [account]);

            for (const [accountId, delta] of deltas) {
              const currentUsedCredit = account.usedCredit ?? 0;
              if (currentUsedCredit + delta < -0.01) {
                throw new Error('El movimiento dejaría una deuda negativa en la tarjeta');
              }
              firestoreTransaction.update(
                doc(db, `users/${userId}/accounts`, accountId),
                { usedCredit: increment(delta) }
              );
            }

            const transactionWithMetadata = {
              ...transactionData,
              createdAt,
            };
            firestoreTransaction.set(transactionRef, transactionWithMetadata);
            createdTransaction = {
              id: transactionRef.id,
              ...transactionWithMetadata,
            } as Transaction;
          }
        }),
        'addDebt',
        { maxRetries: 2 }
      );

      if (createdTransaction) {
        publishTransactionCacheMutation({
          userId,
          type: 'update',
          transactions: [createdTransaction],
        });
      }
    } else {
      debtId = generateId();
      const createdAt = new Date();
      if (debt.accountId && addTransaction) {
        const isLent = debt.type === 'lent';
        await addTransaction({
          type: isLent ? 'expense' : 'income',
          amount: debt.originalAmount,
          category: LOAN_CATEGORY,
          description: isLent
            ? `Préstamo a ${debt.personName}`
            : `Préstamo de ${debt.personName}`,
          date: createdAt,
          paid: true,
          accountId: debt.accountId,
          debtId,
        });
      }
      const newDebt: Debt = { ...debt, id: debtId, createdAt };
      setLocalDebts(prev => [newDebt, ...prev]);
    }
  }, [userId, setLocalDebts, addTransaction]);

  const updateDebt = useCallback(async (id: string, updates: Partial<Debt>) => {
    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      const cleanUpdates = stripUndefined(updates);
      const clearablePaymentFields = ['expectedPaymentDay', 'nextPaymentDate'] as const;
      const deletedPaymentFields = Object.fromEntries(
        clearablePaymentFields
          .filter(field => Object.prototype.hasOwnProperty.call(updates, field) && updates[field] === undefined)
          .map(field => [field, deleteField()])
      );

      await safeFirestoreOperation(
        () => updateDoc(doc(db, `users/${userId}/debts`, id), {
          ...cleanUpdates,
          ...deletedPaymentFields,
        }),
        'updateDebt',
        { maxRetries: 2 }
      );
    } else {
      setLocalDebts(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    }
  }, [userId, setLocalDebts]);

  const deleteDebt = useCallback(async (id: string) => {
    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      await safeFirestoreOperation(async () => {
        const operationId = createAccountOperationId('delete-debt');
        let committed = false;

        try {
          await acquireAccountOperationLock(userId, operationId, 'delete-debt');
          // Todas las lecturas vienen del servidor y ocurren después del lease.
          // Las reglas bloquean altas/ediciones concurrentes mientras se prepara
          // el único batch final.
          const txCollection = collection(db, `users/${userId}/transactions`);
          const debtRef = doc(db, `users/${userId}/debts`, id);
          const accountCollection = collection(db, `users/${userId}/accounts`);
          const [linkedSnapshot, debtSnapshot, accountSnapshot] = await Promise.all([
            getDocsFromServer(query(txCollection, where('debtId', '==', id))),
            getDocFromServer(debtRef),
            getDocsFromServer(accountCollection),
          ]);

          if (!debtSnapshot.exists()) {
            throw new Error('La deuda cambió o ya no existe. Actualiza e intenta de nuevo.');
          }

          const serverAccounts = accountSnapshot.docs.map(accountDoc => ({
            id: accountDoc.id,
            ...(accountDoc.data() as Omit<Account, 'id'>),
          } as Account));
          const linkedTransactions = linkedSnapshot.docs.map(transactionDoc => ({
            id: transactionDoc.id,
            ...(transactionDoc.data() as Omit<Transaction, 'id'>),
          } as Transaction));

          const revertByAccount = new Map<string, number>();
          linkedTransactions.forEach(transaction => {
            for (const [accountId, delta] of creditDeltasByAccount(transaction, serverAccounts)) {
              revertByAccount.set(
                accountId,
                (revertByAccount.get(accountId) ?? 0) + delta
              );
            }
          });
          const accountUpdates = Array.from(revertByAccount.entries())
            .filter(([, delta]) => delta !== 0);

          // tx deletes + account updates + debt delete + liberación del lease.
          assertAtomicBatchCapacity(
            'eliminar esta deuda',
            linkedTransactions.length + accountUpdates.length + 2
          );
          await renewAccountOperationLock(userId, operationId, 'delete-debt');

          const batch = writeBatch(db);
          linkedTransactions.forEach(transaction => {
            batch.delete(
              doc(db, `users/${userId}/transactions`, transaction.id!)
            );
          });
          accountUpdates.forEach(([accountId, delta]) => {
            batch.update(
              doc(db, `users/${userId}/accounts`, accountId),
              { usedCredit: increment(-delta) }
            );
          });
          batch.delete(debtRef);
          batch.set(
            doc(db, 'users', userId),
            createAccountOperationRelease(operationId, 'delete-debt'),
            { mergeFields: ['accountOperationLock'] }
          );
          await batch.commit();
          committed = true;

          if (linkedTransactions.length > 0) {
            publishTransactionCacheMutation({
              userId,
              type: 'delete',
              transactionIds: linkedTransactions.map(transaction => transaction.id!),
            });
          }
        } finally {
          if (!committed) {
            await releaseAccountOperationLock(
              userId,
              operationId,
              'delete-debt'
            ).catch(() => undefined);
          }
        }
      }, 'deleteDebt', { maxRetries: 2 });
    } else {
      // Modo invitado (en memoria): borrar transacciones vinculadas + la deuda.
      if (deleteTransaction) {
        const linkedTxIds = transactions.filter(t => t.debtId === id && t.id).map(t => t.id!);
        for (const txId of linkedTxIds) {
          await deleteTransaction(txId);
        }
      }
      setLocalDebts(prev => prev.filter(d => d.id !== id));
    }
  }, [userId, setLocalDebts, deleteTransaction, transactions]);

  const reassignDebtAccount = useCallback(async (debtId: string, nextAccountId?: string) => {
    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      await safeFirestoreOperation(async () => {
        const operationId = createAccountOperationId('reassign-debt-account');
        let committed = false;

        try {
          await acquireAccountOperationLock(userId, operationId, 'reassign-debt-account');
          const debtRef = doc(db, `users/${userId}/debts`, debtId);
          const linkedQuery = query(
            collection(db, `users/${userId}/transactions`),
            where('debtId', '==', debtId)
          );
          const [debtSnapshot, linkedSnapshot, accountSnapshot] = await Promise.all([
            getDocFromServer(debtRef),
            getDocsFromServer(linkedQuery),
            getDocsFromServer(collection(db, `users/${userId}/accounts`)),
          ]);
          if (!debtSnapshot.exists()) {
            throw new Error('El préstamo cambió o ya no existe. Actualiza e intenta de nuevo.');
          }

          const persistedDebt = {
            ...(debtSnapshot.data() as Omit<Debt, 'id'>),
            id: debtId,
          } as Debt;
          const linkedTransactions = linkedSnapshot.docs.map(transactionDoc => ({
            ...(transactionDoc.data() as Omit<Transaction, 'id'>),
            id: transactionDoc.id,
          } as Transaction));
          const serverAccounts = accountSnapshot.docs.map(accountDoc => ({
            ...(accountDoc.data() as Omit<Account, 'id'>),
            id: accountDoc.id,
          } as Account));
          const plan = buildDebtAccountReassignmentPlan(
            persistedDebt,
            linkedTransactions,
            serverAccounts,
            nextAccountId
          );
          const principalWriteCount = plan.principal ? 1 : 0;
          assertAtomicBatchCapacity(
            'cambiar la cuenta de este préstamo',
            1 + principalWriteCount + plan.creditAdjustments.length + 1
          );
          await renewAccountOperationLock(userId, operationId, 'reassign-debt-account');

          const batch = writeBatch(db);
          batch.update(debtRef, {
            accountId: nextAccountId ?? deleteField(),
          });
          if (plan.principal) {
            const principalRef = doc(
              db,
              `users/${userId}/transactions`,
              plan.principal.before.id!
            );
            if (plan.principal.after) {
              batch.update(principalRef, { accountId: plan.principal.after.accountId });
            } else {
              batch.delete(principalRef);
            }
          }
          plan.creditAdjustments.forEach(adjustment => {
            batch.update(
              doc(db, `users/${userId}/accounts`, adjustment.accountId),
              { usedCredit: increment(adjustment.delta) }
            );
          });
          batch.set(
            doc(db, 'users', userId),
            createAccountOperationRelease(operationId, 'reassign-debt-account'),
            { mergeFields: ['accountOperationLock'] }
          );
          await batch.commit();
          committed = true;

          if (plan.principal?.after) {
            publishTransactionCacheMutation({
              userId,
              type: 'update',
              transactions: [plan.principal.after],
            });
          } else if (plan.principal) {
            publishTransactionCacheMutation({
              userId,
              type: 'delete',
              transactionIds: [plan.principal.before.id!],
            });
          }
        } finally {
          if (!committed) {
            await releaseAccountOperationLock(
              userId,
              operationId,
              'reassign-debt-account'
            ).catch(() => undefined);
          }
        }
      }, 'reassignDebtAccount', { maxRetries: 2 });
      return;
    }

    const debt = debts.find(candidate => candidate.id === debtId);
    if (!debt) throw new Error('Préstamo no encontrado');
    const linkedTransactions = transactions.filter(transaction => transaction.debtId === debtId);
    const plan = buildDebtAccountReassignmentPlan(
      debt,
      linkedTransactions,
      operationAccounts,
      nextAccountId
    );

    if (plan.principal?.after) {
      if (!updateTransaction) throw new Error('No se puede actualizar la operación original');
      await updateTransaction(plan.principal.before.id!, { accountId: plan.principal.after.accountId });
    } else if (plan.principal) {
      if (!deleteTransaction) throw new Error('No se puede retirar la operación original');
      await deleteTransaction(plan.principal.before.id!);
    }
    await updateDebt(debtId, { accountId: nextAccountId });
  }, [
    userId,
    debts,
    transactions,
    operationAccounts,
    updateTransaction,
    deleteTransaction,
    updateDebt,
  ]);

  // Register a payment against a debt
  const registerDebtPayment = useCallback(async (debtId: string, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;

    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      let createdTransaction: Transaction | null = null;
      await safeFirestoreOperation(
        () => runTransaction(db, async firestoreTransaction => {
          const debtRef = doc(db, `users/${userId}/debts`, debtId);
          const debtSnapshot = await firestoreTransaction.get(debtRef);
          if (!debtSnapshot.exists()) {
            throw new Error('El préstamo cambió o ya no existe. Actualiza e intenta de nuevo.');
          }

          const persistedDebt = {
            ...(debtSnapshot.data() as Omit<Debt, 'id'>),
            id: debtId,
          } as Debt;
          const effectiveAmount = Math.min(amount, persistedDebt.remainingAmount);
          if (effectiveAmount <= 0 || persistedDebt.isSettled) return;

          const newRemaining = Math.max(0, persistedDebt.remainingAmount - effectiveAmount);
          const isSettled = newRemaining === 0;
          const createdAt = new Date();
          const transactionData = persistedDebt.accountId
            ? {
                type: persistedDebt.type === 'lent' ? 'income' as const : 'expense' as const,
                amount: effectiveAmount,
                category: LOAN_PAYMENT_CATEGORY,
                description: persistedDebt.type === 'lent'
                  ? `Cobro de ${persistedDebt.personName}`
                  : `Pago a ${persistedDebt.personName}`,
                date: createdAt,
                paid: true,
                accountId: persistedDebt.accountId,
                debtId,
              }
            : null;
          const accountRef = transactionData
            ? doc(db, `users/${userId}/accounts`, transactionData.accountId)
            : null;
          const accountSnapshot = accountRef
            ? await firestoreTransaction.get(accountRef)
            : null;

          if (accountRef && !accountSnapshot?.exists()) {
            throw new Error('La cuenta asociada al préstamo no existe');
          }

          firestoreTransaction.update(debtRef, {
            remainingAmount: newRemaining,
            isSettled,
            ...(isSettled ? { settledAt: createdAt } : {}),
          });

          if (transactionData && accountRef && accountSnapshot) {
            const transactionRef = doc(collection(db, `users/${userId}/transactions`));
            const account = {
              id: transactionData.accountId,
              ...(accountSnapshot.data() as Omit<Account, 'id'>),
            } as Account;
            const deltas = creditDeltasByAccount(transactionData, [account]);

            for (const [accountId, delta] of deltas) {
              const currentUsedCredit = account.usedCredit ?? 0;
              if (currentUsedCredit + delta < -0.01) {
                throw new Error('El pago excede la deuda disponible en la tarjeta');
              }
              firestoreTransaction.update(
                doc(db, `users/${userId}/accounts`, accountId),
                { usedCredit: increment(delta) }
              );
            }

            const transactionWithMetadata = {
              ...transactionData,
              createdAt,
            };
            firestoreTransaction.set(transactionRef, transactionWithMetadata);
            createdTransaction = {
              id: transactionRef.id,
              ...transactionWithMetadata,
            } as Transaction;
          }
        }),
        'registerDebtPayment',
        { maxRetries: 2 }
      );

      if (createdTransaction) {
        publishTransactionCacheMutation({
          userId,
          type: 'update',
          transactions: [createdTransaction],
        });
      }
      return;
    }

    const debt = debts.find(d => d.id === debtId);
    if (!debt) return;

    const effectiveAmount = Math.min(amount, debt.remainingAmount);
    const newRemaining = Math.max(0, debt.remainingAmount - effectiveAmount);
    const isSettled = newRemaining === 0;

    if (debt.accountId && addTransaction && effectiveAmount > 0) {
      const isLent = debt.type === 'lent';
      await addTransaction({
        type: isLent ? 'income' : 'expense',
        amount: effectiveAmount,
        category: LOAN_PAYMENT_CATEGORY,
        description: isLent
          ? `Cobro de ${debt.personName}`
          : `Pago a ${debt.personName}`,
        date: new Date(),
        paid: true,
        accountId: debt.accountId,
        debtId,
      });
    }

    await updateDebt(debtId, {
      remainingAmount: newRemaining,
      isSettled,
      ...(isSettled ? { settledAt: new Date() } : {}),
    });
  }, [userId, debts, updateDebt, addTransaction]);

  // Modify debt balance (add or subtract from original amount)
  const modifyDebtBalance = useCallback(async (
    debtId: string,
    amount: number,
    operation: 'add' | 'subtract'
  ) => {
    const debt = debts.find(d => d.id === debtId);
    if (!debt) {
      throw new Error('Préstamo no encontrado');
    }

    if (debt.isSettled) {
      throw new Error('No puedes modificar un préstamo ya saldado');
    }

    // Invariante de dominio: la magnitud a sumar/restar debe ser positiva finita. Sin
    // este guard, un `add` con monto negativo reducía la deuda (y un `subtract` con
    // negativo la aumentaba) sin transacción compensatoria. Audit F-debt-neg.
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('El monto debe ser mayor a cero');
    }

    let newOriginalAmount: number;
    let newRemainingAmount: number;

    if (operation === 'add') {
      newOriginalAmount = debt.originalAmount + amount;
      newRemainingAmount = debt.remainingAmount + amount;
    } else {
      // Subtract
      if (amount > debt.remainingAmount) {
        throw new Error('No puedes restar más del saldo pendiente');
      }
      newOriginalAmount = debt.originalAmount - amount;
      newRemainingAmount = debt.remainingAmount - amount;
    }

    // Check if debt becomes settled
    const isSettled = newRemainingAmount === 0;

    await updateDebt(debtId, {
      originalAmount: newOriginalAmount,
      remainingAmount: newRemainingAmount,
      isSettled,
      ...(isSettled ? { settledAt: new Date() } : {}),
    });
  }, [debts, updateDebt]);

  // Condonar una deuda: marcarla saldada con motivo, SIN mover dinero. El dinero
  // ya se movió al prestar/recibir; condonar solo deja de esperarlo (no revierte
  // saldos ni borra transacciones). Aplica a 'lent' y 'borrowed'.
  const forgiveDebt = useCallback(async (
    debtId: string,
    reason: NonNullable<Debt['forgivenReason']>
  ) => {
    await updateDebt(debtId, {
      remainingAmount: 0,
      isSettled: true,
      settledAt: new Date(),
      forgivenReason: reason,
    });
  }, [updateDebt]);

  // Get transactions linked to a specific debt
  const getDebtTransactions = useCallback((debtId: string): Transaction[] => {
    return transactions.filter(t => t.debtId === debtId);
  }, [transactions]);

  // Stats
  const stats = useMemo(() => {
    const activeDebts = debts.filter(d => !d.isSettled);
    const lent = activeDebts.filter(d => d.type === 'lent');
    const borrowed = activeDebts.filter(d => d.type === 'borrowed');

    return {
      totalLent: lent.reduce((sum, d) => sum + d.remainingAmount, 0),
      totalBorrowed: borrowed.reduce((sum, d) => sum + d.remainingAmount, 0),
      activeLentCount: lent.length,
      activeBorrowedCount: borrowed.length,
      settledCount: debts.filter(d => d.isSettled).length,
      totalCount: debts.length,
    };
  }, [debts]);

  return {
    debts,
    loading,
    addDebt,
    updateDebt,
    deleteDebt,
    reassignDebtAccount,
    registerDebtPayment,
    modifyDebtBalance,
    forgiveDebt,
    getDebtTransactions,
    stats,
  };
}
