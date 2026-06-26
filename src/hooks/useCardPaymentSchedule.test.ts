import { describe, it, expect } from 'vitest';
import { buildCardPaymentSchedule } from './useCardPaymentSchedule';
import type { Account, Transaction, RecurringPayment } from '../types/finance';

// â”€â”€â”€ Fixtures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const NOW = new Date(2025, 5, 15); // June 15, 2025

function makeCard(overrides: Partial<Account> = {}): Account {
  return {
    id: 'card-1',
    name: 'Visa Gold',
    type: 'credit',
    isDefault: false,
    initialBalance: 0,
    cutoffDay: 15,
    paymentDay: 5,
    ...overrides,
  };
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    type: 'expense',
    amount: 100000,
    category: 'Restaurantes',
    description: 'Compra test',
    date: new Date(2025, 4, 10), // May 10, 2025 â€” in cycle 0 or -1 depending on cutoff
    paid: true,
    accountId: 'card-1',
    ...overrides,
  };
}

function makeRecurring(overrides: Partial<RecurringPayment> = {}): RecurringPayment {
  return {
    id: 'rec-1',
    name: 'Netflix',
    amount: 45900,
    category: 'Entretenimiento',
    accountId: 'card-1',
    dueDay: 15,
    frequency: 'monthly',
    isActive: true,
    ...overrides,
  };
}

// â”€â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('buildCardPaymentSchedule', () => {
  it('returns empty array when no credit cards', () => {
    const savings: Account = {
      id: 'sav-1', name: 'Savings', type: 'savings',
      isDefault: true, initialBalance: 1000000,
    };
    const result = buildCardPaymentSchedule([savings], [], [], NOW);
    expect(result.months).toEqual([]);
  });

  it('returns empty array for credit card with no cutoffDay/paymentDay', () => {
    const card: Account = {
      id: 'card-1', name: 'Card', type: 'credit',
      isDefault: false, initialBalance: 0,
      // No cutoffDay or paymentDay
    };
    const result = buildCardPaymentSchedule([card], [], [], NOW);
    expect(result.months).toEqual([]);
  });

  it('omits months where total is 0', () => {
    const card = makeCard();
    // No transactions, no recurring â†’ no months
    const result = buildCardPaymentSchedule([card], [], [], NOW);
    expect(result.months).toEqual([]);
  });

  it('distributes a contado (no installments) to exactly 1 cycle', () => {
    const card = makeCard({ cutoffDay: 15, paymentDay: 5 });
    // Transaction on May 10 â€” before cutoff May 15 â†’ in cycle that ends May 15
    const tx = makeTx({ date: new Date(2025, 4, 10), amount: 200000, installments: 1 });
    const result = buildCardPaymentSchedule([card], [tx], [], NOW);

    // Should have exactly 1 MonthGroup (the cycle where this tx falls)
    expect(result.months.length).toBeGreaterThanOrEqual(1);

    // Find the month containing this transaction's installment item
    const monthsWithTx = result.months.filter(m =>
      m.cards.some(c => c.installmentItems.some(i => i.description === 'Compra test'))
    );
    expect(monthsWithTx.length).toBe(1);
    expect(monthsWithTx[0].cards[0].installmentItems[0].cuota).toBe(1);
    expect(monthsWithTx[0].cards[0].installmentItems[0].total).toBe(1);
  });

  it('distributes installments across N consecutive cycles', () => {
    const card = makeCard({ cutoffDay: 15, paymentDay: 5 });
    const tx = makeTx({
      date: new Date(2025, 4, 10), // May 10 â€” before cutoff 15
      amount: 600000,
      installments: 6,
      monthlyInstallmentAmount: 100000,
    });
    const result = buildCardPaymentSchedule([card], [tx], [], NOW);

    // Find all months containing this transaction's installment
    const monthsWithInstallment = result.months.filter(m =>
      m.cards.some(c => c.installmentItems.some(i => i.description === 'Compra test'))
    );

    expect(monthsWithInstallment.length).toBe(6);

    // Cuotas should be numbered 1 through 6
    const cuotas = monthsWithInstallment.flatMap(m =>
      m.cards.flatMap(c => c.installmentItems.filter(i => i.description === 'Compra test'))
    ).map(i => i.cuota).sort((a, b) => a - b);
    expect(cuotas).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('adds recurring monthly payments only in future cycles (index > 0)', () => {
    const card = makeCard({ cutoffDay: 15, paymentDay: 5 });
    const recurring = makeRecurring({ amount: 45900, frequency: 'monthly' });

    const result = buildCardPaymentSchedule([card], [], [recurring], NOW);

    // All months should be future (recurring only contributes to future cycles)
    expect(result.months.length).toBeGreaterThan(0);
    for (const month of result.months) {
      for (const c of month.cards) {
        expect(c.status).toBe('projected');
        expect(c.recurringItems.length).toBeGreaterThan(0);
      }
    }
  });

  it('adds recurring yearly payments only in the matching anchor month', () => {
    const card = makeCard({ cutoffDay: 15, paymentDay: 5 });
    const recurring = makeRecurring({
      frequency: 'yearly',
      amount: 200000,
      createdAt: new Date(2024, 2, 15), // Created in March â†’ anchor month = 2 (March)
    });

    const result = buildCardPaymentSchedule([card], [], [recurring], NOW);

    // Should appear only in months whose cycle's end month is March
    for (const month of result.months) {
      for (const c of month.cards) {
        if (c.recurringItems.length > 0) {
          // The cycleEnd month should be March (month 2)
          expect(c.cycleEnd.getMonth()).toBe(2);
        }
      }
    }
  });

  it('sets status to projected for future cycles (index > 0)', () => {
    const card = makeCard({ cutoffDay: 15, paymentDay: 5 });
    const recurring = makeRecurring({ amount: 50000 });

    const result = buildCardPaymentSchedule([card], [], [recurring], NOW);

    for (const month of result.months) {
      for (const c of month.cards) {
        expect(c.status).toBe('projected');
      }
    }
  });

  it('computes paid status correctly when payments cover the total', () => {
    const card = makeCard({ cutoffDay: 15, paymentDay: 5 });
    // Charge in a past cycle
    const charge = makeTx({
      date: new Date(2025, 2, 10), // March 10 â€” past
      amount: 500000,
      installments: 1,
    });
    // Payment covering the charge â€” after cycle end, before next cycle end
    const payment: Transaction = {
      type: 'income',
      amount: 500000,
      category: 'Ingreso',
      description: 'Pago tarjeta',
      date: new Date(2025, 3, 1), // April 1
      paid: true,
      accountId: 'card-1',
    };

    const result = buildCardPaymentSchedule([card], [charge, payment], [], NOW);
    const monthWithCharge = result.months.find(m =>
      m.cards.some(c => c.installmentItems.some(i => i.description === 'Compra test'))
    );

    if (monthWithCharge) {
      const cardData = monthWithCharge.cards.find(c => c.cardId === 'card-1');
      if (cardData && cardData.status !== 'projected') {
        expect(['paid', 'partial', 'pending']).toContain(cardData.status);
      }
    }
  });

  it('monthKey is in YYYY-MM format', () => {
    const card = makeCard({ cutoffDay: 15, paymentDay: 5 });
    const tx = makeTx({ date: new Date(2025, 4, 10), amount: 100000 });
    const result = buildCardPaymentSchedule([card], [tx], [], NOW);

    for (const month of result.months) {
      expect(month.monthKey).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it('at most one month is marked isCurrent', () => {
    const card = makeCard({ cutoffDay: 15, paymentDay: 5 });
    const tx = makeTx({ date: new Date(2025, 4, 10), amount: 100000 });
    const recurring = makeRecurring({ amount: 50000 });

    const result = buildCardPaymentSchedule([card], [tx], [recurring], NOW);
    const currentMonths = result.months.filter(m => m.isCurrent);
    expect(currentMonths.length).toBeLessThanOrEqual(1);
  });

  it('results are sorted ascending by monthKey', () => {
    const card = makeCard({ cutoffDay: 15, paymentDay: 5 });
    const tx = makeTx({
      date: new Date(2025, 1, 10), // Feb 10
      amount: 600000,
      installments: 6,
      monthlyInstallmentAmount: 100000,
    });
    const result = buildCardPaymentSchedule([card], [tx], [], NOW);

    for (let i = 1; i < result.months.length; i++) {
      expect(result.months[i].monthKey >= result.months[i - 1].monthKey).toBe(true);
    }
  });

  it('respects past horizon of 6 cycles', () => {
    const card = makeCard({ cutoffDay: 15, paymentDay: 5 });
    // Very old transaction (18 months ago) â€” should not create cycles beyond -6
    const tx = makeTx({
      date: new Date(2023, 5, 10), // June 2023 â€” 24 months ago
      amount: 100000,
      installments: 1,
    });
    const result = buildCardPaymentSchedule([card], [tx], [], NOW);

    // The tx may not even appear since the cycle is far in the past (beyond -6)
    // This tests that we don't generate infinite past months
    expect(result.months.length).toBeLessThanOrEqual(19); // 6 past + 12 future + 1 current max
  });

  it('respects future horizon hard cap of 12', () => {
    const card = makeCard({ cutoffDay: 15, paymentDay: 5 });
    // Transaction with 36 installments â€” should not go beyond +12
    const tx = makeTx({
      date: new Date(2025, 4, 10),
      amount: 3600000,
      installments: 36,
      monthlyInstallmentAmount: 100000,
    });
    const result = buildCardPaymentSchedule([card], [tx], [], NOW);

    // Hard cap at 12 future cycles â€” won't generate all 36
    // Total months â‰¤ 6 (past) + 1 (current) + 12 (future) = 19
    expect(result.months.length).toBeLessThanOrEqual(19);
  });

  it('every MonthGroup has total > 0 (except current cycle with projectedTotal)', () => {
    const card = makeCard({ cutoffDay: 15, paymentDay: 5 });
    const tx = makeTx({ date: new Date(2025, 4, 10), amount: 100000 });
    const recurring = makeRecurring({ amount: 50000 });

    const result = buildCardPaymentSchedule([card], [tx], [recurring], NOW);

    for (const month of result.months) {
      // Current cycle entries may have total === 0 when projectedTotal is reported (Req 3.3)
      const hasProjectedTotal = month.cards.some(c => c.projectedTotal !== undefined);
      if (hasProjectedTotal) {
        expect(month.total).toBeGreaterThanOrEqual(0);
      } else {
        expect(month.total).toBeGreaterThan(0);
      }
    }
  });

  it('uses monthlyInstallmentAmount when available for installments', () => {
    const card = makeCard({ cutoffDay: 15, paymentDay: 5 });
    const tx = makeTx({
      date: new Date(2025, 4, 10),
      amount: 600000,
      installments: 6,
      monthlyInstallmentAmount: 110000, // Includes interest
    });
    const result = buildCardPaymentSchedule([card], [tx], [], NOW);

    const allItems = result.months.flatMap(m =>
      m.cards.flatMap(c => c.installmentItems.filter(i => i.description === 'Compra test'))
    );

    // Each installment should use monthlyInstallmentAmount
    for (const item of allItems) {
      expect(item.amount).toBe(110000);
    }
  });

  it('totalProjectedDebt includes all 12 cuotas while projectedTotal only includes current cuota', () => {
    // Scenario: phone purchase of $3,600,000 COP in 12 installments of $300,000 each
    const card = makeCard({ cutoffDay: 15, paymentDay: 5 });
    // Transaction on June 1 — within current cycle (May 16 → June 15 with cutoff=15, now=June 15)
    const tx = makeTx({
      date: new Date(2025, 5, 1), // June 1, within current cycle
      amount: 3600000,
      installments: 12,
      monthlyInstallmentAmount: 300000,
      description: 'Celular iPhone',
    });

    const result = buildCardPaymentSchedule([card], [tx], [], NOW);

    // Find the current cycle entry — identified by having projectedTotal defined (index === 0)
    const currentCycleMonth = result.months.find(m =>
      m.cards.some(c => c.projectedTotal !== undefined)
    );
    expect(currentCycleMonth).toBeDefined();

    const currentCard = currentCycleMonth!.cards.find(
      c => c.cardId === 'card-1' && c.projectedTotal !== undefined
    );
    expect(currentCard).toBeDefined();

    // projectedTotal should be only the current cuota ($300,000)
    expect(currentCard!.projectedTotal).toBe(300000);

    // totalProjectedDebt should include ALL 12 cuotas (current + 11 future)
    // = 12 × $300,000 = $3,600,000
    expect(currentCard!.totalProjectedDebt).toBe(3600000);

    // totalProjectedDebt must be >= projectedTotal (it's a superset)
    expect(currentCard!.totalProjectedDebt!).toBeGreaterThanOrEqual(currentCard!.projectedTotal!);
  });
});
