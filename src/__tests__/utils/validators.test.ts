import { describe, it, expect } from 'vitest';
import { TransactionValidator, AccountValidator, CategoryValidator } from '../../utils/validators';
import type { Account, NewTransaction, NewAccount, Transaction } from '../../types/finance';

const baseTransaction: NewTransaction = {
  type: 'expense',
  amount: '50000',
  category: 'Alimentación',
  description: 'Supermercado',
  date: '2024-01-15',
  paid: true,
  accountId: 'acc-1',
  toAccountId: '',
  hasInterest: false,
  installments: 1,
};

describe('TransactionValidator', () => {
  describe('validate (basic, without account)', () => {
    it('passes valid expense transaction', () => {
      const result = TransactionValidator.validate(baseTransaction);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes when description is empty (description is optional)', () => {
      const result = TransactionValidator.validate({ ...baseTransaction, description: '' });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes when description is whitespace-only (description is optional)', () => {
      const result = TransactionValidator.validate({ ...baseTransaction, description: '   ' });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes when description is valid (MT-P0-02)', () => {
      const result = TransactionValidator.validate({ ...baseTransaction, description: 'Compra válida' });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when amount is zero', () => {
      const result = TransactionValidator.validate({ ...baseTransaction, amount: '0' });
      expect(result.isValid).toBe(false);
    });

    it('fails when amount is negative', () => {
      const result = TransactionValidator.validate({ ...baseTransaction, amount: '-100' });
      expect(result.isValid).toBe(false);
    });

    it('fails when amount is NaN', () => {
      const result = TransactionValidator.validate({ ...baseTransaction, amount: 'abc' });
      expect(result.isValid).toBe(false);
    });

    it('fails when category is empty for expense', () => {
      const result = TransactionValidator.validate({ ...baseTransaction, category: '' });
      expect(result.isValid).toBe(false);
    });

    it('allows empty category for transfer type', () => {
      const transfer: NewTransaction = {
        ...baseTransaction,
        type: 'transfer',
        category: '',
        toAccountId: 'acc-2',
      };
      const result = TransactionValidator.validate(transfer);
      expect(result.isValid).toBe(true);
    });

    it('fails transfer without toAccountId', () => {
      const transfer: NewTransaction = {
        ...baseTransaction,
        type: 'transfer',
        toAccountId: '',
      };
      const result = TransactionValidator.validate(transfer);
      expect(result.isValid).toBe(false);
    });

    it('fails transfer to same account', () => {
      const transfer: NewTransaction = {
        ...baseTransaction,
        type: 'transfer',
        toAccountId: 'acc-1',
      };
      const result = TransactionValidator.validate(transfer);
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateAmount', () => {
    it('passes valid amounts', () => {
      expect(TransactionValidator.validateAmount('100').isValid).toBe(true);
      expect(TransactionValidator.validateAmount(500).isValid).toBe(true);
    });

    it('fails for zero or negative', () => {
      expect(TransactionValidator.validateAmount('0').isValid).toBe(false);
      expect(TransactionValidator.validateAmount(-1).isValid).toBe(false);
    });

    it('fails for NaN', () => {
      expect(TransactionValidator.validateAmount('abc').isValid).toBe(false);
    });
  });

  describe('ledger planner adapter', () => {
    const savings: Account = {
      id: 'acc-1',
      name: 'Ahorros',
      type: 'savings',
      isDefault: true,
      initialBalance: 100,
    };

    it('does not reserve funds for a pending expense', () => {
      const result = TransactionValidator.validate(
        { ...baseTransaction, amount: '150', paid: false },
        savings,
        []
      );

      expect(result).toEqual({ isValid: true, errors: [] });
    });

    it('rejects editing an income downward when the complete before/after plan crosses below zero', () => {
      const original: Transaction = {
        id: 'income',
        type: 'income',
        amount: 100,
        category: 'Ingresos',
        description: 'Ingreso',
        date: new Date('2026-08-01T12:00:00.000Z'),
        paid: true,
        accountId: 'acc-1',
      };
      const expense: Transaction = {
        id: 'expense',
        type: 'expense',
        amount: 180,
        category: 'Gastos',
        description: 'Gasto',
        date: new Date('2026-08-02T12:00:00.000Z'),
        paid: true,
        accountId: 'acc-1',
      };

      const result = TransactionValidator.validate(
        { ...baseTransaction, type: 'income', amount: '50' },
        savings,
        [original, expense],
        original
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/Saldo insuficiente/i);
    });

    it.each([
      ['absent', undefined],
      ['negative', -1],
      ['non-finite', Number.POSITIVE_INFINITY],
    ])('blocks a card preview when persisted authority is %s', (_caseName, usedCredit) => {
      const card: Account = {
        id: 'card',
        name: 'Visa',
        type: 'credit',
        isDefault: false,
        initialBalance: 0,
        creditLimit: 1_000,
        usedCredit,
      };

      const result = TransactionValidator.validate(
        { ...baseTransaction, accountId: 'card', amount: '50' },
        card,
        []
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/conciliación|deuda persistida/i);
    });

    it('keeps the current form contract for a card with valid persisted authority', () => {
      const card: Account = {
        id: 'card',
        name: 'Visa',
        type: 'credit',
        isDefault: false,
        initialBalance: 0,
        creditLimit: 1_000,
        usedCredit: 100,
      };

      expect(TransactionValidator.validate(
        { ...baseTransaction, accountId: 'card', amount: '50' },
        card,
        []
      )).toEqual({ isValid: true, errors: [] });
    });
  });

  describe('validateDescription', () => {
    it('passes valid descriptions', () => {
      expect(TransactionValidator.validateDescription('Supermercado').isValid).toBe(true);
    });

    it('fails for empty', () => {
      expect(TransactionValidator.validateDescription('').isValid).toBe(false);
      expect(TransactionValidator.validateDescription('   ').isValid).toBe(false);
    });
  });
});

describe('AccountValidator', () => {
  const validSavings: NewAccount = {
    name: 'Mi Cuenta',
    type: 'savings',
    initialBalance: 100000,
    creditLimit: 0,
    cutoffDay: 1,
    paymentDay: 1,
    monthlySpendingLimit: 0,
    interestRate: 0,
  };

  const validCredit: NewAccount = {
    name: 'TC Visa',
    type: 'credit',
    initialBalance: 0,
    creditLimit: 5000000,
    cutoffDay: 15,
    paymentDay: 5,
    monthlySpendingLimit: 1500000,
    interestRate: 28.5,
  };

  it('passes valid savings account', () => {
    const result = AccountValidator.validate(validSavings);
    expect(result.isValid).toBe(true);
  });

  it('passes valid credit card account', () => {
    const result = AccountValidator.validate(validCredit);
    expect(result.isValid).toBe(true);
  });

  it('allows zero manual card cap because it means automatic analysis', () => {
    const result = AccountValidator.validate({ ...validCredit, monthlySpendingLimit: 0 });
    expect(result.isValid).toBe(true);
  });

  it('rejects manual card cap above credit limit', () => {
    const result = AccountValidator.validate({ ...validCredit, monthlySpendingLimit: 6000000 });
    expect(result.isValid).toBe(false);
  });

  it('fails when name is empty', () => {
    const result = AccountValidator.validate({ ...validSavings, name: '' });
    expect(result.isValid).toBe(false);
  });

  it('fails when credit limit is zero for credit card', () => {
    const result = AccountValidator.validate({ ...validCredit, creditLimit: 0 });
    expect(result.isValid).toBe(false);
  });

  it('fails when cutoff day is out of range', () => {
    const result = AccountValidator.validate({ ...validCredit, cutoffDay: 32 });
    expect(result.isValid).toBe(false);
  });

  it('skips balance/credit validations when editing', () => {
    const result = AccountValidator.validate({ ...validCredit, creditLimit: 0 }, true);
    expect(result.isValid).toBe(true); // Only name is validated
  });

  describe('validateName', () => {
    it('passes valid names', () => {
      expect(AccountValidator.validateName('Cuenta').isValid).toBe(true);
    });

    it('fails for empty names', () => {
      expect(AccountValidator.validateName('').isValid).toBe(false);
    });
  });

  describe('validateCreditCardConfig', () => {
    it('passes valid config', () => {
      const result = AccountValidator.validateCreditCardConfig(5000000, 15, 5);
      expect(result.isValid).toBe(true);
    });

    it('fails for invalid credit limit', () => {
      const result = AccountValidator.validateCreditCardConfig(0, 15, 5);
      expect(result.isValid).toBe(false);
    });

    it('fails for invalid cutoff day', () => {
      const result = AccountValidator.validateCreditCardConfig(5000000, 0, 5);
      expect(result.isValid).toBe(false);
    });
  });
});

describe('CategoryValidator', () => {
  it('passes valid category name', () => {
    expect(CategoryValidator.validateName('Comida').isValid).toBe(true);
  });

  it('fails for empty category name', () => {
    expect(CategoryValidator.validateName('').isValid).toBe(false);
  });

  it('detects duplicate categories', () => {
    const existing = ['Comida', 'Transporte'];
    expect(CategoryValidator.validateUnique('Comida', existing).isValid).toBe(false);
    expect(CategoryValidator.validateUnique('Salud', existing).isValid).toBe(true);
  });

  it('validates complete category', () => {
    const existing = ['Comida'];
    expect(CategoryValidator.validate('Nueva', existing).isValid).toBe(true);
    expect(CategoryValidator.validate('Comida', existing).isValid).toBe(false);
    expect(CategoryValidator.validate('', existing).isValid).toBe(false);
  });
});
