import { LOAN_CATEGORY } from '../config/constants';
import type { Account, Debt, Transaction } from '../types/finance';
import { findAccountForTransaction } from './accountTransactions';
import { creditDeltasByAccount } from './creditDeltas';
import { getCreditAuthorityState } from './creditAuthority';
import { roundMoney } from './formatters';

export interface DebtAccountCreditAdjustment {
  accountId: string;
  delta: number;
  resultingUsedCredit: number;
}

export interface DebtAccountReassignmentPlan {
  nextAccountId?: string;
  principal: {
    before: Transaction;
    after?: Transaction;
  } | null;
  untouchedTransactions: Transaction[];
  creditAdjustments: DebtAccountCreditAdjustment[];
}

export function buildDebtAccountReassignmentPlan(
  debt: Debt,
  linkedTransactions: Transaction[],
  accounts: Account[],
  nextAccountId?: string
): DebtAccountReassignmentPlan {
  const nextAccount = nextAccountId
    ? accounts.find(account => account.id === nextAccountId)
    : undefined;
  if (nextAccountId && !nextAccount) {
    throw new Error('La cuenta nueva no existe. Actualiza e intenta de nuevo.');
  }

  const principals = linkedTransactions.filter(transaction => transaction.category === LOAN_CATEGORY);
  if (principals.length > 1) {
    throw new Error('Hay más de una operación original; debes revisar el historial antes de cambiar la cuenta.');
  }

  const principalBefore = principals[0] ?? null;
  const untouchedTransactions = linkedTransactions.filter(transaction => transaction !== principalBefore);
  if (!principalBefore) {
    return {
      nextAccountId,
      principal: null,
      untouchedTransactions,
      creditAdjustments: [],
    };
  }
  if (!principalBefore.id) {
    throw new Error('La operación original no tiene un identificador válido.');
  }
  if (!findAccountForTransaction(accounts, principalBefore.accountId)) {
    throw new Error('La cuenta anterior de la operación original no existe.');
  }

  const principalAfter = nextAccountId
    ? { ...principalBefore, accountId: nextAccountId }
    : undefined;
  const beforeDeltas = creditDeltasByAccount(principalBefore, accounts);
  const afterDeltas = principalAfter
    ? creditDeltasByAccount(principalAfter, accounts)
    : new Map<string, number>();
  const affectedAccountIds = new Set([
    ...beforeDeltas.keys(),
    ...afterDeltas.keys(),
  ]);
  const creditAdjustments: DebtAccountCreditAdjustment[] = [];

  for (const accountId of affectedAccountIds) {
    const account = accounts.find(candidate => candidate.id === accountId);
    if (!account || account.type !== 'credit') {
      throw new Error('No se pudo validar una tarjeta afectada por el cambio.');
    }
    const delta = roundMoney((afterDeltas.get(accountId) ?? 0) - (beforeDeltas.get(accountId) ?? 0));
    if (delta === 0) continue;

    const authority = getCreditAuthorityState(account);
    if (!authority.ready || authority.usedCredit === null) {
      throw new Error(
        `La tarjeta ${account.name} requiere reconciliación antes de cambiar la deuda.`
      );
    }
    const resultingUsedCredit = roundMoney(authority.usedCredit + delta);
    if (resultingUsedCredit < -0.01) {
      throw new Error(`El cambio dejaría deuda negativa en ${account.name}; el saldo persistido no es consistente.`);
    }
    creditAdjustments.push({ accountId, delta, resultingUsedCredit });
  }

  return {
    nextAccountId,
    principal: { before: principalBefore, after: principalAfter },
    untouchedTransactions,
    creditAdjustments,
  };
}
