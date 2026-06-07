import { describe, expect, it } from 'vitest';
import { calculateCreditUsedFromTransactions } from '../../hooks/firestore/useCreditMigration';
import type { Account, Transaction } from '../../types/finance';

const gold: Account = {
  id: 'gold',
  name: 'Gold',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  creditLimit: 10_000_000,
  usedCredit: 0,
};

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  type: 'expense',
  amount: 0,
  category: 'Otros',
  description: '',
  date: new Date('2026-06-01'),
  paid: true,
  accountId: 'gold',
  ...overrides,
});

describe('calculateCreditUsedFromTransactions', () => {
  it('calculates pending credit from expenses minus direct and transfer payments', () => {
    const transactions: Transaction[] = [
      tx({ amount: 407_450, category: 'Salud' }),
      tx({ id: 'market', amount: 13_000, category: 'Mercado' }),
      tx({ id: 'payment', type: 'income', amount: 100_000, category: 'Pago Crédito' }),
      tx({
        id: 'transfer-payment',
        type: 'transfer',
        amount: 50_000,
        accountId: 'bank',
        toAccountId: 'gold',
      }),
    ];

    expect(calculateCreditUsedFromTransactions(gold, transactions)).toBe(270_450);
  });

  it('includes transactions from merged card ids', () => {
    const mergedGold = { ...gold, mergedAccountIds: ['old-gold'] };
    const transactions: Transaction[] = [
      tx({ accountId: 'old-gold', amount: 200_000 }),
      tx({ id: 'payment', type: 'income', accountId: 'gold', amount: 75_000 }),
    ];

    expect(calculateCreditUsedFromTransactions(mergedGold, transactions)).toBe(125_000);
  });
});
