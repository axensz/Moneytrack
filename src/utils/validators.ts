/**
 * 🔵 SISTEMA DE VALIDACIÓN CENTRALIZADO - VERSIÓN CON STRATEGY PATTERN
 *
 * PASO 4: INTEGRACIÓN CON ESTRATEGIAS
 * ✅ Usa AccountStrategyFactory para validaciones específicas por tipo
 * ✅ Valida cupo disponible en tarjetas de crédito
 * ✅ Validación consistente con la lógica de negocio
 */

import {
  TRANSACTION_VALIDATION,
  ACCOUNT_VALIDATION,
  ERROR_MESSAGES,
  TRANSFER_CATEGORY
} from '../config/constants';
import { AccountStrategyFactory } from './accountStrategies';
import type {
  NewTransaction,
  NewAccount,
  ValidationResult,
  Account,
  Transaction
} from '../types/finance';

/**
 * 🔵 VALIDADOR DE TRANSACCIONES CON STRATEGY PATTERN
 */
export class TransactionValidator {
  /**
   * 🔵 Valida una transacción completa usando Strategy Pattern
   *
   * MEJORAS PASO 4:
   * - ✅ Valida cupo en TC usando CreditCardStrategy
   * - ✅ Valida saldo en cuentas normales usando SavingsAccountStrategy
   * - ✅ Usa estrategias en lugar de if (accountType === 'credit')
   *
   * @param transaction - Transacción a validar
   * @param account - Cuenta completa (para usar estrategia)
   * @param transactions - Lista de transacciones (para calcular balance actual)
   * @returns Resultado de validación con errores si los hay
   */
  static validate(
    transaction: NewTransaction,
    account?: Account,
    transactions?: Transaction[]
  ): ValidationResult {
    const errors: string[] = [];

    // ===== VALIDACIONES BÁSICAS =====

    // Validar descripción (opcional, pero con límite de largo)
    if (transaction.description.length > TRANSACTION_VALIDATION.description.maxLength) {
      errors.push(
        `La descripción no puede tener más de ${TRANSACTION_VALIDATION.description.maxLength} caracteres`
      );
    }

    // Validar categoría (excepto para transferencias y pagos de TC)
    const isTCPayment = account?.type === 'credit' && transaction.type === 'income';
    if (transaction.type !== 'transfer' && !isTCPayment && !transaction.category) {
      errors.push(ERROR_MESSAGES.EMPTY_CATEGORY);
    }

    // Validar cuenta destino para transferencias
    if (transaction.type === 'transfer' && !transaction.toAccountId) {
      errors.push(ERROR_MESSAGES.EMPTY_TO_ACCOUNT);
    }

    // Validar cuenta origen para pagos de TC
    if (isTCPayment && !transaction.toAccountId) {
      errors.push('Selecciona la cuenta desde la que pagarás la tarjeta');
    }

    // Validar que no se transfiera a la misma cuenta
    if (
      transaction.type === 'transfer' &&
      transaction.accountId &&
      transaction.accountId === transaction.toAccountId
    ) {
      errors.push(ERROR_MESSAGES.SAME_ACCOUNT_TRANSFER);
    }

    // ===== VALIDACIÓN DE MONTO =====

    const amount = parseFloat(transaction.amount);
    if (!transaction.amount || isNaN(amount)) {
      errors.push(ERROR_MESSAGES.INVALID_AMOUNT);
    } else if (amount <= TRANSACTION_VALIDATION.amount.min) {
      errors.push(TRANSACTION_VALIDATION.amount.errorMessage);
    } else if (amount > TRANSACTION_VALIDATION.amount.max) {
      errors.push(
        `El monto no puede ser mayor a ${TRANSACTION_VALIDATION.amount.max}`
      );
    }

    // ===== 🔵 VALIDACIÓN CON STRATEGY PATTERN =====

    // Validar según tipo de transacción y cuenta
    if (account && transactions && !isNaN(amount)) {
      try {
        // ✅ Obtener estrategia para el tipo de cuenta
        const strategy = AccountStrategyFactory.getStrategy(account.type);

        // ✅ Delegar validación a la estrategia (pasando el tipo de transacción)
        const validation = strategy.validateTransaction(
          account,
          amount,
          transactions,
          transaction.type
        );

        if (!validation.valid && validation.error) {
          errors.push(validation.error);
        }
      } catch (error) {
        // Si no existe estrategia (tipo inválido), agregar error genérico
        errors.push('Tipo de cuenta no válido');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 🔴 MÉTODO LEGACY: Validación sin estrategias (backward compatibility)
   * @deprecated Usar validate(transaction, account, transactions) con estrategias
   */
  static validateLegacy(
    transaction: NewTransaction,
    accountBalance?: number,
    accountType?: 'savings' | 'credit' | 'cash'
  ): ValidationResult {
    const errors: string[] = [];

    // Validaciones básicas (igual que antes)
    // Descripción es opcional

    if (transaction.type !== 'transfer' && !transaction.category) {
      errors.push(ERROR_MESSAGES.EMPTY_CATEGORY);
    }

    if (transaction.type === 'transfer' && !transaction.toAccountId) {
      errors.push(ERROR_MESSAGES.EMPTY_TO_ACCOUNT);
    }

    if (
      transaction.type === 'transfer' &&
      transaction.accountId === transaction.toAccountId
    ) {
      errors.push(ERROR_MESSAGES.SAME_ACCOUNT_TRANSFER);
    }

    const amount = parseFloat(transaction.amount);
    if (!transaction.amount || isNaN(amount)) {
      errors.push(ERROR_MESSAGES.INVALID_AMOUNT);
    } else if (amount <= TRANSACTION_VALIDATION.amount.min) {
      errors.push(TRANSACTION_VALIDATION.amount.errorMessage);
    }

    // ❌ Validación legacy (sin estrategias)
    if (
      (transaction.type === 'expense' || transaction.type === 'transfer') &&
      accountBalance !== undefined &&
      accountBalance !== null &&
      accountType !== 'credit' &&
      amount > accountBalance
    ) {
      errors.push('Saldo insuficiente para realizar esta transacción');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida solo el monto
   */
  static validateAmount(amount: string | number): ValidationResult {
    const errors: string[] = [];
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

    if (isNaN(numAmount) || numAmount <= TRANSACTION_VALIDATION.amount.min) {
      errors.push(TRANSACTION_VALIDATION.amount.errorMessage);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida solo la descripción
   */
  static validateDescription(description: string): ValidationResult {
    const errors: string[] = [];

    if (!description.trim()) {
      errors.push(ERROR_MESSAGES.EMPTY_DESCRIPTION);
    } else if (description.length > TRANSACTION_VALIDATION.description.maxLength) {
      errors.push(
        `La descripción no puede tener más de ${TRANSACTION_VALIDATION.description.maxLength} caracteres`
      );
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Validador de cuentas
 */
export class AccountValidator {
  /**
   * Valida una cuenta completa
   * @param account - Cuenta a validar
   * @param isEditing - Si está editando (algunas validaciones no aplican)
   * @returns Resultado de validación con errores si los hay
   */
  static validate(account: NewAccount, isEditing: boolean = false): ValidationResult {
    const errors: string[] = [];

    // Validar nombre
    if (!account.name.trim()) {
      errors.push(ERROR_MESSAGES.EMPTY_ACCOUNT_NAME);
    }

    // Solo validar lo siguiente si es una cuenta nueva (no editando)
    if (!isEditing) {
      // Validar configuración de tarjeta de crédito
      if (account.type === 'credit') {
        const creditLimit = parseFloat(account.creditLimit.toString());
        if (isNaN(creditLimit) || creditLimit <= ACCOUNT_VALIDATION.creditLimit.min) {
          errors.push(ERROR_MESSAGES.INVALID_CREDIT_LIMIT);
        } else if (creditLimit > ACCOUNT_VALIDATION.creditLimit.max) {
          errors.push(
            `El cupo no puede ser mayor a ${ACCOUNT_VALIDATION.creditLimit.max}`
          );
        }

        const cutoffDay = parseInt(account.cutoffDay.toString(), 10);
        if (
          isNaN(cutoffDay) ||
          cutoffDay < ACCOUNT_VALIDATION.cutoffDay.min ||
          cutoffDay > ACCOUNT_VALIDATION.cutoffDay.max
        ) {
          errors.push(ERROR_MESSAGES.INVALID_CUTOFF_DAY);
        }

        const paymentDay = parseInt(account.paymentDay.toString(), 10);
        if (
          isNaN(paymentDay) ||
          paymentDay < ACCOUNT_VALIDATION.paymentDay.min ||
          paymentDay > ACCOUNT_VALIDATION.paymentDay.max
        ) {
          errors.push(ERROR_MESSAGES.INVALID_PAYMENT_DAY);
        }
      } else {
        // Validar saldo inicial para cuentas de ahorro/efectivo
        const initialBalance = parseFloat(account.initialBalance.toString());
        if (isNaN(initialBalance)) {
          errors.push(ERROR_MESSAGES.INVALID_INITIAL_BALANCE);
        } else if (
          initialBalance < ACCOUNT_VALIDATION.initialBalance.min ||
          initialBalance > ACCOUNT_VALIDATION.initialBalance.max
        ) {
          errors.push(
            `El saldo inicial debe estar entre ${ACCOUNT_VALIDATION.initialBalance.min} y ${ACCOUNT_VALIDATION.initialBalance.max}`
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida solo el nombre de cuenta
   */
  static validateName(name: string): ValidationResult {
    const errors: string[] = [];

    if (!name.trim()) {
      errors.push(ERROR_MESSAGES.EMPTY_ACCOUNT_NAME);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida configuración de tarjeta de crédito
   */
  static validateCreditCardConfig(
    creditLimit: number,
    cutoffDay: number,
    paymentDay: number
  ): ValidationResult {
    const errors: string[] = [];

    if (creditLimit <= ACCOUNT_VALIDATION.creditLimit.min) {
      errors.push(ERROR_MESSAGES.INVALID_CREDIT_LIMIT);
    }

    if (
      cutoffDay < ACCOUNT_VALIDATION.cutoffDay.min ||
      cutoffDay > ACCOUNT_VALIDATION.cutoffDay.max
    ) {
      errors.push(ERROR_MESSAGES.INVALID_CUTOFF_DAY);
    }

    if (
      paymentDay < ACCOUNT_VALIDATION.paymentDay.min ||
      paymentDay > ACCOUNT_VALIDATION.paymentDay.max
    ) {
      errors.push(ERROR_MESSAGES.INVALID_PAYMENT_DAY);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Validador de categorías
 */
export class CategoryValidator {
  /**
   * Valida el nombre de una categoría
   */
  static validateName(name: string): ValidationResult {
    const errors: string[] = [];

    if (!name.trim()) {
      errors.push(ERROR_MESSAGES.EMPTY_CATEGORY_NAME);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida que la categoría no exista ya
   */
  static validateUnique(name: string, existingCategories: string[]): ValidationResult {
    const errors: string[] = [];

    if (existingCategories.includes(name.trim())) {
      errors.push(ERROR_MESSAGES.DUPLICATE_CATEGORY);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validación completa de categoría
   */
  static validate(name: string, existingCategories: string[]): ValidationResult {
    const errors: string[] = [];

    // Validar nombre
    const nameValidation = this.validateName(name);
    if (!nameValidation.isValid) {
      errors.push(...nameValidation.errors);
    }

    // Validar unicidad
    if (nameValidation.isValid) {
      const uniqueValidation = this.validateUnique(name, existingCategories);
      if (!uniqueValidation.isValid) {
        errors.push(...uniqueValidation.errors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
