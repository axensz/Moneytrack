import { describe, expect, it } from 'vitest';
import type { PaymentInstrument } from '../../types/transactionImport';
import { matchPaymentInstrument } from '../../utils/paymentInstrumentMatching';

const instrument = (
  id: string,
  accountId: string,
  last4: string,
  active = true,
): PaymentInstrument => ({
  id,
  schemaVersion: 1,
  label: `Medio ${id}`,
  accountId,
  kind: 'wallet-token',
  last4,
  network: 'visa',
  active,
  createdAt: new Date('2026-08-25T12:00:00.000Z'),
  updatedAt: new Date('2026-08-25T12:00:00.000Z'),
});

describe('matchPaymentInstrument', () => {
  it('suggests the account only for one active exact match', () => {
    const result = matchPaymentInstrument('1234', [
      instrument('wallet-1234', 'credit-account-1', '1234'),
      instrument('wallet-5678', 'credit-account-2', '5678'),
      instrument('old-1234', 'credit-account-old', '1234', false),
    ]);

    expect(result).toEqual({
      status: 'matched',
      accountId: 'credit-account-1',
      instrumentId: 'wallet-1234',
    });
  });

  it('does not suggest an inactive match', () => {
    expect(matchPaymentInstrument('1234', [
      instrument('old-1234', 'credit-account-old', '1234', false),
    ])).toEqual({ status: 'none' });
  });

  it('does not suggest when no active instrument has the observed digits', () => {
    expect(matchPaymentInstrument('9999', [
      instrument('wallet-1234', 'credit-account-1', '1234'),
    ])).toEqual({ status: 'none' });
    expect(matchPaymentInstrument(undefined, [
      instrument('wallet-1234', 'credit-account-1', '1234'),
    ])).toEqual({ status: 'none' });
  });

  it('reports ambiguity when two active instruments share the digits', () => {
    const result = matchPaymentInstrument('1234', [
      instrument('plastic', 'credit-account-1', '1234'),
      instrument('wallet', 'credit-account-1', '1234'),
    ]);

    expect(result).toEqual({ status: 'ambiguous' });
  });
});
