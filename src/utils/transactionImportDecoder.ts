import type {
  PaymentInstrument,
  PaymentInstrumentKind,
  PaymentInstrumentNetwork,
  TransactionImportCandidate,
  TransactionImportConfidence,
  TransactionImportStatus,
} from '../types/transactionImport';

export type TransactionImportDecodeEntity =
  | 'payment-instrument'
  | 'transaction-import-candidate';

export type TransactionImportDecodeIssueCode =
  | 'invalid-document'
  | 'unknown-field'
  | 'invalid-field'
  | 'invalid-state';

export interface TransactionImportDecodeIssue {
  code: TransactionImportDecodeIssueCode;
  entity: TransactionImportDecodeEntity;
  documentId: string;
  message: string;
  field?: string;
}

export interface TransactionImportDocumentLike {
  id: string;
  data(): unknown;
}

export type PaymentInstrumentDecodeResult =
  | { ok: true; instrument: PaymentInstrument }
  | { ok: false; issue: TransactionImportDecodeIssue };

export type TransactionImportCandidateDecodeResult =
  | { ok: true; candidate: TransactionImportCandidate }
  | { ok: false; issue: TransactionImportDecodeIssue };

const PAYMENT_INSTRUMENT_FIELDS = new Set([
  'schemaVersion',
  'label',
  'accountId',
  'kind',
  'last4',
  'network',
  'active',
  'createdAt',
  'updatedAt',
]);

const TRANSACTION_IMPORT_CANDIDATE_FIELDS = new Set([
  'schemaVersion',
  'source',
  'sourcePackage',
  'occurredAt',
  'amountMinor',
  'currency',
  'merchant',
  'cardLast4',
  'observedInstrumentLabel',
  'parserId',
  'parserVersion',
  'confidence',
  'status',
  'transactionId',
  'confirmedAt',
  'dismissedAt',
]);

const PAYMENT_INSTRUMENT_KINDS = new Set<PaymentInstrumentKind>([
  'physical-card',
  'wallet-token',
]);

const PAYMENT_INSTRUMENT_NETWORKS = new Set<PaymentInstrumentNetwork>([
  'visa',
  'mastercard',
  'amex',
  'other',
  'unknown',
]);

const TRANSACTION_IMPORT_CONFIDENCES = new Set<TransactionImportConfidence>([
  'high',
  'medium',
]);

const TRANSACTION_IMPORT_STATUSES = new Set<TransactionImportStatus>([
  'pending',
  'confirmed',
  'dismissed',
]);

const TRANSACTION_IMPORT_CANDIDATE_ID = /^[0-9a-f]{64}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const decodeTimestamp = (value: unknown): Date | null => {
  let date: Date;
  if (value instanceof Date) {
    date = new Date(value.getTime());
  } else if (isRecord(value) && typeof value.toDate === 'function') {
    try {
      const converted = value.toDate();
      if (!(converted instanceof Date)) return null;
      date = new Date(converted.getTime());
    } catch {
      return null;
    }
  } else {
    return null;
  }
  return Number.isFinite(date.getTime()) ? date : null;
};

const unknownField = (
  data: Record<string, unknown>,
  allowedFields: ReadonlySet<string>,
): string | undefined => Object.keys(data).find(key => !allowedFields.has(key));

const invalidIssue = (
  entity: TransactionImportDecodeEntity,
  documentId: string,
  code: TransactionImportDecodeIssueCode,
  field?: string,
): TransactionImportDecodeIssue => ({
  code,
  entity,
  documentId,
  field,
  message: field
    ? `El documento ${documentId} tiene un valor inválido en ${field}.`
    : `El documento ${documentId} no cumple el contrato esperado.`,
});

const hasBoundedText = (
  value: unknown,
  maximumLength: number,
): value is string => (
  typeof value === 'string'
  && value.trim().length > 0
  && value.length <= maximumLength
);

const isLast4 = (value: unknown): value is string => (
  typeof value === 'string' && /^\d{4}$/.test(value)
);

export function decodePaymentInstrument(
  document: TransactionImportDocumentLike,
): PaymentInstrumentDecodeResult {
  const entity = 'payment-instrument';
  const data = document.data();
  if (!isRecord(data)) {
    return {
      ok: false,
      issue: invalidIssue(entity, document.id, 'invalid-document'),
    };
  }

  const extraField = unknownField(data, PAYMENT_INSTRUMENT_FIELDS);
  if (extraField) {
    return {
      ok: false,
      issue: invalidIssue(entity, document.id, 'unknown-field', extraField),
    };
  }

  if (data.schemaVersion !== 1 && data.schemaVersion !== 2) {
    return {
      ok: false,
      issue: invalidIssue(entity, document.id, 'invalid-field', 'schemaVersion'),
    };
  }
  if (!hasBoundedText(data.label, 80)) {
    return {
      ok: false,
      issue: invalidIssue(entity, document.id, 'invalid-field', 'label'),
    };
  }
  if (!hasBoundedText(data.accountId, 1_500)) {
    return {
      ok: false,
      issue: invalidIssue(entity, document.id, 'invalid-field', 'accountId'),
    };
  }
  if (
    typeof data.kind !== 'string'
    || !PAYMENT_INSTRUMENT_KINDS.has(data.kind as PaymentInstrumentKind)
  ) {
    return {
      ok: false,
      issue: invalidIssue(entity, document.id, 'invalid-field', 'kind'),
    };
  }
  const requiresLast4 = data.schemaVersion === 1 || data.kind === 'physical-card';
  if (
    (requiresLast4 && !isLast4(data.last4))
    || (!requiresLast4 && data.last4 !== undefined && !isLast4(data.last4))
  ) {
    return {
      ok: false,
      issue: invalidIssue(entity, document.id, 'invalid-field', 'last4'),
    };
  }
  if (
    typeof data.network !== 'string'
    || !PAYMENT_INSTRUMENT_NETWORKS.has(data.network as PaymentInstrumentNetwork)
  ) {
    return {
      ok: false,
      issue: invalidIssue(entity, document.id, 'invalid-field', 'network'),
    };
  }
  if (typeof data.active !== 'boolean') {
    return {
      ok: false,
      issue: invalidIssue(entity, document.id, 'invalid-field', 'active'),
    };
  }

  const createdAt = decodeTimestamp(data.createdAt);
  if (!createdAt) {
    return {
      ok: false,
      issue: invalidIssue(entity, document.id, 'invalid-field', 'createdAt'),
    };
  }
  const updatedAt = decodeTimestamp(data.updatedAt);
  if (!updatedAt) {
    return {
      ok: false,
      issue: invalidIssue(entity, document.id, 'invalid-field', 'updatedAt'),
    };
  }

  return {
    ok: true,
    instrument: {
      id: document.id,
      schemaVersion: data.schemaVersion,
      label: data.label,
      accountId: data.accountId,
      kind: data.kind as PaymentInstrumentKind,
      ...(isLast4(data.last4) ? { last4: data.last4 } : {}),
      network: data.network as PaymentInstrumentNetwork,
      active: data.active,
      createdAt,
      updatedAt,
    },
  };
}

const invalidCandidate = (
  documentId: string,
  code: TransactionImportDecodeIssueCode,
  field?: string,
): TransactionImportCandidateDecodeResult => ({
  ok: false,
  issue: invalidIssue(
    'transaction-import-candidate',
    documentId,
    code,
    field,
  ),
});

export function decodeTransactionImportCandidate(
  document: TransactionImportDocumentLike,
): TransactionImportCandidateDecodeResult {
  if (!TRANSACTION_IMPORT_CANDIDATE_ID.test(document.id)) {
    return invalidCandidate(document.id, 'invalid-document');
  }
  const data = document.data();
  if (!isRecord(data)) return invalidCandidate(document.id, 'invalid-document');

  const extraField = unknownField(data, TRANSACTION_IMPORT_CANDIDATE_FIELDS);
  if (extraField) return invalidCandidate(document.id, 'unknown-field', extraField);

  if (data.schemaVersion !== 1 && data.schemaVersion !== 2) {
    return invalidCandidate(document.id, 'invalid-field', 'schemaVersion');
  }
  if (data.source !== 'android-notification') {
    return invalidCandidate(document.id, 'invalid-field', 'source');
  }
  if (!hasBoundedText(data.sourcePackage, 160)) {
    return invalidCandidate(document.id, 'invalid-field', 'sourcePackage');
  }

  const occurredAt = decodeTimestamp(data.occurredAt);
  if (!occurredAt) {
    return invalidCandidate(document.id, 'invalid-field', 'occurredAt');
  }
  if (
    typeof data.amountMinor !== 'number'
    || !Number.isInteger(data.amountMinor)
    || data.amountMinor <= 0
    || data.amountMinor > 100_000_000_000
  ) {
    return invalidCandidate(document.id, 'invalid-field', 'amountMinor');
  }
  if (data.currency !== 'COP') {
    return invalidCandidate(document.id, 'invalid-field', 'currency');
  }
  if (!hasBoundedText(data.merchant, 140)) {
    return invalidCandidate(document.id, 'invalid-field', 'merchant');
  }
  if (data.cardLast4 !== undefined && !isLast4(data.cardLast4)) {
    return invalidCandidate(document.id, 'invalid-field', 'cardLast4');
  }
  if (
    data.observedInstrumentLabel !== undefined
    && (
      !hasBoundedText(data.observedInstrumentLabel, 24)
      || !/^\p{L}+$/u.test(data.observedInstrumentLabel)
    )
  ) {
    return invalidCandidate(document.id, 'invalid-field', 'observedInstrumentLabel');
  }
  const validParserContract = data.schemaVersion === 1
    ? data.parserId === 'strict-cop-purchase'
      && data.observedInstrumentLabel === undefined
    : data.parserId === 'google-wallet-purchase'
      && data.sourcePackage === 'com.google.android.apps.walletnfcrel';
  if (!validParserContract) {
    return invalidCandidate(document.id, 'invalid-field', 'parserId');
  }
  if (data.parserVersion !== 1) {
    return invalidCandidate(document.id, 'invalid-field', 'parserVersion');
  }
  if (
    typeof data.confidence !== 'string'
    || !TRANSACTION_IMPORT_CONFIDENCES.has(
      data.confidence as TransactionImportConfidence,
    )
  ) {
    return invalidCandidate(document.id, 'invalid-field', 'confidence');
  }
  if (
    typeof data.status !== 'string'
    || !TRANSACTION_IMPORT_STATUSES.has(data.status as TransactionImportStatus)
  ) {
    return invalidCandidate(document.id, 'invalid-field', 'status');
  }

  const common = {
    id: document.id,
    schemaVersion: data.schemaVersion as 1 | 2,
    source: 'android-notification' as const,
    sourcePackage: data.sourcePackage,
    occurredAt,
    amountMinor: data.amountMinor,
    currency: 'COP' as const,
    merchant: data.merchant,
    ...(data.cardLast4 === undefined ? {} : { cardLast4: data.cardLast4 }),
    ...(data.observedInstrumentLabel === undefined
      ? {}
      : { observedInstrumentLabel: data.observedInstrumentLabel }),
    parserId: data.parserId as 'strict-cop-purchase' | 'google-wallet-purchase',
    parserVersion: 1 as const,
    confidence: data.confidence as TransactionImportConfidence,
  };

  if (data.status === 'pending') {
    const terminalField = ['transactionId', 'confirmedAt', 'dismissedAt']
      .find(field => data[field] !== undefined);
    if (terminalField) {
      return invalidCandidate(document.id, 'invalid-state', terminalField);
    }
    return {
      ok: true,
      candidate: { ...common, status: 'pending' },
    };
  }

  if (data.status === 'confirmed') {
    if (typeof data.transactionId !== 'string' || data.transactionId.trim().length === 0) {
      return invalidCandidate(document.id, 'invalid-state', 'transactionId');
    }
    const confirmedAt = decodeTimestamp(data.confirmedAt);
    if (!confirmedAt) {
      return invalidCandidate(document.id, 'invalid-state', 'confirmedAt');
    }
    if (data.dismissedAt !== undefined) {
      return invalidCandidate(document.id, 'invalid-state', 'dismissedAt');
    }
    return {
      ok: true,
      candidate: {
        ...common,
        status: 'confirmed',
        transactionId: data.transactionId,
        confirmedAt,
      },
    };
  }

  if (data.transactionId !== undefined) {
    return invalidCandidate(document.id, 'invalid-state', 'transactionId');
  }
  if (data.confirmedAt !== undefined) {
    return invalidCandidate(document.id, 'invalid-state', 'confirmedAt');
  }
  const dismissedAt = decodeTimestamp(data.dismissedAt);
  if (!dismissedAt) {
    return invalidCandidate(document.id, 'invalid-state', 'dismissedAt');
  }
  return {
    ok: true,
    candidate: {
      ...common,
      status: 'dismissed',
      dismissedAt,
    },
  };
}
