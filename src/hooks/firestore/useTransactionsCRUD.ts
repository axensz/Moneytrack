/**
 * Hook para operaciones CRUD de transacciones
 * Incluye lógica de transferencias atómicas
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  collection,
  doc,
  addDoc,
  runTransaction,
  increment,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { TRANSFER_CATEGORY } from '../../config/constants';
import type { Transaction, Account } from '../../types/finance';
import { isOffline } from '../../utils/firestoreHelpers';
import { getCreditDelta, creditDeltasByAccount } from '../../utils/creditDeltas';
import { logger } from '../../utils/logger';

// Las escrituras de transacciones requieren conexión: las que ajustan usedCredit
// usan runTransaction (no funciona offline) y queremos evitar estados optimistas
// inconsistentes que descuadren balances. Offline → error claro (sin toast aquí;
// lo muestra el caller). La lectura offline sigue disponible vía persistentLocalCache.
const OFFLINE_WRITE_ERROR = 'Sin conexión a internet. Conéctate para guardar los cambios.';

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

      // Borrar la transacción y revertir usedCredit en las TC afectadas
      // ATÓMICAMENTE: si una de las escrituras falla, ninguna se aplica y
      // usedCredit nunca queda desincronizado del set de transacciones.
      await runTransaction(db, async (firestoreTransaction) => {
        const txRef = doc(db, `users/${userId}/transactions`, id);
        const txSnap = await firestoreTransaction.get(txRef);
        if (!txSnap.exists()) return;
        const txData = txSnap.data() as Transaction;

        // Lecturas primero (requisito de Firestore): leer las TC afectadas.
        const deltas = creditDeltasByAccount(txData, accountsRef.current);
        const accountEntries = Array.from(deltas.entries()).map(([accountId, delta]) => ({
          accountId,
          delta,
          ref: doc(db, `users/${userId}/accounts`, accountId),
        }));
        const snaps = await Promise.all(
          accountEntries.map(entry => firestoreTransaction.get(entry.ref))
        );

        // Escrituras después.
        firestoreTransaction.delete(txRef);
        accountEntries.forEach((entry, index) => {
          if (snaps[index].exists() && entry.delta !== 0) {
            firestoreTransaction.update(entry.ref, { usedCredit: increment(-entry.delta) });
          }
        });
      });
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
        // Actualizar la transacción y ajustar usedCredit ATÓMICAMENTE comparando
        // el efecto antes/después por cada TC. Cubre cambios de monto, tipo,
        // cuenta origen y cuenta destino (transferencias). Si algo falla, nada
        // se aplica y usedCredit nunca queda desincronizado.
        await runTransaction(db, async (firestoreTransaction) => {
          const txRef = doc(db, `users/${userId}/transactions`, id);
          const txSnap = await firestoreTransaction.get(txRef);
          const oldData = txSnap.exists() ? (txSnap.data() as Transaction) : null;

          // Lecturas primero (requisito de Firestore): leer todas las TC afectadas.
          let affectedAccounts: { accountId: string; diff: number; ref: ReturnType<typeof doc> }[] = [];
          if (oldData) {
            const oldDeltas = creditDeltasByAccount(oldData, accountsRef.current);
            const newData = { ...oldData, ...updates } as Transaction;
            const newDeltas = creditDeltasByAccount(newData, accountsRef.current);
            const affectedAccountIds = new Set([...oldDeltas.keys(), ...newDeltas.keys()]);
            affectedAccounts = Array.from(affectedAccountIds).map(accountId => ({
              accountId,
              diff: (newDeltas.get(accountId) ?? 0) - (oldDeltas.get(accountId) ?? 0),
              ref: doc(db, `users/${userId}/accounts`, accountId),
            }));
          }
          const snaps = await Promise.all(
            affectedAccounts.map(entry => firestoreTransaction.get(entry.ref))
          );

          // Escrituras después.
          firestoreTransaction.update(txRef, cleanUpdates);
          affectedAccounts.forEach((entry, index) => {
            if (snaps[index].exists() && entry.diff !== 0) {
              firestoreTransaction.update(entry.ref, { usedCredit: increment(entry.diff) });
            }
          });
        });
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
