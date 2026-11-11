import type { Debt } from '../types/finance';
import { getFirstInterestDate } from '../../functions/src/shared/debtMonthlyInterest';

/** Un préstamo saldado no debe recuperar intereses de los meses que estuvo cerrado. */
export function reopenedDebtInterest(debt: Pick<Debt, 'isSettled' | 'interestAccrual' | 'interestCutoffDay'>, now = new Date()): Pick<Debt, 'nextInterestDate'> {
  if (!debt.isSettled || debt.interestAccrual !== 'monthly') return {};
  return { nextInterestDate: getFirstInterestDate(now, debt.interestCutoffDay ?? Number.NaN) };
}
