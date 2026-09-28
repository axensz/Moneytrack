/**
 * A3 — NotificationManager: gating por preferencias, deduplicación y toasts.
 *
 * Verifica que respeta `preferences.enabled` por tipo, deduplica dentro de la
 * ventana de debounce (60s), y decide toasts por severidad / quiet hours. Audit A3.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock('../../lib/browserNotifications', () => ({
  appNotificationToBrowserPayload: vi.fn((notification) => notification),
  showBrowserNotification: vi.fn().mockResolvedValue(undefined),
}));

import toast from 'react-hot-toast';
import { showBrowserNotification } from '../../lib/browserNotifications';
import { NotificationManager } from '../../services/NotificationManager';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../types/finance';
import type { Notification, NotificationPreferences } from '../../types/finance';

const setup = (prefs: Partial<NotificationPreferences> = {}, notifications: Notification[] = []) => {
  // Devuelve true = creó la notificación (false = ya existía, dedup diario).
  const addNotification = vi.fn().mockResolvedValue(true);
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

  it('no aplica debounce a candidatos v2 y deja la revisión al store transaccional', async () => {
    const { mgr, addNotification } = setup();
    const event = {
      schemaVersion: 2 as const,
      eventKey: 'budget:b1:2026-08',
      stage: 'warning' as const,
      stageWindow: 'warning',
      lifecycleStatus: 'active' as const,
    };

    await mgr.createNotification(notif(event));
    await mgr.createNotification(notif({ ...event, stage: 'critical', stageWindow: 'critical' }));

    expect(addNotification).toHaveBeenCalledTimes(2);
    expect(addNotification.mock.calls[0][0]).not.toHaveProperty('revision');
    expect(addNotification.mock.calls[1][0]).not.toHaveProperty('revision');
  });

  it('descarta una revisión v2 suministrada por el candidato antes de delegar', async () => {
    const { mgr, addNotification } = setup();
    await mgr.createNotification(notif({
      schemaVersion: 2,
      eventKey: 'budget:b1:2026-08',
      revision: 99,
      stage: 'warning',
      stageWindow: 'warning',
      lifecycleStatus: 'active',
    }));

    expect(addNotification).toHaveBeenCalledTimes(1);
    expect(addNotification.mock.calls[0][0]).not.toHaveProperty('revision');
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

  it('NO muestra toast si la notificación ya existía hoy (addNotification → false) — minor', async () => {
    vi.mocked(toast.error).mockClear();
    const { mgr, addNotification } = setup();
    addNotification.mockResolvedValue(false); // dedup diario: ya existe
    await mgr.createNotification(notif({ severity: 'error' }));
    expect(addNotification).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('publica feedback solo después de que la mutación del store tiene éxito', async () => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(showBrowserNotification).mockClear();
    const { mgr, addNotification } = setup({
      browserNotifications: { enabled: true },
    });
    addNotification.mockRejectedValue(new Error('offline'));

    await expect(mgr.createNotification(notif({ severity: 'error' }))).rejects.toThrow('offline');

    expect(toast.error).not.toHaveBeenCalled();
    expect(showBrowserNotification).not.toHaveBeenCalled();
  });

  it('muestra toast cuando addNotification SÍ crea la notificación', async () => {
    vi.mocked(toast.error).mockClear();
    const { mgr } = setup(); // mock devuelve true por defecto
    await mgr.createNotification(notif({ severity: 'error' }));
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('getUnreadCount cuenta solo las no leídas', () => {
    const read = { id: '1', createdAt: new Date(), isRead: true } as Notification;
    const unread = { id: '2', createdAt: new Date(), isRead: false } as Notification;
    const { mgr } = setup({}, [read, unread, { ...unread, id: '3' }]);
    expect(mgr.getUnreadCount()).toBe(2);
  });

  it('asocia lectura y descarte de un evento v2 a su revisión actual', async () => {
    const versioned = {
      ...notif(),
      id: 'event-1',
      createdAt: new Date(),
      schemaVersion: 2 as const,
      eventKey: 'recurring:rent:2026-08',
      revision: 3,
      stage: 'due' as const,
      stageWindow: 'due',
      lifecycleStatus: 'active' as const,
    } as Notification;
    const updateNotification = vi.fn().mockResolvedValue(undefined);
    const deleteNotification = vi.fn().mockResolvedValue(undefined);
    const mgr = new NotificationManager({
      addNotification: vi.fn().mockResolvedValue(true),
      updateNotification,
      deleteNotification,
      clearAll: vi.fn().mockResolvedValue(undefined),
      markAllAsRead: vi.fn().mockResolvedValue(undefined),
      notifications: [versioned],
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    });

    await mgr.markAsRead('event-1');
    await mgr.deleteNotification('event-1');

    expect(updateNotification).toHaveBeenNthCalledWith(1, 'event-1', { isRead: true, readRevision: 3 });
    expect(updateNotification).toHaveBeenCalledTimes(1);
    expect(deleteNotification).toHaveBeenCalledWith('event-1', 3);
  });

  it('conserva el comportamiento legacy si el snapshot aún no contiene el id', async () => {
    const updateNotification = vi.fn().mockResolvedValue(undefined);
    const deleteNotification = vi.fn().mockResolvedValue(undefined);
    const mgr = new NotificationManager({
      addNotification: vi.fn().mockResolvedValue(true),
      updateNotification,
      deleteNotification,
      clearAll: vi.fn().mockResolvedValue(undefined),
      markAllAsRead: vi.fn().mockResolvedValue(undefined),
      notifications: [],
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    });

    await mgr.markAsRead('not-yet-loaded');
    await mgr.deleteNotification('not-yet-loaded');

    expect(updateNotification).toHaveBeenCalledWith('not-yet-loaded', { isRead: true });
    expect(deleteNotification).not.toHaveBeenCalled();
  });
});

describe('NotificationManager — canShowBrowserNotification gate (Task 7)', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('cuando se inyecta canShowBrowserNotification, ESE gate gobierna la presentación OS', async () => {
    vi.mocked(showBrowserNotification).mockClear();
    const canShow = vi.fn(() => true);
    // browserNotifications.enabled = false, pero el gate inyectado dice true → presenta
    const addNotification = vi.fn().mockResolvedValue(true);
    const mgr = new NotificationManager({
      addNotification,
      updateNotification: vi.fn().mockResolvedValue(undefined),
      deleteNotification: vi.fn().mockResolvedValue(undefined),
      clearAll: vi.fn().mockResolvedValue(undefined),
      markAllAsRead: vi.fn().mockResolvedValue(undefined),
      notifications: [],
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, browserNotifications: { enabled: false } },
      canShowBrowserNotification: canShow,
    });

    await mgr.createNotification(notif({ severity: 'error' }));
    expect(canShow).toHaveBeenCalled();
    expect(showBrowserNotification).toHaveBeenCalledTimes(1);
  });

  it('gate inyectado false suprime la presentación OS aunque browserNotifications.enabled sea true', async () => {
    vi.mocked(showBrowserNotification).mockClear();
    const mgr = new NotificationManager({
      addNotification: vi.fn().mockResolvedValue(true),
      updateNotification: vi.fn().mockResolvedValue(undefined),
      deleteNotification: vi.fn().mockResolvedValue(undefined),
      clearAll: vi.fn().mockResolvedValue(undefined),
      markAllAsRead: vi.fn().mockResolvedValue(undefined),
      notifications: [],
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, browserNotifications: { enabled: true } },
      canShowBrowserNotification: () => false,
    });

    await mgr.createNotification(notif({ severity: 'error' }));
    expect(showBrowserNotification).not.toHaveBeenCalled();
  });
});

describe('NotificationManager — deferred quiet-hours OS presentation (Task 7)', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  const makeQuietSetup = (over: Record<string, unknown> = {}) => {
    const addNotification = vi.fn().mockResolvedValue(true);
    const timers: { cb: () => void; ms: number; handle: number }[] = [];
    let handleSeq = 0;
    let nowMs = new Date('2026-06-15T23:00:00').getTime(); // dentro de [22,8)
    const clearCalls: number[] = [];

    const mgr = new NotificationManager({
      addNotification,
      updateNotification: vi.fn().mockResolvedValue(undefined),
      deleteNotification: vi.fn().mockResolvedValue(undefined),
      clearAll: vi.fn().mockResolvedValue(undefined),
      markAllAsRead: vi.fn().mockResolvedValue(undefined),
      notifications: [],
      preferences: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        quietHours: { enabled: true, startHour: 22, endHour: 8 },
        browserNotifications: { enabled: true },
      },
      canShowBrowserNotification: () => true,
      now: () => nowMs,
      setDeferTimer: (cb: () => void, ms: number) => {
        const handle = ++handleSeq;
        timers.push({ cb, ms, handle });
        return handle;
      },
      clearDeferTimer: (handle: number) => { clearCalls.push(handle); },
      ...over,
    });

    return {
      mgr, addNotification, timers, clearCalls,
      advanceTo: (iso: string) => { nowMs = new Date(iso).getTime(); },
      fireAll: () => timers.forEach((t) => t.cb()),
    };
  };

  it('un evento creado en quiet hours aparece en el inbox inmediatamente y difiere UNA presentación OS', async () => {
    vi.mocked(showBrowserNotification).mockClear();
    const { mgr, addNotification, timers } = makeQuietSetup();

    await mgr.createNotification(notif({ severity: 'error' }));

    // inbox: persistencia inmediata
    expect(addNotification).toHaveBeenCalledTimes(1);
    // OS presentation diferida (no inmediata) → un timer
    expect(showBrowserNotification).not.toHaveBeenCalled();
    expect(timers.length).toBe(1);
  });

  it('al quiet-end re-chequea el gate y presenta UNA vez', async () => {
    vi.mocked(showBrowserNotification).mockClear();
    const { mgr, advanceTo, fireAll } = makeQuietSetup();
    await mgr.createNotification(notif({ severity: 'error' }));

    advanceTo('2026-06-16T08:00:00'); // quiet-end
    fireAll();

    expect(showBrowserNotification).toHaveBeenCalledTimes(1);
  });

  it('si el gate ya no permite al quiet-end, NO presenta', async () => {
    vi.mocked(showBrowserNotification).mockClear();
    let allowed = true;
    const { mgr, advanceTo, fireAll } = makeQuietSetup({ canShowBrowserNotification: () => allowed });
    await mgr.createNotification(notif({ severity: 'error' }));

    allowed = false;
    advanceTo('2026-06-16T08:00:00');
    fireAll();

    expect(showBrowserNotification).not.toHaveBeenCalled();
  });

  it('cancela el timer diferido en logout/account-switch (cancelDeferredPresentations)', async () => {
    const { mgr, clearCalls } = makeQuietSetup();
    await mgr.createNotification(notif({ severity: 'error' }));
    mgr.cancelDeferredPresentations();
    expect(clearCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('los toasts y el inbox no cambian por el diferido (persistencia intacta)', async () => {
    vi.mocked(toast.error).mockClear();
    const { mgr, addNotification } = makeQuietSetup();
    // quiet hours suprime toasts (comportamiento existente), inbox sí persiste
    await mgr.createNotification(notif({ severity: 'error' }));
    expect(addNotification).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
