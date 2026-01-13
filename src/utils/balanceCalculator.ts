/**
 * 🟢 CALCULADOR DE BALANCE DE CUENTAS - VERSIÓN CON STRATEGY PATTERN
 *
 * REFACTORIZACIÓN PASO 3:
 * ✅ Elimina if (type === 'credit') hardcodeados
 * ✅ Usa Strategy Pattern para delegar cálculos
 * ✅ Preparado para nuevos tipos de cuenta sin modificar código
 *
 * VERSIÓN ANTERIOR: 260 líneas con lógica hardcodeada
 * VERSIÓN ACTUAL: 120 líneas delegando a estrategias
 */

import type { Account, Transaction } from '../types/finance';
import { AccountStrategyFactory, getCreditCardStrategy } from './accountStrategies';

/**
 * 🔴 CLASE PARA CÁLCULO DE TARJETAS DE CRÉDITO
 * Mantenida por compatibilidad, pero ahora delega a CreditCardStrategy
 *
 * @deprecated Usar getCreditCardStrategy() y sus métodos directamente
 */
export class CreditCardCalculator {
  /**
   * Calcula el CUPO UTILIZADO (deuda pendiente por pagar)
   */
  static calculateUsedCredit(
    account: Account,
    transactions: Transaction[]
  ): number {
    if (account.type !== 'credit') return 0;

    // ✅ Delegar a estrategia
    const strategy = getCreditCardStrategy();
    return strategy.getUsedCredit(account, transactions);
  }

  /**
   * Calcula el CUPO DISPONIBLE
   */
  static calculateAvailableCredit(
    account: Account,
    transactions: Transaction[]
  ): number {
    if (account.type !== 'credit') return 0;

    // ✅ Delegar a estrategia
    const strategy = AccountStrategyFactory.getStrategy('credit');
    return strategy.calculateBalance(account, transactions);
  }

  /**
   * Valida si se puede realizar un gasto con la tarjeta
   */
  static canMakeExpense(
    account: Account,
    transactions: Transaction[],
    amount: number
  ): { valid: boolean; error?: string; available?: number } {
    if (account.type !== 'credit') {
      return { valid: false, error: 'Esta cuenta no es una tarjeta de crédito' };
    }

    // ✅ Delegar a estrategia
    const strategy = AccountStrategyFactory.getStrategy('credit');
    const validation = strategy.validateTransaction(account, amount, transactions);
    const available = strategy.calculateBalance(account, transactions);

    return {
      ...validation,
      available
    };
  }
}

/**
 * 🟢 CALCULADOR PRINCIPAL CON STRATEGY PATTERN
 * Clase utilitaria para calcular balances usando estrategias
 */
export class BalanceCalculator {
  /**
   * 🟢 FUNCIÓN PRINCIPAL: Calcula el balance de una cuenta usando Strategy Pattern
   *
   * ANTES (❌ Hardcoded):
   * ```typescript
   * if (account.type === 'credit') {
   *   return CreditCardCalculator.calculateAvailableCredit(account, transactions);
   * }
   * return account.initialBalance + transactionsBalance;
   * ```
   *
   * AHORA (✅ Strategy Pattern):
   * ```typescript
   * const strategy = AccountStrategyFactory.getStrategy(account.type);
   * return strategy.calculateBalance(account, transactions);
   * ```
   *
   * @param account - Cuenta a calcular
   * @param transactions - Lista de todas las transacciones
   * @returns Balance total de la cuenta
   */
  static calculateAccountBalance(
    account: Account,
    transactions: Transaction[]
  ): number {
    // ✅ Obtener estrategia para el tipo de cuenta
    const strategy = AccountStrategyFactory.getStrategy(account.type);

    // ✅ Delegar cálculo a la estrategia
    return strategy.calculateBalance(account, transactions);
  }

  /**
   * 🟢 Calcula el balance total usando Strategy Pattern
   *
   * ANTES (❌ Hardcoded):
   * ```typescript
   * return accounts
   *   .filter(acc => acc.type !== 'credit') // ❌ Hardcoded
   *   .reduce((sum, account) => sum + this.calculateAccountBalance(account, transactions), 0);
   * ```
   *
   * AHORA (✅ Strategy Pattern):
   * ```typescript
   * return accounts
   *   .filter(acc => {
   *     const strategy = AccountStrategyFactory.getStrategy(acc.type);
   *     return strategy.includeInTotalBalance(); // ✅ Delegado
   *   })
   *   .reduce(...);
   * ```
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
        // ✅ Preguntar a la estrategia si se incluye en total
        const strategy = AccountStrategyFactory.getStrategy(acc.type);
        return strategy.includeInTotalBalance();
      })
      .reduce(
        (sum, account) => sum + this.calculateAccountBalance(account, transactions),
        0
      );
  }

  /**
   * 🟢 Valida si una cuenta puede realizar una transacción usando Strategy Pattern
   *
   * NUEVA FUNCIÓN: Ahora cualquier tipo de cuenta puede tener lógica de validación
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
    // ✅ Delegar validación a la estrategia
    const strategy = AccountStrategyFactory.getStrategy(account.type);
    return strategy.validateTransaction(account, amount, transactions);
  }

  /**
   * 🔴 COMPATIBILIDAD: Calcula el cupo utilizado de una tarjeta de crédito
   * @deprecated Usar CreditCardCalculator.calculateUsedCredit directamente
   */
  static calculateCreditCardUsed(
    account: Account,
    transactions: Transaction[]
  ): number {
    return CreditCardCalculator.calculateUsedCredit(account, transactions);
  }

  /**
   * Calcula el total pendiente por pagar en tarjetas de crédito
   *
   * @param accounts - Lista de cuentas
   * @param transactions - Lista de transacciones
   * @returns Total pendiente de tarjetas de crédito (deuda total)
   */
  static calculateTotalCreditCardPending(
    accounts: Account[],
    transactions: Transaction[]
  ): number {
    return accounts
      .filter(acc => acc.type === 'credit')
      .reduce(
        (sum, account) => sum + CreditCardCalculator.calculateUsedCredit(account, transactions),
        0
      );
  }

  /**
   * 🆕 Calcula el cupo disponible de una tarjeta de crédito
   */
  static calculateCreditCardAvailable(
    account: Account,
    transactions: Transaction[]
  ): number {
    return CreditCardCalculator.calculateAvailableCredit(account, transactions);
  }
}
