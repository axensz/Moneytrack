/** Fuente autoritativa de transacciones para saldos. */
import { useEffect, useState } from 'react';
import { useAllTransactionsWithStatus } from './useAllTransactions';
import type { Transaction } from '../types/finance';

export interface BalanceTransactionsResult {
  transactions: Transaction[];
  ready: boolean;
  currentServerSettled: boolean;
  error: Error | null;
}

export function useBalanceTransactions(
  userId: string | null,
  liveTransactions: Transaction[],
  transactionsServerSettled = !userId,
  transactionsHeadExhaustive = !userId,
  retryGeneration = 0,
): BalanceTransactionsResult {
  const confirmedNeedsFullHistory = !!userId
    && transactionsServerSettled
    && !transactionsHeadExhaustive;
  const [fullHistoryUserId, setFullHistoryUserId] = useState<string | null>(null);
  const requiresFullHistory = !!userId
    && !(transactionsServerSettled && transactionsHeadExhaustive)
    && (confirmedNeedsFullHistory || fullHistoryUserId === userId);
  const historyUserId = requiresFullHistory ? userId : null;

  useEffect(() => {
    setFullHistoryUserId(historyUserId);
  }, [historyUserId]);

  const { transactions, settled, currentServerSettled, error } = useAllTransactionsWithStatus(
    historyUserId,
    liveTransactions,
    retryGeneration,
  );

  return {
    transactions,
    ready: !userId
      || (transactionsServerSettled && transactionsHeadExhaustive)
      || (requiresFullHistory && settled),
    currentServerSettled: !userId || (
      transactionsServerSettled
      && (transactionsHeadExhaustive || (requiresFullHistory && currentServerSettled))
    ),
    error,
  };
}
