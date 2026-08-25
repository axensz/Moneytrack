import { BALANCE_ADJUSTMENT_CATEGORY } from '../config/constants';
import type { Account, Transaction } from '../types/finance';
import { roundMoney } from './formatters';
import {
  LedgerMutationValidationError,
  normalizeLedgerAmount,
} from './ledgerMutation';

export const normalizeBalanceTarget = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new LedgerMutationValidationError(
      'INVALID_AMOUNT',
      'El saldo objetivo debe ser un número válido mayor o igual a cero'
    );
  }
  if (value === 0) return 0;
  return normalizeLedgerAmount(value);
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

  const target = normalizeBalanceTarget(targetBalance);
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
