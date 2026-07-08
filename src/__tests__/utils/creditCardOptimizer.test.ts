import { describe, expect, it } from 'vitest';
import { buildCreditCardUsagePlans, getRecommendedCreditCardUsagePlan } from '../../utils/creditCardOptimizer';
import type { Account, Transaction } from '../../types/finance';

const makeCard = (overrides: Partial<Account>): Account => ({
  id: 'card',
  name: 'Tarjeta',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  creditLimit: 3_000_000,
  cutoffDay: 15,
  paymentDay: 5,
  usedCredit: 0,
  monthlySpendingLimit: 1_000_000,
  ...overrides,
});

const makeExpense = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx',
  type: 'expense',
  amount: 100_000,
  category: 'Compras Personales',
  description: 'Compra',
  date: new Date('2026-07-10T12:00:00'),
  paid: true,
  accountId: 'card',
  ...overrides,
});

describe('creditCardOptimizer', () => {
  it('recommends the card with the longer payment window when it can cover the purchase', () => {
    const cards = [
      makeCard({ id: 'near-cutoff', name: 'Corta pronto', cutoffDay: 13, paymentDay: 1 }),
      makeCard({ id: 'fresh-cycle', name: 'Ciclo amplio', cutoffDay: 25, paymentDay: 15 }),
    ];

    const plans = buildCreditCardUsagePlans(cards, [], {
      amount: 300_000,
      date: new Date('2026-07-11T12:00:00'),
      usedCreditByCard: {
        'near-cutoff': 0,
        'fresh-cycle': 0,
      },
    });

    expect(getRecommendedCreditCardUsagePlan(plans)?.cardId).toBe('fresh-cycle');
  });

  it('warns and avoids recommending a card that would exceed its monthly spending cap', () => {
    const cards = [
      makeCard({ id: 'capped', name: 'Con tope', cutoffDay: 25, monthlySpendingLimit: 500_000 }),
      makeCard({ id: 'available', name: 'Disponible', cutoffDay: 20, monthlySpendingLimit: 1_500_000 }),
    ];
    const transactions = [
      makeExpense({ id: 'spent', accountId: 'capped', amount: 450_000, date: new Date('2026-07-12T12:00:00') }),
    ];

    const plans = buildCreditCardUsagePlans(cards, transactions, {
      amount: 100_000,
      date: new Date('2026-07-13T12:00:00'),
      usedCreditByCard: {
        capped: 450_000,
        available: 0,
      },
    });

    const capped = plans.find((plan) => plan.cardId === 'capped');
    expect(capped?.canCoverAmount).toBe(false);
    expect(capped?.warnings.some((warning) => warning.message.includes('tope mensual'))).toBe(true);
    expect(getRecommendedCreditCardUsagePlan(plans)?.cardId).toBe('available');
  });

  it('uses a suggested cap when the card has no manual monthly limit', () => {
    const transactions = [
      makeExpense({ id: 'may', accountId: 'auto', amount: 500_000, date: new Date('2026-05-10T12:00:00') }),
      makeExpense({ id: 'jun', accountId: 'auto', amount: 700_000, date: new Date('2026-06-10T12:00:00') }),
    ];

    const plans = buildCreditCardUsagePlans([
      makeCard({ id: 'auto', creditLimit: 3_000_000, monthlySpendingLimit: 0 }),
    ], transactions, {
      amount: 200_000,
      date: new Date('2026-07-13T12:00:00'),
      usedCreditByCard: { auto: 0 },
    });

    const plan = plans[0];
    expect(plan.monthlyLimitSource).toBe('suggested');
    expect(plan.analysisCycleCount).toBe(2);
    expect(plan.analysisBaseline).toBe(600_000);
    expect(plan.suggestedMonthlyLimit).toBe(720_000);
    expect(plan.monthlyLimit).toBe(720_000);
  });

  it('keeps the suggested cap anchored to history and credit target', () => {
    const transactions = [
      makeExpense({ id: 'may', accountId: 'auto', amount: 800_000, date: new Date('2026-05-10T12:00:00') }),
      makeExpense({ id: 'jun', accountId: 'auto', amount: 900_000, date: new Date('2026-06-10T12:00:00') }),
    ];

    const plans = buildCreditCardUsagePlans([
      makeCard({ id: 'auto', creditLimit: 3_000_000, monthlySpendingLimit: 0 }),
    ], transactions, {
      amount: 100_000,
      date: new Date('2026-07-13T12:00:00'),
      usedCreditByCard: { auto: 0 },
    });

    expect(plans[0].suggestedMonthlyLimit).toBe(900_000);
    expect(plans[0].monthlyLimit).toBe(900_000);
  });

  it('keeps a manual cap but warns when it exceeds the suggested cap', () => {
    const transactions = [
      makeExpense({ id: 'may', accountId: 'manual', amount: 750_000, date: new Date('2026-05-10T12:00:00') }),
      makeExpense({ id: 'jun', accountId: 'manual', amount: 750_000, date: new Date('2026-06-10T12:00:00') }),
    ];

    const plans = buildCreditCardUsagePlans([
      makeCard({ id: 'manual', creditLimit: 3_000_000, monthlySpendingLimit: 1_500_000 }),
    ], transactions, {
      amount: 1_000_000,
      date: new Date('2026-07-13T12:00:00'),
      usedCreditByCard: { manual: 0 },
    });

    const plan = plans[0];
    expect(plan.monthlyLimitSource).toBe('manual');
    expect(plan.monthlyLimit).toBe(1_500_000);
    expect(plan.suggestedMonthlyLimit).toBe(900_000);
    expect(plan.warnings.some((warning) => warning.message.includes('tope manual'))).toBe(true);
  });

  it('does not invent a suggested cap with insufficient completed-cycle history', () => {
    const plans = buildCreditCardUsagePlans([
      makeCard({ id: 'new-card', creditLimit: 3_000_000, monthlySpendingLimit: 0 }),
    ], [
      makeExpense({ id: 'current', accountId: 'new-card', amount: 2_000_000, date: new Date('2026-07-12T12:00:00') }),
    ], {
      amount: 100_000,
      date: new Date('2026-07-13T12:00:00'),
      usedCreditByCard: { 'new-card': 0 },
    });

    expect(plans[0].analysisCycleCount).toBe(0);
    expect(plans[0].suggestedMonthlyLimit).toBe(0);
    expect(plans[0].monthlyLimit).toBe(0);
    expect(plans[0].canCoverAmount).toBe(true);
    expect(getRecommendedCreditCardUsagePlan(plans)).toBeNull();
  });

  it('uses merged card ids in the historical spending analysis', () => {
    const plans = buildCreditCardUsagePlans([
      makeCard({ id: 'new-card', mergedAccountIds: ['old-card'], creditLimit: 3_000_000, monthlySpendingLimit: 0 }),
    ], [
      makeExpense({ id: 'old', accountId: 'old-card', amount: 400_000, date: new Date('2026-05-10T12:00:00') }),
      makeExpense({ id: 'new', accountId: 'new-card', amount: 600_000, date: new Date('2026-06-10T12:00:00') }),
    ], {
      amount: 100_000,
      date: new Date('2026-07-13T12:00:00'),
      usedCreditByCard: { 'new-card': 0 },
    });

    expect(plans[0].analysisBaseline).toBe(500_000);
    expect(plans[0].suggestedMonthlyLimit).toBe(600_000);
  });

  it('excludes internal adjustment categories from the historical baseline', () => {
    const plans = buildCreditCardUsagePlans([
      makeCard({ id: 'card', creditLimit: 3_000_000, monthlySpendingLimit: 0 }),
    ], [
      makeExpense({ id: 'apr', amount: 700_000, date: new Date('2026-04-10T12:00:00') }),
      makeExpense({ id: 'may', amount: 500_000, date: new Date('2026-05-10T12:00:00') }),
      makeExpense({ id: 'adjust', amount: 2_000_000, category: 'Ajuste de saldo', date: new Date('2026-06-10T12:00:00') }),
    ], {
      amount: 100_000,
      date: new Date('2026-07-13T12:00:00'),
      usedCreditByCard: { card: 0 },
    });

    expect(plans[0].analysisBaseline).toBe(600_000);
    expect(plans[0].suggestedMonthlyLimit).toBe(720_000);
  });

  it('does not let a new card without history change analyzed card suggestions', () => {
    const transactions = [
      makeExpense({ id: 'may', accountId: 'analyzed', amount: 800_000, date: new Date('2026-05-10T12:00:00') }),
      makeExpense({ id: 'jun', accountId: 'analyzed', amount: 800_000, date: new Date('2026-06-10T12:00:00') }),
    ];

    const plans = buildCreditCardUsagePlans([
      makeCard({ id: 'analyzed', creditLimit: 3_000_000, monthlySpendingLimit: 0 }),
      makeCard({ id: 'new-card', creditLimit: 3_000_000, monthlySpendingLimit: 0 }),
    ], transactions, {
      amount: 100_000,
      date: new Date('2026-07-13T12:00:00'),
      usedCreditByCard: { analyzed: 0, 'new-card': 0 },
    });

    const analyzed = plans.find((plan) => plan.cardId === 'analyzed');
    const newCard = plans.find((plan) => plan.cardId === 'new-card');

    expect(analyzed?.suggestedMonthlyLimit).toBe(900_000);
    expect(newCard?.suggestedMonthlyLimit).toBe(0);
  });

  it('keeps analyzed suggestions stable when a new card has a manual cap', () => {
    const transactions = [
      makeExpense({ id: 'may', accountId: 'analyzed', amount: 800_000, date: new Date('2026-05-10T12:00:00') }),
      makeExpense({ id: 'jun', accountId: 'analyzed', amount: 800_000, date: new Date('2026-06-10T12:00:00') }),
    ];

    const plans = buildCreditCardUsagePlans([
      makeCard({ id: 'analyzed', creditLimit: 3_000_000, monthlySpendingLimit: 0 }),
      makeCard({ id: 'new-card', creditLimit: 3_000_000, monthlySpendingLimit: 300_000 }),
    ], transactions, {
      amount: 100_000,
      date: new Date('2026-07-13T12:00:00'),
      usedCreditByCard: { analyzed: 0, 'new-card': 0 },
    });

    const analyzed = plans.find((plan) => plan.cardId === 'analyzed');
    const newCard = plans.find((plan) => plan.cardId === 'new-card');

    expect(analyzed?.suggestedMonthlyLimit).toBe(900_000);
    expect(newCard?.monthlyLimitSource).toBe('manual');
    expect(newCard?.monthlyLimit).toBe(300_000);
  });

  it('does not let a large manual card distort analyzed card suggestions', () => {
    const transactions = [
      makeExpense({ id: 'may', accountId: 'analyzed', amount: 800_000, date: new Date('2026-05-10T12:00:00') }),
      makeExpense({ id: 'jun', accountId: 'analyzed', amount: 800_000, date: new Date('2026-06-10T12:00:00') }),
    ];

    const plans = buildCreditCardUsagePlans([
      makeCard({ id: 'analyzed', creditLimit: 3_000_000, monthlySpendingLimit: 0 }),
      makeCard({ id: 'new-large-card', creditLimit: 30_000_000, monthlySpendingLimit: 100_000 }),
    ], transactions, {
      amount: 100_000,
      date: new Date('2026-07-13T12:00:00'),
      usedCreditByCard: { analyzed: 0, 'new-large-card': 0 },
    });

    const analyzed = plans.find((plan) => plan.cardId === 'analyzed');

    expect(analyzed?.suggestedMonthlyLimit).toBe(900_000);
  });

  it('keeps a current-cycle spend separate from the suggested cap', () => {
    const plans = buildCreditCardUsagePlans([
      makeCard({ id: 'gold', name: 'Gold', creditLimit: 9_000_000, cutoffDay: 29, paymentDay: 10, monthlySpendingLimit: 0 }),
    ], [
      makeExpense({ id: 'gold-may', accountId: 'gold', amount: 500_000, date: new Date('2026-05-10T12:00:00') }),
      makeExpense({ id: 'gold-jun', accountId: 'gold', amount: 500_000, date: new Date('2026-06-10T12:00:00') }),
      makeExpense({ id: 'gold-current', accountId: 'gold', amount: 268_842, date: new Date('2026-07-10T12:00:00') }),
    ], {
      amount: 0,
      date: new Date('2026-07-13T12:00:00'),
      usedCreditByCard: { gold: 268_842 },
    });

    const gold = plans[0];

    expect(gold.cycleSpent).toBe(268_842);
    expect(gold.suggestedMonthlyLimit).toBe(600_000);
    expect(gold.monthlyLimit).toBe(600_000);
    expect(gold.monthlyUsageRatio).toBeCloseTo(0.44807, 5);
    expect(gold.warnings.some((warning) => warning.message.includes('Supera el tope'))).toBe(false);
  });

  it('prioritizes lower total card usage over a longer payment window', () => {
    const cards = [
      makeCard({
        id: 'loaded',
        name: 'Muy usada',
        creditLimit: 10_000_000,
        cutoffDay: 28,
        paymentDay: 20,
        monthlySpendingLimit: 3_000_000,
      }),
      makeCard({
        id: 'healthy',
        name: 'Mas sana',
        creditLimit: 10_000_000,
        cutoffDay: 16,
        paymentDay: 5,
        monthlySpendingLimit: 3_000_000,
      }),
    ];

    const plans = buildCreditCardUsagePlans(cards, [], {
      amount: 0,
      date: new Date('2026-07-13T12:00:00'),
      usedCreditByCard: { loaded: 7_500_000, healthy: 500_000 },
    });

    const loaded = plans.find((plan) => plan.cardId === 'loaded');

    expect(loaded?.usedCredit).toBe(7_500_000);
    expect(loaded?.warnings.some((warning) => warning.message.includes('uso total'))).toBe(true);
    expect(getRecommendedCreditCardUsagePlan(plans)?.cardId).toBe('healthy');
  });

  it('penalizes future installments when recommending the next card', () => {
    const cards = [
      makeCard({
        id: 'installments',
        name: 'Con cuotas',
        creditLimit: 10_000_000,
        cutoffDay: 28,
        paymentDay: 20,
        monthlySpendingLimit: 3_000_000,
      }),
      makeCard({
        id: 'clean',
        name: 'Sin cuotas',
        creditLimit: 10_000_000,
        cutoffDay: 16,
        paymentDay: 5,
        monthlySpendingLimit: 3_000_000,
      }),
    ];

    const plans = buildCreditCardUsagePlans(cards, [
      makeExpense({
        id: 'installment-purchase',
        accountId: 'installments',
        amount: 2_400_000,
        date: new Date('2026-06-10T12:00:00'),
        installments: 12,
        monthlyInstallmentAmount: 200_000,
      }),
    ], {
      amount: 0,
      date: new Date('2026-07-13T12:00:00'),
      usedCreditByCard: { installments: 500_000, clean: 500_000 },
    });

    const installments = plans.find((plan) => plan.cardId === 'installments');

    expect(installments?.currentStatementTotal).toBe(200_000);
    expect(installments?.futureInstallmentTotal).toBe(2_000_000);
    expect(installments?.futureInstallmentCycles).toBe(10);
    expect(installments?.warnings.some((warning) => warning.message.includes('cuotas futuras'))).toBe(true);
    expect(getRecommendedCreditCardUsagePlan(plans)?.cardId).toBe('clean');
  });

  it('uses current statement load, not only new cycle purchases, for monthly cap usage', () => {
    const plans = buildCreditCardUsagePlans([
      makeCard({
        id: 'nu',
        name: 'Nu Credito',
        creditLimit: 13_150_000,
        cutoffDay: 28,
        paymentDay: 18,
        monthlySpendingLimit: 1_687_336.03,
      }),
    ], [
      makeExpense({
        id: 'small-cycle-purchase',
        accountId: 'nu',
        amount: 23_430.64,
        date: new Date('2026-07-10T12:00:00'),
      }),
      makeExpense({
        id: 'installment-load',
        accountId: 'nu',
        amount: 3_800_000,
        date: new Date('2026-06-10T12:00:00'),
        installments: 12,
        monthlyInstallmentAmount: 316_666.67,
      }),
    ], {
      amount: 0,
      date: new Date('2026-07-13T12:00:00'),
      usedCreditByCard: { nu: 3_913_485 },
    });

    const nu = plans[0];

    expect(nu.cycleSpent).toBe(23_430.64);
    expect(nu.currentStatementTotal).toBe(340_097.31);
    expect(nu.cycleRemaining).toBe(1_347_238.72);
    expect(nu.monthlyUsageRatio).toBeCloseTo(0.20156, 5);
    expect(nu.creditUsageRatio).toBeCloseTo(0.29760, 5);
  });

  it('does not recommend an analyzing card when analyzed cards are already over cap', () => {
    const cards = [
      makeCard({ id: 'rappi', name: 'RappiCard', creditLimit: 12_000_000, cutoffDay: 30, paymentDay: 10, monthlySpendingLimit: 0 }),
      makeCard({ id: 'nu', name: 'Nu Credito', creditLimit: 9_000_000, cutoffDay: 21, paymentDay: 18, monthlySpendingLimit: 0 }),
      makeCard({ id: 'gold', name: 'Gold', creditLimit: 9_000_000, cutoffDay: 29, paymentDay: 10, monthlySpendingLimit: 0 }),
    ];

    const transactions = [
      makeExpense({ id: 'rappi-one-cycle', accountId: 'rappi', amount: 500_000, date: new Date('2026-06-10T12:00:00') }),
      makeExpense({ id: 'nu-may', accountId: 'nu', amount: 500_000, date: new Date('2026-05-10T12:00:00') }),
      makeExpense({ id: 'nu-jun', accountId: 'nu', amount: 500_000, date: new Date('2026-06-10T12:00:00') }),
      makeExpense({ id: 'nu-current', accountId: 'nu', amount: 800_000, date: new Date('2026-07-10T12:00:00') }),
      makeExpense({ id: 'gold-may', accountId: 'gold', amount: 500_000, date: new Date('2026-05-10T12:00:00') }),
      makeExpense({ id: 'gold-jun', accountId: 'gold', amount: 500_000, date: new Date('2026-06-10T12:00:00') }),
      makeExpense({ id: 'gold-current', accountId: 'gold', amount: 800_000, date: new Date('2026-07-10T12:00:00') }),
    ];

    const plans = buildCreditCardUsagePlans(cards, transactions, {
      amount: 0,
      date: new Date('2026-07-13T12:00:00'),
      usedCreditByCard: { rappi: 500_000, nu: 1_800_000, gold: 1_800_000 },
    });

    const rappi = plans.find((plan) => plan.cardId === 'rappi');

    expect(rappi?.analysisCycleCount).toBe(1);
    expect(rappi?.monthlyLimit).toBe(0);
    expect(rappi?.isRecommended).toBe(false);
    expect(getRecommendedCreditCardUsagePlan(plans)).toBeNull();
  });
});
