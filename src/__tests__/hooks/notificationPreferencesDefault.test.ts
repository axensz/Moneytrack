import { afterEach, describe, expect, it, vi } from 'vitest';

describe('preferencias de notificación por defecto', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it.each(['UTC', 'Pacific/Kiritimati', 'America/Bogota'])(
    'un invitado nuevo usa Bogotá aunque el host sea %s',
    async (hostTimeZone) => {
      const current = new Intl.DateTimeFormat().resolvedOptions();
      vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
        ...current,
        timeZone: hostTimeZone,
      });
      vi.resetModules();

      const { DEFAULT_NOTIFICATION_PREFERENCES } = await import('../../types/finance');

      expect(DEFAULT_NOTIFICATION_PREFERENCES.timeZone).toBe('America/Bogota');
    },
  );
});
