import { describe, expect, it } from 'vitest';
import {
  advanceVersionedNotification,
  buildBudgetEventKey,
  buildDailyExpenseEventKey,
  buildDebtEventKey,
  buildRecurringEventKey,
  eventDocumentId,
  getDailyReminderDisposition,
  getCanonicalEventRevision,
  getDailyReminderCatchUp,
  getRecurringStageWindow,
  isNotificationDismissed,
  isNotificationRead,
} from '../../utils/notificationEventLifecycle';
import type { Notification } from '../../types/finance';

const versioned = (revision: number, overrides: Partial<Notification> = {}): Notification => ({
  id: 'event-recurring-rent-2026-08',
  type: 'recurring',
  title: 'Arriendo',
  message: 'Pendiente',
  severity: 'warning',
  isRead: false,
  createdAt: new Date('2026-08-01T14:00:00.000Z'),
  schemaVersion: 2,
  eventKey: 'recurring:rent:2026-08',
  revision,
  stage: revision === 1 ? 'd3' : 'd1',
  stageWindow: revision === 1 ? 'd3' : 'd1',
  lifecycleStatus: 'active',
  ...overrides,
});

describe('notificationEventLifecycle', () => {
  it('uses stable source identities instead of copy or wall-clock time', () => {
    expect(buildBudgetEventKey('budget-1', '2026-08')).toBe('budget:budget-1:2026-08');
    expect(buildRecurringEventKey('rent', '2026-08')).toBe('recurring:rent:2026-08');
    expect(buildDailyExpenseEventKey('2026-08-03')).toBe('daily-expense:2026-08-03');
    expect(buildDebtEventKey('debt-1', '2026-08')).toBe('debt:debt-1:2026-08');
  });

  it('encodes every identity segment injectively and never leaves a slash in a document id', () => {
    const budget = buildBudgetEventKey('/%:\u00f1', '2026/08%');
    const recurringA = buildRecurringEventKey('a:b', 'c');
    const recurringB = buildRecurringEventKey('a', 'b:c');

    expect(budget).toBe('budget:%2F%25%3A%C3%B1:2026%2F08%25');
    expect(buildDailyExpenseEventKey('/%:\u00f1')).toBe('daily-expense:%2F%25%3A%C3%B1');
    expect(buildDebtEventKey('/%:\u00f1', '2026/08%')).toBe('debt:%2F%25%3A%C3%B1:2026%2F08%25');
    expect(recurringA).not.toBe(recurringB);
    expect(eventDocumentId(budget)).toBe('event:budget%3A%252F%2525%253A%25C3%25B1%3A2026%252F08%2525');
    expect(eventDocumentId(budget)).not.toContain('/');
  });

  it('selects only the current recurring stage window after a missed check', () => {
    expect(getRecurringStageWindow(3)).toEqual({ stage: 'd3', stageWindow: 'd3' });
    expect(getRecurringStageWindow(1)).toEqual({ stage: 'd1', stageWindow: 'd1' });
    expect(getRecurringStageWindow(0)).toEqual({ stage: 'due', stageWindow: 'due' });
    expect(getRecurringStageWindow(-8)).toEqual({
      stage: 'overdue',
      stageWindow: 'overdue:1',
      overdueOccurrence: 1,
    });
    expect(getRecurringStageWindow(2)).toBeNull();
  });

  it('derives canonical revisions from source kind and stage window instead of accepting manual values', () => {
    const recurring = 'recurring:rent:2026-08';
    expect(getCanonicalEventRevision({ eventKey: recurring, stage: 'd3', stageWindow: 'd3' })).toBe(1);
    expect(getCanonicalEventRevision({ eventKey: recurring, stage: 'd1', stageWindow: 'd1' })).toBe(2);
    expect(getCanonicalEventRevision({ eventKey: recurring, stage: 'due', stageWindow: 'due' })).toBe(3);
    expect(getCanonicalEventRevision({ eventKey: recurring, stage: 'overdue', stageWindow: 'overdue:0' })).toBe(4);
    expect(getCanonicalEventRevision({ eventKey: recurring, stage: 'overdue', stageWindow: 'overdue:1' })).toBe(5);
    expect(getCanonicalEventRevision({ eventKey: recurring, stage: 'overdue', stageWindow: 'overdue:2' })).toBe(6);
    expect(getCanonicalEventRevision({ eventKey: 'budget:b1:2026-08', stage: 'warning', stageWindow: 'warning' })).toBe(1);
    expect(getCanonicalEventRevision({ eventKey: 'budget:b1:2026-08', stage: 'critical', stageWindow: 'critical' })).toBe(2);
    expect(getCanonicalEventRevision({ eventKey: 'budget:b1:2026-08', stage: 'exceeded', stageWindow: 'exceeded' })).toBe(3);
    expect(getCanonicalEventRevision({ eventKey: 'daily-expense:2026-08-03', stage: 'daily', stageWindow: 'daily' })).toBe(1);
    expect(getCanonicalEventRevision({ eventKey: 'debt:d1:2026-08', stage: 'due', stageWindow: 'due' })).toBe(1);
    expect(getCanonicalEventRevision({ eventKey: 'debt:d1:2026-08', stage: 'warning', stageWindow: 'warning' })).toBe(2);
    expect(getCanonicalEventRevision({ eventKey: 'debt:d1:2026-08', stage: 'critical', stageWindow: 'critical' })).toBe(3);
    expect(getCanonicalEventRevision({ eventKey: 'debt:d1:2026-08', stage: 'overdue', stageWindow: 'overdue:2' })).toBe(7);

    const normalized = advanceVersionedNotification(
      versioned(1),
      versioned(99, { stage: 'd1', stageWindow: 'd1' })
    );
    expect(normalized.revision).toBe(2);
    expect(() => advanceVersionedNotification(
      versioned(1),
      versioned(2, { stage: 'd1', stageWindow: 'due' })
    )).toThrow('Invalid versioned notification stage');
  });

  it('catches up a daily reminder only in its current local date', () => {
    expect(getDailyReminderDisposition('2026-08-03', '2026-08-03')).toBe('due');
    expect(getDailyReminderDisposition('2026-08-02', '2026-08-03')).toBe('skipped');
    expect(getDailyReminderDisposition('2026-08-04', '2026-08-03')).toBe('pending');
  });

  it('catches up at the configured local time exactly once after a day or zone boundary', () => {
    expect(getDailyReminderCatchUp({
      now: new Date('2026-08-03T01:00:00.000Z'),
      timeZone: 'America/Bogota',
      hour: 20,
      minute: 0,
      lastReminderLocalDate: '2026-08-01',
    })).toEqual({ localDate: '2026-08-02', shouldSend: true });
    expect(getDailyReminderCatchUp({
      now: new Date('2026-08-03T01:00:00.000Z'),
      timeZone: 'Europe/Madrid',
      hour: 20,
      minute: 0,
      lastReminderLocalDate: '2026-08-02',
    })).toEqual({ localDate: '2026-08-03', shouldSend: false });
    expect(getDailyReminderCatchUp({
      now: new Date('2026-08-04T02:00:00.000Z'),
      timeZone: 'America/Bogota',
      hour: 20,
      minute: 0,
      lastReminderLocalDate: '2026-08-02',
    })).toEqual({ localDate: '2026-08-03', shouldSend: true });
    expect(getDailyReminderCatchUp({
      now: new Date('2026-08-04T02:00:00.000Z'),
      timeZone: 'America/Bogota',
      hour: 20,
      minute: 0,
      lastReminderLocalDate: '2026-08-03',
    })).toEqual({ localDate: '2026-08-03', shouldSend: false });
  });

  it('ignores equal or lower revisions without replacing newer state', () => {
    const current = versioned(2, { readRevision: 2, dismissedRevision: 2, isRead: true });
    const stale = versioned(1);

    expect(advanceVersionedNotification(current, stale)).toBe(current);
  });

  it('resolves the superseded revision without inheriting its read or dismissal state', () => {
    const current = versioned(1, {
      lifecycleStatus: 'scheduled',
      scheduledAt: new Date('2026-08-01T09:00:00.000Z'),
      readRevision: 1,
      dismissedRevision: 1,
      dismissedAt: new Date('2026-08-01T10:00:00.000Z'),
      isRead: true,
    });
    const next = advanceVersionedNotification(current, versioned(2, {
      createdAt: new Date('2026-08-02T14:00:00.000Z'),
      lifecycleStatus: 'active',
    }));

    expect(next).toMatchObject({
      id: 'event-recurring-rent-2026-08',
      revision: 2,
      isRead: false,
      lifecycleStatus: 'active',
      resolvedRevision: 1,
      resolvedAt: new Date('2026-08-02T14:00:00.000Z'),
    });
    expect(next.readRevision).toBeUndefined();
    expect(next.dismissedRevision).toBeUndefined();
    expect(next.dismissedAt).toBeUndefined();
    expect(next.scheduledAt).toBeUndefined();
    expect(isNotificationRead(next)).toBe(false);
    expect(isNotificationDismissed(next)).toBe(false);
  });
});
