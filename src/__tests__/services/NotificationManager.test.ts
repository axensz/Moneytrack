/**
 * A3 — NotificationManager: gating por preferencias, deduplicación y toasts.
 *
 * Verifica que respeta `preferences.enabled` por tipo, deduplica dentro de la
 * ventana de debounce (60s), y decide toasts por severidad / quiet hours. Audit A3.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

import { NotificationManager } from '../../services/NotificationManager';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../types/finance';
import type { Notification, NotificationPreferences } from '../../types/finance';

const setup = (prefs: Partial<NotificationPreferences> = {}, notifications: Notification[] = []) => {
  const addNotification = vi.fn().mockResolvedValue(undefined);
  const mgr = new NotificationManager({
    addNotification,
    updateNotification: vi.fn().mockResolvedValue(undefined),
    deleteNotification: vi.fn().mockResolvedValue(undefined),
    clearAll: vi.fn().mockResolvedValue(undefined),
    markAllAsRead: vi.fn().mockResolvedValue(undefined),
    notifications,
    preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...prefs },
  });
  return { mgr, addNotification };
};

const notif = (o: Partial<Notification> = {}): Omit<Notification, 'id' | 'createdAt'> => ({
  type: 'budget', title: 'Presupuesto', message: 'm', severity: 'warning', isRead: false,
  ...o,
} as Notification);

describe('NotificationManager (A3)', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('NO crea la notificación si su tipo está deshabilitado en preferencias', async () => {
    const { mgr, addNotification } = setup({ enabled: { ...DEFAULT_NOTIFICATION_PREFERENCES.enabled, budget: false } });
    await mgr.createNotification(notif({ type: 'budget' }));
    expect(addNotification).not.toHaveBeenCalled();
  });

  it('crea la notificación si su tipo está habilitado', async () => {
    const { mgr, addNotification } = setup();
    await mgr.createNotification(notif({ type: 'budget' }));
    expect(addNotification).toHaveBeenCalledTimes(1);
  });

  it('deduplica llamadas idénticas dentro de la ventana de debounce y vuelve a permitir tras ella', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
    const { mgr, addNotification } = setup();

    await mgr.createNotification(notif({ metadata: { budgetId: 'b1' } }));
    await mgr.createNotification(notif({ metadata: { budgetId: 'b1' } })); // duplicado
    expect(addNotification).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-06-15T12:02:00')); // +2 min > 60s
    await mgr.createNotification(notif({ metadata: { budgetId: 'b1' } }));
    expect(addNotification).toHaveBeenCalledTimes(2);
  });

  it('shouldShowToast: solo para severidad warning/error', () => {
    const { mgr } = setup();
    expect(mgr.shouldShowToast(notif({ severity: 'warning' }))).toBe(true);
    expect(mgr.shouldShowToast(notif({ severity: 'error' }))).toBe(true);
    expect(mgr.shouldShowToast(notif({ severity: 'info' }))).toBe(false);
    expect(mgr.shouldShowToast(notif({ severity: 'success' }))).toBe(false);
  });

  it('quiet hours: suprime toasts dentro de la ventana nocturna', () => {
    vi.useFakeTimers();
    const { mgr } = setup({ quietHours: { enabled: true, startHour: 22, endHour: 8 } });

    vi.setSystemTime(new Date('2026-06-15T23:30:00')); // dentro de [22, 8)
    expect(mgr.isInQuietHours()).toBe(true);
    expect(mgr.shouldShowToast(notif({ severity: 'warning' }))).toBe(false);

    vi.setSystemTime(new Date('2026-06-15T12:00:00')); // fuera
    expect(mgr.isInQuietHours()).toBe(false);
    expect(mgr.shouldShowToast(notif({ severity: 'warning' }))).toBe(true);
  });

  it('quiet hours con startHour === endHour NO silencia (rango vacío, no 24/7)', () => {
    vi.useFakeTimers();
    const { mgr } = setup({ quietHours: { enabled: true, startHour: 22, endHour: 22 } });

    vi.setSystemTime(new Date('2026-06-15T22:30:00')); // dentro de la "ventana" degenerada
    expect(mgr.isInQuietHours()).toBe(false);
    expect(mgr.shouldShowToast(notif({ severity: 'warning' }))).toBe(true);
  });

  it('getUnreadCount cuenta solo las no leídas', () => {
    const read = { id: '1', createdAt: new Date(), isRead: true } as Notification;
    const unread = { id: '2', createdAt: new Date(), isRead: false } as Notification;
    const { mgr } = setup({}, [read, unread, { ...unread, id: '3' }]);
    expect(mgr.getUnreadCount()).toBe(2);
  });
});
