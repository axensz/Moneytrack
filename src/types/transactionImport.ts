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

interface TransactionImportCandidateCommon {
  id: string;
  occurredAt: Date;
  amountMinor: number;
  currency: 'COP';
  merchant: string;
}

export interface AndroidNotificationCandidateBase
  extends TransactionImportCandidateCommon {
  schemaVersion: 1 | 2;
  source: 'android-notification';
  sourcePackage: string;
  cardLast4?: string;
  observedInstrumentLabel?: string;
  parserId: 'strict-cop-purchase' | 'google-wallet-purchase';
  parserVersion: 1;
  confidence: TransactionImportConfidence;
  suggestedAccountId?: never;
  suggestedCategory?: never;
  createdAt?: never;
}

export interface AndroidShortcutCandidateBase
  extends TransactionImportCandidateCommon {
  schemaVersion: 3;
  source: 'android-shortcut';
  suggestedAccountId: string;
  suggestedCategory: string;
  createdAt: Date;
  sourcePackage?: never;
  cardLast4?: never;
  observedInstrumentLabel?: never;
  parserId?: never;
  parserVersion?: never;
  confidence?: never;
}

type TransactionImportCandidateBase =
  | AndroidNotificationCandidateBase
  | AndroidShortcutCandidateBase;

export type PendingTransactionImportCandidate = TransactionImportCandidateBase & {
  status: 'pending';
};

export type ConfirmedTransactionImportCandidate = TransactionImportCandidateBase & {
  status: 'confirmed';
  transactionId: string;
  confirmedAt: Date;
};

export type DismissedTransactionImportCandidate = TransactionImportCandidateBase & {
  status: 'dismissed';
  dismissedAt: Date;
};

export type TransactionImportCandidate =
  | PendingTransactionImportCandidate
  | ConfirmedTransactionImportCandidate
  | DismissedTransactionImportCandidate;
