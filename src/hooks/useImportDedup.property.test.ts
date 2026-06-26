import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { useImportDedup } from './useImportDedup';
import { INTERNAL_TRANSFER_KEYWORDS, isInternalTransferDescription } from '../utils/csvParser';
import { importDayKey, importDescKey, transferImportKey } from '../utils/importDuplicates';
import type { ImportRow } from './useImportTransactions';
import type { Transaction } from '../types/finance';

/**
 * Property-based tests para useImportDedup.markDuplicates
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 *
 * Stack: Vitest + fast-check, minimum 100 iterations per property.
 */

// --- Generators ---

/** Generates a valid Date within a reasonable range (2020-2026) */
const arbDate = fc.date({ min: new Date(2020, 0, 1), max: new Date(2026, 11, 31) });

/** Generates a positive amount in COP (typical range) */
const arbAmount = fc.float({ min: 100, max: 50_000_000, noNaN: true })
  .map(v => Math.round(v * 100) / 100)
  .filter(v => v > 0 && isFinite(v));

/** Generates a non-empty description string (no control chars) */
const arbDescription = fc.string({ minLength: 1, maxLength: 80 })
  .filter(s => s.trim().length > 0);

/** Generates the transaction type */
const arbNonTransferType = fc.constantFrom('income' as const, 'expense' as const);
const arbType = fc.constantFrom('income' as const, 'expense' as const, 'transfer' as const);

/** Generates an account ID */
const arbAccountId = fc.stringMatching(/^acc-[a-z0-9]{1,8}$/);

/** Generates a base ImportRow (non-transfer, non-exchange) */
const arbNormalRow = fc.record({
  date: arbDate,
  description: arbDescription,
  amount: arbAmount,
  type: arbNonTransferType,
  category: fc.constant('Otros'),
  accountId: arbAccountId,
  include: fc.constant(true),
  needsExchangeRate: fc.constant(false),
}).map(r => r as ImportRow);

/** Generates an ImportRow that is explicitly a transfer (type === 'transfer') */
const arbTransferRow = fc.record({
  date: arbDate,
  description: arbDescription,
  amount: arbAmount,
  type: fc.constant('transfer' as const),
  category: fc.constant('Pago tarjeta'),
  accountId: arbAccountId,
  include: fc.constant(true),
  needsExchangeRate: fc.constant(false),
}).map(r => r as ImportRow);

/** Generates an ImportRow with an internal transfer keyword in description */
const arbInternalTransferDescRow = fc.record({
  date: arbDate,
  description: fc.constantFrom(...INTERNAL_TRANSFER_KEYWORDS),
  amount: arbAmount,
  type: arbNonTransferType,
  category: fc.constant('Pago tarjeta'),
  accountId: arbAccountId,
  include: fc.constant(true),
  needsExchangeRate: fc.constant(false),
}).map(r => r as ImportRow);

/** Generates an ImportRow with needsExchangeRate: true */
const arbForeignCurrencyRow = fc.record({
  date: arbDate,
  description: arbDescription,
  amount: arbAmount,
  type: arbNonTransferType,
  category: fc.constant('Otros'),
  accountId: arbAccountId,
  include: fc.constant(true),
  needsExchangeRate: fc.constant(true),
}).map(r => r as ImportRow);

/** Generates a Transaction for the existing DB */
const arbTransaction = fc.record({
  type: arbType,
  amount: arbAmount,
  category: fc.constant('Alimentación'),
  description: arbDescription,
  date: arbDate,
  paid: fc.boolean(),
  accountId: arbAccountId,
}).map(r => r as Transaction);

// --- Helper: compute keys the same way the hook does ---

function buildExactKey(type: string, date: Date, amount: number, description: string): string {
  return `${type}|${importDayKey(date)}|${amount.toFixed(2)}|${importDescKey(description)}`;
}

function isTransferRow(row: ImportRow): boolean {
  return row.type === 'transfer' || isInternalTransferDescription(row.description);
}

function computeRowKey(row: ImportRow): string {
  if (isTransferRow(row)) {
    return transferImportKey(row.date, row.amount);
  }
  return buildExactKey(row.type, row.date, row.amount, row.description);
}

// ========================================================================
// Property 5: Duplicate marking invariant
// ========================================================================

describe('Property 5: Duplicate marking invariant', () => {
  /**
   * **Validates: Requirements 3.1, 3.2**
   *
   * For any ImportRow and set of existingTransactions, if the row's computed key
   * matches an existing transaction key for the target account OR matches a
   * previously-seen key in the same file, the row SHALL have isDuplicate === true
   * and include === false.
   */

  it('rows matching an existing transaction key are marked isDuplicate=true, include=false', () => {
    fc.assert(
      fc.property(
        arbNormalRow,
        arbAccountId,
        (row, accountId) => {
          // Create an existing transaction that will produce the SAME key as the row
          const existingTx: Transaction = {
            type: row.type,
            amount: row.amount,
            category: 'Test',
            description: row.description,
            date: row.date,
            paid: true,
            accountId: accountId, // same account
          };

          const { result } = renderHook(() =>
            useImportDedup({ existingTransactions: [existingTx] })
          );

          const inputRow: ImportRow = { ...row, accountId };
          const marked = result.current.markDuplicates([inputRow], accountId);

          expect(marked[0].isDuplicate).toBe(true);
          expect(marked[0].include).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('transfer rows matching an existing transfer key are marked isDuplicate=true, include=false', () => {
    fc.assert(
      fc.property(
        arbTransferRow,
        arbAccountId,
        (row, accountId) => {
          // Create an existing transfer transaction with same day+amount
          const existingTx: Transaction = {
            type: 'transfer',
            amount: row.amount,
            category: 'Pago tarjeta',
            description: 'Different bank text',
            date: row.date,
            paid: true,
            accountId: 'other-acc', // transfer keys match across all accounts
          };

          const { result } = renderHook(() =>
            useImportDedup({ existingTransactions: [existingTx] })
          );

          const inputRow: ImportRow = { ...row, accountId };
          const marked = result.current.markDuplicates([inputRow], accountId);

          expect(marked[0].isDuplicate).toBe(true);
          expect(marked[0].include).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('same-file duplicates: second occurrence of same key is marked isDuplicate=true, include=false', () => {
    fc.assert(
      fc.property(
        arbNormalRow,
        arbAccountId,
        (row, accountId) => {
          const { result } = renderHook(() =>
            useImportDedup({ existingTransactions: [] })
          );

          const inputRow: ImportRow = { ...row, accountId };
          // Two identical rows in the same file
          const marked = result.current.markDuplicates([inputRow, { ...inputRow }], accountId);

          // First should NOT be duplicate
          expect(marked[0].isDuplicate).toBe(false);
          // Second SHOULD be duplicate (same-file)
          expect(marked[1].isDuplicate).toBe(true);
          expect(marked[1].include).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rows NOT matching any existing key and unique in file are NOT marked as duplicate', () => {
    fc.assert(
      fc.property(
        arbNormalRow,
        arbAccountId,
        fc.array(arbTransaction, { minLength: 0, maxLength: 10 }),
        (row, accountId, existingTxs) => {
          const { result } = renderHook(() =>
            useImportDedup({ existingTransactions: existingTxs })
          );

          const inputRow: ImportRow = { ...row, accountId };
          const rowKey = computeRowKey(inputRow);

          // Compute existing keys for the same account
          const existingKeys = new Set<string>();
          existingTxs.forEach(tx => {
            const d = tx.date instanceof Date ? tx.date : new Date(tx.date as unknown as string);
            if (isNaN(d.getTime())) return;
            if (tx.accountId === accountId) {
              existingKeys.add(buildExactKey(tx.type, d, tx.amount, tx.description));
            }
            if (tx.type === 'transfer' || isTransferRow({ ...inputRow, type: tx.type, description: tx.description })) {
              existingKeys.add(transferImportKey(d, tx.amount));
            }
          });

          const marked = result.current.markDuplicates([inputRow], accountId);

          if (!existingKeys.has(rowKey)) {
            // Row does not match any existing key → should NOT be duplicate
            expect(marked[0].isDuplicate).toBe(false);
          }
          // If it IS in existingKeys, it should be duplicate — already covered above
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ========================================================================
// Property 6: Transfer and foreign-currency exclusion
// ========================================================================

describe('Property 6: Transfer and foreign-currency exclusion', () => {
  /**
   * **Validates: Requirements 3.3, 3.4**
   *
   * For any ImportRow where type === 'transfer' OR isInternalTransferDescription(description)
   * returns true OR needsExchangeRate === true, the row SHALL have include === false
   * after dedup processing.
   */

  it('rows with type=transfer always have include=false', () => {
    fc.assert(
      fc.property(
        arbTransferRow,
        arbAccountId,
        fc.array(arbTransaction, { minLength: 0, maxLength: 5 }),
        (row, accountId, existingTxs) => {
          const { result } = renderHook(() =>
            useImportDedup({ existingTransactions: existingTxs })
          );

          const inputRow: ImportRow = { ...row, accountId };
          const marked = result.current.markDuplicates([inputRow], accountId);

          expect(marked[0].include).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rows with internal transfer keyword in description always have include=false', () => {
    fc.assert(
      fc.property(
        arbInternalTransferDescRow,
        arbAccountId,
        fc.array(arbTransaction, { minLength: 0, maxLength: 5 }),
        (row, accountId, existingTxs) => {
          const { result } = renderHook(() =>
            useImportDedup({ existingTransactions: existingTxs })
          );

          const inputRow: ImportRow = { ...row, accountId };
          const marked = result.current.markDuplicates([inputRow], accountId);

          expect(marked[0].include).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rows with needsExchangeRate=true always have include=false', () => {
    fc.assert(
      fc.property(
        arbForeignCurrencyRow,
        arbAccountId,
        fc.array(arbTransaction, { minLength: 0, maxLength: 5 }),
        (row, accountId, existingTxs) => {
          const { result } = renderHook(() =>
            useImportDedup({ existingTransactions: existingTxs })
          );

          const inputRow: ImportRow = { ...row, accountId };
          const marked = result.current.markDuplicates([inputRow], accountId);

          expect(marked[0].include).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('combined: any exclusion condition (transfer OR internal-desc OR foreign-currency) → include=false', () => {
    const arbExcludedRow = fc.oneof(
      arbTransferRow,
      arbInternalTransferDescRow,
      arbForeignCurrencyRow
    );

    fc.assert(
      fc.property(
        arbExcludedRow,
        arbAccountId,
        fc.array(arbTransaction, { minLength: 0, maxLength: 5 }),
        (row, accountId, existingTxs) => {
          const { result } = renderHook(() =>
            useImportDedup({ existingTransactions: existingTxs })
          );

          const inputRow: ImportRow = { ...row, accountId };
          const marked = result.current.markDuplicates([inputRow], accountId);

          expect(marked[0].include).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('normal rows without exclusion conditions have include=true (when not duplicate)', () => {
    fc.assert(
      fc.property(
        arbNormalRow,
        arbAccountId,
        (row, accountId) => {
          // Ensure this row does NOT match any internal transfer keywords
          fc.pre(!isInternalTransferDescription(row.description));
          fc.pre(row.type !== 'transfer');
          fc.pre(!row.needsExchangeRate);

          const { result } = renderHook(() =>
            useImportDedup({ existingTransactions: [] })
          );

          const inputRow: ImportRow = { ...row, accountId };
          const marked = result.current.markDuplicates([inputRow], accountId);

          // Not a duplicate, not a transfer, not foreign currency → include=true
          expect(marked[0].include).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
