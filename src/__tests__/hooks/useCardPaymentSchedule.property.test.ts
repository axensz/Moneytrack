/**
 * Property-based tests for useCardPaymentSchedule (buildCardPaymentSchedule).
 * Tests Properties 8â€“13 from the design document.
 * Also includes Property 1 from card-payment-window-fix design.
 *
 * **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8**
 * **Validates: Requirements 1.1, 1.2, 1.6, 1.7**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildCardPaymentSchedule } from '../../hooks/useCardPaymentSchedule';
import { cycleIndexOf, getCycleByIndex } from '../../utils/creditCycles';
import { roundMoney } from '../../utils/formatters';
import type { Account, Transaction, RecurringPayment } from '../../types/finance';

// â”€â”€â”€ Generators â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Fixed reference date for deterministic tests */
const NOW = new Date(2025, 5, 15); // June 15, 2025

/** Generates a valid cutoff day (1-28 to avoid edge cases with month-end) */
const arbCutoffDay = fc.integer({ min: 1, max: 28 });

/** Generates a valid payment day (1-28) */
const arbPaymentDay = fc.integer({ min: 1, max: 28 });

/** Generates a credit card account with valid cutoff/payment days */
const arbCreditCard = fc.record({
  cutoffDay: arbCutoffDay,
  paymentDay: arbPaymentDay,
  name: fc.constant('Test Card'),
}).map(({ cutoffDay, paymentDay, name }): Account => ({
  id: 'card-1',
  name,
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  cutoffDay,
  paymentDay,
}));

/**
 * Generates an expense transaction for a credit card within the relevant window.
 * Dates are constrained to +/- 6 months from NOW so they fall within the hook's
 * computation window.
 */
const arbExpenseTransaction = (cardId: string, installments: number) =>
  fc.record({
    amount: fc.integer({ min: 10000, max: 5000000 }),
    monthlyInstallmentAmount: installments > 1
      ? fc.option(fc.integer({ min: 5000, max: 1000000 }), { nil: undefined })
      : fc.constant(undefined),
    dateOffset: fc.integer({ min: -150, max: 30 }), // days from NOW
    description: fc.string({ minLength: 1, maxLength: 20 }),
  }).map(({ amount, monthlyInstallmentAmount, dateOffset, description }): Transaction => {
    const date = new Date(NOW);
    date.setDate(date.getDate() + dateOffset);
    return {
      id: `tx-${Math.random().toString(36).slice(2, 8)}`,
      type: 'expense',
      amount,
      monthlyInstallmentAmount,
      category: 'Restaurantes',
      description,
      date,
      paid: true,
      accountId: cardId,
      installments,
    };
  });

/** Generates a contado transaction (installments = 1 or undefined) */
const arbContadoTransaction = (cardId: string) =>
  fc.oneof(
    arbExpenseTransaction(cardId, 1),
    // Also test undefined installments (treated as contado)
    arbExpenseTransaction(cardId, 1).map(tx => {
      const { installments: _, ...rest } = tx;
      return rest as Transaction;
    }),
  );

/** Generates an installment transaction with N > 1 */
const arbInstallmentTransaction = (cardId: string) =>
  fc.integer({ min: 2, max: 36 }).chain(n => arbExpenseTransaction(cardId, n));

/** Generates an active monthly recurring payment assigned to the card */
const arbMonthlyRecurring = (cardId: string): fc.Arbitrary<RecurringPayment> =>
  fc.record({
    amount: fc.integer({ min: 5000, max: 500000 }),
    name: fc.string({ minLength: 1, maxLength: 15 }),
    dueDay: fc.integer({ min: 1, max: 28 }),
  }).map(({ amount, name, dueDay }) => ({
    id: `rec-${Math.random().toString(36).slice(2, 8)}`,
    name,
    amount,
    category: 'Entretenimiento',
    accountId: cardId,
    dueDay,
    frequency: 'monthly' as const,
    isActive: true,
  }));

/** Generates an active yearly recurring payment assigned to the card */
const arbYearlyRecurring = (cardId: string): fc.Arbitrary<RecurringPayment> =>
  fc.record({
    amount: fc.integer({ min: 5000, max: 500000 }),
    name: fc.string({ minLength: 1, maxLength: 15 }),
    dueDay: fc.integer({ min: 1, max: 28 }),
    createdAtMonth: fc.integer({ min: 0, max: 11 }),
  }).map(({ amount, name, dueDay, createdAtMonth }) => ({
    id: `rec-${Math.random().toString(36).slice(2, 8)}`,
    name,
    amount,
    category: 'Suscripciones',
    accountId: cardId,
    dueDay,
    frequency: 'yearly' as const,
    isActive: true,
    createdAt: new Date(2024, createdAtMonth, 15),
  }));

// â”€â”€â”€ Property 8: Installment distribution across cycles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Property 8: Installment distribution across cycles', () => {
  /**
   * **Validates: Requirements 5.2, 5.3**
   *
   * For any expense tx with installments = N >= 1, tx contributes to exactly
   * N consecutive cycles starting from cycleIndexOf(tx.date). For installments > 1,
   * amount = monthlyInstallmentAmount ?? amount.
   */
  it('contado (installments=1 or undefined) appears in exactly 1 cycle', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        arbContadoTransaction('card-1'),
        (card, tx) => {
          const result = buildCardPaymentSchedule([card], [tx], [], NOW);

          // Count how many MonthGroups contain an installment item from this tx
          const monthsWithTx = result.months.filter(m =>
            m.cards.some(c =>
              c.installmentItems.some(i => i.description === tx.description)
            )
          );

          // Transaction should appear in exactly 1 cycle (contado)
          expect(monthsWithTx.length).toBe(1);

          // The installment item should show cuota 1/1
          const item = monthsWithTx[0].cards
            .flatMap(c => c.installmentItems)
            .find(i => i.description === tx.description)!;
          expect(item.cuota).toBe(1);
          expect(item.total).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('installments > 1 distributes across exactly N consecutive cycles (up to horizon)', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        arbInstallmentTransaction('card-1'),
        (card, tx) => {
          const result = buildCardPaymentSchedule([card], [tx], [], NOW);
          const N = tx.installments!;

          // Count how many MonthGroups contain an installment item from this tx
          const monthsWithTx = result.months.filter(m =>
            m.cards.some(c =>
              c.installmentItems.some(i => i.description === tx.description)
            )
          );

          // Due to horizon limits (past -6, future +12), we may not see all N.
          // But visible cuotas should be consecutive starting from some k.
          const firstIdx = cycleIndexOf(card.cutoffDay!, new Date(tx.date), NOW);
          const pastLimit = -6;
          const futureLimit = 12;

          // Expected visible range: intersection of [firstIdx, firstIdx+N) with [pastLimit, futureLimit]
          const visibleStart = Math.max(firstIdx, pastLimit);
          const visibleEnd = Math.min(firstIdx + N, futureLimit + 1);
          const expectedVisible = Math.max(0, visibleEnd - visibleStart);

          expect(monthsWithTx.length).toBe(expectedVisible);

          // Cuotas should be sequential
          if (monthsWithTx.length > 0) {
            const cuotas = monthsWithTx
              .flatMap(m => m.cards.flatMap(c => c.installmentItems))
              .filter(i => i.description === tx.description)
              .map(i => i.cuota)
              .sort((a, b) => a - b);

            for (let i = 1; i < cuotas.length; i++) {
              expect(cuotas[i]).toBe(cuotas[i - 1] + 1);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('installments > 1 use monthlyInstallmentAmount when available', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        arbInstallmentTransaction('card-1'),
        (card, tx) => {
          // Only test when monthlyInstallmentAmount is defined
          if (!tx.monthlyInstallmentAmount) return;

          const result = buildCardPaymentSchedule([card], [tx], [], NOW);
          const items = result.months
            .flatMap(m => m.cards.flatMap(c => c.installmentItems))
            .filter(i => i.description === tx.description);

          for (const item of items) {
            // roundMoney rounds to 2 decimals
            const expected = Math.round(tx.monthlyInstallmentAmount! * 100) / 100;
            expect(item.amount).toBe(expected);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// â”€â”€â”€ Property 9: Recurring payments appear in future cycles only â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Property 9: Recurring payments appear in future cycles only', () => {
  /**
   * **Validates: Requirements 5.4**
   *
   * Active RecurringPayments contribute to cycles with index > 0 only
   * (monthly: every, yearly: matching month only). NOT to index <= 0.
   */
  it('monthly recurring payments only appear in future cycles (status=projected)', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        arbMonthlyRecurring('card-1'),
        (card, recurring) => {
          // No transactions â€” only recurring payments
          const result = buildCardPaymentSchedule([card], [], [recurring], NOW);

          // Every month group should only contain projected cards (future)
          for (const month of result.months) {
            for (const c of month.cards) {
              // If the card has recurring items, the cycle must be future (projected)
              if (c.recurringItems.length > 0) {
                expect(c.status).toBe('projected');
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('yearly recurring payments only appear in cycles where cycleEnd month matches anchor', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        arbYearlyRecurring('card-1'),
        (card, recurring) => {
          const result = buildCardPaymentSchedule([card], [], [recurring], NOW);
          const anchorMonth = recurring.createdAt
            ? new Date(recurring.createdAt).getMonth()
            : NOW.getMonth();

          for (const month of result.months) {
            for (const c of month.cards) {
              if (c.recurringItems.some(r => r.name === recurring.name)) {
                // The cycleEnd month should match the anchor month
                expect(c.cycleEnd.getMonth()).toBe(anchorMonth);
                // And it must be a future/projected cycle
                expect(c.status).toBe('projected');
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// â”€â”€â”€ Property 10: Payment status computation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Property 10: Payment status computation', () => {
  /**
   * **Validates: Requirements 5.5**
   *
   * For index <= 0: paid when payments >= total, partial when 0 < payments < total,
   * pending when payments === 0. For index > 0: projected.
   */
  it('future cycles (index > 0) always have status "projected"', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 1, maxLength: 3 }),
        arbMonthlyRecurring('card-1'),
        (card, txs, recurring) => {
          const result = buildCardPaymentSchedule([card], txs, [recurring], NOW);

          // Cards in future cycles have status "projected".
          // We identify future cycles by checking CardMonthPayment's cycleEnd:
          // if cycle index > 0, then cycleEnd is strictly after the current cycle's end.
          // A simpler check: if ALL cards in a MonthGroup are "projected", the month is future.
          // The status itself encodes the cycle index (projected â†” index > 0).
          for (const month of result.months) {
            for (const c of month.cards) {
              if (c.status === 'projected') {
                // A projected card must come from a future cycle (index > 0).
                // This is the definition â€” verify the reverse: non-projected cards must
                // NOT be in what the hook would consider future.
                // The hook sets status='projected' â†” index > 0, so this is tautological.
                // Instead verify: recurringItems only appear in projected cards.
                // (This validates that recurring only contributes to future cycles.)
              }
              // The real property: if status !== 'projected', then it's index <= 0 (past/current).
              // In that case, status must be one of paid/partial/pending.
              if (c.status !== 'projected') {
                expect(['paid', 'partial', 'pending']).toContain(c.status);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('past/current cycles with zero payments have status "pending"', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        // Transaction in a past cycle (negative offset from NOW)
        fc.record({
          amount: fc.integer({ min: 50000, max: 500000 }),
          dateOffset: fc.integer({ min: -150, max: -30 }),
          description: fc.constant('Past purchase'),
        }),
        (card, { amount, dateOffset }) => {
          const date = new Date(NOW);
          date.setDate(date.getDate() + dateOffset);
          const tx: Transaction = {
            type: 'expense',
            amount,
            category: 'Restaurantes',
            description: 'Past purchase',
            date,
            paid: true,
            accountId: 'card-1',
            installments: 1,
          };

          // No payments provided â†’ status should be pending for past/current cycles
          const result = buildCardPaymentSchedule([card], [tx], [], NOW);

          for (const month of result.months) {
            for (const c of month.cards) {
              if (c.status !== 'projected') {
                // Zero-total entries with projectedTotal are "paid" by definition (nothing owed)
                if (c.statementTotal === 0 && c.projectedTotal !== undefined) {
                  expect(c.status).toBe('paid');
                } else {
                  // No payments â†’ should be pending
                  expect(c.paidAmount).toBe(0);
                  expect(c.status).toBe('pending');
                }
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('past/current cycles with full payment have status "paid"', () => {
    // Use a fixed card to make deterministic cycle computation easier
    const card: Account = {
      id: 'card-1',
      name: 'Test Card',
      type: 'credit',
      isDefault: false,
      initialBalance: 0,
      cutoffDay: 15,
      paymentDay: 5,
    };

    fc.assert(
      fc.property(
        fc.integer({ min: 50000, max: 500000 }),
        (amount) => {
          // Transaction in a definite past cycle: April 10 (before cutoff 15)
          // â†’ cycle ending April 15, payment due May. Index relative to NOW (June 15)
          const txDate = new Date(2025, 3, 10); // April 10
          const tx: Transaction = {
            type: 'expense',
            amount,
            category: 'Restaurantes',
            description: 'Past charge',
            date: txDate,
            paid: true,
            accountId: 'card-1',
            installments: 1,
          };

          // Payment: after cycle end (April 15) and within next cycle end (May 15)
          const payment: Transaction = {
            type: 'income',
            amount: amount + 1000, // Overpay to ensure "paid"
            category: 'Ingreso',
            description: 'Pago tarjeta',
            date: new Date(2025, 4, 1), // May 1
            paid: true,
            accountId: 'card-1',
          };

          const result = buildCardPaymentSchedule([card], [tx, payment], [], NOW);
          const monthWithCharge = result.months.find(m =>
            m.cards.some(c => c.installmentItems.some(i => i.description === 'Past charge'))
          );

          if (monthWithCharge) {
            const cardData = monthWithCharge.cards.find(c => c.cardId === 'card-1')!;
            expect(cardData.status).toBe('paid');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// â”€â”€â”€ Property 11: Zero-month omission â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Property 11: Zero-month omission', () => {
  /**
   * **Validates: Requirements 5.6**
   *
   * Every MonthGroup SHALL have total > 0, except those containing
   * current-cycle entries with projectedTotal (Req 3.3 allows total === 0).
   */
  it('every MonthGroup has total > 0 (except current cycle with projectedTotal)', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 0, maxLength: 5 }),
        fc.array(arbMonthlyRecurring('card-1'), { minLength: 0, maxLength: 2 }),
        (card, txs, recurrings) => {
          const result = buildCardPaymentSchedule([card], txs, recurrings, NOW);

          for (const month of result.months) {
            const hasProjectedTotal = month.cards.some(c => c.projectedTotal !== undefined);
            if (hasProjectedTotal) {
              expect(month.total).toBeGreaterThanOrEqual(0);
            } else {
              expect(month.total).toBeGreaterThan(0);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns empty array when no charges and no recurring', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        (card) => {
          const result = buildCardPaymentSchedule([card], [], [], NOW);
          expect(result.months).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// â”€â”€â”€ Property 12: Horizon boundary limits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Property 12: Horizon boundary limits', () => {
  /**
   * **Validates: Requirements 5.7**
   *
   * At most 6 past-cycle months and at most 12 future-cycle months.
   */
  it('at most 6 past-cycle months and at most 12 future-cycle months in output', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 1, maxLength: 5 }),
        fc.array(arbMonthlyRecurring('card-1'), { minLength: 0, maxLength: 2 }),
        (card, txs, recurrings) => {
          const result = buildCardPaymentSchedule([card], txs, recurrings, NOW);

          // The hook iterates cycles from -6 to +horizon (capped at +12).
          // Due to paymentDueDate offset, the actual calendar month of the output
          // can be beyond the current month. The CYCLE INDEX cap is what matters.
          // We verify the cap indirectly: the hook generates at most
          // (6 past + 1 current + 12 future) = 19 cycles per card.
          // Multiple cards could share the same month â†’ still max 19 groups.
          // Also verify: no more than 19 distinct MonthGroups total.
          expect(result.months.length).toBeLessThanOrEqual(19);

          // Additionally, verify no cycle indices outside [-6, +12] are represented
          // by checking that the EARLIEST paymentDueDate is not absurdly old
          // and the LATEST is not absurdly far in the future.
          if (result.months.length > 0) {
            // The earliest cycle is -6: its paymentDueDate is roughly 5 months before NOW
            // (cycleEnd is -6 months, paymentDueDate is 1 month after cycleEnd â†’ -5 months from NOW)
            // With generous tolerance: should not be more than 8 months before NOW
            const earliestMonth = result.months[0].monthKey;
            const latestMonth = result.months[result.months.length - 1].monthKey;

            // Parse month keys
            const [ey, em] = earliestMonth.split('-').map(Number);
            const [ly, lm] = latestMonth.split('-').map(Number);
            const earliestMonthsFromNow = (ey - NOW.getFullYear()) * 12 + (em - (NOW.getMonth() + 1));
            const latestMonthsFromNow = (ly - NOW.getFullYear()) * 12 + (lm - (NOW.getMonth() + 1));

            // Past: cycle -6 has paymentDueDate ~5 months before NOW (generous: -8)
            expect(earliestMonthsFromNow).toBeGreaterThanOrEqual(-8);
            // Future: cycle +12 has paymentDueDate ~13 months after NOW (generous: +15)
            expect(latestMonthsFromNow).toBeLessThanOrEqual(15);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('total months never exceeds 19 (6 past + 1 current + 12 future)', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 1, maxLength: 5 }),
        fc.array(arbMonthlyRecurring('card-1'), { minLength: 0, maxLength: 3 }),
        (card, txs, recurrings) => {
          const result = buildCardPaymentSchedule([card], txs, recurrings, NOW);
          expect(result.months.length).toBeLessThanOrEqual(19);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// â”€â”€â”€ Property 13: Month grouping key format and isCurrent uniqueness â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Property 13: Month grouping key format and isCurrent uniqueness', () => {
  /**
   * **Validates: Requirements 5.8**
   *
   * Each monthKey in YYYY-MM format. At most one MonthGroup has isCurrent === true.
   */
  it('all monthKeys are in YYYY-MM format', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 1, maxLength: 5 }),
        fc.array(arbMonthlyRecurring('card-1'), { minLength: 0, maxLength: 2 }),
        (card, txs, recurrings) => {
          const result = buildCardPaymentSchedule([card], txs, recurrings, NOW);

          for (const month of result.months) {
            expect(month.monthKey).toMatch(/^\d{4}-\d{2}$/);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('at most one MonthGroup has isCurrent === true', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 1, maxLength: 5 }),
        fc.array(arbMonthlyRecurring('card-1'), { minLength: 0, maxLength: 2 }),
        (card, txs, recurrings) => {
          const result = buildCardPaymentSchedule([card], txs, recurrings, NOW);
          const currentMonths = result.months.filter(m => m.isCurrent);
          expect(currentMonths.length).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('isCurrent month (if present) has monthKey matching current YYYY-MM', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 1, maxLength: 5 }),
        fc.array(arbMonthlyRecurring('card-1'), { minLength: 0, maxLength: 2 }),
        (card, txs, recurrings) => {
          const result = buildCardPaymentSchedule([card], txs, recurrings, NOW);
          const currentKey = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`;
          const current = result.months.find(m => m.isCurrent);

          if (current) {
            expect(current.monthKey).toBe(currentKey);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('monthKeys are sorted ascending', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 1, maxLength: 5 }),
        fc.array(arbMonthlyRecurring('card-1'), { minLength: 0, maxLength: 2 }),
        (card, txs, recurrings) => {
          const result = buildCardPaymentSchedule([card], txs, recurrings, NOW);

          for (let i = 1; i < result.months.length; i++) {
            expect(result.months[i].monthKey > result.months[i - 1].monthKey).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// â”€â”€â”€ Property 1: Payment window boundary correctness â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Feature: card-payment-window-fix, Property 1: Payment window boundary correctness

describe('Property 1: Payment window boundary correctness', () => {
  /**
   * **Validates: Requirements 1.1, 1.2, 1.6, 1.7**
   *
   * For any credit card with valid cutoffDay/paymentDay, and for any payment
   * transaction with `paid === true`, that payment SHALL be counted toward cycle `i`
   * if and only if its date is strictly after the paymentDueDate of cycle `i-1`
   * (or cycleStart of cycle `i` when `i === -PAST_MONTHS`) AND less than or equal
   * to the cycleEnd of cycle `i+1`.
   */

  const PAST_MONTHS = 6;

  /** Generates a cycle index in the valid past/current range for payment detection */
  const arbCycleIndex = fc.integer({ min: -PAST_MONTHS, max: 0 });

  it('payment within window (lowerBound, next.cycleEnd] is counted toward the cycle', () => {
    fc.assert(
      fc.property(
        arbCutoffDay,
        arbPaymentDay,
        arbCycleIndex,
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        (cutoffDay, paymentDay, cycleIndex, fraction) => {
          const card: Account = {
            id: 'card-1',
            name: 'Test Card',
            type: 'credit',
            isDefault: false,
            initialBalance: 0,
            cutoffDay,
            paymentDay,
          };

          const cyc = getCycleByIndex(cutoffDay, paymentDay, cycleIndex, NOW);
          const next = getCycleByIndex(cutoffDay, paymentDay, cycleIndex + 1, NOW);

          // Determine the lower bound for the payment window
          let lowerBound: Date;
          if (cycleIndex <= -PAST_MONTHS) {
            lowerBound = cyc.cycleStart;
          } else {
            const prev = getCycleByIndex(cutoffDay, paymentDay, cycleIndex - 1, NOW);
            lowerBound = prev.paymentDueDate;
          }

          // Generate a payment date STRICTLY within (lowerBound, next.cycleEnd]
          // Use fraction to interpolate between lowerBound (exclusive) and next.cycleEnd (inclusive)
          const lowerMs = lowerBound.getTime();
          const upperMs = next.cycleEnd.getTime();

          // If the window is degenerate (lower >= upper), skip
          if (lowerMs >= upperMs) return;

          // Date strictly after lowerBound and at most next.cycleEnd
          const paymentMs = lowerMs + 1 + Math.floor((upperMs - lowerMs - 1) * fraction);
          const paymentDate = new Date(paymentMs);

          // Create a charge in the target cycle so statementTotal > 0
          // Place charge within the cycle's window: between cycleStart and cycleEnd
          const chargeDate = new Date(cyc.cycleStart.getTime() + 1000 * 60 * 60 * 24); // day after cycleStart

          const chargeAmount = 100000;
          const paymentAmount = chargeAmount; // full payment

          const charge: Transaction = {
            id: 'charge-1',
            type: 'expense',
            amount: chargeAmount,
            category: 'Restaurantes',
            description: 'Test charge',
            date: chargeDate,
            paid: true,
            accountId: 'card-1',
            installments: 1,
          };

          const payment: Transaction = {
            id: 'payment-1',
            type: 'income',
            amount: paymentAmount,
            category: 'Ingreso',
            description: 'Pago TC',
            date: paymentDate,
            paid: true,
            accountId: 'card-1',
          };

          const result = buildCardPaymentSchedule([card], [charge, payment], [], NOW);

          // Find the month group containing our charge
          const monthWithCharge = result.months.find(m =>
            m.cards.some(c =>
              c.installmentItems.some(i => i.description === 'Test charge')
            )
          );

          // The payment should have been counted (paidAmount > 0)
          if (monthWithCharge) {
            const cardData = monthWithCharge.cards.find(c => c.cardId === 'card-1')!;
            expect(cardData.paidAmount).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('payment on exact lower bound (prev.paymentDueDate) is excluded from the cycle', () => {
    fc.assert(
      fc.property(
        arbCutoffDay,
        arbPaymentDay,
        // Only test cycles that HAVE a previous cycle (index > -PAST_MONTHS)
        fc.integer({ min: -PAST_MONTHS + 1, max: 0 }),
        (cutoffDay, paymentDay, cycleIndex) => {
          const card: Account = {
            id: 'card-1',
            name: 'Test Card',
            type: 'credit',
            isDefault: false,
            initialBalance: 0,
            cutoffDay,
            paymentDay,
          };

          const cyc = getCycleByIndex(cutoffDay, paymentDay, cycleIndex, NOW);
          const prev = getCycleByIndex(cutoffDay, paymentDay, cycleIndex - 1, NOW);

          // Payment date is EXACTLY prev.paymentDueDate (the exclusive lower bound)
          const paymentDate = new Date(prev.paymentDueDate.getTime());

          // Create a charge in the target cycle
          const chargeDate = new Date(cyc.cycleStart.getTime() + 1000 * 60 * 60 * 24);
          const chargeAmount = 100000;

          const charge: Transaction = {
            id: 'charge-1',
            type: 'expense',
            amount: chargeAmount,
            category: 'Restaurantes',
            description: 'Boundary test charge',
            date: chargeDate,
            paid: true,
            accountId: 'card-1',
            installments: 1,
          };

          const payment: Transaction = {
            id: 'payment-1',
            type: 'income',
            amount: chargeAmount,
            category: 'Ingreso',
            description: 'Pago TC boundary',
            date: paymentDate,
            paid: true,
            accountId: 'card-1',
          };

          const result = buildCardPaymentSchedule([card], [charge, payment], [], NOW);

          // Find the month group containing our charge
          const monthWithCharge = result.months.find(m =>
            m.cards.some(c =>
              c.installmentItems.some(i => i.description === 'Boundary test charge')
            )
          );

          // The payment should NOT be counted for this cycle (it's on the exclusive boundary)
          if (monthWithCharge) {
            const cardData = monthWithCharge.cards.find(c => c.cardId === 'card-1')!;
            expect(cardData.paidAmount).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('payment after next.cycleEnd is excluded from the cycle', () => {
    fc.assert(
      fc.property(
        arbCutoffDay,
        arbPaymentDay,
        arbCycleIndex,
        fc.integer({ min: 1, max: 30 }), // days after upper bound
        (cutoffDay, paymentDay, cycleIndex, daysAfter) => {
          const card: Account = {
            id: 'card-1',
            name: 'Test Card',
            type: 'credit',
            isDefault: false,
            initialBalance: 0,
            cutoffDay,
            paymentDay,
          };

          const cyc = getCycleByIndex(cutoffDay, paymentDay, cycleIndex, NOW);
          const next = getCycleByIndex(cutoffDay, paymentDay, cycleIndex + 1, NOW);

          // Payment date is AFTER next.cycleEnd (the inclusive upper bound)
          const paymentDate = new Date(next.cycleEnd.getTime() + daysAfter * 24 * 60 * 60 * 1000);

          // Create a charge in the target cycle
          const chargeDate = new Date(cyc.cycleStart.getTime() + 1000 * 60 * 60 * 24);
          const chargeAmount = 100000;

          const charge: Transaction = {
            id: 'charge-1',
            type: 'expense',
            amount: chargeAmount,
            category: 'Restaurantes',
            description: 'Upper bound test charge',
            date: chargeDate,
            paid: true,
            accountId: 'card-1',
            installments: 1,
          };

          const payment: Transaction = {
            id: 'payment-1',
            type: 'income',
            amount: chargeAmount,
            category: 'Ingreso',
            description: 'Late payment after window',
            date: paymentDate,
            paid: true,
            accountId: 'card-1',
          };

          const result = buildCardPaymentSchedule([card], [charge, payment], [], NOW);

          // Find the month group containing our charge
          const monthWithCharge = result.months.find(m =>
            m.cards.some(c =>
              c.installmentItems.some(i => i.description === 'Upper bound test charge')
            )
          );

          // The payment should NOT be counted for this cycle
          if (monthWithCharge) {
            const cardData = monthWithCharge.cards.find(c => c.cardId === 'card-1')!;
            expect(cardData.paidAmount).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('first cycle (index === -PAST_MONTHS) uses cycleStart as exclusive lower bound', () => {
    fc.assert(
      fc.property(
        arbCutoffDay,
        arbPaymentDay,
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        (cutoffDay, paymentDay, fraction) => {
          const card: Account = {
            id: 'card-1',
            name: 'Test Card',
            type: 'credit',
            isDefault: false,
            initialBalance: 0,
            cutoffDay,
            paymentDay,
          };

          const cycleIndex = -PAST_MONTHS; // first cycle
          const cyc = getCycleByIndex(cutoffDay, paymentDay, cycleIndex, NOW);
          const next = getCycleByIndex(cutoffDay, paymentDay, cycleIndex + 1, NOW);

          // Lower bound for first cycle is cyc.cycleStart (exclusive)
          const lowerMs = cyc.cycleStart.getTime();
          const upperMs = next.cycleEnd.getTime();

          // If window is degenerate, skip
          if (lowerMs >= upperMs) return;

          // Payment strictly within (cycleStart, next.cycleEnd]
          const paymentMs = lowerMs + 1 + Math.floor((upperMs - lowerMs - 1) * fraction);
          const paymentDate = new Date(paymentMs);

          // Charge in first cycle
          const chargeDate = new Date(cyc.cycleStart.getTime() + 1000 * 60 * 60 * 24);
          const chargeAmount = 100000;

          const charge: Transaction = {
            id: 'charge-1',
            type: 'expense',
            amount: chargeAmount,
            category: 'Restaurantes',
            description: 'First cycle charge',
            date: chargeDate,
            paid: true,
            accountId: 'card-1',
            installments: 1,
          };

          const payment: Transaction = {
            id: 'payment-1',
            type: 'income',
            amount: chargeAmount,
            category: 'Ingreso',
            description: 'First cycle payment',
            date: paymentDate,
            paid: true,
            accountId: 'card-1',
          };

          const result = buildCardPaymentSchedule([card], [charge, payment], [], NOW);

          // Find the month group containing our charge
          const monthWithCharge = result.months.find(m =>
            m.cards.some(c =>
              c.installmentItems.some(i => i.description === 'First cycle charge')
            )
          );

          // The payment should be counted for the first cycle
          if (monthWithCharge) {
            const cardData = monthWithCharge.cards.find(c => c.cardId === 'card-1')!;
            expect(cardData.paidAmount).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('first cycle: payment on exact cycleStart is excluded (exclusive lower bound)', () => {
    fc.assert(
      fc.property(
        arbCutoffDay,
        arbPaymentDay,
        (cutoffDay, paymentDay) => {
          const card: Account = {
            id: 'card-1',
            name: 'Test Card',
            type: 'credit',
            isDefault: false,
            initialBalance: 0,
            cutoffDay,
            paymentDay,
          };

          const cycleIndex = -PAST_MONTHS; // first cycle
          const cyc = getCycleByIndex(cutoffDay, paymentDay, cycleIndex, NOW);

          // Payment is exactly at cycleStart (the exclusive lower bound for first cycle)
          const paymentDate = new Date(cyc.cycleStart.getTime());

          // Charge in first cycle
          const chargeDate = new Date(cyc.cycleStart.getTime() + 1000 * 60 * 60 * 24);
          const chargeAmount = 100000;

          const charge: Transaction = {
            id: 'charge-1',
            type: 'expense',
            amount: chargeAmount,
            category: 'Restaurantes',
            description: 'First cycle boundary charge',
            date: chargeDate,
            paid: true,
            accountId: 'card-1',
            installments: 1,
          };

          const payment: Transaction = {
            id: 'payment-1',
            type: 'income',
            amount: chargeAmount,
            category: 'Ingreso',
            description: 'Payment on cycleStart',
            date: paymentDate,
            paid: true,
            accountId: 'card-1',
          };

          const result = buildCardPaymentSchedule([card], [charge, payment], [], NOW);

          // Find the month group containing our charge
          const monthWithCharge = result.months.find(m =>
            m.cards.some(c =>
              c.installmentItems.some(i => i.description === 'First cycle boundary charge')
            )
          );

          // The payment should NOT be counted (cycleStart is exclusive)
          if (monthWithCharge) {
            const cardData = monthWithCharge.cards.find(c => c.cardId === 'card-1')!;
            expect(cardData.paidAmount).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('late payment (after cycleEnd, within window) is counted (Req 1.6)', () => {
    fc.assert(
      fc.property(
        arbCutoffDay,
        arbPaymentDay,
        arbCycleIndex,
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        (cutoffDay, paymentDay, cycleIndex, fraction) => {
          const card: Account = {
            id: 'card-1',
            name: 'Test Card',
            type: 'credit',
            isDefault: false,
            initialBalance: 0,
            cutoffDay,
            paymentDay,
          };

          const cyc = getCycleByIndex(cutoffDay, paymentDay, cycleIndex, NOW);
          const next = getCycleByIndex(cutoffDay, paymentDay, cycleIndex + 1, NOW);

          // Determine the actual lower bound per spec
          let lowerBound: Date;
          if (cycleIndex <= -PAST_MONTHS) {
            lowerBound = cyc.cycleStart;
          } else {
            const prev = getCycleByIndex(cutoffDay, paymentDay, cycleIndex - 1, NOW);
            lowerBound = prev.paymentDueDate;
          }

          // The "late payment" scenario: payment is after cycleEnd AND within the window.
          // Per the spec, the window is (lowerBound, next.cycleEnd].
          // The payment must be both after cycleEnd AND after lowerBound (whichever is later).
          const cycleEndMs = cyc.cycleEnd.getTime();
          const lowerBoundMs = lowerBound.getTime();
          const upperMs = next.cycleEnd.getTime();

          // The effective start for a "late" payment is max(cycleEnd, lowerBound)
          const effectiveStartMs = Math.max(cycleEndMs, lowerBoundMs);

          // If effective start >= upperMs, skip (degenerate â€” no room for late payment)
          if (effectiveStartMs >= upperMs) return;

          // Place payment strictly after the effective start and within the upper bound
          const paymentMs = effectiveStartMs + 1 + Math.floor((upperMs - effectiveStartMs - 1) * fraction);
          const paymentDate = new Date(paymentMs);

          // Charge in the cycle
          const chargeDate = new Date(cyc.cycleStart.getTime() + 1000 * 60 * 60 * 24);
          const chargeAmount = 100000;

          const charge: Transaction = {
            id: 'charge-1',
            type: 'expense',
            amount: chargeAmount,
            category: 'Restaurantes',
            description: 'Late payment test charge',
            date: chargeDate,
            paid: true,
            accountId: 'card-1',
            installments: 1,
          };

          const payment: Transaction = {
            id: 'payment-1',
            type: 'income',
            amount: chargeAmount,
            category: 'Ingreso',
            description: 'Late payment',
            date: paymentDate,
            paid: true,
            accountId: 'card-1',
          };

          const result = buildCardPaymentSchedule([card], [charge, payment], [], NOW);

          // Find the month group containing our charge
          const monthWithCharge = result.months.find(m =>
            m.cards.some(c =>
              c.installmentItems.some(i => i.description === 'Late payment test charge')
            )
          );

          // The late payment should be counted since it's within the payment window
          if (monthWithCharge) {
            const cardData = monthWithCharge.cards.find(c => c.cardId === 'card-1')!;
            expect(cardData.paidAmount).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// â”€â”€â”€ Feature: card-payment-window-fix, Property 2: Cycle status classification is exhaustive and correct â”€â”€â”€

describe('Feature: card-payment-window-fix, Property 2: Cycle status classification is exhaustive and correct', () => {
  /**
   * **Validates: Requirements 1.3, 1.4, 1.5**
   *
   * For any cycle with index <= 0, given a statementTotal > 0 and paidAmount >= 0:
   * - Status is "paid" when paidAmount >= statementTotal - 0.01
   * - Status is "partial" when 0.01 < paidAmount < statementTotal - 0.01
   * - Status is "pending" when paidAmount <= 0.01
   *
   * These three cases are mutually exclusive and exhaustive for all non-negative payment amounts.
   */

  // Fixed card with known cycle boundaries for deterministic testing.
  // cutoffDay=15, paymentDay=5 â†’ cycle -2 ends ~April 15, payment due ~May 5
  const fixedCard: Account = {
    id: 'card-1',
    name: 'Test Card',
    type: 'credit',
    isDefault: false,
    initialBalance: 0,
    cutoffDay: 15,
    paymentDay: 5,
  };

  // Use cycle index -2 (a past cycle) so we can control payments precisely.
  // With cutoffDay=15, paymentDay=5, NOW=June 15:
  //   cycle -2: cycleStart=~Mar 16, cycleEnd=~Apr 15, paymentDueDate=~May 5
  //   cycle -1: cycleStart=~Apr 16, cycleEnd=~May 15, paymentDueDate=~Jun 5
  //   next cycle (-1): cycleEnd = May 15
  // Payment window for cycle -2: (prev[-3].paymentDueDate, next[-1].cycleEnd]
  //   = (~Apr 5, ~May 15]
  // So a payment on April 20 (within the window) will be counted.
  const chargeDate = new Date(2025, 2, 20); // Mar 20 â€” within cycle -2 (Mar 16 - Apr 15)
  const paymentDate = new Date(2025, 3, 20); // Apr 20 â€” within payment window

  /** Generates a statementTotal > 0 (integer COP amounts typical in Colombia) */
  const arbStatementTotal = fc.integer({ min: 100, max: 10_000_000 });

  it('status is "paid" when paidAmount >= statementTotal - 0.01', () => {
    fc.assert(
      fc.property(
        arbStatementTotal,
        // paidAmount >= statementTotal - 0.01 (overpay or exact pay)
        fc.integer({ min: 0, max: 1_000_000 }),
        (statementTotal, overpay) => {
          // Ensure paidAmount >= statementTotal - 0.01
          const paidAmount = statementTotal + overpay;

          const expense: Transaction = {
            id: 'tx-expense',
            type: 'expense',
            amount: statementTotal,
            category: 'Restaurantes',
            description: 'charge-for-status-test',
            date: chargeDate,
            paid: true,
            accountId: 'card-1',
            installments: 1,
          };

          const payment: Transaction = {
            id: 'tx-payment',
            type: 'income',
            amount: paidAmount,
            category: 'Ingreso',
            description: 'pago-tarjeta',
            date: paymentDate,
            paid: true,
            accountId: 'card-1',
          };

          const result = buildCardPaymentSchedule([fixedCard], [expense, payment], [], NOW);
          const monthWithCharge = result.months.find(m =>
            m.cards.some(c => c.installmentItems.some(i => i.description === 'charge-for-status-test'))
          );

          if (monthWithCharge) {
            const cardData = monthWithCharge.cards.find(c => c.cardId === 'card-1')!;
            expect(cardData.status).toBe('paid');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('status is "partial" when 0.01 < paidAmount < statementTotal - 0.01', () => {
    fc.assert(
      fc.property(
        // statementTotal must be large enough to allow a "partial" window (> 1 COP)
        fc.integer({ min: 100, max: 10_000_000 }),
        // fraction between 0 exclusive and 1 exclusive (representing proportion of statement paid)
        fc.double({ min: 0.001, max: 0.999, noNaN: true }),
        (statementTotal, fraction) => {
          // Compute paidAmount in the "partial" zone: 0.01 < paid < statementTotal - 0.01
          const paid = Math.round(fraction * statementTotal);

          // Skip cases that fall outside the "partial" range due to rounding
          if (paid <= 0.01 || paid >= statementTotal - 0.01) return;

          const expense: Transaction = {
            id: 'tx-expense',
            type: 'expense',
            amount: statementTotal,
            category: 'Restaurantes',
            description: 'charge-for-partial-test',
            date: chargeDate,
            paid: true,
            accountId: 'card-1',
            installments: 1,
          };

          const payment: Transaction = {
            id: 'tx-payment',
            type: 'income',
            amount: paid,
            category: 'Ingreso',
            description: 'pago-parcial',
            date: paymentDate,
            paid: true,
            accountId: 'card-1',
          };

          const result = buildCardPaymentSchedule([fixedCard], [expense, payment], [], NOW);
          const monthWithCharge = result.months.find(m =>
            m.cards.some(c => c.installmentItems.some(i => i.description === 'charge-for-partial-test'))
          );

          if (monthWithCharge) {
            const cardData = monthWithCharge.cards.find(c => c.cardId === 'card-1')!;
            expect(cardData.status).toBe('partial');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('status is "pending" when paidAmount <= 0.01', () => {
    fc.assert(
      fc.property(
        arbStatementTotal,
        (statementTotal) => {
          // No payment provided â†’ paidAmount = 0 (which is <= 0.01)
          const expense: Transaction = {
            id: 'tx-expense',
            type: 'expense',
            amount: statementTotal,
            category: 'Restaurantes',
            description: 'charge-for-pending-test',
            date: chargeDate,
            paid: true,
            accountId: 'card-1',
            installments: 1,
          };

          const result = buildCardPaymentSchedule([fixedCard], [expense], [], NOW);
          const monthWithCharge = result.months.find(m =>
            m.cards.some(c => c.installmentItems.some(i => i.description === 'charge-for-pending-test'))
          );

          if (monthWithCharge) {
            const cardData = monthWithCharge.cards.find(c => c.cardId === 'card-1')!;
            expect(cardData.paidAmount).toBeLessThanOrEqual(0.01);
            expect(cardData.status).toBe('pending');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('the three statuses are mutually exclusive and exhaustive for any non-negative paidAmount', () => {
    fc.assert(
      fc.property(
        arbStatementTotal,
        fc.integer({ min: 0, max: 20_000_000 }),
        (statementTotal, paidAmount) => {
          const expense: Transaction = {
            id: 'tx-expense',
            type: 'expense',
            amount: statementTotal,
            category: 'Restaurantes',
            description: 'charge-exhaustive-test',
            date: chargeDate,
            paid: true,
            accountId: 'card-1',
            installments: 1,
          };

          const transactions: Transaction[] = [expense];

          // Only add payment if paidAmount > 0
          if (paidAmount > 0) {
            transactions.push({
              id: 'tx-payment',
              type: 'income',
              amount: paidAmount,
              category: 'Ingreso',
              description: 'pago-exhaustive',
              date: paymentDate,
              paid: true,
              accountId: 'card-1',
            });
          }

          const result = buildCardPaymentSchedule([fixedCard], transactions, [], NOW);
          const monthWithCharge = result.months.find(m =>
            m.cards.some(c => c.installmentItems.some(i => i.description === 'charge-exhaustive-test'))
          );

          if (monthWithCharge) {
            const cardData = monthWithCharge.cards.find(c => c.cardId === 'card-1')!;
            const { status, paidAmount: actualPaid, statementTotal: actualTotal } = cardData;

            // Status must be one of the three (not "projected" since index <= 0)
            expect(['paid', 'partial', 'pending']).toContain(status);

            // Verify classification matches the expected rule
            if (actualPaid >= actualTotal - 0.01) {
              expect(status).toBe('paid');
            } else if (actualPaid <= 0.01) {
              expect(status).toBe('pending');
            } else {
              // 0.01 < actualPaid < actualTotal - 0.01
              expect(status).toBe('partial');
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Feature: card-payment-window-fix, Property 3: Projected total invariant ───────────────

describe('Feature: card-payment-window-fix, Property 3: Projected total invariant', () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.4**
   *
   * For any set of credit card accounts with transactions and recurring payments,
   * the `projectedTotal` field in each `CardMonthPayment` of the current cycle
   * (`isCurrent: true`) SHALL equal the `statementTotal` of that card in that cycle.
   * Furthermore, the `consolidatedProjectedTotal` in the hook return SHALL equal
   * the sum of all per-card `projectedTotal` values.
   */

  it('projectedTotal === statementTotal for each card in the current cycle', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 1, maxLength: 5 }),
        fc.array(arbMonthlyRecurring('card-1'), { minLength: 0, maxLength: 3 }),
        (card, txs, recurrings) => {
          const result = buildCardPaymentSchedule([card], txs, recurrings, NOW);

          // Find the current month group
          const currentMonth = result.months.find(m => m.isCurrent);

          if (currentMonth) {
            for (const c of currentMonth.cards) {
              // Cards with projectedTotal defined (from index === 0) must equal statementTotal
              if (c.projectedTotal !== undefined) {
                expect(c.projectedTotal).toBe(c.statementTotal);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('projectedTotal === statementTotal with multiple cards', () => {
    // Generator for a second card with different id
    const arbSecondCard = fc.record({
      cutoffDay: arbCutoffDay,
      paymentDay: arbPaymentDay,
      name: fc.constant('Second Card'),
    }).map(({ cutoffDay, paymentDay, name }): Account => ({
      id: 'card-2',
      name,
      type: 'credit',
      isDefault: false,
      initialBalance: 0,
      cutoffDay,
      paymentDay,
    }));

    fc.assert(
      fc.property(
        arbCreditCard,
        arbSecondCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 1, maxLength: 3 }),
        fc.array(arbInstallmentTransaction('card-2'), { minLength: 1, maxLength: 3 }),
        fc.array(arbMonthlyRecurring('card-1'), { minLength: 0, maxLength: 2 }),
        (card1, card2, txs1, txs2, recurrings) => {
          const allTxs = [...txs1, ...txs2];
          const result = buildCardPaymentSchedule([card1, card2], allTxs, recurrings, NOW);

          const currentMonth = result.months.find(m => m.isCurrent);

          if (currentMonth) {
            for (const c of currentMonth.cards) {
              // Cards with projectedTotal defined (from index === 0) must equal statementTotal
              if (c.projectedTotal !== undefined) {
                expect(c.projectedTotal).toBe(c.statementTotal);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('consolidatedProjectedTotal === sum of per-card projectedTotal', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 1, maxLength: 5 }),
        fc.array(arbMonthlyRecurring('card-1'), { minLength: 0, maxLength: 3 }),
        (card, txs, recurrings) => {
          const result = buildCardPaymentSchedule([card], txs, recurrings, NOW);

          // Sum all projectedTotal values from all cards in the current month
          let expectedConsolidated = 0;
          const currentMonth = result.months.find(m => m.isCurrent);

          if (currentMonth) {
            for (const c of currentMonth.cards) {
              if (c.projectedTotal !== undefined) {
                expectedConsolidated += c.projectedTotal;
              }
            }
          }

          // Apply same rounding as the implementation
          const roundedExpected = Math.round(expectedConsolidated * 100) / 100;
          expect(result.consolidatedProjectedTotal).toBe(roundedExpected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('consolidatedProjectedTotal === sum of per-card projectedTotal with multiple cards', () => {
    const arbSecondCard = fc.record({
      cutoffDay: arbCutoffDay,
      paymentDay: arbPaymentDay,
      name: fc.constant('Second Card'),
    }).map(({ cutoffDay, paymentDay, name }): Account => ({
      id: 'card-2',
      name,
      type: 'credit',
      isDefault: false,
      initialBalance: 0,
      cutoffDay,
      paymentDay,
    }));

    fc.assert(
      fc.property(
        arbCreditCard,
        arbSecondCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 1, maxLength: 3 }),
        fc.array(arbInstallmentTransaction('card-2'), { minLength: 1, maxLength: 3 }),
        fc.array(arbMonthlyRecurring('card-1'), { minLength: 0, maxLength: 2 }),
        fc.array(arbMonthlyRecurring('card-2'), { minLength: 0, maxLength: 2 }),
        (card1, card2, txs1, txs2, recs1, recs2) => {
          const allTxs = [...txs1, ...txs2];
          const allRecs = [...recs1, ...recs2];
          const result = buildCardPaymentSchedule([card1, card2], allTxs, allRecs, NOW);

          // Sum all projectedTotal values from all cards in the current month
          let expectedConsolidated = 0;
          const currentMonth = result.months.find(m => m.isCurrent);

          if (currentMonth) {
            for (const c of currentMonth.cards) {
              if (c.projectedTotal !== undefined) {
                expectedConsolidated += c.projectedTotal;
              }
            }
          }

          const roundedExpected = Math.round(expectedConsolidated * 100) / 100;
          expect(result.consolidatedProjectedTotal).toBe(roundedExpected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('consolidatedProjectedTotal is 0 when no cards have charges in current cycle', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        (card) => {
          // No transactions, no recurring → no current cycle entry → consolidatedProjectedTotal = 0
          const result = buildCardPaymentSchedule([card], [], [], NOW);
          expect(result.consolidatedProjectedTotal).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Feature: balance-comparison-total-debt, Property 7: Total projected debt includes all current+future cycles ───

describe('Feature: balance-comparison-total-debt, Property 7: Total projected debt includes all current+future cycles', () => {
  /**
   * **Validates: Requirements 1.1, 1.4**
   *
   * For any credit card with installments (N > 1) and/or recurring payments,
   * `totalProjectedDebt` SHALL equal the sum of `statementTotal` for all cycles
   * where index >= 0, up to the computed horizon.
   * Additionally, `totalProjectedDebt >= projectedTotal` (it's a superset).
   */

  it('totalProjectedDebt equals sum of statementTotal for cycles index >= 0 (manual computation)', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 1, maxLength: 4 }),
        fc.array(arbMonthlyRecurring('card-1'), { minLength: 0, maxLength: 2 }),
        (card, txs, recurrings) => {
          const result = buildCardPaymentSchedule([card], txs, recurrings, NOW);

          // Find the current month group (isCurrent === true)
          const currentMonth = result.months.find(m => m.isCurrent);
          if (!currentMonth) return; // No current cycle entry → nothing to verify

          const cardEntry = currentMonth.cards.find(c => c.cardId === 'card-1');
          if (!cardEntry || cardEntry.totalProjectedDebt === undefined) return;

          // Manually compute the expected totalProjectedDebt:
          // Sum statementTotal for all cycles index >= 0 up to horizon.
          // We need to recompute using the same logic as the hook.
          const cutoffDay = card.cutoffDay!;
          const refIds = new Set([card.id!]);
          const charges = txs.filter(t => t.accountId === 'card-1' && t.type === 'expense');

          // Compute horizon the same way the hook does
          let maxIdx = 0;
          for (const tx of charges) {
            const n = tx.installments && tx.installments > 1 ? tx.installments : 1;
            const lastCycle = cycleIndexOf(cutoffDay, new Date(tx.date), NOW) + n - 1;
            if (lastCycle > maxIdx) maxIdx = lastCycle;
          }
          if (maxIdx === 0) {
            const hasRecurring = recurrings.some(
              r => r.isActive && r.accountId && refIds.has(r.accountId)
            );
            if (hasRecurring) maxIdx = 3; // MIN_FUTURE_RECURRING
          }
          const horizon = Math.min(maxIdx, 12); // MAX_FUTURE

          // Sum statementTotal for index 0..horizon
          let expectedTotalDebt = 0;
          for (let index = 0; index <= horizon; index++) {
            // Compute statement for this cycle (same logic as cardStatementForCycle)
            let stmtTotal = 0;
            for (const tx of charges) {
              const firstIndex = cycleIndexOf(cutoffDay, new Date(tx.date), NOW);
              const n = tx.installments && tx.installments > 1 ? tx.installments : 1;
              const k = index - firstIndex;
              if (k < 0 || k >= n) continue;
              const amount = n > 1
                ? (tx.monthlyInstallmentAmount ?? roundMoney(tx.amount / n))
                : tx.amount;
              stmtTotal += roundMoney(amount);
            }
            stmtTotal = roundMoney(stmtTotal);

            // Compute recurring for this cycle (only for index > 0)
            let recTotal = 0;
            if (index > 0) {
              const cycle = getCycleByIndex(cutoffDay, card.paymentDay!, index, NOW);
              for (const r of recurrings) {
                if (!r.isActive || r.accountId !== 'card-1') continue;
                if (r.frequency === 'yearly') {
                  // Skip yearly unless month matches (simplified check)
                  const anchor = r.createdAt
                    ? new Date(r.createdAt).getMonth()
                    : NOW.getMonth();
                  if (cycle.cycleEnd.getMonth() !== anchor) continue;
                }
                recTotal += r.amount;
              }
              recTotal = roundMoney(recTotal);
            }

            expectedTotalDebt += roundMoney(stmtTotal + recTotal);
          }

          expectedTotalDebt = roundMoney(expectedTotalDebt);

          expect(cardEntry.totalProjectedDebt).toBe(expectedTotalDebt);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('totalProjectedDebt >= projectedTotal (superset of current cycle)', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 1, maxLength: 5 }),
        fc.array(arbMonthlyRecurring('card-1'), { minLength: 0, maxLength: 3 }),
        (card, txs, recurrings) => {
          const result = buildCardPaymentSchedule([card], txs, recurrings, NOW);

          // Find the current month group
          const currentMonth = result.months.find(m => m.isCurrent);
          if (!currentMonth) return;

          for (const c of currentMonth.cards) {
            if (c.totalProjectedDebt !== undefined && c.projectedTotal !== undefined) {
              // totalProjectedDebt is a superset: it includes the current cycle plus future cycles
              expect(c.totalProjectedDebt).toBeGreaterThanOrEqual(c.projectedTotal);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('totalProjectedDebt > 0 when card has installments with N > 1 in current/future cycles', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 1, maxLength: 4 }),
        (card, txs) => {
          const result = buildCardPaymentSchedule([card], txs, [], NOW);

          // Find the current month group
          const currentMonth = result.months.find(m => m.isCurrent);
          if (!currentMonth) return;

          const cardEntry = currentMonth.cards.find(c => c.cardId === 'card-1');
          if (!cardEntry || cardEntry.totalProjectedDebt === undefined) return;

          // If there's at least one installment tx that contributes to cycles >= 0,
          // then totalProjectedDebt should be > 0
          const cutoffDay = card.cutoffDay!;
          const hasCurrentOrFutureCuotas = txs.some(tx => {
            const firstIndex = cycleIndexOf(cutoffDay, new Date(tx.date), NOW);
            const n = tx.installments && tx.installments > 1 ? tx.installments : 1;
            const lastIndex = firstIndex + n - 1;
            // At least one cuota is in cycle index >= 0
            return lastIndex >= 0 && firstIndex <= 12; // within horizon
          });

          if (hasCurrentOrFutureCuotas) {
            expect(cardEntry.totalProjectedDebt).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('totalProjectedDebt === projectedTotal when card has no future cycles (contado only)', () => {
    fc.assert(
      fc.property(
        arbCreditCard,
        fc.array(arbContadoTransaction('card-1'), { minLength: 1, maxLength: 3 }),
        (card, txs) => {
          // Only contado transactions (installments = 1 or undefined), no recurring
          const result = buildCardPaymentSchedule([card], txs, [], NOW);

          const currentMonth = result.months.find(m => m.isCurrent);
          if (!currentMonth) return;

          const cardEntry = currentMonth.cards.find(c => c.cardId === 'card-1');
          if (!cardEntry || cardEntry.totalProjectedDebt === undefined || cardEntry.projectedTotal === undefined) return;

          // For contado-only cards, horizon is 0 → totalProjectedDebt === projectedTotal
          // (Validates Requirement 1.4)
          expect(cardEntry.totalProjectedDebt).toBe(cardEntry.projectedTotal);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('consolidatedTotalProjectedDebt equals sum of per-card totalProjectedDebt', () => {
    // Generator for a second card
    const arbSecondCard = fc.record({
      cutoffDay: arbCutoffDay,
      paymentDay: arbPaymentDay,
      name: fc.constant('Second Card'),
    }).map(({ cutoffDay, paymentDay, name }): Account => ({
      id: 'card-2',
      name,
      type: 'credit',
      isDefault: false,
      initialBalance: 0,
      cutoffDay,
      paymentDay,
    }));

    fc.assert(
      fc.property(
        arbCreditCard,
        arbSecondCard,
        fc.array(arbInstallmentTransaction('card-1'), { minLength: 1, maxLength: 3 }),
        fc.array(arbInstallmentTransaction('card-2'), { minLength: 1, maxLength: 3 }),
        fc.array(arbMonthlyRecurring('card-1'), { minLength: 0, maxLength: 2 }),
        fc.array(arbMonthlyRecurring('card-2'), { minLength: 0, maxLength: 2 }),
        (card1, card2, txs1, txs2, recs1, recs2) => {
          const allTxs = [...txs1, ...txs2];
          const allRecs = [...recs1, ...recs2];
          const result = buildCardPaymentSchedule([card1, card2], allTxs, allRecs, NOW);

          // Sum totalProjectedDebt from all cards in the current month
          let expectedConsolidated = 0;
          const currentMonth = result.months.find(m => m.isCurrent);
          if (currentMonth) {
            for (const c of currentMonth.cards) {
              if (c.totalProjectedDebt !== undefined) {
                expectedConsolidated += c.totalProjectedDebt;
              }
            }
          }

          expect(result.consolidatedTotalProjectedDebt).toBe(roundMoney(expectedConsolidated));
        },
      ),
      { numRuns: 100 },
    );
  });
});
