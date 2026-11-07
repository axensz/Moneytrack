import type { Debt, Transaction } from '../types/finance';

/**
 * Candidatos para ENLAZAR una transacción existente a un pago de préstamo.
 *
 * Análogo a getRecurringLinkCandidates (ver recurringPayments.ts), pero para
 * deudas: devuelve movimientos ya pagados que podrían ser el pago de la deuda sin
 * crear un segundo movimiento. Un candidato es válido cuando:
 *  - está marcado como pagado (paid === true),
 *  - su type coincide con la dirección del préstamo (cobrar un `lent` entra como
 *    ingreso; pagar un `borrowed` sale como gasto),
 *  - pertenece a la misma cuenta del préstamo (accountId === debt.accountId),
 *  - NO está ya vinculado a ninguna deuda (sin debtId),
 *  - NO pertenece a un pago periódico (sin recurringPaymentId),
 *  - NO es la mitad de un par de pago de tarjeta (sin linkedTransactionId).
 *
 * Se ordenan por fecha descendente y se acotan para mantener la UI ligera.
 */
export const getDebtLinkCandidates = (
  transactions: readonly Transaction[],
  debt: Debt,
  limit = 30,
): Transaction[] => {
  if (!debt.accountId) return [];
  const expectedType = debt.type === 'lent' ? 'income' : 'expense';

  return transactions
    .filter((transaction) => {
      if (!transaction.id) return false;
      if (transaction.paid !== true) return false;
      if (transaction.type !== expectedType) return false;
      if (transaction.accountId !== debt.accountId) return false;
      if (transaction.debtId) return false;
      if (transaction.recurringPaymentId) return false;
      if (transaction.linkedTransactionId) return false;
      return true;
    })
    .sort((left, right) => (
      new Date(right.date).getTime() - new Date(left.date).getTime()
    ))
    .slice(0, limit);
};
