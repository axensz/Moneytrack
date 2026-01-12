/**
 * Sistema de validación centralizado
 */

import {
  TRANSACTION_VALIDATION,
  ACCOUNT_VALIDATION,
  ERROR_MESSAGES,
  TRANSFER_CATEGORY
} from '../config/constants';
import type {
  NewTransaction,
  NewAccount,
  ValidationResult
} from '../types/finance';

/**
 * Validador de transacciones
 */
export class TransactionValidator {
  /**
   * Valida una transacción completa
   * @param transaction - Transacción a validar
   * @param accountBalance - Saldo actual de la cuenta (opcional)
   * @param accountType - Tipo de cuenta (opcional)
   * @returns Resultado de validación con errores si los hay
   */
  static validate(
    transaction: NewTransaction, 
    accountBalance?: number, 
    accountType?: 'savings' | 'credit' | 'cash'
  ): ValidationResult {
    const errors: string[] = [];

    // Validar descripción
    if (!transaction.description.trim()) {
      errors.push(ERROR_MESSAGES.EMPTY_DESCRIPTION);
    } else if (transaction.description.length > TRANSACTION_VALIDATION.description.maxLength) {
      errors.push(
        `La descripción no puede tener más de ${TRANSACTION_VALIDATION.description.maxLength} caracteres`
      );
    }

    // Validar categoría (excepto para transferencias)
    if (transaction.type !== 'transfer' && !transaction.category) {
      errors.push(ERROR_MESSAGES.EMPTY_CATEGORY);
    }

    // Validar cuenta destino para transferencias
    if (transaction.type === 'transfer' && !transaction.toAccountId) {
      errors.push(ERROR_MESSAGES.EMPTY_TO_ACCOUNT);
    }

    // Validar que no se transfiera a la misma cuenta
    if (
      transaction.type === 'transfer' &&
      transaction.accountId &&
      transaction.accountId === transaction.toAccountId
    ) {
      errors.push(ERROR_MESSAGES.SAME_ACCOUNT_TRANSFER);
    }

    // Validar monto
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

    // Validar saldo insuficiente para gastos y transferencias
    if (
      (transaction.type === 'expense' || transaction.type === 'transfer') &&
      accountBalance !== undefined &&
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

        // Validar que el día de pago sea después del día de corte
        if (!isNaN(cutoffDay) && !isNaN(paymentDay) && paymentDay <= cutoffDay) {
          errors.push(ERROR_MESSAGES.PAYMENT_BEFORE_CUTOFF);
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

    if (paymentDay <= cutoffDay) {
      errors.push(ERROR_MESSAGES.PAYMENT_BEFORE_CUTOFF);
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
