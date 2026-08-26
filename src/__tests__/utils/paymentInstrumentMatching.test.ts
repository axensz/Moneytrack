import { describe, expect, it } from 'vitest';
import type { PaymentInstrument } from '../../types/transactionImport';
import { matchPaymentInstrument } from '../../utils/paymentInstrumentMatching';

const instrument = ({
  id,
  accountId,
  label,
  last4,
  active = true,
  kind = 'wallet-token',
  schemaVersion = 2,
}: {
  id: string;
  accountId: string;
  label: string;
  last4?: string;
  active?: boolean;
  kind?: PaymentInstrument['kind'];
  schemaVersion?: 1 | 2;
}): PaymentInstrument => ({
  id,
  schemaVersion,
  label,
  accountId,
  kind,
  ...(last4 ? { last4 } : {}),
  network: 'visa',
  active,
  createdAt: new Date('2026-08-25T12:00:00.000Z'),
  updatedAt: new Date('2026-08-25T12:00:00.000Z'),
});

describe('matchPaymentInstrument', () => {
  it('suggests one active exact last-four match', () => {
    const result = matchPaymentInstrument({ cardLast4: '1234' }, [
      instrument({
        id: 'wallet-1234',
        accountId: 'credit-account-1',
        label: 'Oro',
        last4: '1234',
      }),
      instrument({
        id: 'wallet-5678',
        accountId: 'credit-account-2',
        label: 'Nu',
        last4: '5678',
      }),
      instrument({
        id: 'old-1234',
        accountId: 'credit-account-old',
        label: 'Anterior',
        last4: '1234',
        active: false,
      }),
    ]);

    expect(result).toEqual({
      status: 'matched',
      accountId: 'credit-account-1',
      instrumentId: 'wallet-1234',
    });
  });

  it('matches a unique Wallet nickname after safe normalization', () => {
    const result = matchPaymentInstrument(
      { observedInstrumentLabel: '  MAMÁDÉBITO  ' },
      [
        instrument({
          id: 'mama-wallet',
          accountId: 'savings-account-1',
          label: 'MamáDébito',
        }),
        instrument({
          id: 'other-wallet',
          accountId: 'savings-account-2',
          label: 'Oro',
        }),
      ],
    );

    expect(result).toEqual({
      status: 'matched',
      accountId: 'savings-account-1',
      instrumentId: 'mama-wallet',
    });
  });

  it('never matches an observed Wallet nickname against a physical card', () => {
    expect(matchPaymentInstrument(
      { observedInstrumentLabel: 'Oro' },
      [instrument({
        id: 'physical',
        accountId: 'credit-account-1',
        label: 'Oro',
        last4: '1234',
        kind: 'physical-card',
      })],
    )).toEqual({ status: 'none' });
  });

  it('reports ambiguity for duplicate active nickname matches', () => {
    expect(matchPaymentInstrument(
      { observedInstrumentLabel: 'Oro' },
      [
        instrument({ id: 'one', accountId: 'account-1', label: 'Oro' }),
        instrument({ id: 'two', accountId: 'account-2', label: 'oro' }),
      ],
    )).toEqual({ status: 'ambiguous' });
  });

  it('requires nickname and last four to converge on the same instrument', () => {
    const shared = instrument({
      id: 'same',
      accountId: 'account-1',
      label: 'Oro',
      last4: '1234',
    });

    expect(matchPaymentInstrument(
      { observedInstrumentLabel: 'Oro', cardLast4: '1234' },
      [shared],
    )).toEqual({
      status: 'matched',
      accountId: 'account-1',
      instrumentId: 'same',
    });

    expect(matchPaymentInstrument(
      { observedInstrumentLabel: 'Oro', cardLast4: '9876' },
      [
        shared,
        instrument({
          id: 'other',
          accountId: 'account-2',
          label: 'Nu',
          last4: '9876',
        }),
      ],
    )).toEqual({ status: 'conflict' });
  });

  it('does not suggest inactive or unknown evidence', () => {
    expect(matchPaymentInstrument(
      { observedInstrumentLabel: 'Oro' },
      [instrument({
        id: 'inactive',
        accountId: 'account-1',
        label: 'Oro',
        active: false,
      })],
    )).toEqual({ status: 'none' });

    expect(matchPaymentInstrument(
      { observedInstrumentLabel: 'Desconocida' },
      [instrument({ id: 'known', accountId: 'account-1', label: 'Oro' })],
    )).toEqual({ status: 'none' });

    expect(matchPaymentInstrument({}, [
      instrument({ id: 'known', accountId: 'account-1', label: 'Oro' }),
    ])).toEqual({ status: 'none' });
  });
});
