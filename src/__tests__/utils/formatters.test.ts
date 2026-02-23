import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatDateForInput,
  parseDateFromInput,
  formatMonthYear,
  parseFloatSafe,
  parseIntSafe,
  clamp,
  formatNumberForInput,
  unformatNumber,
  generateId,
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

describe('parseFloatSafe', () => {
  it('parses valid float strings', () => {
    expect(parseFloatSafe('3.14')).toBe(3.14);
  });

  it('returns default for invalid strings', () => {
    expect(parseFloatSafe('abc')).toBe(0);
    expect(parseFloatSafe('abc', 99)).toBe(99);
  });

  it('passes through numbers', () => {
    expect(parseFloatSafe(42)).toBe(42);
  });
});

describe('parseIntSafe', () => {
  it('parses valid integer strings', () => {
    expect(parseIntSafe('42')).toBe(42);
  });

  it('returns default for invalid strings', () => {
    expect(parseIntSafe('abc')).toBe(0);
    expect(parseIntSafe('', 5)).toBe(5);
  });

  it('floors numbers', () => {
    expect(parseIntSafe(3.9)).toBe(3);
  });
});

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
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
