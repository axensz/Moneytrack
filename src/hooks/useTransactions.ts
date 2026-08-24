/**
 * 🟡 HOOK REFACTORIZADO: useTransactions
 *
 * CAMBIOS:
 * ❌ Eliminada lógica duplicada de cálculo de estadísticas (líneas 15-42)
 * ✅ Ahora solo maneja operaciones CRUD de transacciones (responsabilidad única)
 * ✅ Las estadísticas se calculan en useGlobalStats (DRY)
 * ✅ Usa localStorage para usuarios no autenticados
 * ✅ Offline gestionado nativamente por Firestore (persistentLocalCache): lectura
 *    offline disponible; las escrituras requieren conexión y fallan con un error
 *    claro (la cola custom anterior escribía a un path denegado y nunca sincronizaba).
 *
 * RESPONSABILIDAD: Gestión de transacciones (CRUD + operaciones)
 */

import { useEffect, useMemo } from 'react';
import { useFirestoreData } from '../contexts/FirestoreContext';
import { useGuestLedger } from './useGuestLedger';
import { generateId } from '../utils/formatters';
import { ensureDate } from '../utils/dateUtils';
import { getAccountReferenceIds } from '../utils/accountTransactions';
import { BalanceCalculator } from '../utils/balanceCalculator';
import { planLedgerMutation } from '../utils/ledgerMutation';
import { logger } from '../utils/logger';
import {
  getTransactionRestorePolicy,
  transactionMatchesRestoreSnapshot,
} from '../utils/transactionRestorePolicy';
import {
  CURRENT_PAYMENT_PAIR_MODEL_VERSION,
  findHistoricalCreditPaymentPairs,
} from '../utils/creditPaymentPairs';
import {
  isRecurringCycleKeyForPayment,
  recurringTransactionSatisfiesCycleKey,
} from '../utils/recurringPayments';
import type { Transaction } from '../types/finance';

const linkedPaymentUpdates = (updates: Partial<Transaction>): Partial<Transaction> => {
  const linked: Partial<Transaction> = {};
  for (const field of ['amount', 'date', 'beneficiary', 'paid'] as const) {
    if (field in updates) Object.assign(linked, { [field]: updates[field] });
  }
  return linked;
};

const safePaymentUpdates = (updates: Partial<Transaction>): Partial<Transaction> => {
  const safe = { ...updates };
  delete safe.type;
  delete safe.accountId;
  delete safe.toAccountId;
  delete safe.linkedTransactionId;
  delete safe.category;
  return safe;
};

/**
 * Orden de la lista de transacciones: fecha descendente y, como DESEMPATE,
 * createdAt descendente (lo recién creado primero).
 *
 * Por qué el desempate: las transacciones se registran con una fecha sin hora
 * (parseDateFromInput → medianoche local), así que todas las del MISMO día
 * comparten timestamp y Firestore las devuelve en orden de doc-id (aparente
 * "desorden"). createdAt (instante real de creación) las ordena de forma
 * estable sin necesidad de un índice compuesto en Firestore —que además
 * excluiría documentos sin createdAt.
 */
export function byDateThenCreatedDesc(a: Transaction, b: Transaction): number {
  const dateDiff = ensureDate(b.date).getTime() - ensureDate(a.date).getTime();
  if (dateDiff !== 0) return dateDiff;
  // Fallback estable: sin createdAt → al final del grupo del día.
  const createdA = a.createdAt ? ensureDate(a.createdAt).getTime() : 0;
  const createdB = b.createdAt ? ensureDate(b.createdAt).getTime() : 0;
  return createdB - createdA;
}

export function useTransactions(userId: string | null) {
  const {
    transactions: firestoreTransactions,
    loading: firestoreLoading,
    addTransaction: firestoreAddTransaction,
    addCreditPaymentAtomic: firestoreAddCreditPaymentAtomic,
    addRecurringTransactionAtomic: firestoreAddRecurringTransactionAtomic,
    linkRecurringTransactionAtomic: firestoreLinkRecurringTransactionAtomic,
    restoreTransaction: firestoreRestoreTransaction,
    deleteTransaction: firestoreDeleteTransaction,
    updateTransaction: firestoreUpdateTransaction
  } = useFirestoreData();

  const {
    transactions: localTransactions,
    mutate: mutateGuestLedger,
  } = useGuestLedger();

  // Los pagos creados antes de linkedTransactionId eran dos movimientos
  // independientes. En invitado se enlazan una vez, solo cuando el par es
  // inequívoco, para que editar/borrar conserve ambos lados sincronizados.
  useEffect(() => {
    if (userId) return;
    void mutateGuestLedger(draft => {
      const pendingAccounts = draft.accounts.filter(account =>
        account.type === 'credit' && account.id &&
        account.paymentPairModelVersion !== CURRENT_PAYMENT_PAIR_MODEL_VERSION
      );
      if (pendingAccounts.length === 0) return;
      const links = new Map<string, string>();
      pendingAccounts.forEach(account => {
        findHistoricalCreditPaymentPairs(account, draft.transactions).forEach(pair => {
          links.set(pair.creditTransactionId, pair.sourceTransactionId);
          links.set(pair.sourceTransactionId, pair.creditTransactionId);
        });
      });
      if (links.size > 0) draft.transactions = draft.transactions.map(transaction => {
        const linkedTransactionId = transaction.id ? links.get(transaction.id) : undefined;
        return linkedTransactionId ? { ...transaction, linkedTransactionId } : transaction;
      });
      draft.accounts = draft.accounts.map(account =>
        pendingAccounts.some(pending => pending.id === account.id)
        ? { ...account, paymentPairModelVersion: CURRENT_PAYMENT_PAIR_MODEL_VERSION }
        : account
      );
    }, { operationId: 'guest-migration:payment-pairs:v1' }).catch(error => {
      logger.error('No se pudo reconciliar el modelo local de pagos de tarjeta', error);
    });
  }, [userId, mutateGuestLedger]);

  // Usar Firebase si hay usuario, localStorage si no.
  // Firestore ya viene ordenado por fecha DESC; reordenamos con el desempate por
  // createdAt para que las transacciones del mismo día no aparezcan en desorden.
  const transactions = useMemo(() => {
    const base = userId ? firestoreTransactions : localTransactions;
    return [...base].sort(byDateThenCreatedDesc);
  }, [userId, firestoreTransactions, localTransactions]);

  const loading = userId ? firestoreLoading : false;

  const addTransaction = async (transaction: Omit<Transaction, 'id' | 'createdAt'>) => {
    if (userId) {
      await firestoreAddTransaction(transaction);
    } else {
      const newTransaction: Transaction = {
        ...transaction,
        id: generateId(),
        createdAt: new Date()
      };
      await mutateGuestLedger(draft => {
        draft.transactions.unshift(newTransaction);
      }, { operationId: newTransaction.operationId ?? `guest-create:${newTransaction.id}` });
    }
  };

  // Pago de TC atómico (par ingreso-a-TC + gasto-en-origen). En modo invitado la
  // versión Firestore hace no-op (if(!userId)return) → el invitado "pagaba" la TC
  // sin que se escribiera nada (pérdida silenciosa). Paridad: crear ambas tx en
  // localStorage. (#tx-1)
  const addCreditPaymentAtomic = async (
    creditTx: Omit<Transaction, 'id' | 'createdAt'>,
    sourceTx: Omit<Transaction, 'id' | 'createdAt'>
  ) => {
    if (userId) {
      await firestoreAddCreditPaymentAtomic(creditTx, sourceTx);
    } else {
      const now = new Date();
      const creditId = generateId();
      const sourceId = generateId();
      const credit: Transaction = {
        ...creditTx, id: creditId, linkedTransactionId: sourceId, createdAt: now,
      };
      const source: Transaction = {
        ...sourceTx, id: sourceId, linkedTransactionId: creditId, createdAt: now,
      };
      await mutateGuestLedger(draft => {
        draft.transactions.unshift(credit, source);
      }, {
        operationId: credit.operationId
          ?? source.operationId
          ?? `guest-credit-payment:${creditId}:${sourceId}`,
      });
    }
  };

  const addRecurringTransactionAtomic = async (
    transaction: Omit<Transaction, 'id' | 'createdAt'>
  ) => {
    if (userId) {
      await firestoreAddRecurringTransactionAtomic(transaction);
      return;
    }
    if (!transaction.recurringPaymentId || !transaction.recurringCycle) {
      throw new Error('El pago periódico requiere una identidad de ciclo.');
    }
    const operationId = `guest-recurring:${transaction.recurringPaymentId}:${transaction.recurringCycle}`;
    const newTransaction: Transaction = {
      ...transaction,
      id: operationId,
      createdAt: new Date(),
      operationId,
      mutationKind: 'recurring-post',
      mutationSource: 'recurring',
    };
    await mutateGuestLedger(draft => {
      const payment = draft.recurringPayments.find(
        candidate => candidate.id === transaction.recurringPaymentId
      );
      if (!payment) throw new Error('El pago periódico ya no existe. Actualiza e intenta de nuevo.');
      if (!isRecurringCycleKeyForPayment(payment, transaction.recurringCycle!)) {
        throw new Error('La identidad del ciclo no corresponde al pago periódico.');
      }
      const duplicate = draft.transactions.find(candidate => (
        recurringTransactionSatisfiesCycleKey(
          payment,
          candidate,
          transaction.recurringCycle!,
        )
      ));
      const committed = duplicate ?? newTransaction;
      if (!duplicate) draft.transactions.unshift(newTransaction);
      draft.recurringPayments = draft.recurringPayments.map(candidate => (
        candidate.id === payment.id
          ? {
              ...candidate,
              lastPaidAmount: committed.amount,
              lastPaidDate: committed.date,
            }
          : candidate
      ));
    }, { operationId });
  };

  const linkRecurringTransactionAtomic = async (
    transactionId: string,
    recurringPaymentId: string,
    recurringCycle: string
  ) => {
    if (userId) {
      await firestoreLinkRecurringTransactionAtomic(
        transactionId,
        recurringPaymentId,
        recurringCycle
      );
      return;
    }
    await mutateGuestLedger(draft => {
      const payment = draft.recurringPayments.find(candidate => candidate.id === recurringPaymentId);
      if (!payment) throw new Error('El pago periódico ya no existe. Actualiza e intenta de nuevo.');
      if (!isRecurringCycleKeyForPayment(payment, recurringCycle)) {
        throw new Error('La identidad del ciclo no corresponde al pago periódico.');
      }
      const existing = draft.transactions.find(candidate => candidate.id === transactionId);
      if (!existing) throw new Error('La transacción ya no existe. Actualiza e intenta de nuevo.');
      if (existing.type !== 'expense' || existing.paid !== true) {
        throw new Error('Solo un gasto pagado puede vincularse a un ciclo periódico.');
      }
      if (existing.recurringPaymentId && existing.recurringPaymentId !== recurringPaymentId) {
        throw new Error('La transacción ya pertenece a otro pago periódico.');
      }
      const duplicate = draft.transactions.find(candidate => (
        candidate.id !== transactionId
        && recurringTransactionSatisfiesCycleKey(payment, candidate, recurringCycle)
      ));
      if (duplicate) throw new Error('Este ciclo ya tiene un pago registrado.');
      const operationId = `guest-recurring:${recurringPaymentId}:${recurringCycle}`;
      const linked: Transaction = {
        ...existing,
        recurringPaymentId,
        recurringCycle,
        operationId,
        mutationKind: 'recurring-post',
        mutationSource: 'recurring',
      };
      draft.transactions = draft.transactions.map(candidate => (
        candidate.id === transactionId ? linked : candidate
      ));
      draft.recurringPayments = draft.recurringPayments.map(candidate => (
        candidate.id === recurringPaymentId
          ? {
              ...candidate,
              lastPaidAmount: linked.amount,
              lastPaidDate: linked.date,
            }
          : candidate
      ));
    }, { operationId: `guest-recurring:${recurringPaymentId}:${recurringCycle}` });
  };

  const restoreTransaction = async (transaction: Transaction) => {
    if (userId) {
      await firestoreRestoreTransaction(transaction);
      return;
    }

    const transactionId = transaction.id!;
    await mutateGuestLedger(draft => {
      const policy = getTransactionRestorePolicy(transaction, draft.accounts);
      if (!policy.allowed) throw new Error(policy.reason);
      const existing = draft.transactions.find(candidate => candidate.id === transactionId);
      if (existing) {
        if (transactionMatchesRestoreSnapshot(existing, transaction)) return;
        throw new Error('La identidad original ya pertenece a otra transacción.');
      }

      const account = draft.accounts.find(candidate => (
        getAccountReferenceIds(candidate).includes(transaction.accountId)
      ));
      if (!account?.id) {
        throw new Error('No se pudo validar la cuenta de la transacción eliminada.');
      }
      const restored: Transaction = {
        ...transaction,
        id: transactionId,
        accountId: account.id,
        createdAt: transaction.createdAt ?? new Date(),
        mutationKind: 'restore',
        mutationSource: 'undo',
      };
      planLedgerMutation(
        {
          kind: 'restore',
          before: [],
          after: [restored],
          metadata: { mutationSource: 'undo' },
        },
        [{
          account: { id: account.id, type: account.type },
          currentBalance: BalanceCalculator.calculateAccountBalance(account, draft.transactions),
        }]
      );
      draft.transactions.unshift(restored);
    }, { operationId: `guest-undo:${transactionId}:restore:${generateId()}` });
  };

  const deleteTransaction = async (id: string) => {
    if (userId) {
      return firestoreDeleteTransaction(id);
    }
    let deleted: Transaction | null = null;
    await mutateGuestLedger(draft => {
      const current = draft.transactions.find(candidate => candidate.id === id);
      if (!current) return;
      deleted = current;
      const ids = new Set([id, current.linkedTransactionId].filter(Boolean));
      draft.transactions = draft.transactions.filter(candidate => (
        !candidate.id || !ids.has(candidate.id)
      ));
    }, { operationId: `guest-delete:${id}:${generateId()}` });
    return deleted;
  };

  const togglePaid = async (id: string) => {
    const transaction = transactions.find(t => t.id === id);
    if (transaction) {
      if (userId) {
        await firestoreUpdateTransaction(id, { paid: !transaction.paid });
      } else {
        await mutateGuestLedger(draft => {
          const current = draft.transactions.find(candidate => candidate.id === id);
          if (!current) return;
          draft.transactions = draft.transactions.map(item => (
            item.id === id || item.id === current.linkedTransactionId
              ? { ...item, paid: !current.paid }
              : item
          ));
        }, { operationId: `guest-toggle-paid:${id}:${!transaction.paid}:${generateId()}` });
      }
    }
  };

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    if (userId) {
      await firestoreUpdateTransaction(id, updates);
    } else {
      await mutateGuestLedger(draft => {
        const transaction = draft.transactions.find(t => t.id === id);
        if (!transaction?.linkedTransactionId) {
          draft.transactions = draft.transactions.map(t => t.id === id ? { ...t, ...updates } : t);
          return;
        }

        const safeUpdates = safePaymentUpdates(updates);
        const linkedUpdates = linkedPaymentUpdates(safeUpdates);
        draft.transactions = draft.transactions.map(t => {
          if (t.id === id) return { ...t, ...safeUpdates };
          if (t.id === transaction.linkedTransactionId) return { ...t, ...linkedUpdates };
          return t;
        });
      }, { operationId: `guest-update:${id}:${generateId()}` });
    }
  };

  return {
    transactions,
    loading,
    addTransaction,
    addCreditPaymentAtomic,
    addRecurringTransactionAtomic,
    linkRecurringTransactionAtomic,
    restoreTransaction,
    deleteTransaction,
    togglePaid,
    updateTransaction
  };
}
