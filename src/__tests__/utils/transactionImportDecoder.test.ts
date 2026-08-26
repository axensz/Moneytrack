import { describe, expect, it } from 'vitest';
import {
  decodePaymentInstrument,
  decodeTransactionImportCandidate,
} from '../../utils/transactionImportDecoder';

const timestamp = (iso: string) => ({
  toDate: () => new Date(iso),
});

const document = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
});

const validInstrument = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  label: 'Visa del celular',
  accountId: 'credit-account-1',
  kind: 'wallet-token',
  last4: '1234',
  network: 'visa',
  active: true,
  createdAt: timestamp('2026-08-25T12:00:00.000Z'),
  updatedAt: timestamp('2026-08-25T12:01:00.000Z'),
  ...overrides,
});

const validPendingCandidate = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  source: 'android-notification',
  sourcePackage: 'com.example.bank',
  occurredAt: timestamp('2026-08-25T13:00:00.000Z'),
  amountMinor: 1_234_567,
  currency: 'COP',
  merchant: 'Comercio de prueba',
  cardLast4: '1234',
  parserId: 'strict-cop-purchase',
  parserVersion: 1,
  confidence: 'high',
  status: 'pending',
  ...overrides,
});

const withoutLast4 = (value: Record<string, unknown>) => {
  const result = { ...value };
  delete result.last4;
  return result;
};

const validWalletCandidate = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  source: 'android-notification',
  sourcePackage: 'com.google.android.apps.walletnfcrel',
  occurredAt: timestamp('2026-08-25T13:00:00.000Z'),
  amountMinor: 260_000,
  currency: 'COP',
  merchant: 'OXXO EDS PORTAL DE NIQ',
  observedInstrumentLabel: 'Oro',
  parserId: 'google-wallet-purchase',
  parserVersion: 1,
  confidence: 'medium',
  status: 'pending',
  ...overrides,
});

const pendingCandidateId = 'a'.repeat(64);
const mediumCandidateId = 'b'.repeat(64);
const confirmedCandidateId = 'c'.repeat(64);
const dismissedCandidateId = 'd'.repeat(64);
const invalidFieldCandidateId = 'e'.repeat(64);
const invalidStateCandidateId = 'f'.repeat(64);
const sensitiveCandidateId = '0'.repeat(64);

describe('transactionImportDecoder', () => {
  describe('decodePaymentInstrument', () => {
    it('decodes every persisted field without coercing its values', () => {
      const result = decodePaymentInstrument(
        document('instrument-1', validInstrument()),
      );

      expect(result).toEqual({
        ok: true,
        instrument: {
          id: 'instrument-1',
          schemaVersion: 1,
          label: 'Visa del celular',
          accountId: 'credit-account-1',
          kind: 'wallet-token',
          last4: '1234',
          network: 'visa',
          active: true,
          createdAt: new Date('2026-08-25T12:00:00.000Z'),
          updatedAt: new Date('2026-08-25T12:01:00.000Z'),
        },
      });
    });

    it('decodes a v2 Wallet token identified only by its nickname', () => {
      const data = withoutLast4(validInstrument({
        schemaVersion: 2,
        label: 'Oro',
      }));

      expect(decodePaymentInstrument(document('wallet-alias', data))).toEqual({
        ok: true,
        instrument: {
          id: 'wallet-alias',
          schemaVersion: 2,
          label: 'Oro',
          accountId: 'credit-account-1',
          kind: 'wallet-token',
          network: 'visa',
          active: true,
          createdAt: new Date('2026-08-25T12:00:00.000Z'),
          updatedAt: new Date('2026-08-25T12:01:00.000Z'),
        },
      });
    });

    it('requires last four for v1 and physical-card instruments', () => {
      const legacy = withoutLast4(validInstrument());
      const physical = withoutLast4(validInstrument({
        schemaVersion: 2,
        kind: 'physical-card',
      }));

      for (const [id, data] of [['legacy', legacy], ['physical', physical]] as const) {
        expect(decodePaymentInstrument(document(id, data))).toEqual({
          ok: false,
          issue: expect.objectContaining({ field: 'last4' }),
        });
      }
    });

    it.each([
      ['schemaVersion', { schemaVersion: 3 }],
      ['label', { label: '' }],
      ['label', { label: 'x'.repeat(81) }],
      ['accountId', { accountId: '   ' }],
      ['kind', { kind: 'virtual-card' }],
      ['last4', { last4: '12a4' }],
      ['network', { network: 'diners' }],
      ['active', { active: 'yes' }],
      ['createdAt', { createdAt: '2026-08-25T12:00:00.000Z' }],
      ['updatedAt', { updatedAt: { toDate: () => new Date('invalid') } }],
    ] as const)('rejects an invalid %s instead of guessing', (field, overrides) => {
      const result = decodePaymentInstrument(
        document('instrument-invalid', validInstrument(overrides)),
      );

      expect(result).toEqual({
        ok: false,
        issue: expect.objectContaining({
          entity: 'payment-instrument',
          documentId: 'instrument-invalid',
          field,
        }),
      });
    });

    it.each(['pan', 'cvv', 'otp', 'rawPayload', 'title', 'unexpected'])(
      'rejects the forbidden or unknown key %s',
      key => {
        const result = decodePaymentInstrument(
          document('instrument-sensitive', validInstrument({ [key]: 'secret' })),
        );

        expect(result).toEqual({
          ok: false,
          issue: expect.objectContaining({
            entity: 'payment-instrument',
            documentId: 'instrument-sensitive',
            code: 'unknown-field',
            field: key,
          }),
        });
      },
    );
  });

  describe('decodeTransactionImportCandidate', () => {
    it('decodes a pending candidate with all optional observed fields', () => {
      const result = decodeTransactionImportCandidate(
        document(pendingCandidateId, validPendingCandidate()),
      );

      expect(result).toEqual({
        ok: true,
        candidate: {
          id: pendingCandidateId,
          schemaVersion: 1,
          source: 'android-notification',
          sourcePackage: 'com.example.bank',
          occurredAt: new Date('2026-08-25T13:00:00.000Z'),
          amountMinor: 1_234_567,
          currency: 'COP',
          merchant: 'Comercio de prueba',
          cardLast4: '1234',
          parserId: 'strict-cop-purchase',
          parserVersion: 1,
          confidence: 'high',
          status: 'pending',
        },
      });
    });

    it('decodes a medium-confidence candidate without card digits', () => {
      const data: Record<string, unknown> = validPendingCandidate({ confidence: 'medium' });
      delete data.cardLast4;

      const result = decodeTransactionImportCandidate(
        document(mediumCandidateId, data),
      );

      expect(result).toEqual({
        ok: true,
        candidate: expect.objectContaining({
          id: mediumCandidateId,
          confidence: 'medium',
          status: 'pending',
        }),
      });
      if (result.ok) expect(result.candidate).not.toHaveProperty('cardLast4');
    });

    it('decodes a Wallet v2 candidate with an observed nickname hint', () => {
      const result = decodeTransactionImportCandidate(
        document(mediumCandidateId, validWalletCandidate()),
      );

      expect(result).toEqual({
        ok: true,
        candidate: expect.objectContaining({
          id: mediumCandidateId,
          schemaVersion: 2,
          sourcePackage: 'com.google.android.apps.walletnfcrel',
          amountMinor: 260_000,
          observedInstrumentLabel: 'Oro',
          parserId: 'google-wallet-purchase',
          parserVersion: 1,
          confidence: 'medium',
          status: 'pending',
        }),
      });
    });

    it('rejects mixed candidate schema and parser contracts', () => {
      for (const [id, data] of [
        ['1'.repeat(64), validPendingCandidate({ parserId: 'google-wallet-purchase' })],
        ['2'.repeat(64), validWalletCandidate({ parserId: 'strict-cop-purchase' })],
      ] as const) {
        expect(decodeTransactionImportCandidate(document(id, data))).toEqual({
          ok: false,
          issue: expect.objectContaining({ field: 'parserId' }),
        });
      }
    });

    it('rejects an overlong observed Wallet nickname', () => {
      const result = decodeTransactionImportCandidate(document(
        mediumCandidateId,
        validWalletCandidate({ observedInstrumentLabel: 'a'.repeat(25) }),
      ));

      expect(result).toEqual({
        ok: false,
        issue: expect.objectContaining({ field: 'observedInstrumentLabel' }),
      });
    });

    it('decodes only the fields allowed for each terminal state', () => {
      const confirmed = decodeTransactionImportCandidate(document(
        confirmedCandidateId,
        validPendingCandidate({
          status: 'confirmed',
          transactionId: `ledger-mutation:android:${confirmedCandidateId}`,
          confirmedAt: timestamp('2026-08-25T13:10:00.000Z'),
        }),
      ));
      const dismissed = decodeTransactionImportCandidate(document(
        dismissedCandidateId,
        validPendingCandidate({
          status: 'dismissed',
          dismissedAt: timestamp('2026-08-25T13:11:00.000Z'),
        }),
      ));

      expect(confirmed).toEqual({
        ok: true,
        candidate: expect.objectContaining({
          id: confirmedCandidateId,
          status: 'confirmed',
          transactionId: `ledger-mutation:android:${confirmedCandidateId}`,
          confirmedAt: new Date('2026-08-25T13:10:00.000Z'),
        }),
      });
      expect(dismissed).toEqual({
        ok: true,
        candidate: expect.objectContaining({
          id: dismissedCandidateId,
          status: 'dismissed',
          dismissedAt: new Date('2026-08-25T13:11:00.000Z'),
        }),
      });
    });

    it.each([
      ['schemaVersion', { schemaVersion: 3 }],
      ['source', { source: 'manual' }],
      ['sourcePackage', { sourcePackage: '' }],
      ['sourcePackage', { sourcePackage: 'p'.repeat(161) }],
      ['occurredAt', { occurredAt: 1_777_000_000_000 }],
      ['amountMinor', { amountMinor: 0 }],
      ['amountMinor', { amountMinor: 1.5 }],
      ['amountMinor', { amountMinor: 100_000_000_001 }],
      ['currency', { currency: 'USD' }],
      ['merchant', { merchant: '' }],
      ['merchant', { merchant: 'm'.repeat(141) }],
      ['cardLast4', { cardLast4: '123' }],
      ['parserId', { parserId: 'generic-parser' }],
      ['parserVersion', { parserVersion: 2 }],
      ['confidence', { confidence: 'low' }],
      ['status', { status: 'reviewing' }],
    ] as const)('rejects an invalid %s instead of coercing it', (field, overrides) => {
      const result = decodeTransactionImportCandidate(
        document(invalidFieldCandidateId, validPendingCandidate(overrides)),
      );

      expect(result).toEqual({
        ok: false,
        issue: expect.objectContaining({
          entity: 'transaction-import-candidate',
          documentId: invalidFieldCandidateId,
          field,
        }),
      });
    });

    it.each([
      [{ transactionId: 'tx-on-pending' }, 'transactionId'],
      [{ confirmedAt: timestamp('2026-08-25T13:10:00.000Z') }, 'confirmedAt'],
      [{ dismissedAt: timestamp('2026-08-25T13:10:00.000Z') }, 'dismissedAt'],
      [{ status: 'confirmed' }, 'transactionId'],
      [{
        status: 'confirmed',
        transactionId: 'tx-1',
        confirmedAt: timestamp('2026-08-25T13:10:00.000Z'),
        dismissedAt: timestamp('2026-08-25T13:11:00.000Z'),
      }, 'dismissedAt'],
      [{ status: 'dismissed' }, 'dismissedAt'],
      [{
        status: 'dismissed',
        dismissedAt: timestamp('2026-08-25T13:11:00.000Z'),
        transactionId: 'tx-1',
      }, 'transactionId'],
    ] as const)('rejects an illegal status-field combination', (overrides, field) => {
      const result = decodeTransactionImportCandidate(
        document(invalidStateCandidateId, validPendingCandidate(overrides)),
      );

      expect(result).toEqual({
        ok: false,
        issue: expect.objectContaining({
          entity: 'transaction-import-candidate',
          documentId: invalidStateCandidateId,
          code: 'invalid-state',
          field,
        }),
      });
    });

    it.each([
      'title',
      'text',
      'bigText',
      'subText',
      'rawPayload',
      'pan',
      'cvv',
      'otp',
      'unexpected',
    ])('rejects the forbidden or unknown key %s', key => {
      const result = decodeTransactionImportCandidate(
        document(sensitiveCandidateId, validPendingCandidate({ [key]: 'secret' })),
      );

      expect(result).toEqual({
        ok: false,
        issue: expect.objectContaining({
          entity: 'transaction-import-candidate',
          documentId: sensitiveCandidateId,
          code: 'unknown-field',
          field: key,
        }),
      });
    });

    it.each([
      'a'.repeat(63),
      'g'.repeat(64),
      'A'.repeat(64),
    ])('rejects malformed candidate document id %s', candidateId => {
      const result = decodeTransactionImportCandidate(
        document(candidateId, validPendingCandidate()),
      );

      expect(result).toEqual({
        ok: false,
        issue: expect.objectContaining({
          entity: 'transaction-import-candidate',
          documentId: candidateId,
          code: 'invalid-document',
        }),
      });
    });
  });
});
