import { collection, doc } from 'firebase/firestore';
import { BALANCE_ADJUSTMENT_CATEGORY } from '../../config/constants';
import { db } from '../../lib/firebaseDb';
import type { Account, Transaction } from '../../types/finance';
import { stripUndefined } from '../../utils/firestoreHelpers';
import { roundMoney } from '../../utils/formatters';
import {
  LedgerMutationValidationError,
  normalizeLedgerAmount,
} from '../../utils/ledgerMutation';
import {
  executeAuthenticatedLedgerMutation,
  planCreditAuthorityChanges,
} from './ledgerMutationOrchestration';
import { publishTransactionCacheMutation } from './transactionPaginationCache';

const normalizeTarget = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new LedgerMutationValidationError(
      'INVALID_AMOUNT',
      'El saldo objetivo debe ser un número válido mayor o igual a cero'
    );
  }
  if (value === 0) return 0;
  return normalizeLedgerAmount(value);
};

export const sanitizeBalanceTargetAccountUpdates = (
  updates: Partial<Account>
): Partial<Account> => {
  const safe = { ...updates };
  delete safe.id;
  delete safe.type;
  delete safe.initialBalance;
  delete safe.usedCredit;
  delete safe.creditDebtModelVersion;
  delete safe.paymentPairModelVersion;
  delete safe.mergedAccountIds;
  delete safe.createdAt;
  return safe;
};

export interface BalanceTargetAdjustmentInput {
  account: Account;
  currentValue: number;
  targetBalance: number;
  operationId: string;
  transactionId: string;
  now?: Date;
}

export function buildBalanceTargetAdjustment({
  account,
  currentValue,
  targetBalance,
  operationId,
  transactionId,
  now = new Date(),
}: BalanceTargetAdjustmentInput): Transaction | null {
  if (!account.id) {
    throw new LedgerMutationValidationError(
      'INVALID_ACCOUNT_AUTHORITY',
      'La cuenta no tiene una identidad válida'
    );
  }
  if (!Number.isFinite(currentValue) || (account.type === 'credit' && currentValue < 0)) {
    throw new LedgerMutationValidationError(
      'INVALID_ACCOUNT_AUTHORITY',
      'No se pudo validar el saldo persistido de la cuenta',
      account.id
    );
  }

  const target = normalizeTarget(targetBalance);
  const difference = roundMoney(target - roundMoney(currentValue));
  if (difference === 0) return null;
  const amount = normalizeLedgerAmount(Math.abs(difference));
  const credit = account.type === 'credit';

  return {
    id: transactionId,
    type: credit
      ? (difference > 0 ? 'expense' : 'income')
      : (difference > 0 ? 'income' : 'expense'),
    amount,
    category: BALANCE_ADJUSTMENT_CATEGORY,
    description: credit
      ? `Ajuste de deuda TC a ${target}`
      : `Ajuste de saldo a ${target}`,
    date: now,
    createdAt: now,
    paid: true,
    accountId: account.id,
    operationId,
    mutationKind: 'balance-adjustment',
    mutationSource: 'account',
    expectedBefore: roundMoney(currentValue),
    targetBalance: target,
  };
}

export async function updateAccountWithBalanceTarget(
  userId: string,
  accountId: string,
  updates: Partial<Account>,
  targetBalance: number
): Promise<Transaction | null> {
  const target = normalizeTarget(targetBalance);
  const adjustment = await executeAuthenticatedLedgerMutation<Transaction | null>(
    userId,
    async ({ operationId, loadContext }) => {
      const context = await loadContext([accountId]);
      const canonicalId = context.canonicalAccountId(accountId);
      const account = context.accounts.find(candidate => candidate.id === canonicalId);
      if (!account) throw new Error('La cuenta ya no existe');

      const authority = context.authorities.find(
        candidate => candidate.account.id === canonicalId
      );
      const currentValue = account.type === 'credit'
        ? account.usedCredit
        : authority?.currentBalance;
      if (typeof currentValue !== 'number') {
        throw new LedgerMutationValidationError(
          'INVALID_ACCOUNT_AUTHORITY',
          'No se pudo validar el saldo persistido de la cuenta',
          canonicalId
        );
      }

      const transactionRef = doc(
        collection(db, `users/${userId}/transactions`)
      );
      const plannedAdjustment = buildBalanceTargetAdjustment({
        account,
        currentValue,
        targetBalance: target,
        operationId,
        transactionId: transactionRef.id,
      });
      const intent = {
        kind: 'balance-adjustment' as const,
        before: [],
        after: plannedAdjustment ? [plannedAdjustment] : [],
        metadata: {
          operationId,
          mutationSource: 'account' as const,
          expectedBefore: roundMoney(currentValue),
          targetBalance: target,
        },
      };
      const creditChanges = planCreditAuthorityChanges(intent, context);
      const accountWrite = stripUndefined({
        ...sanitizeBalanceTargetAccountUpdates(updates),
        ...(account.type === 'credit' ? { usedCredit: target } : {}),
      } as Record<string, unknown>);
      const hasAccountWrite = Object.keys(accountWrite).length > 0;

      if (account.type === 'credit') {
        const expectedCredit = plannedAdjustment
          ? creditChanges[0]?.afterUsedCredit
          : roundMoney(currentValue);
        if (expectedCredit !== target) {
          throw new Error('El ajuste no coincide con la deuda objetivo');
        }
      }

      return {
        intent,
        context,
        writeCount: Number(hasAccountWrite) + Number(Boolean(plannedAdjustment)),
        stage: (batch) => {
          if (hasAccountWrite) {
            batch.update(
              doc(db, `users/${userId}/accounts`, canonicalId),
              accountWrite
            );
          }
          if (plannedAdjustment) {
            const persisted = { ...plannedAdjustment };
            delete persisted.id;
            batch.set(transactionRef, persisted);
          }
        },
        result: plannedAdjustment,
      };
    }
  );

  if (adjustment) {
    publishTransactionCacheMutation({
      userId,
      type: 'update',
      transactions: [adjustment],
    });
  }
  return adjustment;
}
