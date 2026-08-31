import { logger } from '../utils/logger';
import { formatCurrency } from '../utils/formatters';
import {
  addLocalCalendarDays,
  calendarDateDifference,
  getZonedDateTimeParts,
  localDateKeyInTimeZone,
} from '../utils/recurringDates';
import { REMINDER_STAGE_LOCAL_TIME } from '../utils/recurringReminderCursor';
import type { Debt, Notification, NotificationEventStage } from '../types/finance';
import { viewActionUrl } from '../hooks/useViewRouting';

export type DebtStageWindow =
  | 'borrowed:30'
  | 'borrowed:60'
  | `borrowed:weekly:${number}`
  | 'lent:90'
  | `lent:weekly:${number}`;

export function getDebtReminderStage({
  debt,
  now,
  timeZone,
}: {
  debt: Debt;
  now: Date;
  timeZone: string;
}): {
  stageWindow: DebtStageWindow;
  rank: number;
  scheduledLocalDate: string;
  stageValidUntilLocalDate: string;
} | null {
  const reference = debt.dueDate ?? debt.createdAt;
  if (!reference) return null;
  const anchor = localDateKeyInTimeZone(new Date(reference), timeZone);
  const localNow = getZonedDateTimeParts(now, timeZone);
  const today = localDateKeyInTimeZone(now, timeZone);
  const [stageHour, stageMinute] = REMINDER_STAGE_LOCAL_TIME.split(':').map(Number);
  const reachedStageTime = localNow.hour > stageHour
    || (localNow.hour === stageHour && localNow.minute >= stageMinute);
  const effectiveDay = calendarDateDifference(anchor, today) - (reachedStageTime ? 0 : 1);
  const window = (stageWindow: DebtStageWindow, rank: number, startDay: number, endDay: number) => ({
    stageWindow,
    rank,
    scheduledLocalDate: addLocalCalendarDays(anchor, startDay),
    stageValidUntilLocalDate: addLocalCalendarDays(anchor, endDay),
  });

  if (debt.type === 'borrowed') {
    if (effectiveDay < 30) return null;
    if (effectiveDay < 60) return window('borrowed:30', 1, 30, 60);
    if (effectiveDay < 67) return window('borrowed:60', 2, 60, 67);
    const occurrence = Math.floor((effectiveDay - 67) / 7);
    return window(`borrowed:weekly:${occurrence}`, 5 + occurrence, 67 + 7 * occurrence, 74 + 7 * occurrence);
  }

  if (effectiveDay < 90) return null;
  if (effectiveDay < 97) return window('lent:90', 1, 90, 97);
  const occurrence = Math.floor((effectiveDay - 97) / 7);
  return window(`lent:weekly:${occurrence}`, 5 + occurrence, 97 + 7 * occurrence, 104 + 7 * occurrence);
}

interface DebtMonitorDeps {
  createNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => Promise<void>;
  debts: Debt[];
  timeZone?: string;
  writerPrefix?: string;
  authorityConfigVersion?: number;
}

const lifecycleStage = (stageWindow: DebtStageWindow): {
  stage: NotificationEventStage;
  stageWindow: string;
  overdueOccurrence?: number;
} => {
  if (stageWindow === 'borrowed:30' || stageWindow === 'lent:90') {
    return { stage: 'due', stageWindow: 'due' };
  }
  if (stageWindow === 'borrowed:60') return { stage: 'warning', stageWindow: 'warning' };
  const occurrence = Number(/:weekly:(\d+)$/.exec(stageWindow)?.[1]);
  return { stage: 'overdue', stageWindow: `overdue:${occurrence}`, overdueOccurrence: occurrence };
};

export class DebtMonitor {
  public deps: DebtMonitorDeps;
  private lastCheckState: string | null = null;

  constructor(deps: DebtMonitorDeps) {
    this.deps = deps;
  }

  async checkOverdueDebts(): Promise<void> {
    try {
      const now = new Date();
      const timeZone = this.deps.timeZone
        ?? Intl.DateTimeFormat().resolvedOptions().timeZone
        ?? 'America/Bogota';
      const writerPrefix = this.deps.writerPrefix ?? 'foreground:compat';
      const evaluations = this.deps.debts
        .filter((debt) => !debt.isSettled && debt.id)
        .map((debt) => ({ debt, reminder: getDebtReminderStage({ debt, now, timeZone }) }));
      const currentState = JSON.stringify(evaluations.map(({ debt, reminder }) => [
        debt.id, debt.remainingAmount, reminder?.stageWindow ?? null,
      ]));
      if (this.lastCheckState === currentState) return;

      for (const { debt, reminder } of evaluations) {
        if (!reminder) continue;
        const debtId = debt.id!;
        const borrowed = debt.type === 'borrowed';
        const authority = this.deps.authorityConfigVersion === undefined
          ? {}
          : { authorityConfigVersion: this.deps.authorityConfigVersion };
        await this.deps.createNotification({
          type: 'debt',
          title: borrowed
            ? reminder.stageWindow === 'borrowed:30'
              ? `Recordatorio de deuda: ${debt.personName}`
              : `Deuda pendiente: ${debt.personName}`
            : `Préstamo pendiente: ${debt.personName}`,
          message: borrowed
            ? `Debes ${formatCurrency(debt.remainingAmount)} a ${debt.personName}`
            : `${debt.personName} te debe ${formatCurrency(debt.remainingAmount)}`,
          severity: reminder.stageWindow === 'borrowed:60' ? 'warning' : 'info',
          isRead: false,
          schemaVersion: 2,
          eventKey: `${writerPrefix}:debt:${encodeURIComponent(debtId)}`,
          ...lifecycleStage(reminder.stageWindow),
          lifecycleStatus: 'active',
          actionUrl: viewActionUrl('debts'),
          metadata: {
            debtId,
            amount: debt.remainingAmount,
            reminderKey: reminder.stageWindow,
            localDate: reminder.scheduledLocalDate,
          },
          ...authority,
        });
      }

      this.lastCheckState = currentState;
      logger.info('Debt check completed', { debtsChecked: evaluations.length });
    } catch (error) {
      logger.error('Debt monitor check failed', error);
    }
  }

  getDaysOutstanding(debt: Debt): number {
    const reference = debt.dueDate ?? debt.createdAt;
    if (!reference) return 0;
    const timeZone = this.deps.timeZone
      ?? Intl.DateTimeFormat().resolvedOptions().timeZone
      ?? 'America/Bogota';
    return calendarDateDifference(
      localDateKeyInTimeZone(new Date(reference), timeZone),
      localDateKeyInTimeZone(new Date(), timeZone),
    );
  }

  resetLastCheck(): void {
    this.lastCheckState = null;
  }

  /** Compatibility no-op: cadence is now represented by lifecycle stages. */
  clearReminderHistory(): void {}
}
