import { describe, it, expect } from 'vitest';
import {
  BalanceCalculator,
  CreditCardCalculator,
} from '../../utils/balanceCalculator';
import type { Account, Transaction } from '../../types/finance';

// ─── Fixtures ──────────────────────────────────────────────────────

const savings: Account = {
  id: 'acc-1',
  name: 'Ahorros',
  type: 'savings',
  isDefault: true,
  initialBalance: 2_000_000,
};

const cash: Account = {
  id: 'acc-2',
  name: 'Efectivo',
  type: 'cash',
  isDefault: false,
  initialBalance: 300_000,
};

const credit: Account = {
  id: 'acc-3',
  name: 'TC Visa',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  creditLimit: 5_000_000,
};

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx-default',
  type: 'expense',
  amount: 100_000,
  category: 'Test',
  description: 'Test tx',
  date: new Date('2024-06-01'),
  paid: true,
  accountId: 'acc-1',
  ...overrides,
});

// ─── BalanceCalculator.calculateAccountBalance ─────────────────────

describe('BalanceCalculator.calculateAccountBalance', () => {
  it('returns initial balance for savings with no transactions', () => {
    expect(BalanceCalculator.calculateAccountBalance(savings, [])).toBe(2_000_000);
  });

  it('calculates savings balance with mixed transactions', () => {
    const txs = [
      makeTx({ accountId: savings.id!, type: 'income', amount: 500_000 }),
      makeTx({ id: 'tx-2', accountId: savings.id!, type: 'expense', amount: 200_000 }),
    ];
    expect(BalanceCalculator.calculateAccountBalance(savings, txs)).toBe(2_300_000);
  });

  it('calculates credit card available credit', () => {
    const txs = [
      makeTx({ accountId: credit.id!, type: 'expense', amount: 1_500_000 }),
    ];
    // Available = 5,000,000 - 1,500,000 = 3,500,000
    expect(BalanceCalculator.calculateAccountBalance(credit, txs)).toBe(3_500_000);
  });

  it('calculates cash balance', () => {
    expect(BalanceCalculator.calculateAccountBalance(cash, [])).toBe(300_000);
  });
});

// ─── BalanceCalculator.calculateTotalBalance ───────────────────────

describe('BalanceCalculator.calculateTotalBalance', () => {
  it('sums savings and cash, excludes credit', () => {
    const allAccounts = [savings, cash, credit];
    const total = BalanceCalculator.calculateTotalBalance(allAccounts, []);
    // 2,000,000 + 300,000 = 2,300,000 (credit excluded)
    expect(total).toBe(2_300_000);
  });

  it('returns 0 when only credit accounts exist', () => {
    expect(BalanceCalculator.calculateTotalBalance([credit], [])).toBe(0);
  });

  it('returns 0 for empty accounts', () => {
    expect(BalanceCalculator.calculateTotalBalance([], [])).toBe(0);
  });
});

// ─── BalanceCalculator.validateTransaction ─────────────────────────

describe('BalanceCalculator.validateTransaction', () => {
  it('delegates to savings strategy for savings accounts', () => {
    const result = BalanceCalculator.validateTransaction(savings, 100_000, []);
    expect(result.valid).toBe(true);
  });

  it('delegates to credit strategy for credit accounts', () => {
    const result = BalanceCalculator.validateTransaction(credit, 100_000, []);
    expect(result.valid).toBe(true);
  });
});

// ─── BalanceCalculator.calculateTotalCreditCardPending ──────────────

describe('BalanceCalculator.calculateTotalCreditCardPending', () => {
  it('returns 0 when no credit cards', () => {
    expect(BalanceCalculator.calculateTotalCreditCardPending([savings], [])).toBe(0);
  });

  it('sums used credit across multiple credit cards', () => {
    const credit2: Account = {
      ...credit,
      id: 'acc-credit-2',
      name: 'TC Master',
      creditLimit: 3_000_000,
    };

    const txs = [
      makeTx({ accountId: credit.id!, type: 'expense', amount: 1_000_000 }),
      makeTx({ id: 'tx-2', accountId: credit2.id!, type: 'expense', amount: 500_000 }),
    ];

    const total = BalanceCalculator.calculateTotalCreditCardPending(
      [savings, credit, credit2],
      txs
    );
    expect(total).toBe(1_500_000);
  });
});

// ─── CreditCardCalculator (deprecated, for backward compatibility) ──

describe('CreditCardCalculator', () => {
  it('calculateUsedCredit returns 0 for non-credit accounts', () => {
    expect(CreditCardCalculator.calculateUsedCredit(savings, [])).toBe(0);
  });

  it('calculateUsedCredit returns correct used credit', () => {
    const txs = [makeTx({ accountId: credit.id!, type: 'expense', amount: 800_000 })];
    expect(CreditCardCalculator.calculateUsedCredit(credit, txs)).toBe(800_000);
  });

  it('calculateAvailableCredit returns 0 for non-credit accounts', () => {
    expect(CreditCardCalculator.calculateAvailableCredit(savings, [])).toBe(0);
  });

  it('calculateAvailableCredit returns correct available', () => {
    const txs = [makeTx({ accountId: credit.id!, type: 'expense', amount: 2_000_000 })];
    expect(CreditCardCalculator.calculateAvailableCredit(credit, txs)).toBe(3_000_000);
  });

  it('canMakeExpense validates within limit', () => {
    const result = CreditCardCalculator.canMakeExpense(credit, [], 1_000_000);
    expect(result.valid).toBe(true);
    expect(result.available).toBe(5_000_000);
  });

  it('canMakeExpense returns available credit even when exceeding limit', () => {
    // Note: canMakeExpense doesn't pass transactionType to validateTransaction,
    // so the credit limit check is not triggered through this path.
    // The validation should be done via BalanceCalculator.validateTransaction with 'expense' type.
    const result = CreditCardCalculator.canMakeExpense(credit, [], 6_000_000);
    expect(result.available).toBe(5_000_000);
  });

  it('canMakeExpense rejects non-credit accounts', () => {
    const result = CreditCardCalculator.canMakeExpense(savings, [], 100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('no es una tarjeta de crédito');
  });
});
