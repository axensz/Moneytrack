import type { RecurringPayment, Transaction } from '../types/finance';
import { cycleKey, effectiveDueDay, getYearlyAnchorMonth } from './recurringDates';

const recurringCycleStart = (key: string): Date | null => {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month
    || date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

export const isRecurringCycleKeyForPayment = (
  payment: RecurringPayment,
  targetCycle: string,
): boolean => {
  const start = recurringCycleStart(targetCycle);
  if (!start) return false;
  const year = start.getFullYear();
  const month = start.getMonth();
  if (start.getDate() !== effectiveDueDay(payment.dueDay, year, month)) return false;
  return payment.frequency !== 'yearly'
    || month === getYearlyAnchorMonth(payment, month);
};

/** One shared definition of a paid recurring cycle for UI, writers and monitors. */
export const recurringTransactionSatisfiesCycle = (
  payment: RecurringPayment,
  transaction: Transaction,
  reference: Date = new Date(),
): boolean => {
  if (
    !payment.id
    || transaction.recurringPaymentId !== payment.id
    || transaction.paid !== true
  ) {
    return false;
  }

  return recurringTransactionSatisfiesCycleKey(
    payment,
    transaction,
    cycleKey(payment, reference),
  );
};

export const recurringTransactionSatisfiesCycleKey = (
  payment: RecurringPayment,
  transaction: Transaction,
  targetCycle: string,
): boolean => {
  if (
    !payment.id
    || transaction.recurringPaymentId !== payment.id
    || transaction.paid !== true
  ) {
    return false;
  }

  if (transaction.recurringCycle) return transaction.recurringCycle === targetCycle;

  const transactionTime = new Date(transaction.date).getTime();
  if (!Number.isFinite(transactionTime)) return false;
  const start = recurringCycleStart(targetCycle);
  if (!start || !isRecurringCycleKeyForPayment(payment, targetCycle)) return false;
  const startYear = start.getFullYear();
  const startMonth = start.getMonth();
  const end = payment.frequency === 'yearly'
    ? new Date(
        startYear + 1,
        startMonth,
        effectiveDueDay(payment.dueDay, startYear + 1, startMonth),
      )
    : new Date(
        startYear,
        startMonth + 1,
        effectiveDueDay(payment.dueDay, startYear, startMonth + 1),
      );
  return transactionTime >= start.getTime() && transactionTime < end.getTime();
};

export const getRecurringLinkCandidates = (
  transactions: readonly Transaction[],
  payment: RecurringPayment,
  reference: Date = new Date(),
  limit = 30,
): Transaction[] => {
  const currentCycle = cycleKey(payment, reference);
  return transactions
    .filter((transaction) => {
      if (transaction.type !== 'expense' || transaction.paid !== true) return false;
      if (!transaction.recurringPaymentId) return true;
      if (transaction.recurringPaymentId !== payment.id) return false;
      return transaction.recurringCycle !== currentCycle;
    })
    .sort((left, right) => (
      new Date(right.date).getTime() - new Date(left.date).getTime()
    ))
    .slice(0, limit);
};
