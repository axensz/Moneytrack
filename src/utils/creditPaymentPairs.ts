import { CREDIT_PAYMENT_CATEGORY } from '../config/constants';
import type { Account, Transaction } from '../types/finance';
import { ensureDate } from './dateUtils';
import { roundMoney } from './formatters';
import { getAccountReferenceIds } from './accountTransactions';

export const CURRENT_PAYMENT_PAIR_MODEL_VERSION = 1;

export interface CreditPaymentPair {
  creditTransactionId: string;
  sourceTransactionId: string;
}

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');

const isCreditPaymentCategory = (category: string): boolean =>
  category === CREDIT_PAYMENT_CATEGORY || category === 'Pago TC';

export type CreditPaymentPairIssue =
  | 'MISSING_COUNTERPART'
  | 'NON_RECIPROCAL_LINK'
  | 'WRONG_ROLE'
  | 'WRONG_ACCOUNT'
  | 'CATEGORY_MISMATCH'
  | 'BENEFICIARY_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'DATE_MISMATCH'
  | 'PAID_MISMATCH';

export type CreditPaymentPairValidation =
  | {
      valid: true;
      creditTransaction: Transaction;
      sourceTransaction: Transaction;
    }
  | { valid: false; reason: CreditPaymentPairIssue };

export function validateCreditPaymentPair(
  creditTransaction: Transaction,
  sourceTransaction: Transaction | undefined,
  account: Account
): CreditPaymentPairValidation {
  if (!sourceTransaction) return { valid: false, reason: 'MISSING_COUNTERPART' };
  if (
    !creditTransaction.id ||
    !sourceTransaction.id ||
    creditTransaction.linkedTransactionId !== sourceTransaction.id ||
    sourceTransaction.linkedTransactionId !== creditTransaction.id
  ) {
    return { valid: false, reason: 'NON_RECIPROCAL_LINK' };
  }
  if (creditTransaction.type !== 'income' || sourceTransaction.type !== 'expense') {
    return { valid: false, reason: 'WRONG_ROLE' };
  }

  const creditAccountIds = getAccountReferenceIds(account);
  if (
    account.type !== 'credit' ||
    !creditAccountIds.includes(creditTransaction.accountId) ||
    creditAccountIds.includes(sourceTransaction.accountId)
  ) {
    return { valid: false, reason: 'WRONG_ACCOUNT' };
  }
  if (
    !isCreditPaymentCategory(creditTransaction.category) ||
    !isCreditPaymentCategory(sourceTransaction.category)
  ) {
    return { valid: false, reason: 'CATEGORY_MISMATCH' };
  }
  if (
    normalizeText(creditTransaction.beneficiary ?? '') !==
    normalizeText(sourceTransaction.beneficiary ?? '')
  ) {
    return { valid: false, reason: 'BENEFICIARY_MISMATCH' };
  }
  if (roundMoney(creditTransaction.amount) !== roundMoney(sourceTransaction.amount)) {
    return { valid: false, reason: 'AMOUNT_MISMATCH' };
  }
  if (ensureDate(creditTransaction.date).getTime() !== ensureDate(sourceTransaction.date).getTime()) {
    return { valid: false, reason: 'DATE_MISMATCH' };
  }
  if (creditTransaction.paid !== sourceTransaction.paid) {
    return { valid: false, reason: 'PAID_MISMATCH' };
  }

  return { valid: true, creditTransaction, sourceTransaction };
}

/**
 * Reconoce exclusivamente el formato que Moneytrack genera al pagar una TC.
 * La igualdad de monto, instante y descripción evita enlazar por aproximación
 * dos pagos históricos legítimos que casualmente tengan el mismo valor.
 */
export function isHistoricalCreditPaymentPair(
  creditTransaction: Transaction,
  sourceTransaction: Transaction,
  account: Account
): boolean {
  if (!creditTransaction.id || !sourceTransaction.id) return false;
  if (creditTransaction.linkedTransactionId || sourceTransaction.linkedTransactionId) return false;
  if (creditTransaction.type !== 'income' || sourceTransaction.type !== 'expense') return false;
  if (!isCreditPaymentCategory(creditTransaction.category) || !isCreditPaymentCategory(sourceTransaction.category)) {
    return false;
  }
  if (!getAccountReferenceIds(account).includes(creditTransaction.accountId)) return false;
  if (Math.abs(creditTransaction.amount - sourceTransaction.amount) > 0.01) return false;
  if (ensureDate(creditTransaction.date).getTime() !== ensureDate(sourceTransaction.date).getTime()) return false;

  const detail = creditTransaction.description.trim();
  const expectedSourceDescription = `Pago a ${account.name}${detail ? `: ${detail}` : ''}`;
  return normalizeText(sourceTransaction.description) === normalizeText(expectedSourceDescription);
}

/** Devuelve solo pares uno-a-uno. Ante cualquier ambigüedad no migra nada. */
export function findHistoricalCreditPaymentPairs(
  account: Account,
  transactions: readonly Transaction[]
): CreditPaymentPair[] {
  const creditCandidates = transactions.filter(transaction =>
    transaction.type === 'income' &&
    !transaction.linkedTransactionId &&
    Boolean(transaction.id) &&
    isCreditPaymentCategory(transaction.category) &&
    getAccountReferenceIds(account).includes(transaction.accountId)
  );
  const sourceCandidates = transactions.filter(transaction =>
    transaction.type === 'expense' &&
    !transaction.linkedTransactionId &&
    Boolean(transaction.id) &&
    isCreditPaymentCategory(transaction.category)
  );

  const matchesByCredit = new Map<string, Transaction[]>();
  const matchesBySource = new Map<string, Transaction[]>();
  for (const credit of creditCandidates) {
    const matches = sourceCandidates.filter(source => isHistoricalCreditPaymentPair(credit, source, account));
    matchesByCredit.set(credit.id!, matches);
    for (const source of matches) {
      matchesBySource.set(source.id!, [...(matchesBySource.get(source.id!) ?? []), credit]);
    }
  }

  return creditCandidates.flatMap(credit => {
    const matches = matchesByCredit.get(credit.id!) ?? [];
    if (matches.length !== 1) return [];
    const [source] = matches;
    if ((matchesBySource.get(source.id!) ?? []).length !== 1) return [];
    return [{ creditTransactionId: credit.id!, sourceTransactionId: source.id! }];
  });
}
