import { describe, it, expect } from 'vitest';
import { parseDateWithTime, formatDateForInput } from '../../utils/formatters';

describe('parseDateWithTime', () => {
  it('combina el día del string con la hora del timeSource', () => {
    const timeSource = new Date(2020, 0, 1, 14, 30, 45, 123);
    const result = parseDateWithTime('2026-06-07', timeSource);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(5); // junio (0-indexed)
    expect(result.getDate()).toBe(7);
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(30);
    expect(result.getSeconds()).toBe(45);
    expect(result.getMilliseconds()).toBe(123);
  });

  it('usa la hora actual por defecto (no medianoche)', () => {
    const now = new Date();
    const result = parseDateWithTime('2026-06-07');
    expect(result.getDate()).toBe(7);
    // Toma hora/minuto del momento actual (tolerancia de 1 min por el borde de minuto).
    const deltaMin = Math.abs(
      result.getHours() * 60 + result.getMinutes() - (now.getHours() * 60 + now.getMinutes()),
    );
    expect(deltaMin).toBeLessThanOrEqual(1);
  });
});

describe('formatDateForInput (componentes locales, sin desfase UTC)', () => {
  it('devuelve el día LOCAL aunque la hora sea nocturna', () => {
    const nightLocal = new Date(2026, 5, 7, 22, 0, 0); // 7 jun, 10 p. m. local
    expect(formatDateForInput(nightLocal)).toBe('2026-06-07');
  });

  it('formatea con ceros a la izquierda', () => {
    expect(formatDateForInput(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('round-trip: parseDateWithTime mantiene el día que da formatDateForInput', () => {
    const original = new Date(2026, 11, 31, 23, 59, 0); // 31 dic, 11:59 p. m.
    const dayStr = formatDateForInput(original);
    const reparsed = parseDateWithTime(dayStr, original);
    expect(formatDateForInput(reparsed)).toBe('2026-12-31');
  });
});
