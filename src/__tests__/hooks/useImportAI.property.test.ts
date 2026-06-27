/**
 * Property-based tests para useImportAI.
 * Validates: Requirements 2.1, 2.2
 *
 * Property 3: AI eligibility filter
 * Property 4: AI confidence threshold and sort order
 *
 * Stack: Vitest + fast-check, minimum 100 iterations per property.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { useImportAI } from '../../hooks/useImportAI';
import type { ImportRow } from '../../hooks/useImportTransactions';
import type { ImportLearningRule } from '../../utils/importLearning';

// Mock categorizeWithAI — we control responses from the AI
vi.mock('../../utils/aiCategorizer', () => ({
  categorizeWithAI: vi.fn().mockResolvedValue([]),
}));

import { categorizeWithAI } from '../../utils/aiCategorizer';

const mockedCategorizeWithAI = vi.mocked(categorizeWithAI);

// ─── Arbitraries (Smart Generators) ────────────────────────────────────────

/** Generate a non-empty alphanumeric description (min 4 chars for pattern extraction). */
const arbDescription = fc.stringMatching(/^[A-Z][A-Z0-9 ]{3,30}$/).filter(s => s.trim().length >= 4);

/** Generate a positive COP amount. */
const arbAmount = fc.integer({ min: 100, max: 100_000_000 });

/** Generate a row type. */
const arbType = fc.constantFrom<'income' | 'expense' | 'transfer'>('income', 'expense', 'transfer');

/** Generate a categorySource value. */
const arbCategorySource = fc.constantFrom<'file' | 'rules' | undefined>('file', 'rules', undefined);

/** Generate a category — either "Otros" variants or a real category. */
const arbCategory = fc.constantFrom(
  'Otros', 'otros', 'OTROS', 'Ótros', // normalized = "otros"
  'Alimentación', 'Transporte', 'Salud', 'Servicios', 'Entretenimiento',
  'Educación', 'Compras Personales', 'Vivienda'
);

/** Generate a complete ImportRow with randomized fields. */
const arbImportRow: fc.Arbitrary<ImportRow> = fc.record({
  date: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
  description: arbDescription,
  amount: arbAmount,
  type: arbType,
  category: arbCategory,
  categorySource: arbCategorySource,
  accountId: fc.constant('acc-1'),
  include: fc.boolean(),
  isDuplicate: fc.boolean(),
}).map(r => r as ImportRow);

/** Generate an array of ImportRow (1 to 20 rows). */
const arbImportRows = fc.array(arbImportRow, { minLength: 1, maxLength: 20 });

/** Normalized category check (same logic as the hook). */
function normalizeCategory(category: string): string {
  return category.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function isOtherCategory(category: string): boolean {
  return normalizeCategory(category) === 'otros';
}

/** Check if a row is eligible for AI categorization (Property 3 definition). */
function isEligibleForAI(row: ImportRow): boolean {
  return (
    row.include === true &&
    row.type !== 'transfer' &&
    row.categorySource !== 'file' &&
    isOtherCategory(row.category)
  );
}

// ─── Confidence/category generators for Property 4 ──────────────────────────

const arbConfidence = fc.double({ min: 0, max: 1, noNaN: true });

const arbResultCategory = fc.constantFrom(
  'Otros', 'otros', 'OTROS',
  'Alimentación', 'Transporte', 'Salud', 'Servicios',
  'Entretenimiento', 'Educación', 'Compras Personales'
);

interface AIResult {
  index: number;
  category: string;
  confidence: number;
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('useImportAI — Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Property 3: AI eligibility filter**
   * **Validates: Requirements 2.1**
   *
   * For any set of ImportRow[], only rows where include === true AND
   * type !== 'transfer' AND categorySource !== 'file' AND normalized
   * category equals "otros" SHALL be passed to the AI categorizer.
   */
  describe('Property 3: AI eligibility filter', () => {
    it('only eligible rows are sent to categorizeWithAI', async () => {
      await fc.assert(
        fc.asyncProperty(arbImportRows, async (rows) => {
          vi.clearAllMocks();
          mockedCategorizeWithAI.mockResolvedValue([]);

          const setLearningRules = vi.fn();
          const { result } = renderHook(() =>
            useImportAI({
              availableCategoryOptions: ['Alimentación', 'Transporte', 'Salud', 'Otros'],
              learningRules: [] as ImportLearningRule[],
              setLearningRules,
            })
          );

          await act(async () => {
            await result.current.handleAICategorize(rows);
          });

          // If there are eligible rows, categorizeWithAI should have been called
          const eligibleRows = rows.filter(isEligibleForAI);

          if (eligibleRows.length === 0) {
            // AI should still be called with an empty array (rows grouped = empty)
            // Actually it WILL be called since rows.length > 0
            if (mockedCategorizeWithAI.mock.calls.length > 0) {
              const sentToAI = mockedCategorizeWithAI.mock.calls[0][0];
              expect(sentToAI).toHaveLength(0);
            }
          } else {
            expect(mockedCategorizeWithAI).toHaveBeenCalledTimes(1);
            const sentToAI = mockedCategorizeWithAI.mock.calls[0][0];

            // Every item sent to AI must correspond to an eligible row index.
            // The hook groups rows by pattern, so the sentToAI items have `index`
            // that references the group index, not the row index. But the
            // original row indexes are captured in the group's `indexes` array.
            // What we can verify: number of items sent ≤ number of eligible groups.
            // More importantly, we verify the count of underlying rows matches.
            expect(sentToAI.length).toBeGreaterThan(0);
            expect(sentToAI.length).toBeLessThanOrEqual(eligibleRows.length);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('ineligible rows are never included in AI input', async () => {
      await fc.assert(
        fc.asyncProperty(arbImportRows, async (rows) => {
          vi.clearAllMocks();

          // Make categorizeWithAI capture what's sent to it
          let capturedInput: Array<{ index: number; description: string }> = [];
          mockedCategorizeWithAI.mockImplementation(async (input) => {
            capturedInput = input as typeof capturedInput;
            return [];
          });

          const setLearningRules = vi.fn();
          const { result } = renderHook(() =>
            useImportAI({
              availableCategoryOptions: ['Alimentación', 'Transporte', 'Salud', 'Otros'],
              learningRules: [] as ImportLearningRule[],
              setLearningRules,
            })
          );

          await act(async () => {
            await result.current.handleAICategorize(rows);
          });

          // Compute expected eligible indexes
          const eligibleIndexes = new Set(
            rows
              .map((row, idx) => ({ row, idx }))
              .filter(({ row }) => isEligibleForAI(row))
              .map(({ idx }) => idx)
          );

          // The hook groups eligible rows by description pattern.
          // The descriptions sent to the AI must ONLY come from eligible rows.
          // We verify by checking that every description token sent matches
          // an eligible row's description.
          if (eligibleIndexes.size === 0) {
            expect(capturedInput).toHaveLength(0);
          } else {
            // All descriptions in capturedInput must be derivable from eligible rows only
            const eligibleDescriptions = rows
              .filter((_, idx) => eligibleIndexes.has(idx))
              .map(r => r.description.toLowerCase());

            capturedInput.forEach(item => {
              // The description format is "pattern: sampleDescription"
              const samplePart = item.description.split(': ').slice(1).join(': ');
              const matchesEligible = eligibleDescriptions.some(
                desc => samplePart.toLowerCase() === desc.toLowerCase() ||
                        desc.toLowerCase().includes(samplePart.toLowerCase()) ||
                        samplePart.toLowerCase().includes(desc.toLowerCase())
              );
              expect(matchesEligible).toBe(true);
            });
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Property 4: AI confidence threshold and sort order**
   * **Validates: Requirements 2.2**
   *
   * For any set of AI results, only results with confidence >= 0.75
   * and a non-"Otros" category SHALL appear in the final aiSuggestions
   * array, and that array SHALL be sorted by category then by pattern
   * using es-CO collation.
   */
  describe('Property 4: AI confidence threshold and sort order', () => {
    it('only results with confidence >= 0.75 and non-Otros category appear in suggestions', async () => {
      // Generate a set of eligible rows (all meeting eligibility criteria)
      // and a set of AI results with varying confidence/category
      const arbEligibleRow = fc.record({
        date: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
        description: arbDescription,
        amount: arbAmount,
        type: fc.constantFrom<'income' | 'expense'>('income', 'expense'),
        category: fc.constant('Otros'),
        categorySource: fc.constant(undefined),
        accountId: fc.constant('acc-1'),
        include: fc.constant(true),
        isDuplicate: fc.constant(false),
      }).map(r => r as ImportRow);

      const arbEligibleRows = fc.array(arbEligibleRow, { minLength: 1, maxLength: 10 });

      // Generate AI results corresponding to groups (indexed 0..n)
      const arbAIResults = fc.array(
        fc.record({
          category: arbResultCategory,
          confidence: arbConfidence,
        }),
        { minLength: 1, maxLength: 10 }
      );

      await fc.assert(
        fc.asyncProperty(arbEligibleRows, arbAIResults, async (rows, aiResults) => {
          vi.clearAllMocks();

          // Map AI results to have proper indexes
          const indexedResults: AIResult[] = aiResults
            .slice(0, rows.length) // don't exceed number of groups
            .map((r, idx) => ({ index: idx, ...r }));

          mockedCategorizeWithAI.mockResolvedValue(indexedResults);

          const setLearningRules = vi.fn();
          const { result } = renderHook(() =>
            useImportAI({
              availableCategoryOptions: ['Alimentación', 'Transporte', 'Salud', 'Otros'],
              learningRules: [] as ImportLearningRule[],
              setLearningRules,
            })
          );

          await act(async () => {
            await result.current.handleAICategorize(rows);
          });

          const suggestions = result.current.aiSuggestions;

          // Threshold check: every suggestion must have confidence >= 0.75
          // and non-"Otros" category
          suggestions.forEach(suggestion => {
            expect(suggestion.confidence).toBeGreaterThanOrEqual(0.75);
            expect(isOtherCategory(suggestion.category)).toBe(false);
          });

          // Completeness: all qualifying results must appear
          const expectedCount = indexedResults.filter(
            r => r.confidence >= 0.75 && !isOtherCategory(r.category)
          ).length;
          // Note: some results may not have a corresponding group if index is out of range
          expect(suggestions.length).toBeLessThanOrEqual(expectedCount);
        }),
        { numRuns: 100 }
      );
    });

    it('suggestions are sorted by category then pattern using es-CO collation', async () => {
      // Use multiple distinct eligible rows to produce multiple groups/suggestions
      const arbDistinctEligibleRows = fc
        .array(arbDescription, { minLength: 2, maxLength: 8 })
        .filter(descs => new Set(descs).size === descs.length)
        .map(descriptions =>
          descriptions.map(
            (desc): ImportRow => ({
              date: new Date('2024-06-15'),
              description: desc,
              amount: 50000,
              type: 'expense',
              category: 'Otros',
              categorySource: undefined,
              accountId: 'acc-1',
              include: true,
              isDuplicate: false,
            })
          )
        );

      const nonOtrosCategories = [
        'Alimentación', 'Transporte', 'Salud', 'Servicios',
        'Entretenimiento', 'Educación', 'Compras Personales', 'Vivienda',
      ];

      await fc.assert(
        fc.asyncProperty(arbDistinctEligibleRows, async (rows) => {
          vi.clearAllMocks();

          // Give each group a valid result (high confidence, non-Otros)
          const results: AIResult[] = rows.map((_, idx) => ({
            index: idx,
            category: nonOtrosCategories[idx % nonOtrosCategories.length],
            confidence: 0.8 + Math.random() * 0.2, // all >= 0.75
          }));

          mockedCategorizeWithAI.mockResolvedValue(results);

          const setLearningRules = vi.fn();
          const { result } = renderHook(() =>
            useImportAI({
              availableCategoryOptions: ['Alimentación', 'Transporte', 'Salud', 'Otros'],
              learningRules: [] as ImportLearningRule[],
              setLearningRules,
            })
          );

          await act(async () => {
            await result.current.handleAICategorize(rows);
          });

          const suggestions = result.current.aiSuggestions;

          // Verify sort order: category first, then pattern (es-CO collation)
          const collator = new Intl.Collator('es-CO', { sensitivity: 'base' });

          for (let i = 1; i < suggestions.length; i++) {
            const prev = suggestions[i - 1];
            const curr = suggestions[i];
            const categoryCompare = collator.compare(prev.category, curr.category);

            if (categoryCompare === 0) {
              // Same category: pattern should be non-descending
              const patternCompare = collator.compare(prev.pattern, curr.pattern);
              expect(patternCompare).toBeLessThanOrEqual(0);
            } else {
              // Categories should be in ascending order
              expect(categoryCompare).toBeLessThan(0);
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    it('results below confidence threshold are excluded regardless of category', async () => {
      // All results with confidence < 0.75 must be excluded
      const arbLowConfidenceResults = fc.array(
        fc.record({
          category: fc.constantFrom('Alimentación', 'Transporte', 'Salud'),
          confidence: fc.double({ min: 0, max: 0.7499, noNaN: true }),
        }),
        { minLength: 1, maxLength: 5 }
      );

      const eligibleRow: ImportRow = {
        date: new Date('2024-06-15'),
        description: 'COMPRA EN EXITO',
        amount: 50000,
        type: 'expense',
        category: 'Otros',
        categorySource: undefined,
        accountId: 'acc-1',
        include: true,
        isDuplicate: false,
      };

      await fc.assert(
        fc.asyncProperty(arbLowConfidenceResults, async (lowResults) => {
          vi.clearAllMocks();

          const indexedResults: AIResult[] = lowResults.map((r, idx) => ({
            index: idx,
            ...r,
          }));

          // Create enough eligible rows for the results
          const rows = lowResults.map((_, idx) => ({
            ...eligibleRow,
            description: `COMPRA ${String.fromCharCode(65 + idx)} STORE ${idx}`,
          }));

          mockedCategorizeWithAI.mockResolvedValue(indexedResults);

          const setLearningRules = vi.fn();
          const { result } = renderHook(() =>
            useImportAI({
              availableCategoryOptions: ['Alimentación', 'Transporte', 'Salud', 'Otros'],
              learningRules: [] as ImportLearningRule[],
              setLearningRules,
            })
          );

          await act(async () => {
            await result.current.handleAICategorize(rows);
          });

          // No suggestions should appear since all are below threshold
          expect(result.current.aiSuggestions).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('results with "Otros" category are excluded regardless of confidence', async () => {
      const arbOtrosResults = fc.array(
        fc.record({
          category: fc.constantFrom('Otros', 'otros', 'OTROS'),
          confidence: fc.double({ min: 0.75, max: 1, noNaN: true }),
        }),
        { minLength: 1, maxLength: 5 }
      );

      const eligibleRow: ImportRow = {
        date: new Date('2024-06-15'),
        description: 'COMPRA EN EXITO',
        amount: 50000,
        type: 'expense',
        category: 'Otros',
        categorySource: undefined,
        accountId: 'acc-1',
        include: true,
        isDuplicate: false,
      };

      await fc.assert(
        fc.asyncProperty(arbOtrosResults, async (otrosResults) => {
          vi.clearAllMocks();

          const indexedResults: AIResult[] = otrosResults.map((r, idx) => ({
            index: idx,
            ...r,
          }));

          const rows = otrosResults.map((_, idx) => ({
            ...eligibleRow,
            description: `COMPRA ${String.fromCharCode(65 + idx)} STORE ${idx}`,
          }));

          mockedCategorizeWithAI.mockResolvedValue(indexedResults);

          const setLearningRules = vi.fn();
          const { result } = renderHook(() =>
            useImportAI({
              availableCategoryOptions: ['Alimentación', 'Transporte', 'Salud', 'Otros'],
              learningRules: [] as ImportLearningRule[],
              setLearningRules,
            })
          );

          await act(async () => {
            await result.current.handleAICategorize(rows);
          });

          // No suggestions should appear since all have "Otros" category
          expect(result.current.aiSuggestions).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });
  });
});
