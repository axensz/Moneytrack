import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { useImportParsing } from '../../hooks/useImportParsing';
import type { Categories } from '../../types/finance';
import type { ParsedRow } from '../../utils/csvParser';

/**
 * Property-Based Tests for useImportParsing
 *
 * **Validates: Requirements 1.1, 1.2**
 */

// Mock parsers
vi.mock('../../utils/csvParser', () => ({
  parseCSV: vi.fn(),
}));
vi.mock('../../utils/xlsxParser', () => ({
  parseXLSX: vi.fn(),
}));
vi.mock('../../utils/pdfParser', () => ({
  parsePDF: vi.fn(),
}));

import { parseCSV } from '../../utils/csvParser';
import { parseXLSX } from '../../utils/xlsxParser';
import { parsePDF } from '../../utils/pdfParser';

const mockParseCSV = vi.mocked(parseCSV);
const mockParseXLSX = vi.mocked(parseXLSX);
const mockParsePDF = vi.mocked(parsePDF);

const categories: Categories = {
  expense: ['Alimentación', 'Transporte', 'Otros'],
  income: ['Salario', 'Otros'],
};

// ── Arbitraries ───────────────────────────────────────────────────────────────

/** Arbitrary for file extensions recognized by useImportParsing */
const csvExtensionArb = fc.constantFrom('.csv');
const xlsxExtensionArb = fc.constantFrom('.xlsx', '.xls');
const pdfExtensionArb = fc.constantFrom('.pdf');

/** Arbitrary for a random filename base (alphanumeric, 1-30 chars) */
const fileBaseArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,30}$/);

/** Arbitrary for a valid transaction type */
const transactionTypeArb = fc.constantFrom('income', 'expense', 'transfer') as fc.Arbitrary<'income' | 'expense' | 'transfer'>;

/** Arbitrary for a category source */
const categorySourceArb = fc.constantFrom('file', 'rules') as fc.Arbitrary<'file' | 'rules'>;

/** Arbitrary for a valid date (within reasonable range) */
const dateArb = fc.date({ min: new Date(2020, 0, 1), max: new Date(2030, 11, 31) });

/** Arbitrary for a positive amount in COP */
const amountArb = fc.integer({ min: 1, max: 100_000_000 });

/** Arbitrary for a non-empty description */
const descriptionArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0);

/** Arbitrary for a suggestedCategory (non-empty string) */
const suggestedCategoryArb = fc.constantFrom('Alimentación', 'Transporte', 'Salario', 'Otros', 'Entretenimiento');

/** Arbitrary for a single ParsedRow returned by parsers */
const parsedRowArb: fc.Arbitrary<ParsedRow> = fc.record({
  date: dateArb,
  description: descriptionArb,
  amount: amountArb,
  type: transactionTypeArb,
  suggestedCategory: suggestedCategoryArb,
  categorySource: fc.option(categorySourceArb, { nil: undefined }),
  rawLine: fc.string({ minLength: 1, maxLength: 50 }),
  installments: fc.option(fc.integer({ min: 1, max: 48 }), { nil: undefined }),
  currentInstallment: fc.option(fc.integer({ min: 1, max: 48 }), { nil: undefined }),
  currency: fc.option(fc.constantFrom('COP', 'USD', 'EUR'), { nil: undefined }),
  originalAmount: fc.option(fc.integer({ min: 1, max: 100_000_000 }), { nil: undefined }),
  originalCurrency: fc.option(fc.constantFrom('USD', 'EUR'), { nil: undefined }),
  exchangeRate: fc.option(fc.float({ min: 1, max: 5000, noNaN: true }), { nil: undefined }),
  needsExchangeRate: fc.option(fc.boolean(), { nil: undefined }),
});

/** Arbitrary for a non-empty list of ParsedRows (1-20 rows) */
const parsedRowsArb = fc.array(parsedRowArb, { minLength: 1, maxLength: 20 });

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFile(name: string, content: string = 'dummy'): File {
  const blob = new Blob([content], { type: 'text/plain' });
  const file = new File([blob], name, { type: 'text/plain' });
  if (!file.text) {
    file.text = () => Promise.resolve(content);
  }
  if (!file.arrayBuffer) {
    file.arrayBuffer = () => blob.arrayBuffer();
  }
  return file;
}

function makeBinaryFile(name: string): File {
  const buffer = new ArrayBuffer(8);
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const file = new File([blob], name, { type: 'application/octet-stream' });
  if (!file.text) {
    file.text = () => Promise.resolve('');
  }
  if (!file.arrayBuffer) {
    file.arrayBuffer = () => Promise.resolve(buffer);
  }
  return file;
}

// ── Property Tests ────────────────────────────────────────────────────────────

describe('useImportParsing — Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Property 1: File extension routing dispatch**
   *
   * For any file with a recognized extension (.csv, .xlsx, .xls, .pdf),
   * useImportParsing SHALL invoke the corresponding parser function
   * (parseCSV, parseXLSX, or parsePDF) and no other parser.
   *
   * **Validates: Requirements 1.1**
   */
  describe('Property 1: File extension routing dispatch', () => {
    it('.csv files always route to parseCSV only', async () => {
      await fc.assert(
        fc.asyncProperty(fileBaseArb, parsedRowsArb, async (baseName, rows) => {
          vi.clearAllMocks();
          mockParseCSV.mockReturnValue({
            rows,
            errors: [],
            totalRows: rows.length,
            skippedRows: 0,
          });

          const { result } = renderHook(() =>
            useImportParsing({ categories, aiReason: null })
          );

          await act(async () => {
            await result.current.parseFile(makeFile(`${baseName}.csv`));
          });

          // parseCSV was called exactly once
          expect(mockParseCSV).toHaveBeenCalledTimes(1);
          // No other parser was called
          expect(mockParseXLSX).not.toHaveBeenCalled();
          expect(mockParsePDF).not.toHaveBeenCalled();
        }),
        { numRuns: 100 }
      );
    });

    it('.xlsx files always route to parseXLSX only', async () => {
      await fc.assert(
        fc.asyncProperty(fileBaseArb, parsedRowsArb, async (baseName, rows) => {
          vi.clearAllMocks();
          mockParseXLSX.mockReturnValue({
            rows,
            errors: [],
            totalRows: rows.length,
            skippedRows: 0,
          });

          const { result } = renderHook(() =>
            useImportParsing({ categories, aiReason: null })
          );

          await act(async () => {
            await result.current.parseFile(makeBinaryFile(`${baseName}.xlsx`));
          });

          expect(mockParseXLSX).toHaveBeenCalledTimes(1);
          expect(mockParseCSV).not.toHaveBeenCalled();
          expect(mockParsePDF).not.toHaveBeenCalled();
        }),
        { numRuns: 100 }
      );
    });

    it('.xls files always route to parseXLSX only', async () => {
      await fc.assert(
        fc.asyncProperty(fileBaseArb, parsedRowsArb, async (baseName, rows) => {
          vi.clearAllMocks();
          mockParseXLSX.mockReturnValue({
            rows,
            errors: [],
            totalRows: rows.length,
            skippedRows: 0,
          });

          const { result } = renderHook(() =>
            useImportParsing({ categories, aiReason: null })
          );

          await act(async () => {
            await result.current.parseFile(makeBinaryFile(`${baseName}.xls`));
          });

          expect(mockParseXLSX).toHaveBeenCalledTimes(1);
          expect(mockParseCSV).not.toHaveBeenCalled();
          expect(mockParsePDF).not.toHaveBeenCalled();
        }),
        { numRuns: 100 }
      );
    });

    it('.pdf files always route to parsePDF only (when AI available)', async () => {
      await fc.assert(
        fc.asyncProperty(fileBaseArb, parsedRowsArb, async (baseName, rows) => {
          vi.clearAllMocks();
          mockParsePDF.mockResolvedValue({
            rows,
            errors: [],
            totalRows: rows.length,
            skippedRows: 0,
          });

          const { result } = renderHook(() =>
            useImportParsing({ categories, aiReason: null })
          );

          await act(async () => {
            await result.current.parseFile(makeBinaryFile(`${baseName}.pdf`));
          });

          expect(mockParsePDF).toHaveBeenCalledTimes(1);
          expect(mockParseCSV).not.toHaveBeenCalled();
          expect(mockParseXLSX).not.toHaveBeenCalled();
        }),
        { numRuns: 100 }
      );
    });

    it('all recognized extensions dispatch to exactly one parser', async () => {
      const extensionArb = fc.oneof(csvExtensionArb, xlsxExtensionArb, pdfExtensionArb);

      await fc.assert(
        fc.asyncProperty(fileBaseArb, extensionArb, parsedRowsArb, async (baseName, ext, rows) => {
          vi.clearAllMocks();

          // Configure mocks to return rows for any parser
          mockParseCSV.mockReturnValue({ rows, errors: [], totalRows: rows.length, skippedRows: 0 });
          mockParseXLSX.mockReturnValue({ rows, errors: [], totalRows: rows.length, skippedRows: 0 });
          mockParsePDF.mockResolvedValue({ rows, errors: [], totalRows: rows.length, skippedRows: 0 });

          const fileName = `${baseName}${ext}`;
          const file = ext === '.pdf' || ext === '.xlsx' || ext === '.xls'
            ? makeBinaryFile(fileName)
            : makeFile(fileName);

          const { result } = renderHook(() =>
            useImportParsing({ categories, aiReason: null })
          );

          await act(async () => {
            await result.current.parseFile(file);
          });

          // Exactly one parser was invoked
          const callCounts = [
            mockParseCSV.mock.calls.length,
            mockParseXLSX.mock.calls.length,
            mockParsePDF.mock.calls.length,
          ];
          const totalCalls = callCounts.reduce((a, b) => a + b, 0);
          expect(totalCalls).toBe(1);

          // Verify the correct parser was the one called
          if (ext === '.csv') {
            expect(mockParseCSV).toHaveBeenCalledTimes(1);
          } else if (ext === '.xlsx' || ext === '.xls') {
            expect(mockParseXLSX).toHaveBeenCalledTimes(1);
          } else if (ext === '.pdf') {
            expect(mockParsePDF).toHaveBeenCalledTimes(1);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Property 2: ImportRow field population invariant**
   *
   * For any non-empty output from a parser, every element in the resulting
   * ImportRow[] SHALL have non-undefined values for date (valid Date),
   * description (string), amount (positive number), type (income|expense|transfer),
   * and suggestedCategory (string).
   *
   * **Validates: Requirements 1.2**
   */
  describe('Property 2: ImportRow field population invariant', () => {
    it('every ImportRow from CSV parsing has all required fields populated', async () => {
      await fc.assert(
        fc.asyncProperty(fileBaseArb, parsedRowsArb, async (baseName, rows) => {
          vi.clearAllMocks();
          mockParseCSV.mockReturnValue({
            rows,
            errors: [],
            totalRows: rows.length,
            skippedRows: 0,
          });

          const { result } = renderHook(() =>
            useImportParsing({ categories, aiReason: null })
          );

          let importRows: Awaited<ReturnType<typeof result.current.parseFile>>;
          await act(async () => {
            importRows = await result.current.parseFile(makeFile(`${baseName}.csv`));
          });

          // Every row must have the required fields
          for (const row of importRows!) {
            // date is a valid Date
            expect(row.date).toBeInstanceOf(Date);
            expect(isNaN(row.date.getTime())).toBe(false);

            // description is a non-empty string
            expect(typeof row.description).toBe('string');
            expect(row.description.length).toBeGreaterThan(0);

            // amount is a positive number
            expect(typeof row.amount).toBe('number');
            expect(row.amount).toBeGreaterThan(0);

            // type is one of the valid values
            expect(['income', 'expense', 'transfer']).toContain(row.type);

            // suggestedCategory is a non-empty string
            expect(typeof row.suggestedCategory).toBe('string');
            expect(row.suggestedCategory!.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('every ImportRow from XLSX parsing has all required fields populated', async () => {
      await fc.assert(
        fc.asyncProperty(fileBaseArb, parsedRowsArb, async (baseName, rows) => {
          vi.clearAllMocks();
          mockParseXLSX.mockReturnValue({
            rows,
            errors: [],
            totalRows: rows.length,
            skippedRows: 0,
          });

          const { result } = renderHook(() =>
            useImportParsing({ categories, aiReason: null })
          );

          let importRows: Awaited<ReturnType<typeof result.current.parseFile>>;
          await act(async () => {
            importRows = await result.current.parseFile(makeBinaryFile(`${baseName}.xlsx`));
          });

          for (const row of importRows!) {
            expect(row.date).toBeInstanceOf(Date);
            expect(isNaN(row.date.getTime())).toBe(false);
            expect(typeof row.description).toBe('string');
            expect(row.description.length).toBeGreaterThan(0);
            expect(typeof row.amount).toBe('number');
            expect(row.amount).toBeGreaterThan(0);
            expect(['income', 'expense', 'transfer']).toContain(row.type);
            expect(typeof row.suggestedCategory).toBe('string');
            expect(row.suggestedCategory!.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('every ImportRow from PDF parsing has all required fields populated', async () => {
      await fc.assert(
        fc.asyncProperty(fileBaseArb, parsedRowsArb, async (baseName, rows) => {
          vi.clearAllMocks();
          mockParsePDF.mockResolvedValue({
            rows,
            errors: [],
            totalRows: rows.length,
            skippedRows: 0,
          });

          const { result } = renderHook(() =>
            useImportParsing({ categories, aiReason: null })
          );

          let importRows: Awaited<ReturnType<typeof result.current.parseFile>>;
          await act(async () => {
            importRows = await result.current.parseFile(makeBinaryFile(`${baseName}.pdf`));
          });

          for (const row of importRows!) {
            expect(row.date).toBeInstanceOf(Date);
            expect(isNaN(row.date.getTime())).toBe(false);
            expect(typeof row.description).toBe('string');
            expect(row.description.length).toBeGreaterThan(0);
            expect(typeof row.amount).toBe('number');
            expect(row.amount).toBeGreaterThan(0);
            expect(['income', 'expense', 'transfer']).toContain(row.type);
            expect(typeof row.suggestedCategory).toBe('string');
            expect(row.suggestedCategory!.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('ImportRow fields preserve original parser data without mutation', async () => {
      await fc.assert(
        fc.asyncProperty(fileBaseArb, parsedRowsArb, async (baseName, rows) => {
          vi.clearAllMocks();
          mockParseCSV.mockReturnValue({
            rows,
            errors: [],
            totalRows: rows.length,
            skippedRows: 0,
          });

          const { result } = renderHook(() =>
            useImportParsing({ categories, aiReason: null })
          );

          let importRows: Awaited<ReturnType<typeof result.current.parseFile>>;
          await act(async () => {
            importRows = await result.current.parseFile(makeFile(`${baseName}.csv`));
          });

          // Each ImportRow should preserve the original parser values
          for (let i = 0; i < importRows!.length; i++) {
            const original = rows[i];
            const mapped = importRows![i];

            expect(mapped.date).toEqual(original.date);
            expect(mapped.description).toBe(original.description);
            expect(mapped.amount).toBe(original.amount);
            expect(mapped.type).toBe(original.type);
            expect(mapped.suggestedCategory).toBe(original.suggestedCategory);
            expect(mapped.categorySource).toBe(original.categorySource);

            // Default fields set by useImportParsing
            expect(mapped.accountId).toBe('');
            expect(mapped.include).toBe(true);
            expect(mapped.isDuplicate).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
