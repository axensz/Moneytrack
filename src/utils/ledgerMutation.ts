import { TRANSACTION_VALIDATION } from '../config/constants';
import type {
  Account,
  LedgerMutationIntent,
  LedgerTransactionEffect,
} from '../types/finance';
import { roundMoney } from './formatters';

export type LedgerMutationErrorCode =
  | 'INVALID_AMOUNT'
  | 'OUT_OF_RANGE'
  | 'SUB_CENT_AMOUNT'
  | 'INVALID_ACCOUNT_AUTHORITY'
  | 'INSUFFICIENT_FUNDS';

export class LedgerMutationValidationError extends Error {
  constructor(
    public readonly code: LedgerMutationErrorCode,
    message: string,
    public readonly accountId?: string
  ) {
    super(message);
    this.name = 'LedgerMutationValidationError';
  }
}

export function normalizeLedgerAmount(value: number): number {
  if (!Number.isFinite(value)) {
    throw new LedgerMutationValidationError('INVALID_AMOUNT', 'El monto no es válido');
  }

  const { min, max, errorMessage } = TRANSACTION_VALIDATION.amount;
  if (value < min || value > max) {
    throw new LedgerMutationValidationError('OUT_OF_RANGE', errorMessage);
  }

  const rounded = roundMoney(value);
  const floatTolerance = Number.EPSILON * Math.max(1, Math.abs(value)) * 8;
  if (Math.abs(value - rounded) > floatTolerance) {
    throw new LedgerMutationValidationError(
      'SUB_CENT_AMOUNT',
      'El monto debe expresarse con máximo dos decimales'
    );
  }

  return rounded;
}

export interface LedgerAssetAuthority {
  account: Pick<Account, 'id' | 'type'>;
  currentBalance: number;
}

export interface LedgerAccountDelta {
  accountId: string;
  beforeBalance: number;
  delta: number;
  afterBalance: number;
}

export interface LedgerMutationPlan {
  intent: LedgerMutationIntent;
  affectedAccountIds: readonly string[];
  accounts: readonly LedgerAccountDelta[];
}

const addDelta = (
  deltas: Map<string, number>,
  accountId: string | undefined,
  value: number
): void => {
  if (!accountId) return;
  deltas.set(accountId, roundMoney((deltas.get(accountId) ?? 0) + value));
};

const addEffect = (
  deltas: Map<string, number>,
  transaction: LedgerTransactionEffect,
  direction: 1 | -1
): void => {
  const amount = normalizeLedgerAmount(transaction.amount) * direction;
  if (!transaction.paid) return;

  if (transaction.type === 'income') addDelta(deltas, transaction.accountId, amount);
  if (transaction.type === 'expense') addDelta(deltas, transaction.accountId, -amount);
  if (transaction.type === 'transfer') {
    addDelta(deltas, transaction.accountId, -amount);
    addDelta(deltas, transaction.toAccountId, amount);
  }
};

const worsensAsset = (before: number, after: number): boolean =>
  (before >= 0 && after < 0) || (before < 0 && after < before);

export function planLedgerMutation(
  intent: LedgerMutationIntent,
  assets: readonly LedgerAssetAuthority[]
): LedgerMutationPlan {
  const deltas = new Map<string, number>();
  intent.before.forEach(transaction => addEffect(deltas, transaction, -1));
  intent.after.forEach(transaction => addEffect(deltas, transaction, 1));

  const affectedAccountIds = [...deltas.keys()].sort();
  const accounts = assets
    .flatMap(({ account, currentBalance }) => {
      const accountId = account.id;
      if (!accountId) {
        throw new LedgerMutationValidationError(
          'INVALID_ACCOUNT_AUTHORITY',
          'La cuenta no tiene una autoridad válida'
        );
      }
      if (!deltas.has(accountId)) return [];
      if (!Number.isFinite(currentBalance)) {
        throw new LedgerMutationValidationError(
          'INVALID_ACCOUNT_AUTHORITY',
          'No se pudo validar el saldo de la cuenta',
          accountId
        );
      }

      const beforeBalance = roundMoney(currentBalance);
      const delta = roundMoney(deltas.get(accountId) ?? 0);
      const afterBalance = roundMoney(beforeBalance + delta);
      if (
        (account.type === 'savings' || account.type === 'cash') &&
        worsensAsset(beforeBalance, afterBalance)
      ) {
        throw new LedgerMutationValidationError(
          'INSUFFICIENT_FUNDS',
          `Saldo insuficiente. Disponible: $${beforeBalance.toLocaleString('es-CO')}`,
          accountId
        );
      }

      return [{ accountId, beforeBalance, delta, afterBalance }];
    })
    .sort((left, right) => left.accountId.localeCompare(right.accountId));

  return { intent, affectedAccountIds, accounts };
}
