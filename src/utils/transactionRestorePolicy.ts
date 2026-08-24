import type { Account, Transaction } from '../types/finance';
import {
  LOAN_CATEGORY,
  LOAN_PAYMENT_CATEGORY,
  SPECIAL_CATEGORIES,
} from '../config/constants';
import { getAccountReferenceIds } from './accountTransactions';
import { ensureDate } from './dateUtils';

export type TransactionRestorePolicy =
  | { allowed: true; kind: 'standalone' | 'debt-payment' }
  | { allowed: false; kind: 'unsupported'; reason: string };

const unsupported = (detail: string, nextStep: string): TransactionRestorePolicy => ({
  allowed: false,
  kind: 'unsupported',
  reason: `No se puede deshacer ${detail} sin restaurar todo su movimiento financiero. ${nextStep}`,
});

const RESTORE_AUDIT_FIELDS = new Set([
  'id',
  'createdAt',
  'operationId',
  'mutationKind',
  'mutationSource',
]);

export const transactionMatchesRestoreSnapshot = (
  existing: Transaction,
  snapshot: Transaction,
): boolean => Object.entries(snapshot).every(([field, value]) => {
  if (RESTORE_AUDIT_FIELDS.has(field)) return true;
  const persisted = (existing as unknown as Record<string, unknown>)[field];
  if (field === 'date') {
    return ensureDate(persisted as Transaction['date']).getTime()
      === ensureDate(value as Transaction['date']).getTime();
  }
  return Object.is(persisted, value);
});

export const getTransactionRestorePolicy = (
  transaction: Transaction,
  accounts: readonly Account[],
): TransactionRestorePolicy => {
  if (!transaction.id) {
    return unsupported(
      'esta fila sin identidad original',
      'Revisa la conciliación antes de recrearla.'
    );
  }
  if (transaction.mutationKind === 'migration' || transaction.mutationSource === 'migration') {
    return unsupported(
      'una fila creada por migración',
      'Revísala mediante la conciliación antes de recrearla.'
    );
  }
  if (transaction.linkedTransactionId) {
    return unsupported(
      'un pago vinculado',
      'Revísalo desde Cuentas y vuelve a crear el pago completo.'
    );
  }
  if (
    transaction.recurringPaymentId
    || transaction.mutationKind === 'recurring-post'
    || transaction.mutationSource === 'recurring'
  ) {
    return unsupported(
      'un pago periódico',
      'Vuelve a registrarlo desde Pagos periódicos.'
    );
  }
  if (transaction.mutationKind === 'credit-payment') {
    return unsupported(
      'una mitad de pago de tarjeta',
      'Revísala desde Cuentas y vuelve a crear el pago completo.'
    );
  }
  if (transaction.type === 'transfer') {
    return unsupported(
      'una transferencia',
      'Vuelve a crear la transferencia completa desde Transacciones.'
    );
  }
  if (
    transaction.mutationKind === 'balance-adjustment'
    || transaction.mutationSource === 'account'
    || SPECIAL_CATEGORIES.groupedAdjustmentCategories.includes(transaction.category)
  ) {
    return unsupported(
      'un ajuste de saldo',
      'Haz un nuevo ajuste desde Cuentas.'
    );
  }
  if (transaction.debtId) {
    return transaction.category === LOAN_PAYMENT_CATEGORY
      ? { allowed: true, kind: 'debt-payment' }
      : unsupported(
          transaction.category === LOAN_CATEGORY
            ? 'el movimiento principal de un préstamo'
            : 'un movimiento asociado a un préstamo',
          'Vuelve a crear o conciliar el préstamo desde Deudas.'
        );
  }
  if (transaction.mutationSource === 'debt') {
    return unsupported(
      'una fila de deuda incompleta',
      'Reconcilia el préstamo desde Deudas.'
    );
  }

  const account = accounts.find(candidate => (
    getAccountReferenceIds(candidate).includes(transaction.accountId)
  ));
  if (!account) {
    return unsupported(
      'una transacción cuya cuenta no está conciliada',
      'Concilia la cuenta antes de recrear el movimiento.'
    );
  }
  if (account.type === 'credit') {
    return unsupported(
      'una transacción de tarjeta',
      'Revísala desde Cuentas y vuelve a crear el movimiento completo.'
    );
  }

  return { allowed: true, kind: 'standalone' };
};
