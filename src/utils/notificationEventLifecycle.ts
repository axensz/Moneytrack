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

type EventRevisionInput = Pick<Notification, 'eventKey' | 'stage' | 'stageWindow'>;

const eventSegment = (value: string): string => encodeURIComponent(value);

export const buildBudgetEventKey = (budgetId: string, localMonth: string): string =>
  `budget:${eventSegment(budgetId)}:${eventSegment(localMonth)}`;

export const buildRecurringEventKey = (recurringPaymentId: string, cycle: string): string =>
  `recurring:${eventSegment(recurringPaymentId)}:${eventSegment(cycle)}`;

export const buildDailyExpenseEventKey = (localDate: string): string =>
  `daily-expense:${eventSegment(localDate)}`;

export const buildDebtEventKey = (debtId: string, localMonth: string): string =>
  `debt:${eventSegment(debtId)}:${eventSegment(localMonth)}`;

export const eventDocumentId = (eventKey: string): string => `event:${eventSegment(eventKey)}`;

export function getCanonicalEventRevision({
  eventKey,
  stage,
  stageWindow,
}: EventRevisionInput): number | null {
  if (!eventKey || !stage || !stageWindow) return null;

  const fixedRevision = (stages: Array<[NotificationEventStage, number]>): number | null => {
    const match = stages.find(([expectedStage]) => expectedStage === stage);
    return match && stageWindow === stage ? match[1] : null;
  };
  const overdueRevision = (start: number): number | null => {
    if (stage !== 'overdue') return null;
    const occurrence = /^overdue:(0|[1-9]\d*)$/.exec(stageWindow)?.[1];
    return occurrence === undefined ? null : start + Number(occurrence);
  };

  if (eventKey.startsWith('recurring:')) {
    return fixedRevision([['d3', 1], ['d1', 2], ['due', 3]]) ?? overdueRevision(4);
  }
  if (eventKey.startsWith('budget:')) {
    return fixedRevision([['warning', 1], ['critical', 2], ['exceeded', 3]]);
  }
  if (eventKey.startsWith('daily-expense:')) {
    return fixedRevision([['daily', 1]]);
  }
  if (eventKey.startsWith('debt:')) {
    return fixedRevision([['due', 1], ['warning', 2], ['critical', 3], ['exceeded', 4]])
      ?? overdueRevision(5);
  }
  return null;
}

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

export function getDailyReminderCatchUp({
  now,
  timeZone,
  hour,
  minute,
  lastReminderLocalDate,
}: {
  now: Date;
  timeZone: string;
  hour: number;
  minute: number;
  lastReminderLocalDate?: string;
}): { localDate: string; shouldSend: boolean } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).reduce<Record<string, string>>((values, part) => {
    values[part.type] = part.value;
    return values;
  }, {});
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  const reachedScheduledTime = Number(parts.hour) > hour
    || (Number(parts.hour) === hour && Number(parts.minute) >= minute);

  return {
    localDate,
    shouldSend: reachedScheduledTime && lastReminderLocalDate !== localDate,
  };
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
  const canonicalRevision = isVersionedEventCandidate(candidate)
    ? getCanonicalEventRevision(candidate)
    : null;
  if (isVersionedEventCandidate(candidate) && canonicalRevision === null) {
    throw new Error('Invalid versioned notification stage');
  }
  const revision = canonicalRevision ?? 1;

  if (current && isVersionedNotification(current) && revision <= current.revision!) {
    return current;
  }

  const advancesCurrent = isVersionedNotification(current) && revision > current.revision;
  const lifecycleStatus = candidate.lifecycleStatus ?? 'active';

  return {
    ...current,
    ...candidate,
    id: current?.id ?? candidate.id,
    createdAt: current?.createdAt ?? candidate.createdAt,
    schemaVersion: NOTIFICATION_EVENT_SCHEMA_VERSION,
    revision,
    stageWindow: candidate.stageWindow ?? candidate.stage,
    lifecycleStatus,
    isRead: false,
    readRevision: undefined,
    dismissedRevision: undefined,
    dismissedAt: undefined,
    scheduledAt: lifecycleStatus === 'scheduled'
      ? candidate.scheduledAt ?? candidate.createdAt
      : undefined,
    resolvedRevision: advancesCurrent
      ? current.revision
      : lifecycleStatus === 'resolved'
        ? revision
        : undefined,
    resolvedAt: advancesCurrent || lifecycleStatus === 'resolved'
      ? candidate.resolvedAt ?? candidate.createdAt
      : undefined,
  };
}
