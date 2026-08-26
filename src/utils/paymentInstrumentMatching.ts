import type { PaymentInstrument } from '../types/transactionImport';

export type PaymentInstrumentMatch =
  | {
    status: 'matched';
    accountId: string;
    instrumentId: string;
  }
  | { status: 'none' }
  | { status: 'ambiguous' }
  | { status: 'conflict' };

export interface PaymentInstrumentEvidence {
  cardLast4?: string;
  observedInstrumentLabel?: string;
}

export function normalizePaymentInstrumentLabel(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-CO');
}

const resolveMatches = (
  matches: readonly PaymentInstrument[],
): PaymentInstrumentMatch => {
  if (matches.length === 0) return { status: 'none' };
  if (matches.length > 1) return { status: 'ambiguous' };
  return {
    status: 'matched',
    accountId: matches[0].accountId,
    instrumentId: matches[0].id,
  };
};

export function matchPaymentInstrument(
  evidence: PaymentInstrumentEvidence,
  instruments: readonly PaymentInstrument[],
): PaymentInstrumentMatch {
  const active = instruments.filter(instrument => instrument.active);
  const normalizedLabel = evidence.observedInstrumentLabel
    ? normalizePaymentInstrumentLabel(evidence.observedInstrumentLabel)
    : '';
  const hasLast4 = Boolean(evidence.cardLast4);
  const hasLabel = Boolean(normalizedLabel);
  if (!hasLast4 && !hasLabel) return { status: 'none' };

  const last4Matches = hasLast4
    ? active.filter(instrument => instrument.last4 === evidence.cardLast4)
    : [];
  const labelMatches = hasLabel
    ? active.filter(instrument => (
      instrument.kind === 'wallet-token'
      && normalizePaymentInstrumentLabel(instrument.label) === normalizedLabel
    ))
    : [];

  if (hasLast4 && hasLabel) {
    const labelIds = new Set(labelMatches.map(instrument => instrument.id));
    const intersection = last4Matches.filter(instrument => labelIds.has(instrument.id));
    if (intersection.length > 0) return resolveMatches(intersection);
    return last4Matches.length > 0 || labelMatches.length > 0
      ? { status: 'conflict' }
      : { status: 'none' };
  }

  return resolveMatches(hasLast4 ? last4Matches : labelMatches);
}
