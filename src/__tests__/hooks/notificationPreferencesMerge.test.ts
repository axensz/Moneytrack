/**
 * withDefaults (#1): las prefs de notificaciones cargadas de un doc legacy se
 * mergean con los defaults, para que los objetos anidados (quietHours, enabled,
 * thresholds) NUNCA queden undefined. Sin esto, NotificationManager leía
 * quietHours.enabled / enabled[tipo] sobre undefined → TypeError al crear
 * cualquier notificación.
 */
import { describe, it, expect, vi } from 'vitest';

// Neutralizar las importaciones de firebase del módulo (withDefaults no las usa).
vi.mock('../../lib/firebaseDb', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), onSnapshot: vi.fn(), setDoc: vi.fn() }));

import { withDefaults } from '../../hooks/useNotificationPreferences';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../types/finance';
import type { NotificationPreferences } from '../../types/finance';

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
});
