import type { Transaction } from '../types/finance';
import { normalizeLedgerAmount } from './ledgerMutation';

export type TransactionDecodeIssueCode =
  | 'invalid-type'
  | 'invalid-amount'
  | 'invalid-paid'
  | 'invalid-account'
  | 'invalid-destination'
  | 'invalid-date'
  | 'invalid-created-at'
  | 'invalid-text'
  | 'invalid-financial-field';

export interface TransactionDecodeIssue {
  code: TransactionDecodeIssueCode;
  transactionId: string;
  message: string;
  field?: string;
}

export type TransactionDecodeResult =
  | { ok: true; transaction: Transaction }
  | { ok: false; issue: TransactionDecodeIssue };

export interface TransactionDocumentLike {
  id: string;
  data(): Record<string, unknown>;
}

const invalid = (
  transactionId: string,
  code: TransactionDecodeIssueCode,
  message: string,
  field?: string,
): TransactionDecodeResult => ({
  ok: false,
  issue: { code, transactionId, message, field },
});

const decodeDate = (value: unknown): Date | null => {
  let date: Date;
  if (value instanceof Date) date = new Date(value.getTime());
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value);
  else if (
    value
    && typeof value === 'object'
    && typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    const converted = (value as { toDate(): unknown }).toDate();
    if (!(converted instanceof Date)) return null;
    date = new Date(converted.getTime());
  } else return null;
  return Number.isFinite(date.getTime()) ? date : null;
};

const FINANCIAL_FIELDS = [
  'totalInterestAmount',
  'monthlyInstallmentAmount',
  'interestRate',
  'originalAmount',
  'exchangeRate',
  'expectedBefore',
  'targetBalance',
] as const;

export function decodeTransactionDocument(
  document: TransactionDocumentLike,
): TransactionDecodeResult {
  const data = document.data();
  const type = data.type;
  if (type !== 'income' && type !== 'expense' && type !== 'transfer') {
    return invalid(
      document.id,
      'invalid-type',
      `La transacción ${document.id} tiene un tipo inválido.`,
      'type',
    );
  }

  let amount: number;
  try {
    amount = normalizeLedgerAmount(data.amount as number);
  } catch {
    return invalid(
      document.id,
      'invalid-amount',
      `La transacción ${document.id} tiene un monto inválido.`,
      'amount',
    );
  }
  if (typeof data.paid !== 'boolean') {
    return invalid(
      document.id,
      'invalid-paid',
      `La transacción ${document.id} tiene un estado de pago inválido.`,
      'paid',
    );
  }
  if (typeof data.accountId !== 'string' || data.accountId.trim().length === 0) {
    return invalid(
      document.id,
      'invalid-account',
      `La transacción ${document.id} tiene una cuenta inválida.`,
      'accountId',
    );
  }
  if (
    type === 'transfer'
    && (
      typeof data.toAccountId !== 'string'
      || data.toAccountId.trim().length === 0
      || data.toAccountId === data.accountId
    )
  ) {
    return invalid(
      document.id,
      'invalid-destination',
      `La transferencia ${document.id} tiene un destino inválido.`,
      'toAccountId',
    );
  }
  if (typeof data.category !== 'string' || typeof data.description !== 'string') {
    return invalid(
      document.id,
      'invalid-text',
      `La transacción ${document.id} tiene categoría o descripción inválida.`,
    );
  }

  const date = decodeDate(data.date);
  if (!date) {
    return invalid(
      document.id,
      'invalid-date',
      `La transacción ${document.id} tiene una fecha inválida.`,
      'date',
    );
  }
  const createdAt = data.createdAt === undefined ? undefined : decodeDate(data.createdAt);
  if (data.createdAt !== undefined && !createdAt) {
    return invalid(
      document.id,
      'invalid-created-at',
      `La transacción ${document.id} tiene una fecha de creación inválida.`,
      'createdAt',
    );
  }

  const invalidFinancialField = FINANCIAL_FIELDS.find(field => (
    data[field] !== undefined
    && (typeof data[field] !== 'number' || !Number.isFinite(data[field]))
  ));
  if (invalidFinancialField) {
    return invalid(
      document.id,
      'invalid-financial-field',
      `La transacción ${document.id} tiene ${invalidFinancialField} inválido.`,
      invalidFinancialField,
    );
  }

  return {
    ok: true,
    transaction: {
      ...data,
      id: document.id,
      type,
      amount,
      category: data.category,
      description: data.description,
      date,
      createdAt,
      paid: data.paid,
      accountId: data.accountId,
      toAccountId: typeof data.toAccountId === 'string' ? data.toAccountId : undefined,
    } as Transaction,
  };
}

export function collectDecodedTransactions(
  documents: readonly TransactionDocumentLike[],
): { transactions: Transaction[]; issues: TransactionDecodeIssue[] } {
  const transactions: Transaction[] = [];
  const issues: TransactionDecodeIssue[] = [];
  documents.forEach(document => {
    const result = decodeTransactionDocument(document);
    if (result.ok) transactions.push(result.transaction);
    else issues.push(result.issue);
  });
  return { transactions, issues };
}

export class TransactionDecodeError extends Error {
  readonly issue: TransactionDecodeIssue;

  constructor(issue: TransactionDecodeIssue) {
    super(issue.message);
    this.name = 'TransactionDecodeError';
    this.issue = issue;
  }
}

export function requireDecodedTransaction(document: TransactionDocumentLike): Transaction {
  const result = decodeTransactionDocument(document);
  if (!result.ok) throw new TransactionDecodeError(result.issue);
  return result.transaction;
}
