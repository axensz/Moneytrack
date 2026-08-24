import { describe, expect, it } from 'vitest';
import {
  collectDecodedTransactions,
  decodeTransactionDocument,
  requireDecodedTransaction,
} from '../../utils/transactionDecoder';

const validData = () => ({
  type: 'expense',
  amount: 12_345.67,
  category: 'Mercado',
  description: 'Compra',
  date: { toDate: () => new Date('2026-08-24T12:00:00.000Z') },
  createdAt: '2026-08-24T12:01:00.000Z',
  paid: true,
  accountId: 'account-1',
});

const document = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  data: () => ({ ...validData(), ...overrides }),
});

describe('transactionDecoder', () => {
  it('normalizes a valid document once for every reader', () => {
    const result = decodeTransactionDocument(document('tx-valid'));

    expect(result).toEqual({
      ok: true,
      transaction: expect.objectContaining({
        id: 'tx-valid',
        type: 'expense',
        amount: 12_345.67,
        date: new Date('2026-08-24T12:00:00.000Z'),
        createdAt: new Date('2026-08-24T12:01:00.000Z'),
      }),
    });
    expect(requireDecodedTransaction(document('tx-valid')).id).toBe('tx-valid');
  });

  it.each([
    ['invalid-type', { type: 'refund' }],
    ['invalid-amount', { amount: Number.NaN }],
    ['invalid-amount', { amount: 0 }],
    ['invalid-amount', { amount: 12_345.678 }],
    ['invalid-paid', { paid: 'yes' }],
    ['invalid-account', { accountId: '' }],
    ['invalid-destination', { type: 'transfer', toAccountId: '' }],
    ['invalid-destination', { type: 'transfer', toAccountId: 'account-1' }],
    ['invalid-date', { date: { seconds: 1 } }],
    ['invalid-created-at', { createdAt: 'not-a-date' }],
    ['invalid-text', { category: 3 }],
    ['invalid-financial-field', { totalInterestAmount: Number.POSITIVE_INFINITY }],
  ] as const)('reports %s with the source id', (code, overrides) => {
    const result = decodeTransactionDocument(document('tx-invalid', overrides));

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({
        code,
        transactionId: 'tx-invalid',
      }),
    });
    if (!result.ok) expect(result.issue.message).toContain('tx-invalid');
  });

  it('collects invalid rows instead of silently dropping their evidence', () => {
    const result = collectDecodedTransactions([
      document('valid-1'),
      document('bad-date', { date: null }),
      document('bad-amount', { amount: -1 }),
    ]);

    expect(result.transactions.map(transaction => transaction.id)).toEqual(['valid-1']);
    expect(result.issues).toEqual([
      expect.objectContaining({ transactionId: 'bad-date', code: 'invalid-date' }),
      expect.objectContaining({ transactionId: 'bad-amount', code: 'invalid-amount' }),
    ]);
  });

  it('throws the same reason when a strict mutation reader requires the row', () => {
    expect(() => requireDecodedTransaction(document('bad-paid', { paid: null })))
      .toThrow(/bad-paid.*pago/i);
  });
});
