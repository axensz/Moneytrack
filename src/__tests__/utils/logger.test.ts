import { describe, it, expect } from 'vitest';
import { __sanitizeForTest as sanitize } from '../../utils/logger';

describe('logger sanitize (S7)', () => {
  it('redacts sensitive financial fields but keeps ids/types/counts', () => {
    const transaction = {
      id: 'tx-1',
      type: 'expense',
      category: 'Alimentación',
      accountId: 'acc-1',
      amount: 35000,
      description: 'COMPRA POS RESTAURANTE',
      originalAmount: 9.99,
    };
    const out = sanitize({ transaction }) as Record<string, Record<string, unknown>>;
    const tx = out.transaction;

    expect(tx.id).toBe('tx-1');
    expect(tx.type).toBe('expense');
    expect(tx.category).toBe('Alimentación');
    expect(tx.accountId).toBe('acc-1');
    expect(tx.amount).toBe('[redacted]');
    expect(tx.description).toBe('[redacted]');
    expect(tx.originalAmount).toBe('[redacted]');
  });

  it('redacts notification title/message', () => {
    const notification = { id: 'n1', type: 'budget', title: 'Gastaste $500.000', message: 'En Alimentación' };
    const out = sanitize({ notification }) as Record<string, Record<string, unknown>>;
    expect(out.notification.id).toBe('n1');
    expect(out.notification.title).toBe('[redacted]');
    expect(out.notification.message).toBe('[redacted]');
  });

  it('redacts the gemini api key and raw AI payloads', () => {
    const out = sanitize({ geminiApiKey: 'AIzaSecret', raw: '{"financial":"data"}' }) as Record<string, unknown>;
    expect(out.geminiApiKey).toBe('[redacted]');
    expect(out.raw).toBe('[redacted]');
  });

  it('keeps null/undefined sensitive values as-is (not the string redacted)', () => {
    const out = sanitize({ amount: null, description: undefined }) as Record<string, unknown>;
    expect(out.amount).toBeNull();
    expect(out.description).toBeUndefined();
  });

  it('recurses into arrays and redacts each item', () => {
    const out = sanitize({ items: [{ amount: 1 }, { amount: 2 }] }) as { items: Array<Record<string, unknown>> };
    expect(out.items[0].amount).toBe('[redacted]');
    expect(out.items[1].amount).toBe('[redacted]');
  });

  it('truncates very long arrays', () => {
    const big = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    const out = sanitize({ big }) as { big: unknown[] };
    expect(out.big.length).toBe(21); // 20 items + 1 summary marker
    expect(out.big[20]).toContain('more');
  });

  it('caps recursion depth', () => {
    const deep = { a: { b: { c: { d: { e: 'too-deep' } } } } };
    const out = sanitize(deep) as Record<string, unknown>;
    // At depth 4 it stops recursing.
    const str = JSON.stringify(out);
    expect(str).toContain('depth-limit');
  });

  it('passes primitives through untouched', () => {
    expect(sanitize('hello')).toBe('hello');
    expect(sanitize(42)).toBe(42);
    expect(sanitize(null)).toBeNull();
  });
});
