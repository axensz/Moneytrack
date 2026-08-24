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
import { useLocalStorage } from './useLocalStorage';
import { generateId } from '../utils/formatters';
import { ensureDate } from '../utils/dateUtils';
import { getAccountReferenceIds } from '../utils/accountTransactions';
import { reconcileUsedCredit } from '../utils/creditDeltas';
import { BalanceCalculator } from '../utils/balanceCalculator';
import { planLedgerMutation } from '../utils/ledgerMutation';
import {
  getTransactionRestorePolicy,
  transactionMatchesRestoreSnapshot,
} from '../utils/transactionRestorePolicy';
import {
  CURRENT_PAYMENT_PAIR_MODEL_VERSION,
  findHistoricalCreditPaymentPairs,
} from '../utils/creditPaymentPairs';
import type { Account, Transaction } from '../types/finance';

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

  const [localTransactions, setLocalTransactions] = useLocalStorage<Transaction[]>('transactions', []);
  const [localAccounts, setLocalAccounts] = useLocalStorage<Account[]>('accounts', []);

  // Los pagos creados antes de linkedTransactionId eran dos movimientos
  // independientes. En invitado se enlazan una vez, solo cuando el par es
  // inequívoco, para que editar/borrar conserve ambos lados sincronizados.
  useEffect(() => {
    if (userId) return;
    const pendingAccounts = localAccounts.filter(account =>
      account.type === 'credit' && account.id &&
      account.paymentPairModelVersion !== CURRENT_PAYMENT_PAIR_MODEL_VERSION
    );
    if (pendingAccounts.length === 0) return;

    setLocalTransactions(previous => {
      const links = new Map<string, string>();
      pendingAccounts.forEach(account => {
        findHistoricalCreditPaymentPairs(account, previous).forEach(pair => {
          links.set(pair.creditTransactionId, pair.sourceTransactionId);
          links.set(pair.sourceTransactionId, pair.creditTransactionId);
        });
      });
      if (links.size === 0) return previous;
      return previous.map(transaction => {
        const linkedTransactionId = transaction.id ? links.get(transaction.id) : undefined;
        return linkedTransactionId ? { ...transaction, linkedTransactionId } : transaction;
      });
    });
    setLocalAccounts(previous => previous.map(account =>
      pendingAccounts.some(pending => pending.id === account.id)
        ? { ...account, paymentPairModelVersion: CURRENT_PAYMENT_PAIR_MODEL_VERSION }
        : account
    ));
  }, [userId, localAccounts, setLocalAccounts, setLocalTransactions]);

  // En invitado no existe el trigger atómico de Firestore: reconciliar el campo
  // persistido desde el historial local evita que un usedCredit inicial/mergeado
  // quede congelado después de altas, ediciones o borrados.
  useEffect(() => {
    if (userId) return;
    setLocalAccounts(previous => {
      let changed = false;
      const next = previous.map(account => {
        if (account.type !== 'credit' || !account.id) return account;
        const usedCredit = reconcileUsedCredit(getAccountReferenceIds(account), localTransactions);
        if (account.usedCredit === usedCredit) return account;
        changed = true;
        return { ...account, usedCredit };
      });
      return changed ? next : previous;
    });
  }, [userId, localTransactions, setLocalAccounts]);

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
      setLocalTransactions(prev => [newTransaction, ...prev]);
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
      setLocalTransactions(prev => [credit, source, ...prev]);
    }
  };

  const addRecurringTransactionAtomic = async (
    transaction: Omit<Transaction, 'id' | 'createdAt'>
  ) => {
    if (userId) {
      await firestoreAddRecurringTransactionAtomic(transaction);
      return;
    }
    const newTransaction: Transaction = {
      ...transaction,
      id: generateId(),
      createdAt: new Date(),
      mutationKind: 'recurring-post',
      mutationSource: 'recurring',
    };
    setLocalTransactions(previous => [newTransaction, ...previous]);
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
    setLocalTransactions(previous => previous.map(transaction => (
      transaction.id === transactionId
        ? {
            ...transaction,
            recurringPaymentId,
            recurringCycle,
            mutationKind: 'recurring-post',
            mutationSource: 'recurring',
          }
        : transaction
    )));
  };

  const restoreTransaction = async (transaction: Transaction) => {
    if (userId) {
      await firestoreRestoreTransaction(transaction);
      return;
    }

    const policy = getTransactionRestorePolicy(transaction, localAccounts);
    if (!policy.allowed) throw new Error(policy.reason);

    const transactionId = transaction.id!;
    const existing = localTransactions.find(candidate => candidate.id === transactionId);
    if (existing) {
      if (transactionMatchesRestoreSnapshot(existing, transaction)) return;
      throw new Error('La identidad original ya pertenece a otra transacción.');
    }

    const account = localAccounts.find(candidate => (
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
        currentBalance: BalanceCalculator.calculateAccountBalance(account, localTransactions),
      }]
    );

    setLocalTransactions(previous => {
      const concurrent = previous.find(candidate => candidate.id === transactionId);
      if (!concurrent) return [restored, ...previous];
      if (transactionMatchesRestoreSnapshot(concurrent, transaction)) return previous;
      throw new Error('La identidad original ya pertenece a otra transacción.');
    });
  };

  const deleteTransaction = async (id: string) => {
    if (userId) {
      return firestoreDeleteTransaction(id);
    }
    const transaction = localTransactions.find(candidate => candidate.id === id);
    if (!transaction) return null;
    setLocalTransactions(prev => {
      const current = prev.find(candidate => candidate.id === id);
      const ids = new Set([id, current?.linkedTransactionId].filter(Boolean));
      return prev.filter(candidate => !candidate.id || !ids.has(candidate.id));
    });
    return transaction;
  };

  const togglePaid = async (id: string) => {
    const transaction = transactions.find(t => t.id === id);
    if (transaction) {
      if (userId) {
        await firestoreUpdateTransaction(id, { paid: !transaction.paid });
      } else {
        setLocalTransactions(prev => prev.map(t => (
          t.id === id || t.id === transaction.linkedTransactionId
            ? { ...t, paid: !transaction.paid }
            : t
        )));
      }
    }
  };

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    if (userId) {
      await firestoreUpdateTransaction(id, updates);
    } else {
      setLocalTransactions(prev => {
        const transaction = prev.find(t => t.id === id);
        if (!transaction?.linkedTransactionId) {
          return prev.map(t => t.id === id ? { ...t, ...updates } : t);
        }

        const safeUpdates = safePaymentUpdates(updates);
        const linkedUpdates = linkedPaymentUpdates(safeUpdates);
        return prev.map(t => {
          if (t.id === id) return { ...t, ...safeUpdates };
          if (t.id === transaction.linkedTransactionId) return { ...t, ...linkedUpdates };
          return t;
        });
      });
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
