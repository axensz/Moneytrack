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
import { AccountStrategyFactory } from './accountStrategies';

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
    return accounts
      .filter(acc => {
        const strategy = AccountStrategyFactory.getStrategy(acc.type);
        return strategy.includeInTotalBalance();
      })
      .reduce(
        (sum, account) => sum + this.calculateAccountBalance(account, transactions),
        0
      );
  }

  /**
   * 🟢 Valida si una cuenta puede realizar una transacción, delegando en su
   * estrategia (cualquier tipo de cuenta puede tener lógica de validación).
   *
   * @param account - Cuenta origen
   * @param amount - Monto de la transacción
   * @param transactions - Lista de transacciones
   * @returns Resultado de validación
   */
  static validateTransaction(
    account: Account,
    amount: number,
    transactions: Transaction[]
  ): { valid: boolean; error?: string } {
    const strategy = AccountStrategyFactory.getStrategy(account.type);
    return strategy.validateTransaction(account, amount, transactions);
  }
}
