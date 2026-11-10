import { SPECIAL_CATEGORIES } from '../config/constants';
import type { Debt, Transaction } from '../types/finance';
import { roundMoney } from './formatters';
import { calculateMonthlyInterestCharge, getFirstInterestDate, getMonthlyInterestAccrual } from '../../functions/src/shared/debtMonthlyInterest';

export type DebtInterest = Pick<Debt, 'totalInterestAmount' | 'interestMode' | 'interestRate' | 'installments' | 'monthlyInstallmentAmount' | 'interestAccrual' | 'interestCutoffDay' | 'nextInterestDate'>;

export function initializeMonthlyDebtInterest<T extends Omit<Debt, 'id' | 'createdAt'>>(debt: T, now = new Date()): T {
  if (debt.interestAccrual !== 'monthly') return debt;
  if ((debt.interestMode !== 'card' && debt.interestMode !== 'percentage') || debt.interestRate === undefined || debt.interestCutoffDay === undefined) {
    throw new Error('Define la tasa mensual o de tarjeta y el día de corte del préstamo');
  }
  calculateMonthlyInterestCharge(debt.originalAmount, debt.interestMode, debt.interestRate);
  const nextInterestDate = getFirstInterestDate(debt.lentDate ?? now, debt.interestCutoffDay);
  const initial = { ...debt, totalInterestAmount: 0, remainingAmount: debt.originalAmount, nextInterestDate };
  const updates = getMonthlyInterestAccrual(initial, now);
  if (!updates && nextInterestDate <= now) throw new Error('El interés acumulado supera el límite del préstamo');
  return { ...initial, ...updates };
}

export const getDebtTotalAmount = (debt: Pick<Debt, 'originalAmount' | 'totalInterestAmount'>): number =>
  roundMoney(debt.originalAmount + (debt.totalInterestAmount ?? 0));

export function validateDebtPrincipalAdjustment(debt: Debt, amount: number, operation: 'add' | 'subtract'): void {
  if (debt.interestAccrual === 'monthly') {
    throw new Error('El interés mensual usa el capital original; registra un préstamo adicional para prestar más dinero');
  }
  if (debt.interestMode === 'card' && ((debt.installments ?? 1) > 1 || (debt.totalInterestAmount ?? 0) > 0)) {
    throw new Error('No puedes ajustar el capital financiado sin revisar sus cuotas e intereses');
  }
  if ((debt.totalInterestAmount ?? 0) > 0 && operation === 'subtract' && amount >= debt.originalAmount) {
    throw new Error('La resta no puede agotar el capital mientras el préstamo tiene intereses');
  }
}

export function validateDebtInterest(debt: DebtInterest): void {
  const interest = debt.totalInterestAmount ?? 0;
  if (!Number.isFinite(interest) || interest < 0 || interest > 1_000_000_000) {
    throw new Error('El interés debe ser un valor entre 0 y 1.000.000.000');
  }
  if (debt.interestMode !== undefined && !['fixed', 'percentage', 'card'].includes(debt.interestMode)) {
    throw new Error('El tipo de interés no es válido');
  }
  if (debt.interestRate !== undefined && (!Number.isFinite(debt.interestRate) || debt.interestRate < 0 || debt.interestRate > 200)) {
    throw new Error('La tasa debe estar entre 0% y 200%');
  }
  if (debt.installments !== undefined && (!Number.isInteger(debt.installments) || debt.installments < 1 || debt.installments > 36)) {
    throw new Error('Las cuotas deben estar entre 1 y 36');
  }
  if (debt.monthlyInstallmentAmount !== undefined && (!Number.isFinite(debt.monthlyInstallmentAmount) || debt.monthlyInstallmentAmount < 0 || debt.monthlyInstallmentAmount > 1_000_000_000)) {
    throw new Error('La cuota de referencia no es válida');
  }
  if (debt.interestAccrual !== undefined && !['upfront', 'monthly'].includes(debt.interestAccrual)) throw new Error('La modalidad de interés no es válida');
  if (debt.interestAccrual === 'monthly' && (
    (debt.interestMode !== 'percentage' && debt.interestMode !== 'card')
    || debt.interestRate === undefined
    || !Number.isInteger(debt.interestCutoffDay) || debt.interestCutoffDay! < 1 || debt.interestCutoffDay! > 31
    || !debt.nextInterestDate
  )) throw new Error('Revisa la tasa, el día de corte y la próxima fecha de interés');
}

export function isDebtPrincipalCandidate(transaction: Transaction, type: Debt['type']): boolean {
  return Boolean(transaction.id && transaction.paid && transaction.accountId
    && transaction.type === (type === 'lent' ? 'expense' : 'income')
    && !transaction.debtId && !transaction.recurringPaymentId && !transaction.linkedTransactionId
    && !transaction.toAccountId && !transaction.recurringCycle
    && !['credit-payment', 'balance-adjustment', 'recurring-post', 'migration'].includes(transaction.mutationKind ?? '')
    && !['account', 'debt', 'recurring', 'migration'].includes(transaction.mutationSource ?? '')
    && !SPECIAL_CATEGORIES.adjustmentCategories.includes(transaction.category));
}

/** El movimiento persistido manda sobre el borrador para no duplicar ni cambiar dinero. */
export function debtFromPrincipalTransaction<T extends Omit<Debt, 'id' | 'createdAt'>>(debt: T, transaction: Transaction): T {
  if (!isDebtPrincipalCandidate(transaction, debt.type)) {
    throw new Error('La transacción ya está vinculada o no corresponde a este préstamo. Elige un movimiento pagado compatible.');
  }
  if (transaction.hasInterest && transaction.totalInterestAmount === undefined) {
    throw new Error('La transacción no tiene el interés calculado. Revisa sus cuotas antes de asociarla.');
  }
  const interest: DebtInterest = debt.interestAccrual === 'monthly' ? {
    ...debt,
    installments: transaction.installments ?? debt.installments,
    monthlyInstallmentAmount: transaction.monthlyInstallmentAmount ?? debt.monthlyInstallmentAmount,
    ...(transaction.hasInterest ? { interestMode: 'card' as const, interestRate: transaction.interestRate ?? debt.interestRate } : {}),
  } : transaction.hasInterest ? {
    totalInterestAmount: transaction.totalInterestAmount,
    interestMode: 'card',
    interestRate: transaction.interestRate,
    installments: transaction.installments,
    monthlyInstallmentAmount: transaction.monthlyInstallmentAmount,
  } : {
    totalInterestAmount: debt.totalInterestAmount,
    interestMode: debt.interestMode,
    interestRate: debt.interestRate,
    installments: transaction.installments ?? debt.installments,
    monthlyInstallmentAmount: debt.monthlyInstallmentAmount,
  };
  const result = {
    ...debt, ...interest,
    originalAmount: transaction.amount,
    accountId: transaction.accountId,
    lentDate: transaction.date,
    isSettled: false,
  };
  const normalized = debt.interestAccrual === 'monthly'
    ? initializeMonthlyDebtInterest(result)
    : { ...result, remainingAmount: getDebtTotalAmount(result) };
  validateDebtInterest(normalized);
  return normalized;
}
