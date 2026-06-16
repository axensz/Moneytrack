import type { DateRangePreset } from '../types/finance';

/**
 * S12 — Normaliza cualquier representación de fecha a un objeto Date nativo.
 *
 * Acepta:
 * - `Date`              → devuelve el mismo objeto sin copiar
 * - `string` / `number` → `new Date(value)`
 * - Firestore Timestamp (duck-type: `{ toDate(): Date }`) → `value.toDate()`
 * - cualquier otro valor → `new Date()` (fallback: instante actual)
 *
 * Reemplaza el patrón disperso `x instanceof Date ? x : new Date(x)` y
 * garantiza que el código funcione tanto con datos de Firestore (Timestamp),
 * de localStorage (string ISO serializado por JSON) o ya convertidos (Date).
 */
export function ensureDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  // Firestore Timestamp duck-type
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).toDate === 'function'
  ) {
    return (value as { toDate(): Date }).toDate();
  }
  return new Date();
}

/**
 * Clave de día en hora LOCAL (YYYY-MM-DD) para deduplicación diaria de
 * notificaciones. `toISOString()` da la fecha en UTC, así que en zonas con
 * offset (Colombia UTC-5) el "día" rodaba a las 19:00 locales y desalineaba el
 * corte diario. Esta versión usa los getters locales del Date.
 */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calcula el rango de fechas basado en un preset
 */
export const getDateRangeFromPreset = (
  preset: DateRangePreset
): { start: Date | null; end: Date | null } => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today':
      return {
        start: today,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
      };

    case 'this-week': {
      const dayOfWeek = today.getDay();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)); // Lunes
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      return { start: startOfWeek, end: endOfWeek };
    }

    case 'this-month': {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start: startOfMonth, end: endOfMonth };
    }

    case 'last-month': {
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: startOfLastMonth, end: endOfLastMonth };
    }

    case 'this-year': {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start: startOfYear, end: endOfYear };
    }

    case 'last-year': {
      const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
      const endOfLastYear = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      return { start: startOfLastYear, end: endOfLastYear };
    }

    case 'all':
    default:
      return { start: null, end: null };
  }
};

/**
 * Presets de rango de fecha para el selector
 */
export const DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'Todo el tiempo' },
  { value: 'today', label: 'Hoy' },
  { value: 'this-week', label: 'Esta semana' },
  { value: 'this-month', label: 'Este mes' },
  { value: 'last-month', label: 'Mes pasado' },
  { value: 'this-year', label: 'Este año' },
  { value: 'last-year', label: 'Año pasado' },
  { value: 'custom', label: 'Personalizado' },
];
