import type { RecurringPayment } from '../types/finance';
import {
  calendarDateDifference,
  effectiveDueDay,
  getZonedDateTimeParts,
  localDateKeyFromParts,
} from './recurringDates';

export const REMINDER_STAGE_LOCAL_TIME = '09:00' as const;

export interface RecurringReminderCursor {
  cycleKey: string;
  dueLocalDate: string;
  stageWindow: 'd3' | 'd1' | 'due' | `overdue:${number}` | null;
}

type StageWindow = RecurringReminderCursor['stageWindow'];

const stageRank = (stageWindow: StageWindow): number | null => {
  if (stageWindow === 'd3') return 1;
  if (stageWindow === 'd1') return 2;
  if (stageWindow === 'due') return 3;
  const occurrence = /^overdue:(0|[1-9]\d*)$/.exec(stageWindow ?? '')?.[1];
  return occurrence === undefined ? null : 4 + Number(occurrence);
};

export const isRecurringReminderStageWindow = (value: unknown): value is Exclude<StageWindow, null> =>
  typeof value === 'string' && stageRank(value as StageWindow) !== null;

const cycleFor = (
  payment: RecurringPayment,
  year: number,
  month: number
): Omit<RecurringReminderCursor, 'stageWindow'> => {
  const day = effectiveDueDay(payment.dueDay, year, month);
  return {
    cycleKey: `${year}-${month}-${day}`,
    dueLocalDate: localDateKeyFromParts({ year, month, day }),
  };
};

const latestCycle = (
  payment: RecurringPayment,
  now: Date,
  timeZone: string
): Omit<RecurringReminderCursor, 'stageWindow'> => {
  const localNow = getZonedDateTimeParts(now, timeZone);
  const month = payment.frequency === 'yearly'
    ? payment.createdAt
      ? getZonedDateTimeParts(new Date(payment.createdAt), timeZone).month
      : localNow.month
    : localNow.month;
  return cycleFor(payment, localNow.year, month);
};

const followingCycle = (
  payment: RecurringPayment,
  cursor: Omit<RecurringReminderCursor, 'stageWindow'>
): Omit<RecurringReminderCursor, 'stageWindow'> => {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(cursor.cycleKey);
  if (!match) return cursor;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (payment.frequency === 'yearly') return cycleFor(payment, year + 1, month);
  const next = new Date(Date.UTC(year, month + 1, 1));
  return cycleFor(payment, next.getUTCFullYear(), next.getUTCMonth());
};

const activeStageAt = (
  dueLocalDate: string,
  now: Date,
  timeZone: string
): StageWindow => {
  const localNow = getZonedDateTimeParts(now, timeZone);
  const today = localDateKeyFromParts(localNow);
  const [stageHour, stageMinute] = REMINDER_STAGE_LOCAL_TIME.split(':').map(Number);
  const reachedStageTime = localNow.hour > stageHour
    || (localNow.hour === stageHour && localNow.minute >= stageMinute);
  const effectiveDay = calendarDateDifference(dueLocalDate, today) - (reachedStageTime ? 0 : 1);

  if (effectiveDay < -3) return null;
  if (effectiveDay < -1) return 'd3';
  if (effectiveDay < 0) return 'd1';
  if (effectiveDay === 0) return 'due';
  return `overdue:${Math.floor((effectiveDay - 1) / 7)}`;
};

export function evaluateRecurringReminderCursor(input: {
  payment: RecurringPayment;
  now: Date;
  timeZone: string;
  cursor?: RecurringReminderCursor;
  isPaid: (cycleKey: string) => boolean;
}): {
  nextCursor: RecurringReminderCursor;
  resolvedCycleKey?: string;
  activeStageWindow: StageWindow;
} {
  const { payment, now, timeZone, cursor, isPaid } = input;
  const persistedSelection = cursor
    ? { cycleKey: cursor.cycleKey, dueLocalDate: cursor.dueLocalDate }
    : undefined;
  const cursorPaid = persistedSelection ? isPaid(persistedSelection.cycleKey) : false;
  let selected = persistedSelection && !cursorPaid
    ? persistedSelection
    : latestCycle(payment, now, timeZone);
  const selectedPaid = isPaid(selected.cycleKey);
  const resolvedCycleKey = cursorPaid
    ? persistedSelection!.cycleKey
    : selectedPaid
      ? selected.cycleKey
      : undefined;

  if (selectedPaid) selected = followingCycle(payment, selected);

  let activeStageWindow = activeStageAt(selected.dueLocalDate, now, timeZone);
  if (cursor && !cursorPaid && cursor.cycleKey === selected.cycleKey) {
    const persistedRank = stageRank(cursor.stageWindow);
    const activeRank = stageRank(activeStageWindow);
    if (persistedRank !== null && (activeRank === null || persistedRank > activeRank)) {
      activeStageWindow = cursor.stageWindow;
    }
  }

  return {
    nextCursor: { ...selected, stageWindow: activeStageWindow },
    resolvedCycleKey,
    activeStageWindow,
  };
}
