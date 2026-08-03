import type { Notification, NotificationEventStage } from '../types/finance';

export const NOTIFICATION_EVENT_SCHEMA_VERSION = 2 as const;

export type VersionedNotification = Notification & {
  schemaVersion: typeof NOTIFICATION_EVENT_SCHEMA_VERSION;
  eventKey: string;
  revision: number;
};

export type VersionedEventCandidate = Notification & {
  schemaVersion: typeof NOTIFICATION_EVENT_SCHEMA_VERSION;
  eventKey: string;
};

export type RecurringStageWindow = {
  stage: Extract<NotificationEventStage, 'd3' | 'd1' | 'due' | 'overdue'>;
  stageWindow: string;
  overdueOccurrence?: number;
};

export const buildBudgetEventKey = (budgetId: string, localMonth: string): string =>
  `budget:${budgetId}:${localMonth}`;

export const buildRecurringEventKey = (recurringPaymentId: string, cycle: string): string =>
  `recurring:${recurringPaymentId}:${cycle}`;

export const buildDailyExpenseEventKey = (localDate: string): string =>
  `daily-expense:${localDate}`;

export const buildDebtEventKey = (debtId: string, localMonth: string): string =>
  `debt:${debtId}:${localMonth}`;

export const eventDocumentId = (eventKey: string): string => `event:${eventKey}`;

export function getRecurringStageWindow(daysUntilDue: number): RecurringStageWindow | null {
  if (daysUntilDue === 3) return { stage: 'd3', stageWindow: 'd3' };
  if (daysUntilDue === 1) return { stage: 'd1', stageWindow: 'd1' };
  if (daysUntilDue === 0) return { stage: 'due', stageWindow: 'due' };
  if (daysUntilDue > -1) return null;

  const overdueOccurrence = Math.floor((-daysUntilDue - 1) / 7);
  return {
    stage: 'overdue',
    stageWindow: `overdue:${overdueOccurrence}`,
    overdueOccurrence,
  };
}

export function getDailyReminderDisposition(
  scheduledLocalDate: string,
  currentLocalDate: string
): 'pending' | 'due' | 'skipped' {
  if (scheduledLocalDate > currentLocalDate) return 'pending';
  return scheduledLocalDate === currentLocalDate ? 'due' : 'skipped';
}

export function isVersionedEventCandidate(
  notification: Notification | undefined
): notification is VersionedEventCandidate {
  return notification?.schemaVersion === NOTIFICATION_EVENT_SCHEMA_VERSION
    && typeof notification.eventKey === 'string'
    && notification.eventKey.length > 0;
}

export function isVersionedNotification(
  notification: Notification | undefined
): notification is VersionedNotification {
  return isVersionedEventCandidate(notification)
    && Number.isInteger(notification.revision)
    && notification.revision! > 0;
}

export function isNotificationRead(notification: Notification): boolean {
  return isVersionedNotification(notification)
    ? notification.readRevision === notification.revision
    : notification.isRead;
}

export function isNotificationDismissed(notification: Notification): boolean {
  return isVersionedNotification(notification)
    && notification.dismissedRevision === notification.revision;
}

/**
 * Versioned events are one canonical document per deterministic event key.
 * A stale candidate deliberately returns the current object unchanged.
 */
export function advanceVersionedNotification(
  current: Notification | undefined,
  candidate: Notification
): Notification {
  const revision = Number.isInteger(candidate.revision) && candidate.revision! > 0
    ? candidate.revision!
    : 1;

  if (current && isVersionedNotification(current) && revision <= current.revision!) {
    return current;
  }

  return {
    ...current,
    ...candidate,
    id: current?.id ?? candidate.id,
    createdAt: current?.createdAt ?? candidate.createdAt,
    schemaVersion: NOTIFICATION_EVENT_SCHEMA_VERSION,
    revision,
    stageWindow: candidate.stageWindow ?? candidate.stage,
    lifecycleStatus: candidate.lifecycleStatus ?? 'active',
    isRead: false,
    readRevision: current?.readRevision,
    dismissedRevision: current?.dismissedRevision,
    dismissedAt: current?.dismissedAt,
  };
}
