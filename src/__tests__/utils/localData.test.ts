import { describe, it, expect, beforeEach } from 'vitest';
import { clearGuestFinanceData, GUEST_DATA_KEYS } from '../../utils/localData';

describe('clearGuestFinanceData (S2)', () => {
  beforeEach(() => localStorage.clear());

  it('removes all guest finance data keys', () => {
    GUEST_DATA_KEYS.forEach((k) => localStorage.setItem(k, JSON.stringify([{ x: 1 }])));
    clearGuestFinanceData();
    GUEST_DATA_KEYS.forEach((k) => expect(localStorage.getItem(k)).toBeNull());
  });

  it('does not touch unrelated keys (theme, per-user namespaced)', () => {
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('moneytrack_gemini_key_user-1', 'AIzaSomeKey');
    localStorage.setItem('transactions', '[]');

    clearGuestFinanceData();

    expect(localStorage.getItem('transactions')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('moneytrack_gemini_key_user-1')).toBe('AIzaSomeKey');
  });

  it('is safe to call when keys are absent', () => {
    expect(() => clearGuestFinanceData()).not.toThrow();
  });
});
