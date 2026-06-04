import type { Account, Transaction } from '../types/finance';

/**
 * Returns all historical ids that should be treated as belonging to an account.
 *
 * `mergeCreditCards` rewrites transaction references to the destination card, but
 * keeping source ids on the destination lets read paths remain correct while a
 * merge is in flight or when older data still references a deleted source card.
 */
export function getAccountReferenceIds(account: Account): string[] {
  return Array.from(new Set([account.id, ...(account.mergedAccountIds ?? [])].filter(Boolean) as string[]));
}

export function transactionUsesAccount(transaction: Transaction, account: Account): boolean {
  const accountIds = getAccountReferenceIds(account);
  return accountIds.includes(transaction.accountId) || (transaction.toAccountId ? accountIds.includes(transaction.toAccountId) : false);
}

export function transactionAccountIs(transaction: Transaction, account: Account): boolean {
  return getAccountReferenceIds(account).includes(transaction.accountId);
}

export function transactionDestinationIs(transaction: Transaction, account: Account): boolean {
  return Boolean(transaction.toAccountId && getAccountReferenceIds(account).includes(transaction.toAccountId));
}

export function findAccountForTransaction(
  accounts: Account[],
  accountId: string | undefined
): Account | undefined {
  if (!accountId) return undefined;
  return accounts.find(account => getAccountReferenceIds(account).includes(accountId));
}
