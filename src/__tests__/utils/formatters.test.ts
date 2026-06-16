import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatDateForInput,
  parseDateFromInput,
  formatMonthYear,
  formatRelativeTime,
  formatNumberForInput,
  unformatNumber,
  parseCurrency,
  generateId,
  roundMoney,
} from '../../utils/formatters';

describe('formatCurrency', () => {
  it('formats positive amounts', () => {
    const result = formatCurrency(50000);
    expect(result).toContain('50.000');
  });

  it('formats zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });

  it('formats negative amounts', () => {
    const result = formatCurrency(-1500);
    expect(result).toContain('1.500');
  });

  it('formats decimals', () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain('1.234');
  });
});

describe('roundMoney', () => {
  it('elimina residuos IEEE-754 de sumas de floats', () => {
    // 0.1 * 3 - 0.3 === 5.551115123125783e-17 sin redondeo
    expect(roundMoney(0.1 * 3 - 0.3)).toBe(0);
  });

  it('redondea a 2 decimales (centavos)', () => {
    expect(roundMoney(1234.567)).toBe(1234.57);
    expect(roundMoney(1234.564)).toBe(1234.56);
  });

  it('deja intactos los valores ya exactos', () => {
    expect(roundMoney(1_000_000)).toBe(1_000_000);
    expect(roundMoney(0)).toBe(0);
    expect(roundMoney(-50.5)).toBe(-50.5);
  });

  it('devuelve 0 para NaN o valores no finitos', () => {
    expect(roundMoney(NaN)).toBe(0);
    expect(roundMoney(Infinity)).toBe(0);
    expect(roundMoney(-Infinity)).toBe(0);
    // @ts-expect-error probando entrada no numérica
    expect(roundMoney(undefined)).toBe(0);
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0)); // 15 jun 2026
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('devuelve "hoy" para la fecha actual', () => {
    expect(formatRelativeTime(new Date(2026, 5, 15, 8, 0, 0))).toBe('hoy');
  });

  it('devuelve "ayer" para el día anterior', () => {
    expect(formatRelativeTime(new Date(2026, 5, 14))).toBe('ayer');
  });

  it('devuelve "hace N días" dentro del mes', () => {
    expect(formatRelativeTime(new Date(2026, 5, 10))).toBe('hace 5 días');
  });

  it('devuelve "hace N meses" para fechas de meses anteriores', () => {
    expect(formatRelativeTime(new Date(2026, 2, 15))).toBe('hace 3 meses');
  });

  it('devuelve "hace N años" para fechas de años anteriores', () => {
    expect(formatRelativeTime(new Date(2024, 5, 15))).toBe('hace 2 años');
  });

  it('maneja fechas futuras', () => {
    expect(formatRelativeTime(new Date(2026, 5, 16))).toBe('mañana');
  });

  // F-fecha-relativa: meses/años por calendario real, no /30 ni /365.
  it('usa meses de calendario, no días/30 (1 mes exacto = "hace 1 mes")', () => {
    // 15 may 2026 → 15 jun 2026: 31 días. Con /30 daba "hace 1 mes" por suerte,
    // pero 14 may (32 días) con /30 seguía "1 mes"; aquí validamos el límite real.
    expect(formatRelativeTime(new Date(2026, 4, 15))).toBe('hace 1 mes');
  });

  it('no salta a meses antes de cumplir el mes calendario', () => {
    // 20 may 2026 → 15 jun 2026: 26 días, < 1 mes calendario (día 15 < 20) → días.
    expect(formatRelativeTime(new Date(2026, 4, 20))).toBe('hace 26 días');
  });

  it('cuenta años por calendario (11 meses no es 1 año)', () => {
    // 20 jul 2025 → 15 jun 2026: 10 meses calendario (día 15<20 → 10), no 1 año.
    expect(formatRelativeTime(new Date(2025, 6, 20))).toBe('hace 10 meses');
  });
});

describe('formatDate', () => {
  it('formats a Date object', () => {
    const date = new Date(2024, 0, 15); // Jan 15, 2024
    const result = formatDate(date);
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('formats a date string', () => {
    const result = formatDate('2024-06-20');
    expect(result).toContain('2024');
  });
});

describe('formatDateForInput', () => {
  it('returns YYYY-MM-DD format', () => {
    const date = new Date(2024, 5, 15); // June 15, 2024
    const result = formatDateForInput(date);
    expect(result).toBe('2024-06-15');
  });

  it('returns today when no date given', () => {
    const result = formatDateForInput();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('parseDateFromInput', () => {
  it('parses YYYY-MM-DD to local Date', () => {
    const result = parseDateFromInput('2024-03-25');
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(2); // March = 2
    expect(result.getDate()).toBe(25);
  });

  it('avoids timezone offset issues', () => {
    // When using new Date('2024-01-01'), it creates UTC midnight
    // which can shift back to Dec 31 in negative UTC offsets
    const result = parseDateFromInput('2024-01-01');
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(0);
  });
});

describe('formatMonthYear', () => {
  it('formats a date to month + year', () => {
    const date = new Date(2024, 11, 1); // Dec 2024
    const result = formatMonthYear(date);
    expect(result).toContain('2024');
  });
});

describe('formatNumberForInput', () => {
  it('formats integer with thousand separators', () => {
    const result = formatNumberForInput('1234567');
    expect(result).toBe('1.234.567');
  });

  it('handles empty values', () => {
    expect(formatNumberForInput('')).toBe('');
  });

  it('formats trailing comma input', () => {
    // Preserves trailing comma to allow user to continue typing decimals
    const result = formatNumberForInput('1000,');
    expect(result).toBe('1.000,');
  });

  it('preserves trailing zeros in decimal part', () => {
    // Preserves trailing zeros to allow editing (e.g., 99,9 -> 99,90 -> 99,900)
    expect(formatNumberForInput('99,9')).toBe('99,9');
    expect(formatNumberForInput('99,90')).toBe('99,90');
    expect(formatNumberForInput('99,900')).toBe('99,900');
  });

  it('preserves decimal part', () => {
    const result = formatNumberForInput('1234,56');
    expect(result).toBe('1.234,56');
  });
});

describe('unformatNumber', () => {
  it('strips non-numeric characters except comma', () => {
    expect(unformatNumber('$1.234.567,89')).toBe('1234567,89');
  });

  it('handles plain numbers', () => {
    expect(unformatNumber('100')).toBe('100');
  });
});

describe('parseCurrency (formato colombiano ##.###.##,##)', () => {
  it('miles con punto + decimal con coma', () => {
    expect(parseCurrency('1.000.000,50')).toBe(1_000_000.5);
    expect(parseCurrency('1.234.567,89')).toBe(1_234_567.89);
  });

  it('miles con punto, sin decimal', () => {
    expect(parseCurrency('1.000.000')).toBe(1_000_000);
    expect(parseCurrency('97.515')).toBe(97_515);
  });

  it('decimal tecleado con punto (teclado numérico)', () => {
    expect(parseCurrency('563088.89')).toBe(563_088.89);
  });

  it('NO pierde los centavos de un string ya normalizado (regresión Goals/Debts/Budgets)', () => {
    // unformatNumber devuelve "1234,56"; el bug era parseFloat de eso = 1234.
    expect(parseCurrency('1234,56')).toBe(1234.56);
    expect(parseCurrency(unformatNumber('1.234,56'))).toBe(1234.56);
  });

  it('tolera símbolo de moneda y espacios', () => {
    expect(parseCurrency('$1.234,56')).toBe(1234.56);
  });

  it('vacío/ inválido → NaN', () => {
    expect(Number.isNaN(parseCurrency(''))).toBe(true);
    expect(Number.isNaN(parseCurrency('abc'))).toBe(true);
  });
});

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});
