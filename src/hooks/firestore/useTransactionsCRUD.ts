/**
 * Hook para operaciones CRUD de transacciones
 * Incluye lógica de transferencias atómicas
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  runTransaction,
  increment,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { TRANSFER_CATEGORY } from '../../config/constants';
import type { Transaction, Account } from '../../types/finance';
import { safeFirestoreOperation, isOffline } from '../../utils/firestoreHelpers';
import { findAccountForTransaction } from '../../utils/accountTransactions';
import { logger } from '../../utils/logger';

type CreditEffect = { type: string; amount: number; accountId: string; toAccountId?: string };

// Las escrituras de transacciones requieren conexión: las que ajustan usedCredit
// usan runTransaction (no funciona offline) y queremos evitar estados optimistas
// inconsistentes que descuadren balances. Offline → error claro (sin toast aquí;
// lo muestra el caller). La lectura offline sigue disponible vía persistentLocalCache.
const OFFLINE_WRITE_ERROR = 'Sin conexión a internet. Conéctate para guardar los cambios.';

/**
 * Calcula el delta de usedCredit que una transacción aporta a una cuenta TC.
 * Positivo = aumenta deuda, Negativo = reduce deuda.
 *
 * Modelo de negocio: una compra ocupa el cupo por su monto completo (también las
 * compras a cuotas); el cupo se libera con cada pago, no por cuota vencida.
 */
function getCreditDelta(tx: CreditEffect, accountId: string): number {
  if (tx.type === 'expense' && tx.accountId === accountId) return tx.amount;
  if (tx.type === 'income' && tx.accountId === accountId) return -tx.amount;
  if (tx.type === 'transfer' && tx.toAccountId === accountId) return -tx.amount;
  return 0;
}

/**
 * Devuelve el efecto de una transacción sobre el usedCredit, agrupado por id de
 * cuenta — SOLO para cuentas de tipo crédito. Esto evita escribir un campo
 * `usedCredit` espurio en cuentas de ahorro/efectivo y cubre tanto la cuenta
 * origen (gasto/ingreso) como la destino (transferencia hacia una TC).
 */
function creditDeltasByAccount(tx: CreditEffect, accounts: Account[]): Map<string, number> {
  const deltas = new Map<string, number>();
  const addEffect = (accountId: string | undefined, delta: number) => {
    if (!accountId || delta === 0) return;
    const account = findAccountForTransaction(accounts, accountId);
    if (!account || account.type !== 'credit' || !account.id) return;
    deltas.set(account.id, (deltas.get(account.id) ?? 0) + delta);
  };

  if (tx.type === 'expense') addEffect(tx.accountId, tx.amount);
  else if (tx.type === 'income') addEffect(tx.accountId, -tx.amount);
  else if (tx.type === 'transfer') addEffect(tx.toAccountId, -tx.amount);

  return deltas;
}

/**
 * Interfaces para validación de transacciones
 */
interface ValidationError {
  field: string;
  message: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Valida los campos de una actualización de transacción
 * Verifica que todos los campos presentes sean válidos
 */
function validateTransactionUpdate(updates: Partial<Transaction>): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate amount if present
  if ('amount' in updates) {
    if (updates.amount === undefined || updates.amount === null) {
      errors.push({ field: 'amount', message: 'El monto es requerido' });
    } else if (typeof updates.amount !== 'number' || isNaN(updates.amount)) {
      errors.push({ field: 'amount', message: 'El monto debe ser un número válido' });
    } else if (updates.amount <= 0) {
      errors.push({ field: 'amount', message: 'El monto debe ser mayor a 0' });
    }
  }

  // Validate description if present
  if ('description' in updates) {
    if (updates.description === undefined || updates.description === null) {
      errors.push({ field: 'description', message: 'La descripción es requerida' });
    } else if (typeof updates.description !== 'string') {
      errors.push({ field: 'description', message: 'La descripción debe ser texto' });
    } else if (updates.description.trim() === '') {
      errors.push({ field: 'description', message: 'La descripción no puede estar vacía' });
    }
  }

  // Validate date if present
  if ('date' in updates) {
    if (updates.date === undefined || updates.date === null) {
      errors.push({ field: 'date', message: 'La fecha es requerida' });
    } else if (!(updates.date instanceof Date)) {
      errors.push({ field: 'date', message: 'La fecha debe ser un objeto Date válido' });
    } else if (isNaN(updates.date.getTime())) {
      errors.push({ field: 'date', message: 'La fecha no es válida' });
    }
  }

  // Validate category if present
  if ('category' in updates) {
    if (updates.category === undefined || updates.category === null) {
      errors.push({ field: 'category', message: 'La categoría es requerida' });
    } else if (typeof updates.category !== 'string') {
      errors.push({ field: 'category', message: 'La categoría debe ser texto' });
    } else if (updates.category.trim() === '') {
      errors.push({ field: 'category', message: 'La categoría no puede estar vacía' });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Valida el esquema básico de una transacción antes de guardar
 * Última línea de defensa - la validación principal ocurre en useAddTransaction
 */
function validateTransactionSchema(
  transaction: Omit<Transaction, 'id' | 'createdAt'>
): void {
  if (!transaction.type || !['income', 'expense', 'transfer'].includes(transaction.type)) {
    throw new Error('Tipo de transacción inválido');
  }

  if (typeof transaction.amount !== 'number' || isNaN(transaction.amount) || transaction.amount <= 0) {
    throw new Error('Monto de transacción inválido');
  }

  if (!transaction.accountId || typeof transaction.accountId !== 'string') {
    throw new Error('ID de cuenta inválido');
  }

  if (transaction.type === 'transfer' && !transaction.toAccountId) {
    throw new Error('Transferencia requiere cuenta destino');
  }
}

interface UseTransactionsCRUDReturn {
  addTransaction: (
    transaction: Omit<Transaction, 'id' | 'createdAt'>
  ) => Promise<void>;
  addCreditPaymentAtomic: (
    creditTx: Omit<Transaction, 'id' | 'createdAt'>,
    sourceTx: Omit<Transaction, 'id' | 'createdAt'>
  ) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  updateTransaction: (
    id: string,
    updates: Partial<Transaction>
  ) => Promise<void>;
}

/**
 * Hook para CRUD de transacciones
 */
export function useTransactionsCRUD(
  userId: string | null,
  accounts: Account[] = []
): UseTransactionsCRUDReturn {
  // Ref para leer las cuentas dentro de los callbacks sin recrear sus identidades
  // en cada cambio de la suscripción (evita re-renders/efectos en cascada).
  const accountsRef = useRef(accounts);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  /**
   * Transferencia atómica con Firebase Transaction
   */
  const addTransferAtomic = useCallback(
    async (
      uid: string,
      transaction: Omit<Transaction, 'id' | 'createdAt'>
    ): Promise<void> => {
      const { accountId, toAccountId, amount, description, date } = transaction;

      if (!accountId || !toAccountId) {
        throw new Error(
          'Se requieren cuenta origen y destino para transferencias'
        );
      }

      if (accountId === toAccountId) {
        throw new Error('No puedes transferir a la misma cuenta');
      }

      await runTransaction(db, async (firestoreTransaction) => {
        // Referencias a documentos
        const fromAccountRef = doc(db, `users/${uid}/accounts`, accountId);
        const toAccountRef = doc(db, `users/${uid}/accounts`, toAccountId);

        // Leer ambas cuentas
        const fromAccountSnap = await firestoreTransaction.get(fromAccountRef);
        const toAccountSnap = await firestoreTransaction.get(toAccountRef);

        // Validar existencia
        if (!fromAccountSnap.exists()) {
          throw new Error('La cuenta origen no existe');
        }
        if (!toAccountSnap.exists()) {
          throw new Error('La cuenta destino no existe');
        }

        // Crear documento de transacción
        const transactionRef = doc(
          collection(db, `users/${uid}/transactions`)
        );
        firestoreTransaction.set(transactionRef, {
          type: 'transfer',
          amount,
          accountId,
          toAccountId,
          category: TRANSFER_CATEGORY,
          description: description || 'Transferencia entre cuentas',
          date: date || new Date(),
          paid: true,
          createdAt: new Date(),
        });

        // Actualizar usedCredit en cuentas TC afectadas
        const toAccountData = toAccountSnap.data() as Account;
        if (toAccountData.type === 'credit') {
          firestoreTransaction.update(toAccountRef, { usedCredit: increment(-amount) });
        }
        const fromAccountData = fromAccountSnap.data() as Account;
        if (fromAccountData.type === 'credit') {
          // Transferir DESDE una TC (raro, pero posible) — no afecta usedCredit
          // ya que usedCredit solo cuenta expenses/incomes/transfersIn
        }
      });
    },
    []
  );

  /**
   * AUDIT-FIX: Pago de crédito atómico — crea ambas transacciones en una sola operación
   * (ingreso al crédito + gasto de la cuenta origen)
   */
  const addCreditPaymentAtomic = useCallback(
    async (
      creditTx: Omit<Transaction, 'id' | 'createdAt'>,
      sourceTx: Omit<Transaction, 'id' | 'createdAt'>
    ): Promise<void> => {
      if (!userId) return;
      if (isOffline()) throw new Error(OFFLINE_WRITE_ERROR);

      validateTransactionSchema(creditTx);
      validateTransactionSchema(sourceTx);

      await runTransaction(db, async (firestoreTransaction) => {
        // Verificar que ambas cuentas existan
        const creditAccountRef = doc(db, `users/${userId}/accounts`, creditTx.accountId);
        const sourceAccountRef = doc(db, `users/${userId}/accounts`, sourceTx.accountId);

        const creditSnap = await firestoreTransaction.get(creditAccountRef);
        const sourceSnap = await firestoreTransaction.get(sourceAccountRef);

        if (!creditSnap.exists()) throw new Error('La cuenta de crédito no existe');
        if (!sourceSnap.exists()) throw new Error('La cuenta origen no existe');

        // Crear ambas transacciones atómicamente
        const creditTxRef = doc(collection(db, `users/${userId}/transactions`));
        const sourceTxRef = doc(collection(db, `users/${userId}/transactions`));

        const cleanCredit = Object.fromEntries(
          Object.entries(creditTx).filter(([, v]) => v !== undefined)
        );
        const cleanSource = Object.fromEntries(
          Object.entries(sourceTx).filter(([, v]) => v !== undefined)
        );

        firestoreTransaction.set(creditTxRef, { ...cleanCredit, createdAt: new Date() });
        firestoreTransaction.set(sourceTxRef, { ...cleanSource, createdAt: new Date() });

        // Actualizar usedCredit en la TC (el creditTx es un ingreso que reduce deuda)
        const creditDelta = getCreditDelta(creditTx, creditTx.accountId);
        if (creditDelta !== 0) {
          firestoreTransaction.update(creditAccountRef, { usedCredit: increment(creditDelta) });
        }
      });
    },
    [userId]
  );

  /**
   * Agregar transacción (gasto, ingreso o transferencia)
   */
  const addTransaction = useCallback(
    async (transaction: Omit<Transaction, 'id' | 'createdAt'>) => {
      if (!userId) return;
      if (isOffline()) throw new Error(OFFLINE_WRITE_ERROR);

      // Validación de esquema como última línea de defensa
      validateTransactionSchema(transaction);

      // Transferencias usan atomicidad
      if (transaction.type === 'transfer' && transaction.toAccountId) {
        await addTransferAtomic(userId, transaction);
        return;
      }

      // Gasto/Ingreso
      const cleanTransaction = Object.fromEntries(
        Object.entries(transaction).filter(([, value]) => value !== undefined)
      );

      const deltas = creditDeltasByAccount(transaction, accountsRef.current);

      // Si no afecta ninguna TC, basta una escritura simple
      if (deltas.size === 0) {
        await addDoc(collection(db, `users/${userId}/transactions`), {
          ...cleanTransaction,
          createdAt: new Date(),
        });
        return;
      }

      // Afecta una TC: crear la transacción y ajustar usedCredit ATÓMICAMENTE,
      // para que nunca queden desincronizados si una de las dos escrituras falla.
      await runTransaction(db, async (firestoreTransaction) => {
        // Lecturas primero (requisito de Firestore): validar que las TC existan
        const accountRefs = Array.from(deltas.keys()).map(accountId =>
          doc(db, `users/${userId}/accounts`, accountId)
        );
        const snaps = await Promise.all(
          accountRefs.map(ref => firestoreTransaction.get(ref))
        );
        snaps.forEach(snap => {
          if (!snap.exists()) throw new Error('La cuenta de la transacción no existe');
        });

        const txRef = doc(collection(db, `users/${userId}/transactions`));
        firestoreTransaction.set(txRef, { ...cleanTransaction, createdAt: new Date() });

        for (const [accountId, delta] of deltas) {
          firestoreTransaction.update(doc(db, `users/${userId}/accounts`, accountId), {
            usedCredit: increment(delta),
          });
        }
      });
    },
    [userId, addTransferAtomic]
  );

  const deleteTransaction = useCallback(
    async (id: string) => {
      if (!userId) return;
      if (isOffline()) throw new Error(OFFLINE_WRITE_ERROR);

      // Leer la transacción antes de eliminarla para revertir usedCredit
      const txRef = doc(db, `users/${userId}/transactions`, id);
      const txSnap = await getDoc(txRef);
      const txData = txSnap.exists() ? txSnap.data() as Transaction : null;

      await safeFirestoreOperation(
        () => deleteDoc(txRef),
        'deleteTransaction',
        { maxRetries: 2 }
      );

      // Revertir usedCredit en las TC afectadas (origen y/o destino)
      if (txData) {
        const deltas = creditDeltasByAccount(txData, accountsRef.current);
        for (const [accountId, delta] of deltas) {
          await updateDoc(doc(db, `users/${userId}/accounts`, accountId), {
            usedCredit: increment(-delta),
          });
        }
      }
    },
    [userId]
  );

  const updateTransaction = useCallback(
    async (id: string, updates: Partial<Transaction>) => {
      if (!userId) return;
      if (isOffline()) throw new Error(OFFLINE_WRITE_ERROR);

      // Validate updates
      const validation = validateTransactionUpdate(updates);
      if (!validation.isValid) {
        const errorMessage = validation.errors.map(e => e.message).join(', ');
        throw new Error(`Validación fallida: ${errorMessage}`);
      }

      // Filter undefined values
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, value]) => value !== undefined)
      );

      try {
        // Read old transaction to compute delta change
        const txRef = doc(db, `users/${userId}/transactions`, id);
        const txSnap = await getDoc(txRef);
        const oldData = txSnap.exists() ? txSnap.data() as Transaction : null;

        // Update in Firestore with retry logic
        await safeFirestoreOperation(
          () => updateDoc(txRef, cleanUpdates),
          'updateTransaction',
          { maxRetries: 2 }
        );

        // Ajustar usedCredit comparando el efecto antes/después por cada TC.
        // Cubre cambios de monto, tipo, cuenta origen y cuenta destino (transferencias).
        if (oldData) {
          const oldDeltas = creditDeltasByAccount(oldData, accountsRef.current);
          const newData = { ...oldData, ...updates } as Transaction;
          const newDeltas = creditDeltasByAccount(newData, accountsRef.current);
          const affectedAccountIds = new Set([...oldDeltas.keys(), ...newDeltas.keys()]);
          for (const accountId of affectedAccountIds) {
            const diff = (newDeltas.get(accountId) ?? 0) - (oldDeltas.get(accountId) ?? 0);
            if (diff !== 0) {
              await updateDoc(doc(db, `users/${userId}/accounts`, accountId), {
                usedCredit: increment(diff),
              });
            }
          }
        }
      } catch (error) {
        logger.error('Firestore error updating transaction:', error);
        throw new Error('Error al actualizar la transacción. Por favor intenta de nuevo.');
      }
    },
    [userId]
  );

  return {
    addTransaction,
    addCreditPaymentAtomic,
    deleteTransaction,
    updateTransaction,
  };
}
