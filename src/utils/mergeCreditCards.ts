/**
 * Utilidad pura para merge de tarjetas de crédito.
 *
 * NOTA: La implementación con side-effects (Firestore/localStorage) está en
 * `useAccounts.ts` → `mergeCreditCards`. Esta función sirve como lógica de
 * dominio inmutable para testing y posibles usos futuros sin acoplamiento a I/O.
 */
import type { Account, Transaction } from '../types/finance';
import { getAccountReferenceIds } from './accountTransactions';
import { getCreditCardUsedCredit } from './accountStrategies';

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

  // Consolidar la deuda: el destino asume el cupo utilizado de todas las tarjetas
  // unificadas (destino + orígenes). Se calcula con las transacciones ORIGINALES
  // por tarjeta para no doble-contar al reapuntarlas al destino.
  const mergedUsedCredit = [destinationCard, ...(sourceCards.filter(Boolean) as Account[])].reduce(
    (sum, card) =>
      sum +
      (card.usedCredit != null
        ? Math.max(0, card.usedCredit)
        : getCreditCardUsedCredit(card, transactions)),
    0
  );

  const mergedDestination: Account = {
    ...destinationCard,
    bankAccountId: destinationCard.bankAccountId ?? sourceCards.find(card => card?.bankAccountId)?.bankAccountId,
    creditLimit: destinationCard.creditLimit ?? sourceCards.find(card => card?.creditLimit !== undefined)?.creditLimit,
    mergedAccountIds: Array.from(new Set(destinationReferenceIds.filter(id => id && id !== destinationCard.id))),
    usedCredit: mergedUsedCredit,
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
