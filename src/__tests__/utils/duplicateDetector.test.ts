import { describe, it, expect } from 'vitest';
import { detectDuplicates } from '../../utils/duplicateDetector';
import type { Transaction, NewTransaction } from '../../types/finance';

const baseTx: NewTransaction = {
  type: 'expense',
  amount: '50000',
  category: 'Alimentación',
  description: 'Supermercado',
  date: '2026-02-09',
  paid: true,
  accountId: 'acc1',
  toAccountId: '',
  hasInterest: false,
  installments: 1,
};

const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx1',
  type: 'expense',
  amount: 50000,
  category: 'Alimentación',
  description: 'Supermercado',
  date: new Date('2026-02-09T12:00:00'),
  paid: true,
  accountId: 'acc1',
  createdAt: new Date(),
  ...overrides,
});

describe('detectDuplicates', () => {
  it('should detect exact duplicate', () => {
    const existing = [makeTransaction()];
    const result = detectDuplicates(baseTx, existing);
    expect(result.length).toBe(1);
    expect(result[0].matchScore).toBe(110);
    expect(result[0].reasons).toContain('Mismo monto');
    expect(result[0].reasons).toContain('Misma categoría');
    expect(result[0].reasons).toContain('Misma descripción');
    expect(result[0].reasons).toContain('Fecha cercana (48h)');
  });

  it('should not match different type', () => {
    const existing = [makeTransaction({ type: 'income' })];
    const result = detectDuplicates(baseTx, existing);
    expect(result.length).toBe(0);
  });

  it('should not match when amount differs', () => {
    const existing = [makeTransaction({ amount: 99999, category: '', description: '' })];
    const result = detectDuplicates(baseTx, existing);
    expect(result.length).toBe(0);
  });

  it('should match with score >= 70 (amount + category)', () => {
    const existing = [makeTransaction({
      description: 'Diferente descripción',
      date: new Date('2026-02-12T12:00:00'),
    })];
    const result = detectDuplicates(baseTx, existing);
    expect(result.length).toBe(1);
    expect(result[0].matchScore).toBe(70); // 50 amount + 20 category
  });

  it('should not match below threshold', () => {
    const existing = [makeTransaction({
      amount: 99999,
      description: 'Algo completamente diferente',
      date: new Date('2026-01-01T12:00:00'),
    })];
    const result = detectDuplicates(baseTx, existing);
    expect(result.length).toBe(0);
  });

  it('should return max 3 matches sorted by score', () => {
    const existing = Array.from({ length: 5 }, (_, i) =>
      makeTransaction({ id: `tx${i}` })
    );
    const result = detectDuplicates(baseTx, existing);
    expect(result.length).toBe(3);
  });

  it('should handle Colombian number format', () => {
    const tx: NewTransaction = { ...baseTx, amount: '50.000' };
    const existing = [makeTransaction({ amount: 50000 })];
    const result = detectDuplicates(tx, existing);
    expect(result.length).toBe(1);
    expect(result[0].reasons).toContain('Mismo monto');
  });

  it('should handle plain decimal amounts from CurrencyInput (F10)', () => {
    const tx: NewTransaction = { ...baseTx, amount: '88888.5' };
    const existing = [makeTransaction({ amount: 88888.5 })];
    const result = detectDuplicates(tx, existing);
    expect(result.length).toBe(1);
    expect(result[0].reasons).toContain('Mismo monto');
  });

  it('does not confuse a decimal amount with thousands (F10)', () => {
    // "88888.5" no debe interpretarse como 888885
    const tx: NewTransaction = { ...baseTx, amount: '88888.5' };
    const existing = [makeTransaction({ amount: 888885 })];
    const result = detectDuplicates(tx, existing);
    expect(result.find(r => r.reasons.includes('Mismo monto'))).toBeUndefined();
  });

  it('should return empty for empty description and category', () => {
    const tx: NewTransaction = { ...baseTx, description: '', category: '' };
    const existing = [makeTransaction()];
    const result = detectDuplicates(tx, existing);
    expect(result.length).toBe(0);
  });

  it('should detect partial description match', () => {
    const existing = [makeTransaction({
      description: 'Compra en Supermercado Éxito',
      category: 'Otros',
      date: new Date('2026-02-10T12:00:00'),
    })];
    const tx: NewTransaction = { ...baseTx, description: 'Supermercado', category: 'Otros' };
    const result = detectDuplicates(tx, existing);
    // 50 (amount) + 20 (category) + 15 (partial desc) + 10 (close date) = 95
    expect(result.length).toBe(1);
    expect(result[0].reasons).toContain('Descripción similar');
  });
});
