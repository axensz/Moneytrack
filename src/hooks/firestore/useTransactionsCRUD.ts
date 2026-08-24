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
import { LOAN_PAYMENT_CATEGORY, TRANSFER_CATEGORY } from '../../config/constants';
import type { Transaction, Account } from '../../types/finance';
import { getAccountReferenceIds } from '../../utils/accountTransactions';
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
  collectLedgerMutationAccountIds,
  executeAuthenticatedLedgerMutation,
  loadServerLedgerTransaction,
  planCreditAuthorityChanges,
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

      const createdAt = new Date();
      const transactionRef = doc(collection(db, `users/${userId}/transactions`));
      const createdTransaction = await executeAuthenticatedLedgerMutation(
        userId,
        async ({ operationId, loadContext }) => {
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
          const draft = {
            ...persistedInput,
            amount,
            id: transactionRef.id,
            createdAt,
            operationId,
            mutationKind: transaction.type === 'transfer' ? 'transfer' as const : 'create' as const,
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
              const persistedTransaction = { ...normalizedTransaction };
              delete persistedTransaction.id;
              batch.set(transactionRef, persistedTransaction);
              creditChanges.forEach(({ accountId, delta }) => {
                batch.update(doc(db, `users/${userId}/accounts`, accountId), {
                  usedCredit: increment(delta),
                });
              });
            },
            result: normalizedTransaction,
          };
        }
      );
      publishTransactionCacheMutation({
        userId,
        type: 'update',
        transactions: [createdTransaction],
      });
    },
    [userId]
  );

  const deleteTransaction = useCallback(
    async (id: string) => {
      if (!userId) return;
      if (isOffline()) throw new Error(OFFLINE_WRITE_ERROR);
      const deletedTransactionIds = await executeAuthenticatedLedgerMutation(
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
              result: [] as string[],
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
            result: transactionIds,
          };
        }
      );

      if (deletedTransactionIds.length > 0) {
        publishTransactionCacheMutation({
          userId,
          type: 'delete',
          transactionIds: deletedTransactionIds,
        });
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
      const cleanUpdates = stripUndefined(updates);

      try {
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
            const mutationSource = oldData.mutationSource ?? 'manual';
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
          }
        );

        if (updatedTransactions.length > 0) {
          publishTransactionCacheMutation({
            userId,
            type: 'update',
            transactions: updatedTransactions,
          });
        }
      } catch (error) {
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
    deleteTransaction,
    updateTransaction,
  };
}
