import { LOAN_CATEGORY, LOAN_PAYMENT_CATEGORY } from '../config/constants';
import type { Debt, Transaction } from '../types/finance';
import { roundMoney } from './formatters';
import { LedgerMutationValidationError, normalizeLedgerAmount } from './ledgerMutation';

function rejectDebtEdit(message: string): never {
  throw new LedgerMutationValidationError('INVALID_ACCOUNT_AUTHORITY', message);
}

/** Plan compartido por Firestore e invitado; el adaptador confirma ambos documentos juntos. */
export function planDebtTransactionEdit(
  before: Transaction,
  after: Transaction,
  debt: Debt | undefined,
): (Pick<Debt, 'originalAmount' | 'remainingAmount' | 'isSettled'> & { settledAt: Date | null }) | null {
  if (!before.debtId && !after.debtId) return null;
  for (const field of [
    'debtId', 'type', 'category', 'paid', 'accountId', 'toAccountId', 'linkedTransactionId',
    'installments', 'hasInterest', 'interestRate', 'monthlyInstallmentAmount', 'totalInterestAmount',
  ] as const) {
    if (before[field] !== after[field]) {
      rejectDebtEdit('Solo puedes editar el monto, la fecha y los datos descriptivos de un movimiento de préstamo.');
    }
  }
  if (!debt || debt.id !== before.debtId) {
    rejectDebtEdit('El préstamo del movimiento ya no existe. Actualiza e intenta de nuevo.');
  }
  const amountBefore = normalizeLedgerAmount(before.amount);
  const amountAfter = normalizeLedgerAmount(after.amount);
  if (amountBefore === amountAfter) return null;
  if (
    before.hasInterest || (before.installments ?? 1) > 1
    || (before.interestRate ?? 0) !== 0 || (before.totalInterestAmount ?? 0) !== 0
    || (before.monthlyInstallmentAmount ?? 0) !== 0
  ) {
    rejectDebtEdit('El préstamo tiene cuotas o intereses que requieren reconciliación antes de cambiar su monto.');
  }
  const isPrincipal = before.category === LOAN_CATEGORY;
  const expectedType = (debt.type === 'lent') === isPrincipal ? 'expense' : 'income';
  if (
    !['lent', 'borrowed'].includes(debt.type)
    || (!isPrincipal && before.category !== LOAN_PAYMENT_CATEGORY)
    || before.type !== expectedType || before.paid !== true || before.linkedTransactionId
    || debt.forgivenReason
    || (isPrincipal && (debt.accountId !== before.accountId || debt.originalAmount !== amountBefore))
    || !Number.isFinite(debt.remainingAmount) || debt.remainingAmount < 0
    || debt.remainingAmount > debt.originalAmount
    || debt.isSettled !== (debt.remainingAmount === 0)
  ) {
    rejectDebtEdit('El movimiento del préstamo requiere reconciliación antes de cambiar su monto.');
  }
  const originalBefore = normalizeLedgerAmount(debt.originalAmount);
  const delta = roundMoney(amountAfter - amountBefore);
  const originalAmount = isPrincipal ? amountAfter : originalBefore;
  const remainingAmount = roundMoney(debt.remainingAmount + (isPrincipal ? delta : -delta));
  if (remainingAmount < 0 || remainingAmount > originalAmount) {
    rejectDebtEdit('El monto no puede exceder el préstamo ni los pagos ya registrados.');
  }
  const isSettled = remainingAmount === 0;
  return { originalAmount, remainingAmount, isSettled, settledAt: isSettled ? after.date : null };
}
