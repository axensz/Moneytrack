import { describe, it, expect } from 'vitest';
import {
  SavingsAccountStrategy,
  CashAccountStrategy,
  CreditCardStrategy,
  AccountStrategyFactory,
  getCreditCardStrategy,
} from '../../utils/accountStrategies';
import type { Account, Transaction } from '../../types/finance';

// ─── Fixtures ──────────────────────────────────────────────────────

const makeSavings = (overrides?: Partial<Account>): Account => ({
  id: 'acc-savings',
  name: 'Ahorros',
  type: 'savings',
  isDefault: true,
  initialBalance: 1_000_000,
  ...overrides,
});

const makeCash = (overrides?: Partial<Account>): Account => ({
  id: 'acc-cash',
  name: 'Efectivo',
  type: 'cash',
  isDefault: false,
  initialBalance: 500_000,
  ...overrides,
});

const makeCredit = (overrides?: Partial<Account>): Account => ({
  id: 'acc-credit',
  name: 'TC Visa',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  creditLimit: 5_000_000,
  ...overrides,
});

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx-1',
  type: 'expense',
  amount: 100_000,
  category: 'Alimentación',
  description: 'Test',
  date: new Date('2024-06-01'),
  paid: true,
  accountId: 'acc-savings',
  ...overrides,
});

// ─── SavingsAccountStrategy ────────────────────────────────────────

describe('SavingsAccountStrategy', () => {
  const strategy = new SavingsAccountStrategy();

  it('returns initial balance when no transactions', () => {
    const acc = makeSavings();
    expect(strategy.calculateBalance(acc, [])).toBe(1_000_000);
  });

  it('adds income and subtracts expenses', () => {
    const acc = makeSavings();
    const txs = [
      makeTx({ accountId: acc.id!, type: 'income', amount: 200_000 }),
      makeTx({ id: 'tx-2', accountId: acc.id!, type: 'expense', amount: 50_000 }),
    ];
    // 1,000,000 + 200,000 - 50,000 = 1,150,000
    expect(strategy.calculateBalance(acc, txs)).toBe(1_150_000);
  });

  it('handles outgoing transfers', () => {
    const acc = makeSavings();
    const txs = [
      makeTx({ accountId: acc.id!, type: 'transfer', amount: 300_000, toAccountId: 'other' }),
    ];
    expect(strategy.calculateBalance(acc, txs)).toBe(700_000);
  });

  it('handles incoming transfers', () => {
    const acc = makeSavings();
    const txs = [
      makeTx({ accountId: 'other', type: 'transfer', amount: 150_000, toAccountId: acc.id! }),
    ];
    expect(strategy.calculateBalance(acc, txs)).toBe(1_150_000);
  });

  it('ignores unpaid transactions', () => {
    const acc = makeSavings();
    const txs = [
      makeTx({ accountId: acc.id!, type: 'expense', amount: 999_999, paid: false }),
    ];
    expect(strategy.calculateBalance(acc, txs)).toBe(1_000_000);
  });

  it('validates expense within balance', () => {
    const acc = makeSavings();
    const result = strategy.validateTransaction(acc, 500_000, [], 'expense');
    expect(result.valid).toBe(true);
  });

  it('rejects expense exceeding balance', () => {
    const acc = makeSavings();
    const result = strategy.validateTransaction(acc, 2_000_000, [], 'expense');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Saldo insuficiente');
  });

  it('includes in total balance', () => {
    expect(strategy.includeInTotalBalance()).toBe(true);
  });
});

// ─── CashAccountStrategy ──────────────────────────────────────────

describe('CashAccountStrategy', () => {
  const strategy = new CashAccountStrategy();

  it('delegates calculation to savings logic', () => {
    const acc = makeCash();
    expect(strategy.calculateBalance(acc, [])).toBe(500_000);
  });

  it('includes in total balance', () => {
    expect(strategy.includeInTotalBalance()).toBe(true);
  });
});

// ─── CreditCardStrategy ───────────────────────────────────────────

describe('CreditCardStrategy', () => {
  const strategy = new CreditCardStrategy();

  it('returns full credit limit when no transactions', () => {
    const acc = makeCredit();
    expect(strategy.calculateBalance(acc, [])).toBe(5_000_000);
  });

  it('reduces available credit by expenses', () => {
    const acc = makeCredit();
    const txs = [
      makeTx({ accountId: acc.id!, type: 'expense', amount: 1_000_000 }),
    ];
    // Available = 5,000,000 - 1,000,000 = 4,000,000
    expect(strategy.calculateBalance(acc, txs)).toBe(4_000_000);
  });

  it('considers direct payments (income) to reduce debt', () => {
    const acc = makeCredit();
    const txs = [
      makeTx({ accountId: acc.id!, type: 'expense', amount: 2_000_000 }),
      makeTx({ id: 'tx-pay', accountId: acc.id!, type: 'income', amount: 500_000 }),
    ];
    // Used = 2,000,000 - 500,000 = 1,500,000
    // Available = 5,000,000 - 1,500,000 = 3,500,000
    expect(strategy.calculateBalance(acc, txs)).toBe(3_500_000);
  });

  it('considers transfer payments to reduce debt', () => {
    const acc = makeCredit();
    const txs = [
      makeTx({ accountId: acc.id!, type: 'expense', amount: 1_000_000 }),
      makeTx({ id: 'tx-transfer', accountId: 'other', type: 'transfer', amount: 400_000, toAccountId: acc.id! }),
    ];
    // Used = 1,000,000 - 400,000 = 600,000
    // Available = 5,000,000 - 600,000 = 4,400,000
    expect(strategy.calculateBalance(acc, txs)).toBe(4_400_000);
  });

  it('used credit never goes below 0', () => {
    const acc = makeCredit();
    const txs = [
      makeTx({ accountId: acc.id!, type: 'expense', amount: 100_000 }),
      makeTx({ id: 'tx-pay', accountId: acc.id!, type: 'income', amount: 500_000 }),
    ];
    // Payments > expenses → used credit = 0, available = full limit
    expect(strategy.calculateBalance(acc, txs)).toBe(5_000_000);
  });

  it('validates expense within credit limit', () => {
    const acc = makeCredit();
    const result = strategy.validateTransaction(acc, 3_000_000, [], 'expense');
    expect(result.valid).toBe(true);
  });

  it('rejects expense exceeding available credit', () => {
    const acc = makeCredit();
    const result = strategy.validateTransaction(acc, 6_000_000, [], 'expense');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cupo insuficiente');
  });

  it('rejects payment when no debt exists', () => {
    const acc = makeCredit();
    const result = strategy.validateTransaction(acc, 100_000, [], 'income');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No hay deuda pendiente');
  });

  it('rejects payment exceeding debt', () => {
    const acc = makeCredit();
    const txs = [makeTx({ accountId: acc.id!, type: 'expense', amount: 500_000 })];
    const result = strategy.validateTransaction(acc, 600_000, txs, 'income');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No puedes pagar más');
  });

  it('blocks transfers from credit card', () => {
    const acc = makeCredit();
    const result = strategy.validateTransaction(acc, 100_000, [], 'transfer');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No se pueden realizar transferencias');
  });

  it('does not include in total balance', () => {
    expect(strategy.includeInTotalBalance()).toBe(false);
  });

  it('getUsedCredit returns used amount', () => {
    const acc = makeCredit();
    const txs = [makeTx({ accountId: acc.id!, type: 'expense', amount: 750_000 })];
    expect(strategy.getUsedCredit(acc, txs)).toBe(750_000);
  });
});

// ─── AccountStrategyFactory ────────────────────────────────────────

describe('AccountStrategyFactory', () => {
  it('returns SavingsAccountStrategy for savings', () => {
    const strategy = AccountStrategyFactory.getStrategy('savings');
    expect(strategy).toBeInstanceOf(SavingsAccountStrategy);
  });

  it('returns CashAccountStrategy for cash', () => {
    const strategy = AccountStrategyFactory.getStrategy('cash');
    expect(strategy).toBeInstanceOf(CashAccountStrategy);
  });

  it('returns CreditCardStrategy for credit', () => {
    const strategy = AccountStrategyFactory.getStrategy('credit');
    expect(strategy).toBeInstanceOf(CreditCardStrategy);
  });

  it('throws for unknown account type', () => {
    // @ts-expect-error Testing invalid type
    expect(() => AccountStrategyFactory.getStrategy('crypto')).toThrow('No existe estrategia');
  });

  it('hasStrategy returns true for registered types', () => {
    expect(AccountStrategyFactory.hasStrategy('savings')).toBe(true);
    expect(AccountStrategyFactory.hasStrategy('credit')).toBe(true);
    expect(AccountStrategyFactory.hasStrategy('cash')).toBe(true);
  });

  it('hasStrategy returns false for unregistered types', () => {
    expect(AccountStrategyFactory.hasStrategy('investment')).toBe(false);
  });
});

// ─── getCreditCardStrategy helper ──────────────────────────────────

describe('getCreditCardStrategy', () => {
  it('returns CreditCardStrategy instance', () => {
    const strategy = getCreditCardStrategy();
    expect(strategy).toBeInstanceOf(CreditCardStrategy);
  });
});
