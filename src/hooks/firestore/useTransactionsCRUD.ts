/**
 * Hook para operaciones CRUD de transacciones
 * Incluye lógica de transferencias atómicas
 */

import { useCallback } from 'react';
import {
  collection,
  doc,
  getDocFromServer,
  increment,
  deleteField,
} from 'firebase/firestore';
import { db } from '../../lib/firebaseDb';
import {
  LOAN_PAYMENT_CATEGORY,
  SPECIAL_CATEGORIES,
  TRANSFER_CATEGORY,
} from '../../config/constants';
import type { Transaction, Account, RecurringPayment } from '../../types/finance';
import { getAccountReferenceIds } from '../../utils/accountTransactions';
import { ensureDate } from '../../utils/dateUtils';
import { isOffline, stripUndefined } from '../../utils/firestoreHelpers';
import { validateCreditPaymentPair } from '../../utils/creditPaymentPairs';
import { roundMoney } from '../../utils/formatters';
import { logger } from '../../utils/logger';
import {
  LedgerMutationValidationError,
  normalizeLedgerAmount,
} from '../../utils/ledgerMutation';
import { validateTransactionUpdate } from '../../utils/transactionValidation';
import {
  isRecurringCycleKeyForPayment,
  recurringTransactionSatisfiesCycleKey,
} from '../../utils/recurringPayments';
import {
  collectLedgerMutationAccountIds,
  executeAuthenticatedLedgerMutation,
  loadServerLedgerTransaction,
  loadServerLedgerTransactionsByRecurringPayment,
  planCreditAuthorityChanges,
  validateLedgerMutationOperationId,
} from './ledgerMutationOrchestration';
import { publishTransactionCacheMutation } from './transactionPaginationCache';

// Las escrituras de transacciones requieren conexión: usan autoridad confirmada
// del servidor y queremos evitar estados optimistas
// inconsistentes que descuadren balances. Offline → error claro (sin toast aquí;
// lo muestra el caller). La lectura offline sigue disponible vía persistentLocalCache.
const OFFLINE_WRITE_ERROR = 'Sin conexión a internet. Conéctate para guardar los cambios.';

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

const reconciliationError = (reason: string): LedgerMutationValidationError =>
  new LedgerMutationValidationError(
    'INVALID_ACCOUNT_AUTHORITY',
    `El enlace financiero requiere reconciliación: ${reason}`
  );

const assertValidLinkedPaymentPair = (
  first: Transaction,
  second: Transaction | null,
  accounts: readonly Account[]
): void => {
  if (!second) throw reconciliationError('falta la transacción contraparte');
  const rows = [first, second];
  const creditTransaction = rows.find(row =>
    row.type === 'income' && accounts.some(account =>
      account.type === 'credit' && getAccountReferenceIds(account).includes(row.accountId)
    )
  );
  if (!creditTransaction) throw reconciliationError('no se pudo identificar la mitad de tarjeta');
  const sourceTransaction = rows.find(row => row.id !== creditTransaction.id);
  const creditAccount = accounts.find(account =>
    account.type === 'credit' && getAccountReferenceIds(account).includes(creditTransaction.accountId)
  );
  if (!creditAccount) throw reconciliationError('la tarjeta vinculada no existe');
  const validation = validateCreditPaymentPair(
    creditTransaction,
    sourceTransaction,
    creditAccount
  );
  if (!validation.valid) throw reconciliationError(validation.reason);
};

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

const IDEMPOTENCY_IGNORED_FIELDS = new Set([
  'id',
  'createdAt',
  'operationId',
  'mutationKind',
  'mutationSource',
]);

const sameTransactionValue = (left: unknown, right: unknown): boolean => {
  if (left instanceof Date || right instanceof Date) {
    return left instanceof Date && right instanceof Date
      && left.getTime() === right.getTime();
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return Object.is(left, right);
};

const transactionMatchesRequest = (
  existing: Transaction,
  requested: Partial<Transaction>
): boolean => Object.entries(requested).every(([field, value]) => (
  IDEMPOTENCY_IGNORED_FIELDS.has(field)
  || value === undefined
  || sameTransactionValue(existing[field as keyof Transaction], value)
));

const loadCommittedOperation = async (
  userId: string,
  transactionId: string,
  operationId: string,
  mutationKind: 'create' | 'transfer' | 'edit',
  requested: Partial<Transaction>
): Promise<Transaction | null> => {
  const existing = await loadServerLedgerTransaction(userId, transactionId);
  if (!existing) return null;
  if (
    existing.operationId !== operationId
    || existing.mutationKind !== mutationKind
    || !transactionMatchesRequest(existing, requested)
  ) {
    throw new Error(
      'El identificador de operación ya pertenece a una mutación financiera diferente.'
    );
  }
  return existing;
};

const recurringCycleOperationId = (
  recurringPaymentId: string,
  recurringCycle: string
): string => validateLedgerMutationOperationId(
  `ledger-mutation:recurring:${recurringPaymentId}:${recurringCycle}`
);

const loadServerRecurringPayment = async (
  userId: string,
  recurringPaymentId: string
): Promise<RecurringPayment> => {
  const snapshot = await getDocFromServer(
    doc(db, `users/${userId}/recurringPayments`, recurringPaymentId)
  );
  if (!snapshot.exists()) {
    throw new Error('El pago periódico ya no existe. Actualiza e intenta de nuevo.');
  }
  const data = snapshot.data();
  if (
    typeof data.name !== 'string'
    || typeof data.category !== 'string'
    || typeof data.amount !== 'number'
    || !Number.isFinite(data.amount)
    || data.amount <= 0
    || typeof data.dueDay !== 'number'
    || !Number.isInteger(data.dueDay)
    || data.dueDay < 1
    || data.dueDay > 31
    || (data.frequency !== 'monthly' && data.frequency !== 'yearly')
    || typeof data.isActive !== 'boolean'
  ) {
    throw new LedgerMutationValidationError(
      'INVALID_ACCOUNT_AUTHORITY',
      'El pago periódico no tiene una estructura válida'
    );
  }
  const createdAt = data.createdAt === undefined ? undefined : ensureDate(data.createdAt);
  if (createdAt && !Number.isFinite(createdAt.getTime())) {
    throw new LedgerMutationValidationError(
      'INVALID_ACCOUNT_AUTHORITY',
      'El pago periódico no tiene una fecha de creación válida'
    );
  }
  return {
    ...data,
    id: recurringPaymentId,
    name: data.name,
    category: data.category,
    amount: data.amount,
    dueDay: data.dueDay,
    frequency: data.frequency,
    isActive: data.isActive,
    createdAt,
  } as RecurringPayment;
};

const assertRecurringPaidDraft = (
  transaction: Omit<Transaction, 'id' | 'createdAt'>
): { recurringPaymentId: string; recurringCycle: string } => {
  validateTransactionSchema(transaction);
  if (transaction.type !== 'expense' || transaction.paid !== true) {
    throw new Error('Solo un gasto pagado puede completar un ciclo periódico.');
  }
  if (!transaction.recurringPaymentId || !transaction.recurringCycle) {
    throw new Error('El pago periódico requiere una identidad de ciclo.');
  }
  return {
    recurringPaymentId: transaction.recurringPaymentId,
    recurringCycle: transaction.recurringCycle,
  };
};

const recurringMetadata = (transaction: Transaction) => ({
  amount: transaction.amount,
  lastPaidAmount: transaction.amount,
  lastPaidDate: transaction.date,
});

const restoreOperationId = (transactionId: string): string => (
  validateLedgerMutationOperationId(`ledger-mutation:undo:${transactionId}:restore`)
);

const assertRestorableSnapshot = (transaction: Transaction): void => {
  if (!transaction.id) throw new Error('No se puede restaurar una fila sin identidad original.');
  validateTransactionSchema(transaction);
  if (transaction.mutationKind === 'migration' || transaction.mutationSource === 'migration') {
    throw new Error('No se puede restaurar una fila de migración sin reconciliarla.');
  }
  if (transaction.linkedTransactionId) {
    throw new Error('No se puede restaurar un pago vinculado sin su agregado completo.');
  }
  if (transaction.recurringPaymentId) {
    throw new Error('No se puede restaurar un pago periódico sin su agregado completo.');
  }
  if (transaction.mutationKind === 'credit-payment') {
    throw new Error('No se puede restaurar una mitad de pago sin su agregado completo.');
  }
  if (transaction.mutationKind === 'recurring-post' || transaction.mutationSource === 'recurring') {
    throw new Error('No se puede restaurar una fila periódica incompleta.');
  }
  if (transaction.mutationSource === 'debt' && !transaction.debtId) {
    throw new Error('No se puede restaurar una fila de deuda incompleta.');
  }
  if (transaction.type === 'transfer') {
    throw new Error('No se puede restaurar una transferencia desde el deshacer genérico.');
  }
  if (
    transaction.mutationKind === 'balance-adjustment'
    || transaction.mutationSource === 'account'
    || SPECIAL_CATEGORIES.groupedAdjustmentCategories.includes(transaction.category)
  ) {
    throw new Error('No se puede restaurar un ajuste de saldo desde el deshacer genérico.');
  }
  if (transaction.debtId && transaction.category !== LOAN_PAYMENT_CATEGORY) {
    throw new Error('No se puede restaurar el movimiento principal de una deuda sin recrearla.');
  }
};

interface UseTransactionsCRUDReturn {
  addTransaction: (
    transaction: Omit<Transaction, 'id' | 'createdAt'>
  ) => Promise<void>;
  addCreditPaymentAtomic: (
    creditTx: Omit<Transaction, 'id' | 'createdAt'>,
    sourceTx: Omit<Transaction, 'id' | 'createdAt'>
  ) => Promise<void>;
  addRecurringTransactionAtomic: (
    transaction: Omit<Transaction, 'id' | 'createdAt'>
  ) => Promise<void>;
  linkRecurringTransactionAtomic: (
    transactionId: string,
    recurringPaymentId: string,
    recurringCycle: string
  ) => Promise<void>;
  restoreTransaction: (transaction: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<Transaction | null>;
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
  _accounts: Account[] = []
): UseTransactionsCRUDReturn {
  // Conserva la firma pública; la autoridad financiera siempre se recarga del servidor.
  void _accounts;

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
      const createdAt = new Date();
      const creditTxRef = doc(collection(db, `users/${userId}/transactions`));
      const sourceTxRef = doc(collection(db, `users/${userId}/transactions`));
      const createdTransactions = await executeAuthenticatedLedgerMutation(
        userId,
        async ({ operationId, loadContext }) => {
          const creditDraft = {
            ...stripUndefined(creditTx),
            id: creditTxRef.id,
            amount: normalizeLedgerAmount(creditTx.amount),
            linkedTransactionId: sourceTxRef.id,
            createdAt,
            operationId,
            mutationKind: 'credit-payment' as const,
            mutationSource: creditTx.mutationSource ?? ('manual' as const),
          } as Transaction;
          const sourceDraft = {
            ...stripUndefined(sourceTx),
            id: sourceTxRef.id,
            amount: normalizeLedgerAmount(sourceTx.amount),
            linkedTransactionId: creditTxRef.id,
            createdAt,
            operationId,
            mutationKind: 'credit-payment' as const,
            mutationSource: sourceTx.mutationSource ?? creditDraft.mutationSource,
          } as Transaction;
          const context = await loadContext([creditDraft.accountId, sourceDraft.accountId]);
          const credit = {
            ...creditDraft,
            accountId: context.canonicalAccountId(creditDraft.accountId),
          };
          const source = {
            ...sourceDraft,
            accountId: context.canonicalAccountId(sourceDraft.accountId),
          };
          const creditAccount = context.accounts.find(
            account => account.id === credit.accountId && account.type === 'credit'
          );
          if (!creditAccount) throw new Error('La cuenta de crédito no existe');
          const sourceAccount = context.accounts.find(account => account.id === source.accountId);
          if (!sourceAccount) throw new Error('La cuenta origen no existe');
          if (sourceAccount.type === 'credit') {
            throw new Error('La cuenta origen del pago debe ser de ahorro o efectivo');
          }

          const pair = validateCreditPaymentPair(credit, source, creditAccount);
          if (!pair.valid) {
            throw new Error(`El par de pago de tarjeta es inválido: ${pair.reason}`);
          }

          const intent = {
            kind: 'credit-payment' as const,
            before: [],
            after: [credit, source],
            metadata: {
              operationId,
              mutationSource: credit.mutationSource ?? 'manual' as const,
            },
          };
          const creditChanges = planCreditAuthorityChanges(intent, context);

          return {
            intent,
            context,
            writeCount: 2 + creditChanges.length,
            stage: (batch) => {
              const persistedCredit = stripUndefined({ ...credit, id: undefined });
              const persistedSource = stripUndefined({ ...source, id: undefined });
              batch.set(creditTxRef, persistedCredit);
              batch.set(sourceTxRef, persistedSource);
              creditChanges.forEach(({ accountId, delta }) => {
                batch.update(doc(db, `users/${userId}/accounts`, accountId), {
                  usedCredit: increment(delta),
                });
              });
            },
            result: [credit, source],
          };
        }
      );
      publishTransactionCacheMutation({
        userId,
        type: 'update',
        transactions: createdTransactions,
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
      if (transaction.type !== 'transfer' && transaction.toAccountId) {
        throw new Error(
          'Una cuenta destino en un ingreso o gasto requiere el writer de pago atómico.'
        );
      }

      const createdAt = new Date();
      const amount = normalizeLedgerAmount(transaction.amount);
      const persistedInput = stripUndefined(transaction.type === 'transfer'
        ? {
            ...transaction,
            category: TRANSFER_CATEGORY,
            description: transaction.description || 'Transferencia entre cuentas',
            date: transaction.date || createdAt,
            paid: true,
          }
        : transaction);
      const mutationKind = transaction.type === 'transfer' ? 'transfer' as const : 'create' as const;
      const callerOperationId = transaction.operationId
        ? validateLedgerMutationOperationId(transaction.operationId)
        : undefined;
      const transactionRef = callerOperationId
        ? doc(db, `users/${userId}/transactions`, callerOperationId)
        : doc(collection(db, `users/${userId}/transactions`));
      const requestedTransaction = { ...persistedInput, amount } as Partial<Transaction>;
      const publishCreatedTransaction = (createdTransaction: Transaction) => {
        publishTransactionCacheMutation({
          userId,
          type: 'update',
          transactions: [createdTransaction],
        });
      };

      if (callerOperationId) {
        const committed = await loadCommittedOperation(
          userId,
          transactionRef.id,
          callerOperationId,
          mutationKind,
          requestedTransaction
        );
        if (committed) {
          publishCreatedTransaction(committed);
          return;
        }
      }

      try {
        const createdTransaction = await executeAuthenticatedLedgerMutation(
          userId,
          async ({ operationId, loadContext }) => {
            const draft = {
              ...persistedInput,
              amount,
              id: transactionRef.id,
              createdAt,
              operationId,
              mutationKind,
              mutationSource: transaction.mutationSource ?? ('manual' as const),
            } as Transaction;
            const context = await loadContext([
              draft.accountId,
              ...(draft.toAccountId ? [draft.toAccountId] : []),
            ]);
            const normalizedTransaction = {
              ...draft,
              accountId: context.canonicalAccountId(draft.accountId),
              toAccountId: draft.toAccountId
                ? context.canonicalAccountId(draft.toAccountId)
                : undefined,
            };

            if (normalizedTransaction.type === 'transfer') {
              if (!normalizedTransaction.toAccountId) {
                throw new Error('Se requieren cuenta origen y destino para transferencias');
              }
              if (normalizedTransaction.accountId === normalizedTransaction.toAccountId) {
                throw new Error('No puedes transferir a la misma cuenta');
              }
              const sourceAccount = context.accounts.find(
                account => account.id === normalizedTransaction.accountId
              );
              if (sourceAccount?.type === 'credit') {
                throw new Error('No se puede transferir desde una tarjeta de crédito');
              }
            }

            const intent = {
              kind: normalizedTransaction.type === 'transfer' ? 'transfer' as const : 'create' as const,
              before: [],
              after: [normalizedTransaction],
              metadata: {
                operationId,
                mutationSource: normalizedTransaction.mutationSource ?? 'manual' as const,
              },
            };
            const creditChanges = planCreditAuthorityChanges(intent, context);

            return {
              intent,
              context,
              writeCount: 1 + creditChanges.length,
              stage: (batch) => {
                const persistedTransaction = stripUndefined({ ...normalizedTransaction, id: undefined });
                batch.set(transactionRef, persistedTransaction);
                creditChanges.forEach(({ accountId, delta }) => {
                  batch.update(doc(db, `users/${userId}/accounts`, accountId), {
                    usedCredit: increment(delta),
                  });
                });
              },
              result: normalizedTransaction,
            };
          },
          { operationId: callerOperationId }
        );
        publishCreatedTransaction(createdTransaction);
      } catch (error) {
        if (callerOperationId) {
          try {
            const committed = await loadCommittedOperation(
              userId,
              transactionRef.id,
              callerOperationId,
              mutationKind,
              requestedTransaction
            );
            if (committed) {
              publishCreatedTransaction(committed);
              return;
            }
          } catch {
            // Conservar el error del commit. Un reintento volverá a validar el ID.
          }
        }
        throw error;
      }
    },
    [userId]
  );

  const addRecurringTransactionAtomic = useCallback(
    async (transaction: Omit<Transaction, 'id' | 'createdAt'>) => {
      if (!userId) return;
      if (isOffline()) throw new Error(OFFLINE_WRITE_ERROR);
      const { recurringPaymentId, recurringCycle } = assertRecurringPaidDraft(transaction);
      const operationId = recurringCycleOperationId(recurringPaymentId, recurringCycle);
      const transactionRef = doc(db, `users/${userId}/transactions`, operationId);
      const publish = (committed: Transaction) => {
        publishTransactionCacheMutation({
          userId,
          type: 'update',
          transactions: [committed],
        });
      };
      const loadCommitted = async (): Promise<Transaction | null> => {
        const committed = await loadServerLedgerTransaction(userId, operationId);
        if (!committed) return null;
        if (
          committed.operationId !== operationId
          || committed.mutationKind !== 'recurring-post'
          || committed.recurringPaymentId !== recurringPaymentId
          || committed.recurringCycle !== recurringCycle
          || committed.paid !== true
        ) {
          throw new Error('La identidad del ciclo pertenece a otra mutación financiera.');
        }
        return committed;
      };

      const alreadyCommitted = await loadCommitted();
      if (alreadyCommitted) {
        publish(alreadyCommitted);
        return;
      }

      try {
        const committed = await executeAuthenticatedLedgerMutation(
          userId,
          async ({ loadContext }) => {
            const [payment, linkedTransactions] = await Promise.all([
              loadServerRecurringPayment(userId, recurringPaymentId),
              loadServerLedgerTransactionsByRecurringPayment(userId, recurringPaymentId),
            ]);
            if (!isRecurringCycleKeyForPayment(payment, recurringCycle)) {
              throw new Error('La identidad del ciclo no corresponde al pago periódico.');
            }
            const duplicate = linkedTransactions.find(candidate => (
              recurringTransactionSatisfiesCycleKey(payment, candidate, recurringCycle)
            ));
            if (duplicate) {
              const context = await loadContext([]);
              return {
                intent: {
                  kind: 'recurring-post' as const,
                  before: [],
                  after: [],
                  metadata: { operationId, mutationSource: 'recurring' as const },
                },
                context,
                writeCount: 1,
                stage: (batch) => {
                  batch.update(
                    doc(db, `users/${userId}/recurringPayments`, recurringPaymentId),
                    recurringMetadata(duplicate)
                  );
                },
                result: duplicate,
              };
            }

            const createdAt = new Date();
            const draft = {
              ...stripUndefined(transaction),
              id: operationId,
              amount: normalizeLedgerAmount(transaction.amount),
              createdAt,
              operationId,
              mutationKind: 'recurring-post' as const,
              mutationSource: 'recurring' as const,
            } as Transaction;
            const context = await loadContext([draft.accountId]);
            const normalized = {
              ...draft,
              accountId: context.canonicalAccountId(draft.accountId),
            };
            const intent = {
              kind: 'recurring-post' as const,
              before: [],
              after: [normalized],
              metadata: { operationId, mutationSource: 'recurring' as const },
            };
            const creditChanges = planCreditAuthorityChanges(intent, context);

            return {
              intent,
              context,
              writeCount: 2 + creditChanges.length,
              stage: (batch) => {
                const persisted = { ...normalized };
                delete persisted.id;
                batch.set(transactionRef, persisted);
                batch.update(
                  doc(db, `users/${userId}/recurringPayments`, recurringPaymentId),
                  recurringMetadata(normalized)
                );
                creditChanges.forEach(({ accountId, delta }) => {
                  batch.update(doc(db, `users/${userId}/accounts`, accountId), {
                    usedCredit: increment(delta),
                  });
                });
              },
              result: normalized,
            };
          },
          { operationId }
        );
        publish(committed);
      } catch (error) {
        const committed = await loadCommitted();
        if (committed) {
          publish(committed);
          return;
        }
        throw error;
      }
    },
    [userId]
  );

  const linkRecurringTransactionAtomic = useCallback(
    async (
      transactionId: string,
      recurringPaymentId: string,
      recurringCycle: string
    ) => {
      if (!userId) return;
      if (isOffline()) throw new Error(OFFLINE_WRITE_ERROR);
      const operationId = recurringCycleOperationId(recurringPaymentId, recurringCycle);
      const publish = (linked: Transaction) => publishTransactionCacheMutation({
        userId,
        type: 'update',
        transactions: [linked],
      });
      try {
        const linked = await executeAuthenticatedLedgerMutation(
          userId,
          async ({ loadContext }) => {
            const [payment, transaction, linkedTransactions] = await Promise.all([
              loadServerRecurringPayment(userId, recurringPaymentId),
              loadServerLedgerTransaction(userId, transactionId),
              loadServerLedgerTransactionsByRecurringPayment(userId, recurringPaymentId),
            ]);
            if (!isRecurringCycleKeyForPayment(payment, recurringCycle)) {
              throw new Error('La identidad del ciclo no corresponde al pago periódico.');
            }
            if (!transaction) {
              throw new Error('La transacción ya no existe. Actualiza e intenta de nuevo.');
            }
            if (transaction.type !== 'expense' || transaction.paid !== true) {
              throw new Error('Solo un gasto pagado puede vincularse a un ciclo periódico.');
            }
            if (
              transaction.recurringPaymentId
              && transaction.recurringPaymentId !== recurringPaymentId
            ) {
              throw new Error('La transacción ya pertenece a otro pago periódico.');
            }
            if (
              transaction.recurringPaymentId === recurringPaymentId
              && transaction.recurringCycle === recurringCycle
            ) {
              const context = await loadContext([]);
              return {
                intent: {
                  kind: 'recurring-post' as const,
                  before: [],
                  after: [],
                  metadata: { operationId, mutationSource: 'recurring' as const },
                },
                context,
                writeCount: 0,
                stage: () => undefined,
                result: transaction,
              };
            }

            const duplicate = linkedTransactions.find(candidate => (
              candidate.id !== transactionId
              && recurringTransactionSatisfiesCycleKey(payment, candidate, recurringCycle)
            ));
            if (duplicate) {
              const context = await loadContext([]);
              return {
                intent: {
                  kind: 'recurring-post' as const,
                  before: [],
                  after: [],
                  metadata: { operationId, mutationSource: 'recurring' as const },
                },
                context,
                writeCount: 0,
                stage: () => undefined,
                result: duplicate,
              };
            }

            const candidate = {
              ...transaction,
              recurringPaymentId,
              recurringCycle,
              operationId,
              mutationKind: 'recurring-post' as const,
              mutationSource: 'recurring' as const,
            } as Transaction;
            const context = await loadContext([candidate.accountId]);
            const normalized = {
              ...candidate,
              accountId: context.canonicalAccountId(candidate.accountId),
            };
            const intent = {
              kind: 'recurring-post' as const,
              before: [transaction],
              after: [normalized],
              metadata: { operationId, mutationSource: 'recurring' as const },
            };

            return {
              intent,
              context,
              writeCount: 2,
              stage: (batch) => {
                batch.update(doc(db, `users/${userId}/transactions`, transactionId), {
                  recurringPaymentId,
                  recurringCycle,
                  operationId,
                  mutationKind: 'recurring-post',
                  mutationSource: 'recurring',
                });
                batch.update(
                  doc(db, `users/${userId}/recurringPayments`, recurringPaymentId),
                  recurringMetadata(normalized)
                );
              },
              result: normalized,
            };
          },
          { operationId }
        );
        publish(linked);
      } catch (error) {
        try {
          const committed = await loadServerLedgerTransaction(userId, transactionId);
          if (
            committed
            && committed.recurringPaymentId === recurringPaymentId
            && committed.recurringCycle === recurringCycle
            && committed.paid === true
          ) {
            publish(committed);
            return;
          }
          const payment = await loadServerRecurringPayment(userId, recurringPaymentId);
          const duplicate = (
            await loadServerLedgerTransactionsByRecurringPayment(userId, recurringPaymentId)
          ).find(candidate => (
            recurringTransactionSatisfiesCycleKey(payment, candidate, recurringCycle)
          ));
          if (duplicate) {
            publish(duplicate);
            return;
          }
        } catch {
          // Conservar el error original; un reintento vuelve a leer autoridad.
        }
        throw error;
      }
    },
    [userId]
  );

  const restoreTransaction = useCallback(
    async (transaction: Transaction) => {
      if (!userId) return;
      if (isOffline()) throw new Error(OFFLINE_WRITE_ERROR);
      assertRestorableSnapshot(transaction);

      const transactionId = transaction.id!;
      const operationId = restoreOperationId(transactionId);
      const requested = { ...transaction } as Partial<Transaction>;
      delete requested.id;
      delete requested.operationId;
      delete requested.mutationKind;
      delete requested.mutationSource;
      const publish = (restored: Transaction) => publishTransactionCacheMutation({
        userId,
        type: 'update',
        transactions: [restored],
      });
      const loadRestored = async (): Promise<Transaction | null> => {
        const existing = await loadServerLedgerTransaction(userId, transactionId);
        if (!existing) return null;
        if (
          existing.operationId !== operationId
          || existing.mutationKind !== 'restore'
          || existing.mutationSource !== 'undo'
          || !transactionMatchesRequest(existing, requested)
        ) {
          throw new Error('La identidad original ya pertenece a otra transacción.');
        }
        return existing;
      };

      const alreadyRestored = await loadRestored();
      if (alreadyRestored) {
        publish(alreadyRestored);
        return;
      }

      try {
        const restored = await executeAuthenticatedLedgerMutation(
          userId,
          async ({ loadContext }) => {
            const collision = await loadServerLedgerTransaction(userId, transactionId);
            if (collision) {
              throw new Error('La identidad original ya pertenece a otra transacción.');
            }

            const normalizedAmount = normalizeLedgerAmount(transaction.amount);
            const draft = {
              ...stripUndefined(transaction as unknown as Record<string, unknown>),
              id: transactionId,
              amount: normalizedAmount,
              createdAt: transaction.createdAt ?? new Date(),
              operationId,
              mutationKind: 'restore' as const,
              mutationSource: 'undo' as const,
            } as Transaction;
            let debtRef: ReturnType<typeof doc> | null = null;
            let debtUpdate: Record<string, unknown> | null = null;

            if (draft.debtId) {
              debtRef = doc(db, `users/${userId}/debts`, draft.debtId);
              const debtSnapshot = await getDocFromServer(debtRef);
              if (!debtSnapshot.exists()) {
                throw new Error('No se puede restaurar el pago porque la deuda ya no existe.');
              }
              const debt = debtSnapshot.data();
              const expectedType = debt.type === 'lent'
                ? 'income'
                : debt.type === 'borrowed'
                  ? 'expense'
                  : null;
              if (
                expectedType === null
                || draft.type !== expectedType
                || typeof debt.remainingAmount !== 'number'
                || !Number.isFinite(debt.remainingAmount)
                || debt.remainingAmount < normalizedAmount
                || typeof debt.accountId !== 'string'
                || debt.accountId !== draft.accountId
              ) {
                throw new Error('No se puede restaurar el pago con el saldo pendiente actual.');
              }
              const remainingAmount = roundMoney(debt.remainingAmount - normalizedAmount);
              const isSettled = remainingAmount === 0;
              debtUpdate = {
                remainingAmount,
                isSettled,
                settledAt: isSettled ? draft.date : deleteField(),
              };
            }

            const context = await loadContext([draft.accountId]);
            const normalized = {
              ...draft,
              accountId: context.canonicalAccountId(draft.accountId),
            };
            const sourceAccount = context.accounts.find(
              account => account.id === normalized.accountId
            );
            if (!draft.debtId && sourceAccount?.type === 'credit') {
              throw new Error('No se puede restaurar una transacción de tarjeta sin reconciliarla.');
            }
            const intent = {
              kind: 'restore' as const,
              before: [],
              after: [normalized],
              metadata: { operationId, mutationSource: 'undo' as const },
            };
            const creditChanges = planCreditAuthorityChanges(intent, context);

            return {
              intent,
              context,
              writeCount: 1 + (debtRef ? 1 : 0) + creditChanges.length,
              stage: (batch) => {
                const persisted = { ...normalized };
                delete persisted.id;
                batch.set(
                  doc(db, `users/${userId}/transactions`, transactionId),
                  persisted
                );
                if (debtRef && debtUpdate) batch.update(debtRef, debtUpdate);
                creditChanges.forEach(({ accountId, delta }) => {
                  batch.update(doc(db, `users/${userId}/accounts`, accountId), {
                    usedCredit: increment(delta),
                  });
                });
              },
              result: normalized,
            };
          },
          { operationId }
        );
        publish(restored);
      } catch (error) {
        try {
          const restored = await loadRestored();
          if (restored) {
            publish(restored);
            return;
          }
        } catch {
          // Conservar el error original; el reintento volverá a comprobar el ID.
        }
        throw error;
      }
    },
    [userId]
  );

  const deleteTransaction = useCallback(
    async (id: string) => {
      if (!userId) return null;
      if (isOffline()) throw new Error(OFFLINE_WRITE_ERROR);
      const deleted = await executeAuthenticatedLedgerMutation(
        userId,
        async ({ operationId, loadContext }) => {
          const primary = await loadServerLedgerTransaction(userId, id);
          if (!primary) {
            const context = await loadContext([]);
            return {
              intent: {
                kind: 'delete' as const,
                before: [],
                after: [],
                metadata: { operationId, mutationSource: 'manual' as const },
              },
              context,
              writeCount: 0,
              stage: () => undefined,
              result: {
                transaction: null as Transaction | null,
                transactionIds: [] as string[],
              },
            };
          }

          const counterpart = primary.linkedTransactionId
            ? await loadServerLedgerTransaction(userId, primary.linkedTransactionId)
            : null;
          const before = [primary, ...(counterpart ? [counterpart] : [])];
          const intent = {
            kind: 'delete' as const,
            before,
            after: [],
            metadata: {
              operationId,
              mutationSource: primary.mutationSource ?? 'manual' as const,
            },
          };
          const context = await loadContext(collectLedgerMutationAccountIds(intent));
          if (primary.linkedTransactionId) {
            assertValidLinkedPaymentPair(primary, counterpart, context.accounts);
          }

          const debtRef = primary.category === LOAN_PAYMENT_CATEGORY && primary.debtId
            ? doc(db, `users/${userId}/debts`, primary.debtId)
            : null;
          let debtUpdate: Record<string, unknown> | null = null;
          if (debtRef) {
            const debtSnapshot = await getDocFromServer(debtRef);
            if (!debtSnapshot.exists()) {
              throw new Error('La deuda del pago ya no existe. Actualiza e intenta de nuevo.');
            }
            const remainingAmount = debtSnapshot.data().remainingAmount;
            if (
              typeof remainingAmount !== 'number' ||
              !Number.isFinite(remainingAmount) ||
              remainingAmount < 0
            ) {
              throw new LedgerMutationValidationError(
                'INVALID_ACCOUNT_AUTHORITY',
                'No se pudo validar el saldo persistido de la deuda'
              );
            }
            debtUpdate = {
              remainingAmount: roundMoney(remainingAmount + primary.amount),
              isSettled: false,
              settledAt: deleteField(),
            };
          }

          const creditChanges = planCreditAuthorityChanges(intent, context);
          const transactionIds = before
            .map(transaction => transaction.id)
            .filter((transactionId): transactionId is string => Boolean(transactionId));

          return {
            intent,
            context,
            writeCount: transactionIds.length + creditChanges.length + (debtRef ? 1 : 0),
            stage: (batch) => {
              transactionIds.forEach(transactionId => {
                batch.delete(doc(db, `users/${userId}/transactions`, transactionId));
              });
              if (debtRef && debtUpdate) batch.update(debtRef, debtUpdate);
              creditChanges.forEach(({ accountId, delta }) => {
                batch.update(doc(db, `users/${userId}/accounts`, accountId), {
                  usedCredit: increment(delta),
                });
              });
            },
            result: {
              transaction: primary,
              transactionIds,
            },
          };
        }
      );

      if (deleted.transactionIds.length > 0) {
        publishTransactionCacheMutation({
          userId,
          type: 'delete',
          transactionIds: deleted.transactionIds,
        });
      }
      return deleted.transaction;
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
      const cleanUpdates = stripUndefined(updates);
      const callerOperationId = cleanUpdates.operationId
        ? validateLedgerMutationOperationId(cleanUpdates.operationId)
        : undefined;
      const requestedMutationSource = cleanUpdates.mutationSource;
      const publishUpdatedTransactions = (updatedTransactions: Transaction[]) => {
        if (updatedTransactions.length === 0) return;
        publishTransactionCacheMutation({
          userId,
          type: 'update',
          transactions: updatedTransactions,
        });
      };
      const loadAppliedEdit = async (): Promise<Transaction | null> => {
        if (!callerOperationId) return null;
        const existing = await loadServerLedgerTransaction(userId, id);
        if (!existing || existing.operationId !== callerOperationId) return null;
        const requested = existing.linkedTransactionId
          ? safePaymentUpdates(cleanUpdates as Partial<Transaction>)
          : { ...cleanUpdates } as Partial<Transaction>;
        if (
          existing.mutationKind !== 'edit'
          || !transactionMatchesRequest(existing, requested)
        ) {
          throw new Error(
            'El identificador de operación ya pertenece a una edición financiera diferente.'
          );
        }
        return existing;
      };

      try {
        const alreadyApplied = await loadAppliedEdit();
        if (alreadyApplied) {
          publishUpdatedTransactions([alreadyApplied]);
          return;
        }

        const updatedTransactions = await executeAuthenticatedLedgerMutation(
          userId,
          async ({ operationId, loadContext }) => {
            const oldData = await loadServerLedgerTransaction(userId, id);
            if (!oldData) {
              throw new Error('La transacción ya no existe. Actualiza e intenta de nuevo.');
            }

            const oldLinked = oldData.linkedTransactionId
              ? await loadServerLedgerTransaction(userId, oldData.linkedTransactionId)
              : null;
            const requestedUpdates = oldData.linkedTransactionId
              ? safePaymentUpdates(cleanUpdates as Partial<Transaction>)
              : { ...cleanUpdates } as Partial<Transaction>;
            delete requestedUpdates.id;
            delete requestedUpdates.createdAt;
            delete requestedUpdates.linkedTransactionId;
            delete requestedUpdates.operationId;
            delete requestedUpdates.mutationKind;
            delete requestedUpdates.mutationSource;
            if (requestedUpdates.amount !== undefined) {
              requestedUpdates.amount = normalizeLedgerAmount(requestedUpdates.amount);
            }

            const counterpartUpdates = linkedPaymentUpdates(requestedUpdates);
            const mutationSource = requestedMutationSource
              ?? oldData.mutationSource
              ?? 'manual';
            const auditUpdates = {
              operationId,
              mutationKind: 'edit' as const,
              mutationSource,
            };
            const candidatePrimary = {
              ...oldData,
              ...requestedUpdates,
              ...auditUpdates,
            } as Transaction;
            const candidateLinked = oldLinked
              ? {
                  ...oldLinked,
                  ...counterpartUpdates,
                  ...auditUpdates,
                } as Transaction
              : null;
            const before = [oldData, ...(oldLinked ? [oldLinked] : [])];
            const candidateIntent = {
              kind: 'edit' as const,
              before,
              after: [candidatePrimary, ...(candidateLinked ? [candidateLinked] : [])],
              metadata: { operationId, mutationSource },
            };
            const context = await loadContext(
              collectLedgerMutationAccountIds(candidateIntent)
            );
            const normalizedPrimary = {
              ...candidatePrimary,
              accountId: context.canonicalAccountId(candidatePrimary.accountId),
              toAccountId: candidatePrimary.toAccountId
                ? context.canonicalAccountId(candidatePrimary.toAccountId)
                : undefined,
            };
            const normalizedLinked = candidateLinked
              ? {
                  ...candidateLinked,
                  accountId: context.canonicalAccountId(candidateLinked.accountId),
                  toAccountId: candidateLinked.toAccountId
                    ? context.canonicalAccountId(candidateLinked.toAccountId)
                    : undefined,
                }
              : null;

            validateTransactionSchema(normalizedPrimary);
            if (normalizedLinked) validateTransactionSchema(normalizedLinked);
            if (normalizedPrimary.type === 'transfer') {
              const sourceAccount = context.accounts.find(
                account => account.id === normalizedPrimary.accountId
              );
              if (sourceAccount?.type === 'credit') {
                throw new Error('No se puede transferir desde una tarjeta de crédito');
              }
            }
            if (oldData.linkedTransactionId) {
              assertValidLinkedPaymentPair(oldData, oldLinked, context.accounts);
              assertValidLinkedPaymentPair(
                normalizedPrimary,
                normalizedLinked,
                context.accounts
              );
            }

            const intent = {
              ...candidateIntent,
              after: [
                normalizedPrimary,
                ...(normalizedLinked ? [normalizedLinked] : []),
              ],
            };
            const creditChanges = planCreditAuthorityChanges(intent, context);
            const primaryWrite = stripUndefined({
              ...requestedUpdates,
              ...(requestedUpdates.accountId !== undefined
                ? { accountId: normalizedPrimary.accountId }
                : {}),
              ...(requestedUpdates.toAccountId !== undefined
                ? { toAccountId: normalizedPrimary.toAccountId }
                : {}),
              ...auditUpdates,
            });
            const linkedWrite = stripUndefined({
              ...counterpartUpdates,
              ...auditUpdates,
            });

            return {
              intent,
              context,
              writeCount: 1 + (normalizedLinked ? 1 : 0) + creditChanges.length,
              stage: (batch) => {
                batch.update(doc(db, `users/${userId}/transactions`, id), primaryWrite);
                if (normalizedLinked) {
                  batch.update(
                    doc(db, `users/${userId}/transactions`, normalizedLinked.id!),
                    linkedWrite
                  );
                }
                creditChanges.forEach(({ accountId, delta }) => {
                  batch.update(doc(db, `users/${userId}/accounts`, accountId), {
                    usedCredit: increment(delta),
                  });
                });
              },
              result: [
                normalizedPrimary,
                ...(normalizedLinked ? [normalizedLinked] : []),
              ],
            };
          },
          { operationId: callerOperationId }
        );

        publishUpdatedTransactions(updatedTransactions);
      } catch (error) {
        if (callerOperationId) {
          try {
            const committed = await loadAppliedEdit();
            if (committed) {
              publishUpdatedTransactions([committed]);
              return;
            }
          } catch {
            // Conservar el error original; el siguiente intento vuelve a validar.
          }
        }
        logger.error('Firestore error updating transaction:', error);
        if (error instanceof LedgerMutationValidationError) throw error;
        throw new Error('Error al actualizar la transacción. Por favor intenta de nuevo.');
      }
    },
    [userId]
  );

  return {
    addTransaction,
    addCreditPaymentAtomic,
    addRecurringTransactionAtomic,
    linkRecurringTransactionAtomic,
    restoreTransaction,
    deleteTransaction,
    updateTransaction,
  };
}
