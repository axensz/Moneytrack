import type { RecurringPayment, Transaction } from '../types/finance';
import {
  cycleKey,
  effectiveDueDay,
  getZonedDateTimeParts,
  lastDayOfMonth,
} from './recurringDates';

interface RecurringCycleDate {
  year: number;
  month: number;
  day: number;
}

const recurringCycleStart = (key: string): RecurringCycleDate | null => {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > lastDayOfMonth(year, month)) return null;
  return { year, month, day };
};

export const DEFAULT_RECURRING_TIME_ZONE = 'America/Bogota';

const cycleKeyInTimeZone = (
  payment: RecurringPayment,
  reference: Date,
  timeZone: string,
): string => {
  const local = getZonedDateTimeParts(reference, timeZone);
  if (payment.frequency === 'yearly') {
    const month = yearlyAnchorMonth(payment, local.month, timeZone);
    const dueDay = effectiveDueDay(payment.dueDay, local.year, month);
    const year = local.month > month || (local.month === month && local.day >= dueDay)
      ? local.year
      : local.year - 1;
    return `${year}-${month}-${effectiveDueDay(payment.dueDay, year, month)}`;
  }

  let { year, month } = local;
  if (local.day < effectiveDueDay(payment.dueDay, year, month)) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  return `${year}-${month}-${effectiveDueDay(payment.dueDay, year, month)}`;
};

const calendarOrdinal = ({ year, month, day }: RecurringCycleDate): number =>
  Date.UTC(year, month, day);

const yearlyAnchorMonth = (
  payment: RecurringPayment,
  fallbackMonth: number,
  timeZone: string,
): number => {
  if (!payment.createdAt) return fallbackMonth;
  const createdAt = new Date(payment.createdAt);
  return Number.isFinite(createdAt.getTime())
    ? getZonedDateTimeParts(createdAt, timeZone).month
    : fallbackMonth;
};

export const isRecurringCycleKeyForPayment = (
  payment: RecurringPayment,
  targetCycle: string,
  timeZone: string = DEFAULT_RECURRING_TIME_ZONE,
): boolean => {
  const start = recurringCycleStart(targetCycle);
  if (!start) return false;
  const { year, month, day } = start;
  if (day !== effectiveDueDay(payment.dueDay, year, month)) return false;
  return payment.frequency !== 'yearly'
    || month === yearlyAnchorMonth(payment, month, timeZone);
};

/** One shared definition of a paid recurring cycle for UI, writers and monitors. */
export const recurringTransactionSatisfiesCycle = (
  payment: RecurringPayment,
  transaction: Transaction,
  reference: Date = new Date(),
  timeZone: string = DEFAULT_RECURRING_TIME_ZONE,
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
    cycleKeyInTimeZone(payment, reference, timeZone),
    timeZone,
  );
};

export const recurringTransactionSatisfiesCycleKey = (
  payment: RecurringPayment,
  transaction: Transaction,
  targetCycle: string,
  timeZone: string = DEFAULT_RECURRING_TIME_ZONE,
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
  if (!start || !isRecurringCycleKeyForPayment(payment, targetCycle, timeZone)) return false;
  const transactionLocalDate = getZonedDateTimeParts(new Date(transactionTime), timeZone);
  const end = payment.frequency === 'yearly'
    ? {
        year: start.year + 1,
        month: start.month,
        day: effectiveDueDay(payment.dueDay, start.year + 1, start.month),
      }
    : {
        year: start.month === 11 ? start.year + 1 : start.year,
        month: (start.month + 1) % 12,
        day: effectiveDueDay(
          payment.dueDay,
          start.month === 11 ? start.year + 1 : start.year,
          (start.month + 1) % 12,
        ),
      };
  const transactionOrdinal = calendarOrdinal(transactionLocalDate);
  return transactionOrdinal >= calendarOrdinal(start)
    && transactionOrdinal < calendarOrdinal(end);
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
