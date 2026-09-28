import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDailyExpenseReminder } from '../../hooks/useDailyExpenseReminder';
import type { NotificationManager } from '../../services/NotificationManager';
import type { NotificationPreferences } from '../../types/finance';

const preferences = (overrides: Partial<NotificationPreferences['dailyExpenseReminder']> = {}, timeZone = 'America/Bogota'): NotificationPreferences => ({
  schemaVersion: 2, timeZone,
  enabled: { budget: true, recurring: true, unusualSpending: true, lowBalance: true, debt: true },
  thresholds: { budgetWarning: 80, budgetCritical: 90, budgetExceeded: 100, unusualSpending: 200, lowBalance: 100_000 },
  quietHours: { enabled: false, startHour: 22, endHour: 7 },
  browserNotifications: { enabled: false },
  dailyExpenseReminder: { enabled: true, hour: 9, minute: 0, ...overrides },
});
const manager = () => ({ createNotification: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationManager);

describe('useDailyExpenseReminder — catch-up por fecha local', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('evalúa inmediatamente y produce a lo sumo un evento de la fecha local', async () => {
    vi.setSystemTime(new Date('2026-06-15T14:01:00.000Z'));
    const notificationManager = manager();
    renderHook(() => useDailyExpenseReminder(notificationManager, preferences()));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60 * 1000); });
    expect(notificationManager.createNotification).toHaveBeenCalledTimes(1);
    expect(notificationManager.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 2, eventKey: 'foreground:compat:daily-expense:2026-06-15',
      stage: 'daily', stageWindow: 'daily', lifecycleStatus: 'active',
      metadata: { reminderKey: 'daily-expense-reminder', localDate: '2026-06-15' },
    }));
    const candidate = vi.mocked(notificationManager.createNotification).mock.calls[0][0];
    expect(candidate).not.toHaveProperty('revision');
    expect(candidate).not.toHaveProperty('deliverySource');
  });

  it('reevalúa cada cinco minutos y hace catch-up de hoy, no agenda mañana', async () => {
    vi.setSystemTime(new Date('2026-06-15T13:59:00.000Z'));
    const notificationManager = manager();
    renderHook(() => useDailyExpenseReminder(notificationManager, preferences()));
    expect(notificationManager.createNotification).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
    expect(notificationManager.createNotification).toHaveBeenCalledTimes(1);
    expect(notificationManager.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'foreground:compat:daily-expense:2026-06-15',
    }));
  });

  it('la hora DST repetida no duplica la fecha local', async () => {
    vi.setSystemTime(new Date('2026-11-01T05:30:00.000Z'));
    const notificationManager = manager();
    renderHook(() => useDailyExpenseReminder(notificationManager, preferences({ hour: 1, minute: 30 }, 'America/New_York')));
    await act(async () => { await Promise.resolve(); });
    vi.setSystemTime(new Date('2026-11-01T06:30:00.000Z'));
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
    expect(notificationManager.createNotification).toHaveBeenCalledTimes(1);
    expect(notificationManager.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'foreground:compat:daily-expense:2026-11-01',
    }));
  });

  it('en un hueco DST entrega al primer instante válido posterior del mismo día', async () => {
    vi.setSystemTime(new Date('2026-03-08T07:00:00.000Z'));
    const notificationManager = manager();
    renderHook(() => useDailyExpenseReminder(
      notificationManager,
      preferences({ hour: 2, minute: 30 }, 'America/New_York'),
    ));
    await act(async () => { await Promise.resolve(); });
    expect(notificationManager.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'foreground:compat:daily-expense:2026-03-08',
    }));
  });

  it('deshabilitado no evalúa ni agenda', async () => {
    vi.setSystemTime(new Date('2026-06-15T14:01:00.000Z'));
    const notificationManager = manager();
    renderHook(() => useDailyExpenseReminder(notificationManager, preferences({ enabled: false })));
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60 * 1000); });
    expect(notificationManager.createNotification).not.toHaveBeenCalled();
  });
});
