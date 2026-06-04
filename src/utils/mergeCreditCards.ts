import type { Account, Transaction } from '../types/finance';
import { getAccountReferenceIds } from './accountTransactions';

export interface MergeCreditCardsInput {
  accounts: Account[];
  transactions: Transaction[];
  destinationCardId: string;
  sourceCardIds: string[];
}

export interface MergeCreditCardsResult {
  accounts: Account[];
  transactions: Transaction[];
  destinationCard: Account;
  migratedTransactionCount: number;
}

/**
 * Merges one or more source credit cards into a destination card.
 *
 * The destination card remains in `accounts`, source cards are removed, and any
 * transaction whose origin or destination points to a source card is rewritten to
 * the destination card. Historical source ids are also kept in
 * `destinationCard.mergedAccountIds` so read paths can still resolve legacy data
 * during sync windows or partial migrations.
 */
export function mergeCreditCards({
  accounts,
  transactions,
  destinationCardId,
  sourceCardIds,
}: MergeCreditCardsInput): MergeCreditCardsResult {
  const destinationCard = accounts.find(account => account.id === destinationCardId);
  if (!destinationCard) {
    throw new Error('La tarjeta destino no existe');
  }
  if (destinationCard.type !== 'credit') {
    throw new Error('La cuenta destino debe ser una tarjeta de crédito');
  }

  const uniqueSourceIds = Array.from(new Set(sourceCardIds.filter(id => id && id !== destinationCardId)));
  const sourceCards = uniqueSourceIds.map(id => accounts.find(account => account.id === id));
  const missingSourceId = uniqueSourceIds.find((_, index) => !sourceCards[index]);
  if (missingSourceId) {
    throw new Error(`La tarjeta origen ${missingSourceId} no existe`);
  }

  const nonCreditSource = sourceCards.find(account => account?.type !== 'credit');
  if (nonCreditSource) {
    throw new Error('Todas las cuentas origen deben ser tarjetas de crédito');
  }

  const sourceIdSet = new Set(uniqueSourceIds);
  const destinationReferenceIds = [
    ...getAccountReferenceIds(destinationCard),
    ...uniqueSourceIds,
    ...sourceCards.flatMap(card => card?.mergedAccountIds ?? []),
  ];

  const mergedDestination: Account = {
    ...destinationCard,
    bankAccountId: destinationCard.bankAccountId ?? sourceCards.find(card => card?.bankAccountId)?.bankAccountId,
    creditLimit: destinationCard.creditLimit ?? sourceCards.find(card => card?.creditLimit !== undefined)?.creditLimit,
    mergedAccountIds: Array.from(new Set(destinationReferenceIds.filter(id => id && id !== destinationCard.id))),
  };

  let migratedTransactionCount = 0;
  const migratedTransactions = transactions.map(transaction => {
    const shouldMigrateAccount = sourceIdSet.has(transaction.accountId);
    const shouldMigrateDestination = Boolean(transaction.toAccountId && sourceIdSet.has(transaction.toAccountId));

    if (!shouldMigrateAccount && !shouldMigrateDestination) return transaction;

    migratedTransactionCount++;
    return {
      ...transaction,
      accountId: shouldMigrateAccount ? destinationCardId : transaction.accountId,
      toAccountId: shouldMigrateDestination ? destinationCardId : transaction.toAccountId,
    };
  });

  const mergedAccounts = accounts
    .filter(account => !sourceIdSet.has(account.id ?? ''))
    .map(account => account.id === destinationCardId ? mergedDestination : account);

  return {
    accounts: mergedAccounts,
    transactions: migratedTransactions,
    destinationCard: mergedDestination,
    migratedTransactionCount,
  };
}
