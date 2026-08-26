/**
 * withDefaults (#1): las prefs de notificaciones cargadas de un doc legacy se
 * mergean con los defaults, para que los objetos anidados (quietHours, enabled,
 * thresholds) NUNCA queden undefined. Sin esto, NotificationManager leía
 * quietHours.enabled / enabled[tipo] sobre undefined → TypeError al crear
 * cualquier notificación.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Neutralizar las importaciones de firebase del módulo (withDefaults no las usa).
vi.mock('../../lib/firebaseDb', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), onSnapshot: vi.fn(), setDoc: vi.fn() }));

import { useNotificationPreferences, withDefaults } from '../../hooks/useNotificationPreferences';
import type { PartialNotificationPreferences } from '../../hooks/useNotificationPreferences';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../types/finance';
import type { NotificationPreferences } from '../../types/finance';

const invalidBudgetThresholds: Array<[Partial<NotificationPreferences['thresholds']>, string]> = [
  [{ budgetWarning: 90, budgetCritical: 90 }, 'Budget warning threshold must be lower than critical'],
  [{ budgetCritical: 101, budgetExceeded: 100 }, 'Budget critical threshold must be at most budget exceeded'],
  [{ budgetExceeded: 99 }, 'Budget exceeded threshold must be at least 100'],
];

describe('useNotificationPreferences — withDefaults (#1 anti-crash)', () => {
  it('rellena los objetos anidados ausentes de un doc legacy', () => {
    // Doc viejo: solo trae `enabled` parcial; sin quietHours ni thresholds.
    const legacy = { enabled: { budget: true } } as Partial<NotificationPreferences>;
    const merged = withDefaults(legacy);

    expect(merged.quietHours).toEqual(DEFAULT_NOTIFICATION_PREFERENCES.quietHours);
    expect(merged.thresholds).toEqual(DEFAULT_NOTIFICATION_PREFERENCES.thresholds);
    // conserva lo presente y rellena las claves faltantes de enabled
    expect(merged.enabled.budget).toBe(true);
    expect(merged.enabled.debt).toBe(DEFAULT_NOTIFICATION_PREFERENCES.enabled.debt);
  });

  it('null / undefined → defaults completos', () => {
    expect(withDefaults(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(withDefaults(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it('migra un documento legacy sin versión ni zona horaria', () => {
    const merged = withDefaults({ dailyExpenseReminder: { enabled: true } } as Partial<NotificationPreferences>);

    expect(merged.schemaVersion).toBe(2);
    expect(merged.timeZone).toBe(DEFAULT_NOTIFICATION_PREFERENCES.timeZone);
    expect(merged.dailyExpenseReminder).toEqual({
      ...DEFAULT_NOTIFICATION_PREFERENCES.dailyExpenseReminder,
      enabled: true,
    });
  });

  it('preserves every nested partial value and fills only missing keys', () => {
    const partial: PartialNotificationPreferences = {
      enabled: { recurring: false },
      thresholds: { budgetCritical: 97 },
      quietHours: { startHour: 21 },
      browserNotifications: { enabled: true },
      dailyExpenseReminder: { minute: 15 },
    };
    const merged = withDefaults(partial);

    expect(merged.enabled).toEqual({ ...DEFAULT_NOTIFICATION_PREFERENCES.enabled, recurring: false });
    expect(merged.thresholds).toEqual({ ...DEFAULT_NOTIFICATION_PREFERENCES.thresholds, budgetCritical: 97 });
    expect(merged.quietHours).toEqual({ ...DEFAULT_NOTIFICATION_PREFERENCES.quietHours, startHour: 21 });
    expect(merged.browserNotifications).toEqual({ enabled: true });
    expect(merged.dailyExpenseReminder).toEqual({ ...DEFAULT_NOTIFICATION_PREFERENCES.dailyExpenseReminder, minute: 15 });
  });

  it.each(invalidBudgetThresholds)('rechaza al persistir umbrales de presupuesto no ordenados: %o', async (thresholds, message) => {
    const { result } = renderHook(() => useNotificationPreferences(null, DEFAULT_NOTIFICATION_PREFERENCES));

    await act(async () => {
      await expect(result.current.updatePreferences({ thresholds })).rejects.toThrow(message);
    });
  });

});
