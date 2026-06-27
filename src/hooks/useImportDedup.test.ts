import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useImportDedup } from './useImportDedup';
import type { ImportRow } from './useImportTransactions';
import type { Transaction } from '../types/finance';

/**
 * Tests para useImportDedup — Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  type: 'expense',
  amount: 50000,
  category: 'Alimentación',
  description: 'Compra supermercado',
  date: new Date(2024, 5, 15),
  paid: true,
  accountId: 'acc-1',
  ...overrides,
});

const makeRow = (overrides: Partial<ImportRow> = {}): ImportRow => ({
  date: new Date(2024, 5, 15),
  description: 'Compra supermercado',
  amount: 50000,
  type: 'expense',
  category: 'Alimentación',
  accountId: 'acc-1',
  include: true,
  ...overrides,
});

describe('useImportDedup', () => {
  describe('Requirement 3.1 — exact key comparison for normal movements', () => {
    it('marks a row as duplicate when exact key matches existing transaction', () => {
      const existingTx = makeTransaction({
        accountId: 'acc-1',
        type: 'expense',
        date: new Date(2024, 5, 15),
        amount: 50000,
        description: 'Compra supermercado',
      });

      const { result } = renderHook(() =>
        useImportDedup({ existingTransactions: [existingTx] })
      );

      const rows = [makeRow({
        type: 'expense',
        date: new Date(2024, 5, 15),
        amount: 50000,
        description: 'Compra supermercado',
      })];

      const marked = result.current.markDuplicates(rows, 'acc-1');
      expect(marked[0].isDuplicate).toBe(true);
      expect(marked[0].include).toBe(false);
    });

    it('does NOT mark as duplicate if amount differs', () => {
      const existingTx = makeTransaction({ amount: 50000 });
      const { result } = renderHook(() =>
        useImportDedup({ existingTransactions: [existingTx] })
      );

      const rows = [makeRow({ amount: 60000 })];
      const marked = result.current.markDuplicates(rows, 'acc-1');
      expect(marked[0].isDuplicate).toBe(false);
      expect(marked[0].include).toBe(true);
    });

    it('does NOT mark as duplicate if transaction belongs to different account', () => {
      const existingTx = makeTransaction({ accountId: 'acc-2' });
      const { result } = renderHook(() =>
        useImportDedup({ existingTransactions: [existingTx] })
      );

      const rows = [makeRow()];
      const marked = result.current.markDuplicates(rows, 'acc-1');
      expect(marked[0].isDuplicate).toBe(false);
      expect(marked[0].include).toBe(true);
    });

    it('uses transfer key (day|amount) for transfer rows, ignoring description', () => {
      const existingTx = makeTransaction({
        type: 'transfer',
        date: new Date(2024, 5, 10),
        amount: 100000,
        description: 'Pago PSE Nu', // bank text
      });

      const { result } = renderHook(() =>
        useImportDedup({ existingTransactions: [existingTx] })
      );

      // Row with different description but same day+amount should match as transfer
      const rows = [makeRow({
        type: 'transfer',
        date: new Date(2024, 5, 10),
        amount: 100000,
        description: 'Gracias por tu pago', // card text
      })];

      const marked = result.current.markDuplicates(rows, 'acc-1');
      expect(marked[0].isDuplicate).toBe(true);
      expect(marked[0].include).toBe(false);
    });
  });

  describe('Requirement 3.2 — same-file duplicate detection', () => {
    it('marks the second occurrence in the same file as duplicate', () => {
      const { result } = renderHook(() =>
        useImportDedup({ existingTransactions: [] })
      );

      const row = makeRow({ type: 'expense', description: 'Duplicada' });
      const rows = [row, { ...row }]; // two identical rows

      const marked = result.current.markDuplicates(rows, 'acc-1');
      expect(marked[0].isDuplicate).toBe(false);
      expect(marked[0].include).toBe(true);
      expect(marked[1].isDuplicate).toBe(true);
      expect(marked[1].include).toBe(false);
    });
  });

  describe('Requirement 3.3 — transfers marked include: false', () => {
    it('marks transfer type rows as include: false', () => {
      const { result } = renderHook(() =>
        useImportDedup({ existingTransactions: [] })
      );

      const rows = [makeRow({ type: 'transfer', description: 'Pago a tarjeta' })];
      const marked = result.current.markDuplicates(rows, 'acc-1');
      expect(marked[0].include).toBe(false);
    });

    it('marks rows detected via isInternalTransferDescription as include: false', () => {
      const { result } = renderHook(() =>
        useImportDedup({ existingTransactions: [] })
      );

      // "PAGO PSE NU" is a known internal transfer keyword
      const rows = [makeRow({ type: 'expense', description: 'PAGO PSE NU' })];
      const marked = result.current.markDuplicates(rows, 'acc-1');
      expect(marked[0].include).toBe(false);
    });
  });

  describe('Requirement 3.4 — needsExchangeRate rows excluded', () => {
    it('marks rows with needsExchangeRate: true as include: false', () => {
      const { result } = renderHook(() =>
        useImportDedup({ existingTransactions: [] })
      );

      const rows = [makeRow({ needsExchangeRate: true })];
      const marked = result.current.markDuplicates(rows, 'acc-1');
      expect(marked[0].include).toBe(false);
    });
  });

  describe('Requirement 3.5 — all comparison in memory', () => {
    it('works with an empty existingTransactions array', () => {
      const { result } = renderHook(() =>
        useImportDedup({ existingTransactions: [] })
      );

      const rows = [makeRow(), makeRow({ description: 'Otro gasto', amount: 30000 })];
      const marked = result.current.markDuplicates(rows, 'acc-1');
      expect(marked[0].isDuplicate).toBe(false);
      expect(marked[0].include).toBe(true);
      expect(marked[1].isDuplicate).toBe(false);
      expect(marked[1].include).toBe(true);
    });

    it('handles Firestore-like timestamp objects in existing transactions', () => {
      const firestoreTimestamp = { toDate: () => new Date(2024, 5, 15) };
      const existingTx = makeTransaction({
        date: firestoreTimestamp as unknown as Date,
      });

      const { result } = renderHook(() =>
        useImportDedup({ existingTransactions: [existingTx] })
      );

      const rows = [makeRow()];
      const marked = result.current.markDuplicates(rows, 'acc-1');
      expect(marked[0].isDuplicate).toBe(true);
      expect(marked[0].include).toBe(false);
    });

    it('description key truncates to 20 chars for comparison', () => {
      const longDesc = 'ABCDEFGHIJKLMNOPQRST extra text here';
      const existingTx = makeTransaction({
        description: longDesc + ' more stuff',
      });

      const { result } = renderHook(() =>
        useImportDedup({ existingTransactions: [existingTx] })
      );

      // Same first 20 chars but different tail → should still match
      const rows = [makeRow({ description: longDesc + ' different tail' })];
      const marked = result.current.markDuplicates(rows, 'acc-1');
      expect(marked[0].isDuplicate).toBe(true);
    });
  });
});
