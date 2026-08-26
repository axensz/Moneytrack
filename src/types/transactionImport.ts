export type PaymentInstrumentKind = 'physical-card' | 'wallet-token';

export type PaymentInstrumentNetwork =
  | 'visa'
  | 'mastercard'
  | 'amex'
  | 'other'
  | 'unknown';

export interface PaymentInstrument {
  id: string;
  schemaVersion: 1 | 2;
  label: string;
  accountId: string;
  kind: PaymentInstrumentKind;
  last4?: string;
  network: PaymentInstrumentNetwork;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type TransactionImportConfidence = 'high' | 'medium';
export type TransactionImportStatus = 'pending' | 'confirmed' | 'dismissed';

interface TransactionImportCandidateBase {
  id: string;
  schemaVersion: 1 | 2;
  source: 'android-notification';
  sourcePackage: string;
  occurredAt: Date;
  amountMinor: number;
  currency: 'COP';
  merchant: string;
  cardLast4?: string;
  observedInstrumentLabel?: string;
  parserId: 'strict-cop-purchase' | 'google-wallet-purchase';
  parserVersion: 1;
  confidence: TransactionImportConfidence;
}

export interface PendingTransactionImportCandidate
  extends TransactionImportCandidateBase {
  status: 'pending';
}

export interface ConfirmedTransactionImportCandidate
  extends TransactionImportCandidateBase {
  status: 'confirmed';
  transactionId: string;
  confirmedAt: Date;
}

export interface DismissedTransactionImportCandidate
  extends TransactionImportCandidateBase {
  status: 'dismissed';
  dismissedAt: Date;
}

export type TransactionImportCandidate =
  | PendingTransactionImportCandidate
  | ConfirmedTransactionImportCandidate
  | DismissedTransactionImportCandidate;
