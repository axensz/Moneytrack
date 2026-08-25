import type { PaymentInstrument } from '../types/transactionImport';

export type PaymentInstrumentMatch =
  | {
    status: 'matched';
    accountId: string;
    instrumentId: string;
  }
  | { status: 'none' }
  | { status: 'ambiguous' };

export function matchPaymentInstrument(
  cardLast4: string | undefined,
  instruments: readonly PaymentInstrument[],
): PaymentInstrumentMatch {
  if (!cardLast4) return { status: 'none' };

  const matches = instruments.filter(instrument => (
    instrument.active && instrument.last4 === cardLast4
  ));

  if (matches.length === 0) return { status: 'none' };
  if (matches.length > 1) return { status: 'ambiguous' };

  return {
    status: 'matched',
    accountId: matches[0].accountId,
    instrumentId: matches[0].id,
  };
}
