/**
 * Calculador de balance de cuentas
 * Centraliza la lógica de cálculo de balances para diferentes tipos de cuenta
 */

import type { Account, Transaction } from '../types/finance';

/**
 * Clase utilitaria para calcular balances de cuentas
 */
export class BalanceCalculator {
  /**
   * Calcula el balance neto de transacciones para una cuenta específica
   * @param accountId - ID de la cuenta
   * @param transactions - Lista de transacciones (ya filtradas por paid)
   * @returns Balance neto de las transacciones
   */
  private static calculateTransactionsBalance(
    accountId: string,
    transactions: Transaction[]
  ): number {
    let balance = 0;

    transactions.forEach(t => {
      // Transacciones donde esta cuenta es origen
      if (t.accountId === accountId) {
        if (t.type === 'income') balance += t.amount;
        if (t.type === 'expense') balance -= t.amount;
        if (t.type === 'transfer') balance -= t.amount;
      }

      // Transferencias donde esta cuenta es destino
      if (t.toAccountId === accountId && t.type === 'transfer') {
        balance += t.amount;
      }
    });

    return balance;
  }

  /**
   * Calcula el balance total de una cuenta
   * @param account - Cuenta a calcular
   * @param transactions - Lista de todas las transacciones
   * @returns Balance total de la cuenta
   */
  static calculateAccountBalance(
    account: Account,
    transactions: Transaction[]
  ): number {
    // Solo considerar transacciones pagadas
    const paidTransactions = transactions.filter(t => t.paid);

    // Calcular balance de transacciones
    const transactionsBalance = this.calculateTransactionsBalance(
      account.id!,
      paidTransactions
    );

    // Para tarjetas de crédito, el balance disponible es:
    // cupo total + balance inicial + transacciones
    // (gastos reducen el cupo disponible, pagos lo aumentan)
    if (account.type === 'credit') {
      return (account.creditLimit || 0) + account.initialBalance + transactionsBalance;
    }

    // Para cuentas de ahorro/efectivo:
    // balance inicial + transacciones
    return account.initialBalance + transactionsBalance;
  }

  /**
   * Calcula el balance total de todas las cuentas
   * @param accounts - Lista de cuentas
   * @param transactions - Lista de transacciones
   * @returns Balance total
   */
  static calculateTotalBalance(
    accounts: Account[],
    transactions: Transaction[]
  ): number {
    return accounts.reduce(
      (sum, account) => sum + this.calculateAccountBalance(account, transactions),
      0
    );
  }
}
