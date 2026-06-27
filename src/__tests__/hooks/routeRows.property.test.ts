/**
 * Property tests para routeRows
 *
 * **Property 7: Route function assigns accounts and learned categories**
 * **Validates: Requirements 4.2**
 *
 * For any parsed ImportRow and valid account context, routeRows SHALL assign a
 * non-empty accountId. If the row is a transfer and a single linked credit card
 * exists for the base account, toAccountId SHALL be set to that card's ID.
 * If a learned category rule matches the description and categorySource !== 'file',
 * the output category SHALL equal the learned category.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { routeRows, inferTransferRoute } from '../../hooks/useImportWizard';
import { isInternalTransferDescription } from '../../utils/csvParser';
import { findLearnedCategory } from '../../utils/importLearning';
import type { ImportRow } from '../../hooks/useImportTransactions';
import type { Account } from '../../types/finance';
import type { ImportLearningRule } from '../../utils/importLearning';

// ─── Arbitraries ────────────────────────────────────────────────────────────

const arbRowType = fc.constantFrom<'income' | 'expense' | 'transfer'>('income', 'expense', 'transfer');

const arbCategorySource = fc.constantFrom<'file' | 'rules' | undefined>('file', 'rules', undefined);

const arbDescription = fc.oneof(
  // Descriptions that trigger internal transfer detection
  fc.constantFrom(
    'PAGO TARJETA DE CREDITO',
    'TRANSFERENCIA PROPIA',
    'PAGO TC VISA',
    'Gracias por tu pago',
    'PAGO PSE NU Colombia',
  ),
  // Descriptions that do NOT trigger transfer detection
  fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', '1', '2', '3', ' '), { minLength: 3, maxLength: 40 }),
  // Descriptions that might match learning rules
  fc.constantFrom(
    'Compra en Rappi Colombia',
    'Netflix mensual',
    'Spotify Premium',
    'Uber Eats pedido',
    'Amazon compra online',
  ),
);

const arbImportRow: fc.Arbitrary<ImportRow> = fc.record({
  date: fc.date({ min: new Date(2020, 0, 1), max: new Date(2026, 11, 31) }),
  description: arbDescription,
  amount: fc.integer({ min: 1000, max: 50_000_000 }),
  type: arbRowType,
  category: fc.constantFrom('Otros', 'Alimentación', 'Transporte', 'Entretenimiento'),
  categorySource: arbCategorySource,
  accountId: fc.constant(''), // routeRows will assign it
  include: fc.boolean(),
  suggestedCategory: fc.constantFrom('Otros', 'Alimentación', 'Transporte', 'Entretenimiento', 'Servicios'),
}) as fc.Arbitrary<ImportRow>;

const arbAccountId = fc.uuid();

const arbSavingsAccount = (id: string): fc.Arbitrary<Account> =>
  fc.record({
    id: fc.constant(id),
    name: fc.constant('Cuenta de Ahorros'),
    type: fc.constant<'savings'>('savings'),
    isDefault: fc.constant(true),
    initialBalance: fc.constant(0),
  });

const arbCreditAccount = (bankAccountId: string): fc.Arbitrary<Account> =>
  fc.record({
    id: arbAccountId,
    name: fc.constantFrom('Visa Gold', 'Mastercard Platinum', 'Amex Blue'),
    type: fc.constant<'credit'>('credit'),
    isDefault: fc.constant(false),
    initialBalance: fc.constant(0),
    creditLimit: fc.integer({ min: 1_000_000, max: 50_000_000 }),
    cutoffDay: fc.integer({ min: 1, max: 28 }),
    paymentDay: fc.integer({ min: 1, max: 28 }),
    bankAccountId: fc.constant(bankAccountId),
  });

const arbLearningRule: fc.Arbitrary<ImportLearningRule> = fc.record({
  pattern: fc.constantFrom('rappi', 'netflix', 'spotify', 'uber', 'amazon'),
  category: fc.constantFrom('Alimentación', 'Entretenimiento', 'Transporte', 'Servicios'),
  sourceDescription: fc.constant('test description'),
  createdAt: fc.constant('2025-01-01T00:00:00.000Z'),
  lastUsedAt: fc.constant('2025-06-01T00:00:00.000Z'),
  useCount: fc.integer({ min: 1, max: 100 }),
});

const arbCategoryOptions = fc.constant([
  'Otros', 'Alimentación', 'Transporte', 'Entretenimiento', 'Servicios',
  'Salud', 'Educación', 'Hogar', 'Ropa', 'Tecnología',
]);

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('routeRows — Property 7: Route function assigns accounts and learned categories', () => {
  it('SHALL assign a non-empty accountId to every output row', () => {
    fc.assert(
      fc.property(
        fc.array(arbImportRow, { minLength: 1, maxLength: 20 }),
        arbAccountId,
        fc.array(arbLearningRule, { minLength: 0, maxLength: 5 }),
        arbCategoryOptions,
        (rows, baseAccountId, learningRules, categoryOptions) => {
          // Create a savings account with the base ID and optionally a credit card
          const accounts: Account[] = [
            { id: baseAccountId, name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 },
          ];

          const result = routeRows(rows, baseAccountId, learningRules, accounts, categoryOptions);

          // Every output row SHALL have a non-empty accountId
          result.forEach(row => {
            expect(row.accountId).toBeTruthy();
            expect(row.accountId.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('SHALL set toAccountId to the single linked credit card ID for transfers', () => {
    fc.assert(
      fc.property(
        arbAccountId,
        arbAccountId,
        fc.array(arbLearningRule, { minLength: 0, maxLength: 3 }),
        arbCategoryOptions,
        (baseAccountId, creditCardId, learningRules, categoryOptions) => {
          // Ensure IDs are distinct
          fc.pre(baseAccountId !== creditCardId);

          const accounts: Account[] = [
            { id: baseAccountId, name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 },
            { id: creditCardId, name: 'TC Visa', type: 'credit', isDefault: false, initialBalance: 0, bankAccountId: baseAccountId },
          ];

          // Row explicitly typed as transfer
          const transferRow: ImportRow = {
            date: new Date(2025, 5, 15),
            description: 'Pago manual',
            amount: 500_000,
            type: 'transfer',
            category: 'Otros',
            accountId: '',
            include: true,
            suggestedCategory: 'Otros',
          };

          const result = routeRows([transferRow], baseAccountId, learningRules, accounts, categoryOptions);

          // With a single linked credit card, toAccountId SHALL be set to that card's ID
          expect(result[0].toAccountId).toBe(creditCardId);
          expect(result[0].accountId).toBe(baseAccountId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('SHALL set toAccountId to the linked credit card ID for description-detected transfers', () => {
    fc.assert(
      fc.property(
        arbAccountId,
        arbAccountId,
        fc.constantFrom(
          'PAGO TARJETA DE CREDITO',
          'TRANSFERENCIA PROPIA',
          'Gracias por tu pago',
          'PAGO PSE NU Colombia',
          'PAGO TC mi tarjeta',
        ),
        fc.array(arbLearningRule, { minLength: 0, maxLength: 3 }),
        arbCategoryOptions,
        (baseAccountId, creditCardId, transferDesc, learningRules, categoryOptions) => {
          fc.pre(baseAccountId !== creditCardId);
          // Verify the description actually triggers transfer detection
          fc.pre(isInternalTransferDescription(transferDesc));

          const accounts: Account[] = [
            { id: baseAccountId, name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 },
            { id: creditCardId, name: 'TC Visa', type: 'credit', isDefault: false, initialBalance: 0, bankAccountId: baseAccountId },
          ];

          const row: ImportRow = {
            date: new Date(2025, 5, 15),
            description: transferDesc,
            amount: 300_000,
            type: 'expense', // NOT explicitly transfer, but description triggers it
            category: 'Otros',
            accountId: '',
            include: true,
            suggestedCategory: 'Otros',
          };

          const result = routeRows([row], baseAccountId, learningRules, accounts, categoryOptions);

          expect(result[0].toAccountId).toBe(creditCardId);
          expect(result[0].accountId).toBe(baseAccountId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('SHALL apply learned category when rule matches and categorySource !== "file"', () => {
    fc.assert(
      fc.property(
        arbAccountId,
        fc.constantFrom<'rules' | undefined>('rules', undefined),
        arbCategoryOptions,
        (baseAccountId, categorySource, categoryOptions) => {
          const accounts: Account[] = [
            { id: baseAccountId, name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 },
          ];

          // Learning rule: pattern "rappi" → "Alimentación"
          const learningRules: ImportLearningRule[] = [
            {
              pattern: 'rappi',
              category: 'Alimentación',
              sourceDescription: 'Compra en Rappi',
              createdAt: '2025-01-01T00:00:00.000Z',
              lastUsedAt: '2025-06-01T00:00:00.000Z',
              useCount: 5,
            },
          ];

          // Row with description that matches the "rappi" pattern
          const row: ImportRow = {
            date: new Date(2025, 5, 15),
            description: 'Compra en Rappi Colombia',
            amount: 45_000,
            type: 'expense',
            category: 'Otros',
            categorySource, // NOT 'file'
            accountId: '',
            include: true,
            suggestedCategory: 'Otros',
          };

          const result = routeRows([row], baseAccountId, learningRules, accounts, categoryOptions);

          // The learned category SHALL be applied since it matches and source !== 'file'
          const expectedCategory = findLearnedCategory(row.description, learningRules, categoryOptions);
          expect(expectedCategory).toBe('Alimentación');
          expect(result[0].category).toBe('Alimentación');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('SHALL NOT apply learned category when categorySource === "file"', () => {
    fc.assert(
      fc.property(
        arbAccountId,
        arbCategoryOptions,
        (baseAccountId, categoryOptions) => {
          const accounts: Account[] = [
            { id: baseAccountId, name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 },
          ];

          const learningRules: ImportLearningRule[] = [
            {
              pattern: 'rappi',
              category: 'Alimentación',
              sourceDescription: 'Compra en Rappi',
              createdAt: '2025-01-01T00:00:00.000Z',
              lastUsedAt: '2025-06-01T00:00:00.000Z',
              useCount: 5,
            },
          ];

          // Row with categorySource 'file' — learning rules SHALL NOT be applied
          const row: ImportRow = {
            date: new Date(2025, 5, 15),
            description: 'Compra en Rappi Colombia',
            amount: 45_000,
            type: 'expense',
            category: 'Transporte', // file-assigned category
            categorySource: 'file',
            accountId: '',
            include: true,
            suggestedCategory: 'Transporte',
          };

          const result = routeRows([row], baseAccountId, learningRules, accounts, categoryOptions);

          // When categorySource === 'file', the output category SHALL be suggestedCategory (fallback)
          expect(result[0].category).toBe(row.suggestedCategory);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('SHALL preserve row count — output length equals input length', () => {
    fc.assert(
      fc.property(
        fc.array(arbImportRow, { minLength: 0, maxLength: 30 }),
        arbAccountId,
        fc.array(arbLearningRule, { minLength: 0, maxLength: 5 }),
        arbCategoryOptions,
        (rows, baseAccountId, learningRules, categoryOptions) => {
          const accounts: Account[] = [
            { id: baseAccountId, name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 },
          ];

          const result = routeRows(rows, baseAccountId, learningRules, accounts, categoryOptions);
          expect(result).toHaveLength(rows.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
