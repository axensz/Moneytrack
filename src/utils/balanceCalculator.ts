/**
 * 🟢 CALCULADOR DE BALANCE DE CUENTAS - VERSIÓN CON STRATEGY PATTERN
 *
 * ✅ Sin if (type === 'credit') hardcodeados: delega en AccountStrategyFactory.
 * ✅ Preparado para nuevos tipos de cuenta sin modificar código.
 *
 * La capa @deprecated CreditCardCalculator fue retirada (Q-deprecated): el cupo
 * utilizado de una TC se obtiene ahora con la API viva getCreditCardUsedCredit()
 * de accountStrategies.ts.
 */

import type { Account, Transaction } from '../types/finance';
import {
  AccountStrategyFactory,
  getCreditCardUsedCredit,
} from './accountStrategies';
import { getAccountReferenceIds } from './accountTransactions';

export interface AccountBalanceSnapshot {
  balancesByAccountId: ReadonlyMap<string, number>;
  creditUsedByAccountId: ReadonlyMap<string, number>;
  totalBalance: number;
}

interface IndexedTransaction {
  index: number;
  transaction: Transaction;
}

const EMPTY_TRANSACTIONS: Transaction[] = [];

function indexTransactionsByAccount(
  transactions: Transaction[]
): Map<string, IndexedTransaction[]> {
  const byAccountId = new Map<string, IndexedTransaction[]>();

  transactions.forEach((transaction, index) => {
    const accountIds = new Set(
      [transaction.accountId, transaction.toAccountId].filter(
        (accountId): accountId is string => Boolean(accountId)
      )
    );

    accountIds.forEach(accountId => {
      const bucket = byAccountId.get(accountId);
      const indexedTransaction = { index, transaction };
      if (bucket) bucket.push(indexedTransaction);
      else byAccountId.set(accountId, [indexedTransaction]);
    });
  });

  return byAccountId;
}

function getTransactionsForAccount(
  account: Account,
  transactionsByAccountId: Map<string, IndexedTransaction[]>
): Transaction[] {
  if (!account.id) return EMPTY_TRANSACTIONS;

  // Savings/cash strategies historically match only account.id. Credit cards
  // additionally treat mergedAccountIds as aliases while a merge settles.
  const referenceIds = account.type === 'credit'
    ? getAccountReferenceIds(account)
    : [account.id];

  if (referenceIds.length === 1) {
    return transactionsByAccountId
      .get(referenceIds[0])
      ?.map(({ transaction }) => transaction) ?? EMPTY_TRANSACTIONS;
  }

  // A transfer can reference two aliases of the same merged card. Deduplicate
  // by source-array position so the transaction keeps its original one-row
  // semantics while repeated object references in the input remain distinct.
  const seenIndexes = new Set<number>();
  const related: IndexedTransaction[] = [];
  referenceIds.forEach(referenceId => {
    transactionsByAccountId.get(referenceId)?.forEach(indexedTransaction => {
      if (seenIndexes.has(indexedTransaction.index)) return;
      seenIndexes.add(indexedTransaction.index);
      related.push(indexedTransaction);
    });
  });

  related.sort((left, right) => left.index - right.index);
  return related.map(({ transaction }) => transaction);
}

/**
 * 🟢 CALCULADOR PRINCIPAL CON STRATEGY PATTERN
 * Clase utilitaria para calcular balances usando estrategias.
 */
export class BalanceCalculator {
  /**
   * 🟢 Calcula el balance de una cuenta delegando en su estrategia.
   * Para TC, el "balance" es el cupo disponible (límite - usado).
   *
   * @param account - Cuenta a calcular
   * @param transactions - Lista de todas las transacciones
   * @returns Balance de la cuenta
   */
  static calculateAccountBalance(
    account: Account,
    transactions: Transaction[]
  ): number {
    const strategy = AccountStrategyFactory.getStrategy(account.type);
    return strategy.calculateBalance(account, transactions);
  }

  /**
   * Calcula todos los saldos sobre un índice construido en una sola pasada.
   *
   * Cada estrategia recibe únicamente las transacciones que pueden afectar a
   * su cuenta. Así se conserva la semántica existente y se evita recorrer el
   * historial completo una vez por cuenta.
   */
  static calculateBalanceSnapshot(
    accounts: Account[],
    transactions: Transaction[]
  ): AccountBalanceSnapshot {
    const transactionsByAccountId = indexTransactionsByAccount(transactions);
    const balancesByAccountId = new Map<string, number>();
    const creditUsedByAccountId = new Map<string, number>();
    let totalBalance = 0;

    accounts.forEach(account => {
      const strategy = AccountStrategyFactory.getStrategy(account.type);
      const relatedTransactions = account.id
        ? getTransactionsForAccount(account, transactionsByAccountId)
        : transactions;
      const balance = strategy.calculateBalance(account, relatedTransactions);

      if (account.id) {
        balancesByAccountId.set(account.id, balance);
        if (account.type === 'credit') {
          creditUsedByAccountId.set(
            account.id,
            getCreditCardUsedCredit(account, relatedTransactions)
          );
        }
      }

      if (strategy.includeInTotalBalance()) totalBalance += balance;
    });

    return {
      balancesByAccountId,
      creditUsedByAccountId,
      totalBalance,
    };
  }

  /**
   * 🟢 Calcula el balance total, incluyendo solo las cuentas que la estrategia
   * marca como parte del total (las TC, que son deuda, se excluyen).
   *
   * @param accounts - Lista de cuentas
   * @param transactions - Lista de transacciones
   * @returns Balance total (solo cuentas que aplican)
   */
  static calculateTotalBalance(
    accounts: Account[],
    transactions: Transaction[]
  ): number {
    return this.calculateBalanceSnapshot(accounts, transactions).totalBalance;
  }
}
