/** Fuente autoritativa de transacciones para saldos. */
import { useAllTransactionsWithStatus } from './useAllTransactions';
import type { Transaction } from '../types/finance';

export interface BalanceTransactionsResult {
  transactions: Transaction[];
  ready: boolean;
}

export function useBalanceTransactions(
  userId: string | null,
  liveTransactions: Transaction[],
  transactionsServerSettled = !userId,
  transactionsHeadExhaustive = !userId,
): BalanceTransactionsResult {
  const requiresFullHistory = !!userId
    && transactionsServerSettled
    && !transactionsHeadExhaustive;
  const { transactions, settled } = useAllTransactionsWithStatus(
    requiresFullHistory ? userId : null,
    liveTransactions,
  );

  return {
    transactions,
    ready: !userId || transactionsHeadExhaustive || (requiresFullHistory && settled),
  };
}
