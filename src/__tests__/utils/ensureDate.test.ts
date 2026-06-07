import { describe, it, expect } from 'vitest';
import { ensureDate } from '../../utils/dateUtils';

describe('ensureDate (S12)', () => {
  it('passes through a Date unchanged', () => {
    const d = new Date('2024-03-15T10:00:00.000Z');
    expect(ensureDate(d)).toBe(d); // same reference
  });

  it('converts an ISO string to Date', () => {
    const result = ensureDate('2024-03-15T10:00:00.000Z');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2024-03-15T10:00:00.000Z');
  });

  it('converts a YYYY-MM-DD string to Date', () => {
    const result = ensureDate('2024-06-01');
    expect(result).toBeInstanceOf(Date);
    // YYYY-MM-DD se parsea como UTC midnight → usar métodos UTC
    expect(result.getUTCFullYear()).toBe(2024);
    expect(result.getUTCMonth()).toBe(5); // June = 5 (0-indexed)
    expect(result.getUTCDate()).toBe(1);
  });

  it('converts a numeric epoch ms to Date', () => {
    const ms = new Date('2024-03-15T10:00:00.000Z').getTime();
    const result = ensureDate(ms);
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBe(ms);
  });

  it('converts a Firestore-like Timestamp (duck-type) to Date', () => {
    const fakeTimestamp = {
      toDate: () => new Date('2024-03-15T10:00:00.000Z'),
    };
    const result = ensureDate(fakeTimestamp);
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2024-03-15T10:00:00.000Z');
  });

  it('returns a Date fallback for null', () => {
    const before = Date.now();
    const result = ensureDate(null);
    const after = Date.now();
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(after);
  });

  it('returns a Date fallback for undefined', () => {
    expect(ensureDate(undefined)).toBeInstanceOf(Date);
  });

  it('returns a Date fallback for a plain object without toDate', () => {
    expect(ensureDate({ foo: 'bar' })).toBeInstanceOf(Date);
  });
});
