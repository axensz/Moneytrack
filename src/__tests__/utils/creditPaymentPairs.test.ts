import { describe, expect, it } from 'vitest';
import type { Account, Transaction } from '../../types/finance';
import {
  findHistoricalCreditPaymentPairs,
  validateCreditPaymentPair,
} from '../../utils/creditPaymentPairs';

const card: Account = {
  id: 'card',
  name: 'Visa Gold',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
};

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(),
  type: 'income',
  amount: 125_000,
  category: 'Pago Crédito',
  description: 'Junio',
  date: new Date('2026-06-10T15:30:00.000Z'),
  paid: true,
  accountId: 'card',
  ...overrides,
});

const currentPair = () => ({
  account: card,
  credit: transaction({
    id: 'credit-current',
    beneficiary: 'Banco Prueba',
    linkedTransactionId: 'source-current',
  }),
  source: transaction({
    id: 'source-current',
    type: 'expense',
    accountId: 'savings',
    beneficiary: 'Banco Prueba',
    description: 'Pago a Visa Gold: Junio',
    linkedTransactionId: 'credit-current',
  }),
});

describe('findHistoricalCreditPaymentPairs', () => {
  it('encuentra el par exacto generado por un pago histórico', () => {
    const credit = transaction({ id: 'credit' });
    const source = transaction({
      id: 'source',
      type: 'expense',
      accountId: 'savings',
      description: 'Pago a Visa Gold: Junio',
    });

    expect(findHistoricalCreditPaymentPairs(card, [credit, source])).toEqual([
      { creditTransactionId: 'credit', sourceTransactionId: 'source' },
    ]);
  });

  it('no enlaza candidatos ambiguos con el mismo monto, fecha y descripción', () => {
    const credit = transaction({ id: 'credit' });
    const sourceA = transaction({ id: 'source-a', type: 'expense', accountId: 'a', description: 'Pago a Visa Gold: Junio' });
    const sourceB = transaction({ id: 'source-b', type: 'expense', accountId: 'b', description: 'Pago a Visa Gold: Junio' });

    expect(findHistoricalCreditPaymentPairs(card, [credit, sourceA, sourceB])).toEqual([]);
  });

  it('no enlaza por aproximación si cambia fecha, monto o descripción', () => {
    const credit = transaction({ id: 'credit' });
    const wrongDate = transaction({
      id: 'wrong-date', type: 'expense', accountId: 'savings',
      description: 'Pago a Visa Gold: Junio', date: new Date('2026-06-10T15:30:01.000Z'),
    });
    const wrongAmount = transaction({
      id: 'wrong-amount', type: 'expense', accountId: 'savings',
      description: 'Pago a Visa Gold: Junio', amount: 124_999,
    });
    const wrongDescription = transaction({
      id: 'wrong-description', type: 'expense', accountId: 'savings',
      description: 'Pago a otra tarjeta: Junio',
    });

    expect(findHistoricalCreditPaymentPairs(card, [credit, wrongDate, wrongAmount, wrongDescription])).toEqual([]);
  });

  it('ignora movimientos que ya tienen vínculo', () => {
    const credit = transaction({ id: 'credit', linkedTransactionId: 'source' });
    const source = transaction({
      id: 'source', type: 'expense', accountId: 'savings',
      description: 'Pago a Visa Gold: Junio', linkedTransactionId: 'credit',
    });

    expect(findHistoricalCreditPaymentPairs(card, [credit, source])).toEqual([]);
  });
});

describe('validateCreditPaymentPair', () => {
  const invalidCases: Array<[
    string,
    Partial<Transaction>,
    Partial<Transaction> | undefined,
    string,
  ]> = [
    ['missing counterpart', {}, undefined, 'MISSING_COUNTERPART'],
    ['one-way link', {}, { linkedTransactionId: undefined }, 'NON_RECIPROCAL_LINK'],
    ['wrong role', {}, { type: 'income' }, 'WRONG_ROLE'],
    ['wrong credit account', { accountId: 'other-card' }, {}, 'WRONG_ACCOUNT'],
    ['credit account as source', {}, { accountId: 'card' }, 'WRONG_ACCOUNT'],
    ['wrong category', {}, { category: 'Comida' }, 'CATEGORY_MISMATCH'],
    ['different beneficiary', {}, { beneficiary: 'Otro banco' }, 'BENEFICIARY_MISMATCH'],
    ['different amount', {}, { amount: 99_999 }, 'AMOUNT_MISMATCH'],
    [
      'different date',
      {},
      { date: new Date('2026-08-25T12:00:00-05:00') },
      'DATE_MISMATCH',
    ],
    ['different paid state', {}, { paid: false }, 'PAID_MISMATCH'],
  ];

  it.each(invalidCases)('rejects a %s', (_name, creditOverrides, sourceOverrides, reason) => {
    const { account, credit, source } = currentPair();
    const candidate = sourceOverrides === undefined
      ? undefined
      : { ...source, ...sourceOverrides };

    expect(
      validateCreditPaymentPair({ ...credit, ...creditOverrides }, candidate, account)
    ).toEqual({ valid: false, reason });
  });

  it('accepts an exact current reciprocal pair', () => {
    const { account, credit, source } = currentPair();

    expect(validateCreditPaymentPair(credit, source, account)).toEqual({
      valid: true,
      creditTransaction: credit,
      sourceTransaction: source,
    });
  });
});
