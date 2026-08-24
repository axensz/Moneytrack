/**
 * One-time credit authority migration.
 *
 * Every card is rechecked after acquiring the shared ledger lease. The server
 * account, complete transaction history, reciprocal links, model versions,
 * authority repair, and release tombstone are then committed as one batch.
 */

import { useEffect, useRef } from 'react';
import { doc } from 'firebase/firestore';
import { db } from '../../lib/firebaseDb';
import type { Account, Transaction } from '../../types/finance';
import { logger } from '../../utils/logger';
import {
  CURRENT_CREDIT_DEBT_MODEL_VERSION,
  reconcileUsedCredit,
} from '../../utils/creditDeltas';
import {
  CURRENT_PAYMENT_PAIR_MODEL_VERSION,
  findHistoricalCreditPaymentPairs,
} from '../../utils/creditPaymentPairs';
import {
  executeAuthenticatedLedgerMutation,
  loadServerLedgerTransactions,
} from './ledgerMutationOrchestration';

export function calculateCreditUsedFromTransactions(
  account: Pick<Account, 'id' | 'mergedAccountIds'>,
  transactions: Transaction[]
): number {
  if (!account.id) return 0;

  return reconcileUsedCredit([account.id, ...(account.mergedAccountIds ?? [])], transactions);
}

const hasValidCreditAuthority = (account: Account): boolean =>
  typeof account.usedCredit === 'number' &&
  Number.isFinite(account.usedCredit) &&
  account.usedCredit >= 0;

export interface CreditMigrationResult {
  changed: boolean;
  accountName: string;
  usedCredit?: number;
  linkedPairCount: number;
}

export async function migrateServerCreditAccount(
  userId: string,
  accountId: string
): Promise<CreditMigrationResult> {
  return executeAuthenticatedLedgerMutation<CreditMigrationResult>(
    userId,
    async ({ operationId, loadContext }) => {
      const context = await loadContext([accountId]);
      const canonicalId = context.canonicalAccountId(accountId);
      const account = context.accounts.find(candidate => candidate.id === canonicalId);
      if (!account || account.type !== 'credit') {
        throw new Error('La tarjeta que se iba a migrar ya no existe');
      }

      const migrateDebtAuthority =
        account.creditDebtModelVersion !== CURRENT_CREDIT_DEBT_MODEL_VERSION ||
        !hasValidCreditAuthority(account);
      const migratePaymentPairs =
        account.paymentPairModelVersion !== CURRENT_PAYMENT_PAIR_MODEL_VERSION;

      if (!migrateDebtAuthority && !migratePaymentPairs) {
        return {
          intent: {
            kind: 'migration' as const,
            before: [],
            after: [],
            metadata: { operationId, mutationSource: 'migration' as const },
          },
          context,
          writeCount: 0,
          stage: () => undefined,
          result: {
            changed: false,
            accountName: account.name,
            linkedPairCount: 0,
          },
        };
      }

      const completeTransactions = migratePaymentPairs
        ? await loadServerLedgerTransactions(userId)
        : [];
      const pairs = migratePaymentPairs
        ? findHistoricalCreditPaymentPairs(account, completeTransactions)
        : [];
      const transactionById = new Map(
        completeTransactions.flatMap(transaction =>
          transaction.id ? [[transaction.id, transaction] as const] : []
        )
      );
      const pairRows = pairs.flatMap(pair => {
        const credit = transactionById.get(pair.creditTransactionId);
        const source = transactionById.get(pair.sourceTransactionId);
        return credit && source ? [credit, source] : [];
      });
      if (pairRows.length !== pairs.length * 2) {
        throw new Error('El historial de pagos cambió durante la migración');
      }

      const usedCredit = migrateDebtAuthority
        ? calculateCreditUsedFromTransactions(account, [...context.transactions])
        : account.usedCredit;
      const accountUpdates: Record<string, unknown> = {};
      if (migrateDebtAuthority) {
        accountUpdates.usedCredit = usedCredit;
        accountUpdates.creditDebtModelVersion = CURRENT_CREDIT_DEBT_MODEL_VERSION;
      }
      if (migratePaymentPairs) {
        accountUpdates.paymentPairModelVersion = CURRENT_PAYMENT_PAIR_MODEL_VERSION;
      }

      return {
        intent: {
          kind: 'migration' as const,
          before: [],
          after: [],
          metadata: { operationId, mutationSource: 'migration' as const },
        },
        context,
        writeCount: pairRows.length + 1,
        stage: (batch) => {
          pairs.forEach(pair => {
            batch.update(
              doc(db, `users/${userId}/transactions`, pair.creditTransactionId),
              {
                linkedTransactionId: pair.sourceTransactionId,
                operationId,
                mutationKind: 'migration',
                mutationSource: 'migration',
              }
            );
            batch.update(
              doc(db, `users/${userId}/transactions`, pair.sourceTransactionId),
              {
                linkedTransactionId: pair.creditTransactionId,
                operationId,
                mutationKind: 'migration',
                mutationSource: 'migration',
              }
            );
          });
          batch.update(
            doc(db, `users/${userId}/accounts`, canonicalId),
            accountUpdates
          );
        },
        result: {
          changed: true,
          accountName: account.name,
          usedCredit: migrateDebtAuthority ? usedCredit : undefined,
          linkedPairCount: pairs.length,
        },
      };
    }
  );
}

const needsCreditMigration = (account: Account): boolean =>
  account.type === 'credit' &&
  Boolean(account.id) &&
  (
    account.creditDebtModelVersion !== CURRENT_CREDIT_DEBT_MODEL_VERSION ||
    account.paymentPairModelVersion !== CURRENT_PAYMENT_PAIR_MODEL_VERSION ||
    !hasValidCreditAuthority(account)
  );

export function useCreditMigration(userId: string | null, accounts: Account[]) {
  const migratingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    const candidateIds = accounts
      .filter(needsCreditMigration)
      .map(account => account.id!)
      .filter(accountId => !migratingRef.current.has(accountId));
    if (candidateIds.length === 0) return;

    const migrate = async () => {
      for (const accountId of candidateIds) {
        migratingRef.current.add(accountId);
        try {
          const result = await migrateServerCreditAccount(userId, accountId);
          if (result.changed) {
            logger.info(
              `Migrated credit authority for ${result.accountName}: ` +
              `${result.usedCredit ?? 'unchanged'}, ${result.linkedPairCount} linked pair(s)`
            );
          }
        } catch (error) {
          migratingRef.current.delete(accountId);
          logger.error(`Error migrating credit authority for ${accountId}`, error);
        }
      }
    };

    void migrate();
  }, [userId, accounts]);
}
