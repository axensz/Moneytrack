import { formatDateForInput, parseCurrency, parseDateFromInput, roundMoney } from '../../../../utils/formatters';
import { calculateInterest } from '../../../../utils/interestCalculator';
import { debtFromPrincipalTransaction, getDebtTotalAmount, initializeMonthlyDebtInterest, validateDebtInterest, type DebtInterest } from '../../../../utils/debtInterest';
import type { Account, Debt, Transaction } from '../../../../types/finance';

export interface DebtFormData {
  personName: string;
  type: 'lent' | 'borrowed';
  originalAmount: string;
  description: string;
  accountId: string;
  lentDate: string;
  dueDate: string;
  existingTransactionId: string;
  interestMode: 'none' | 'fixed' | 'percentage' | 'card';
  interestAccrual: 'upfront' | 'monthly';
  interestCutoffDay: string;
  interestValue: string;
  installments: number;
}

export const createInitialDebtFormData = (): DebtFormData => ({
  personName: '',
  type: 'lent',
  originalAmount: '',
  description: '',
  accountId: '',
  lentDate: formatDateForInput(new Date()),
  dueDate: '',
  existingTransactionId: '',
  interestMode: 'none',
  interestAccrual: 'upfront',
  interestCutoffDay: '15',
  interestValue: '',
  installments: 1,
});

type DebtFormFinancials = Pick<Debt, 'originalAmount' | 'remainingAmount' | 'accountId' | 'lentDate' | 'interestAccrual' | 'interestCutoffDay' | 'nextInterestDate'> & DebtInterest;

export function getDebtFormFinancials(form: DebtFormData, accounts: Account[], transactions: Transaction[]): DebtFormFinancials {
  const source = form.existingTransactionId ? transactions.find(t => t.id === form.existingTransactionId) : undefined;
  if (form.existingTransactionId && !source) throw new Error('La transacción ya no está disponible');
  const originalAmount = source?.amount ?? parseCurrency(form.originalAmount);
  if (!Number.isFinite(originalAmount) || originalAmount <= 0) throw new Error('El monto debe ser mayor a 0');
  const isMonthly = form.interestAccrual === 'monthly';
  const interestMode = source?.hasInterest ? 'card' : form.interestMode;
  if (isMonthly && interestMode !== 'card' && interestMode !== 'percentage') throw new Error('El interés mensual requiere porcentaje o tasa de tarjeta');
  const account = accounts.find(a => a.id === (source?.accountId ?? form.accountId));
  const interestCutoffDay = interestMode === 'card' ? account?.cutoffDay : Number(form.interestCutoffDay);
  if (isMonthly && (!Number.isInteger(interestCutoffDay) || (interestCutoffDay ?? 0) < 1 || (interestCutoffDay ?? 0) > 31)) {
    throw new Error(interestMode === 'card' ? 'Configura el día de corte de la tarjeta en Cuentas' : 'El día de corte debe estar entre 1 y 31');
  }
  let interest: DebtInterest = {};
  if ((!source?.hasInterest || isMonthly) && interestMode !== 'none') {
    if (interestMode === 'card') {
      const rate = source?.hasInterest ? source.interestRate ?? account?.interestRate : account?.interestRate;
      if (account?.type !== 'credit' || rate === undefined) throw new Error('Selecciona una tarjeta con tasa E.A. configurada');
      if (!Number.isFinite(rate) || rate < 0 || rate > 200) throw new Error('La tasa de la tarjeta debe estar entre 0% y 200%');
      const installments = source?.installments ?? form.installments;
      if (!Number.isInteger(installments) || installments < 1 || installments > 36) throw new Error('Las cuotas deben estar entre 1 y 36');
      const calculated = isMonthly ? null : calculateInterest(originalAmount, rate, installments, true);
      interest = { interestMode: 'card', interestRate: rate, installments, totalInterestAmount: calculated?.totalInterestAmount ?? 0,
        ...(calculated ? { monthlyInstallmentAmount: calculated.monthlyInstallmentAmount } : source?.monthlyInstallmentAmount !== undefined ? { monthlyInstallmentAmount: source.monthlyInstallmentAmount } : {}),
      };
    } else {
      const value = interestMode === 'fixed' ? parseCurrency(form.interestValue) : Number(form.interestValue.replace(',', '.'));
      if (!form.interestValue.trim() || !Number.isFinite(value) || value < 0) throw new Error('Ingresa un interés válido mayor o igual a 0');
      interest = { interestMode, totalInterestAmount: isMonthly ? 0 : interestMode === 'fixed' ? roundMoney(value) : roundMoney(originalAmount * value / 100), ...(interestMode === 'percentage' ? { interestRate: value } : {}) };
    }
    validateDebtInterest(interest);
  }
  const financials = {
    originalAmount, remainingAmount: getDebtTotalAmount({ originalAmount, ...interest }), accountId: form.accountId || undefined, ...interest,
    ...(interestMode !== 'none' ? { interestAccrual: isMonthly ? 'monthly' as const : 'upfront' as const } : {}),
    ...(isMonthly ? { interestCutoffDay } : {}),
  };
  const debt = { ...financials, personName: form.personName.trim(), type: form.type, isSettled: false, lentDate: form.lentDate ? parseDateFromInput(form.lentDate) : undefined };
  const result = source ? debtFromPrincipalTransaction(debt, source) : isMonthly ? initializeMonthlyDebtInterest(debt) : financials;
  if (getDebtTotalAmount(result) > 1_000_000_000) throw new Error('El total del préstamo no puede superar 1.000.000.000');
  return result;
}
