import { describe, expect, it } from 'vitest';
import {
  advanceVersionedNotification,
  buildBudgetEventKey,
  buildDailyExpenseEventKey,
  buildDebtEventKey,
  buildRecurringEventKey,
  getDailyReminderDisposition,
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

  it('catches up a daily reminder only in its current local date', () => {
    expect(getDailyReminderDisposition('2026-08-03', '2026-08-03')).toBe('due');
    expect(getDailyReminderDisposition('2026-08-02', '2026-08-03')).toBe('skipped');
    expect(getDailyReminderDisposition('2026-08-04', '2026-08-03')).toBe('pending');
  });

  it('ignores equal or lower revisions without replacing newer state', () => {
    const current = versioned(2, { readRevision: 2, dismissedRevision: 2, isRead: true });
    const stale = versioned(1);

    expect(advanceVersionedNotification(current, stale)).toBe(current);
  });

  it('makes a higher revision visible and unread after a prior dismissal', () => {
    const current = versioned(1, { readRevision: 1, dismissedRevision: 1, isRead: true });
    const next = advanceVersionedNotification(current, versioned(2));

    expect(next).toMatchObject({
      id: 'event-recurring-rent-2026-08',
      revision: 2,
      isRead: false,
      readRevision: 1,
      dismissedRevision: 1,
    });
    expect(isNotificationRead(next)).toBe(false);
    expect(isNotificationDismissed(next)).toBe(false);
  });
});
