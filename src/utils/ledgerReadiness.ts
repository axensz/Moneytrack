import type { Account, NewTransaction, Transaction } from '../types/finance';

export const BALANCE_SETTLING_MESSAGE =
  'Estamos conciliando tu historial. Intenta guardar nuevamente en unos segundos.';

export function balanceReadinessBlock(
  balancesReady: boolean,
  balanceSensitive: boolean,
): string | null {
  return !balancesReady && balanceSensitive ? BALANCE_SETTLING_MESSAGE : null;
}

export function isBalanceSensitiveCreate(
  transaction: NewTransaction,
  account: Account,
): boolean {
  if (!transaction.paid) return false;
  return transaction.type === 'expense'
    || transaction.type === 'transfer'
    || (account.type === 'credit' && transaction.type === 'income');
}

export function isBalanceSensitiveEdit(
  original: Transaction,
  amount: number,
  account: Account | undefined,
): boolean {
  if (!original.paid || original.linkedTransactionId) return !!original.linkedTransactionId;
  if (original.type === 'expense' || original.type === 'transfer') return amount > original.amount;
  return account?.type === 'credit' ? amount !== original.amount : amount < original.amount;
}
