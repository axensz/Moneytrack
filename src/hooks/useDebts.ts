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
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc, getDocs, where, runTransaction, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useLocalStorage } from './useLocalStorage';
import { logger } from '../utils/logger';
import { safeFirestoreOperation, checkNetworkConnection } from '../utils/firestoreHelpers';
import { generateId } from '../utils/formatters';
import { creditDeltasByAccount } from '../utils/creditDeltas';
import { LOAN_CATEGORY, LOAN_PAYMENT_CATEGORY } from '../config/constants';
import type { Debt, Transaction, Account } from '../types/finance';

interface DebtTransactionOps {
  addTransaction?: (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
  deleteTransaction?: (id: string) => Promise<void>;
}

export function useDebts(
  userId: string | null,
  transactions: Transaction[],
  externalDebts?: Debt[],
  txOps: DebtTransactionOps = {},
  accounts: Account[] = []
) {
  const { addTransaction, deleteTransaction } = txOps;
  // Firestore state
  const [firestoreDebts, setFirestoreDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);

  // LocalStorage for guest mode
  const [localDebts, setLocalDebts] = useLocalStorage<Debt[]>('debts', []);

  // Firestore subscription — skip if data provided externally (centralized)
  useEffect(() => {
    if (externalDebts !== undefined) {
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
  }, [userId, externalDebts !== undefined]);

  const debts = externalDebts ?? (userId ? firestoreDebts : localDebts);

  // CRUD Operations
  const addDebt = useCallback(async (debt: Omit<Debt, 'id' | 'createdAt'>) => {
    // Limpiar campos undefined antes de enviar a Firestore
    const cleanDebt = Object.fromEntries(
      Object.entries(debt).filter(([, v]) => v !== undefined)
    );

    let debtId: string;
    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      const ref = await safeFirestoreOperation(
        () => addDoc(collection(db, `users/${userId}/debts`), {
          ...cleanDebt,
          createdAt: new Date(),
        }),
        'addDebt',
        { maxRetries: 2 }
      );
      debtId = ref.id;
    } else {
      debtId = generateId();
      const newDebt: Debt = { ...debt, id: debtId, createdAt: new Date() };
      setLocalDebts(prev => [newDebt, ...prev]);
    }

    // Mover el dinero si hay una cuenta asociada:
    // prestar → gasto (sale el dinero); pedir prestado → ingreso (entra el dinero)
    if (debt.accountId && addTransaction) {
      const isLent = debt.type === 'lent';
      await addTransaction({
        type: isLent ? 'expense' : 'income',
        amount: debt.originalAmount,
        category: LOAN_CATEGORY,
        description: isLent
          ? `Préstamo a ${debt.personName}`
          : `Préstamo de ${debt.personName}`,
        date: new Date(),
        paid: true,
        accountId: debt.accountId,
        debtId,
      });
    }
  }, [userId, setLocalDebts, addTransaction]);

  const updateDebt = useCallback(async (id: string, updates: Partial<Debt>) => {
    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined)
      );

      await safeFirestoreOperation(
        () => updateDoc(doc(db, `users/${userId}/debts`, id), cleanUpdates),
        'updateDebt',
        { maxRetries: 2 }
      );
    } else {
      setLocalDebts(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    }
  }, [userId, setLocalDebts]);

  // Nº máximo de transacciones vinculadas que se borran ATÓMICAMENTE en una sola
  // runTransaction (Firestore limita a ~500 ops por transacción: borrados + updates
  // de usedCredit + el borrado de la deuda). Por encima, se cae a la ruta secuencial
  // (cada deleteTransaction es atómica por sí misma). Préstamos reales tienen pocas.
  const ATOMIC_DELETE_LIMIT = 400;

  const deleteDebt = useCallback(async (id: string) => {
    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      // #11: consultar Firestore por TODAS las transacciones del préstamo (el array en
      // memoria está paginado). runTransaction NO permite queries, así que obtenemos
      // los ids fuera y luego operamos sobre refs concretas dentro de la transacción.
      const txCollection = collection(db, `users/${userId}/transactions`);
      const snap = await getDocs(query(txCollection, where('debtId', '==', id)));
      const linkedTxIds = snap.docs.map(d => d.id);
      const debtRef = doc(db, `users/${userId}/debts`, id);

      // Préstamo con demasiadas transacciones para una sola transacción atómica:
      // caer a la ruta secuencial (cada deleteTransaction revierte usedCredit de forma
      // atómica e idempotente). La deuda se borra al final.
      if (linkedTxIds.length > ATOMIC_DELETE_LIMIT) {
        if (deleteTransaction) {
          for (const txId of linkedTxIds) {
            await deleteTransaction(txId);
          }
        }
        await safeFirestoreOperation(() => deleteDoc(debtRef), 'deleteDebt', { maxRetries: 2 });
        return;
      }

      // F-debt-cascade: borrado ATÓMICO. Borra todas las transacciones vinculadas,
      // revierte usedCredit de las TC afectadas y borra la deuda en UNA runTransaction.
      // Un fallo a mitad no aplica nada → nunca quedan deuda o transacciones huérfanas
      // ni saldos/usedCredit desincronizados (antes era una secuencia no atómica).
      await safeFirestoreOperation(
        () => runTransaction(db, async (firestoreTransaction) => {
          const txRefs = linkedTxIds.map(txId => doc(db, `users/${userId}/transactions`, txId));

          // LECTURAS primero (requisito de Firestore).
          const txSnaps = await Promise.all(txRefs.map(ref => firestoreTransaction.get(ref)));

          // Acumular el delta de usedCredit a revertir por cada TC afectada.
          const revertByAccount = new Map<string, number>();
          txSnaps.forEach(s => {
            if (!s.exists()) return;
            const txData = { id: s.id, ...s.data() } as Transaction;
            for (const [accId, delta] of creditDeltasByAccount(txData, accounts)) {
              revertByAccount.set(accId, (revertByAccount.get(accId) ?? 0) + delta);
            }
          });

          const accountIds = Array.from(revertByAccount.keys());
          const accountRefs = accountIds.map(accId => doc(db, `users/${userId}/accounts`, accId));
          const accountSnaps = await Promise.all(accountRefs.map(ref => firestoreTransaction.get(ref)));

          // ESCRITURAS después.
          txRefs.forEach(ref => firestoreTransaction.delete(ref));
          accountIds.forEach((accId, i) => {
            const delta = revertByAccount.get(accId) ?? 0;
            if (accountSnaps[i].exists() && delta !== 0) {
              firestoreTransaction.update(accountRefs[i], { usedCredit: increment(-delta) });
            }
          });
          firestoreTransaction.delete(debtRef);
        }),
        'deleteDebt',
        { maxRetries: 2 }
      );
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
  }, [userId, setLocalDebts, deleteTransaction, transactions, accounts]);

  // Register a payment against a debt
  const registerDebtPayment = useCallback(async (debtId: string, amount: number) => {
    const debt = debts.find(d => d.id === debtId);
    if (!debt) return;

    // Invariante de dominio: un pago debe ser un monto positivo finito. Sin este
    // guard, un monto <= 0 (p. ej. desde una acción de IA o llamada programática; la
    // UI ya lo bloquea) hacía effectiveAmount negativo → AUMENTABA la deuda sin una
    // transacción compensatoria. Audit F-debt-neg.
    if (!Number.isFinite(amount) || amount <= 0) return;

    // #24: Clampar el monto efectivo a lo que la deuda justifica ANTES de mover
    // dinero. Sobrepagar (amount > remainingAmount) antes solo clampaba la deuda a 0
    // con Math.max, pero posteaba el `amount` crudo a la cuenta, moviendo más dinero
    // del que la deuda respalda. Usamos el monto efectivo tanto para la transacción
    // como para reducir el saldo, manteniendo ambos consistentes.
    const effectiveAmount = Math.min(amount, debt.remainingAmount);
    const newRemaining = Math.max(0, debt.remainingAmount - effectiveAmount);
    const isSettled = newRemaining === 0;

    // Mover el dinero si hay cuenta asociada:
    // cobrar un préstamo (lent) → ingreso; pagar una deuda (borrowed) → gasto
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
  }, [debts, updateDebt, addTransaction]);

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
    registerDebtPayment,
    modifyDebtBalance,
    getDebtTransactions,
    stats,
  };
}
