/**
 * localDateKey: clave de día en hora LOCAL (no UTC) para la deduplicación diaria
 * de notificaciones. En UTC-5, toISOString() rodaba el "día" a las 19:00 locales.
 */
import { describe, it, expect } from 'vitest';
import { localDateKey } from '../../utils/dateUtils';

describe('localDateKey', () => {
  it('formatea YYYY-MM-DD desde los componentes LOCALES del Date', () => {
    // Construido en hora local; los getters locales dan el mismo día aunque sean
    // las 23:30 (en zonas UTC-negativas, toISOString() daría el día siguiente).
    expect(localDateKey(new Date(2026, 5, 16, 23, 30))).toBe('2026-06-16');
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05'); // padding mes/día
  });
});
