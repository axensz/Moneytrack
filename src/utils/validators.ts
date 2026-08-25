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
  ERROR_MESSAGES
} from '../config/constants';
import { AccountStrategyFactory } from './accountStrategies';
import { getCreditDelta } from './creditDeltas';
import { getCreditAuthorityState } from './creditAuthority';
import { parseCurrency, roundMoney } from './formatters';
import { LedgerMutationValidationError, planLedgerMutation } from './ledgerMutation';
import type {
  NewTransaction,
  NewAccount,
  ValidationResult,
  Account,
  Transaction
} from '../types/finance';

const parseValidationAmount = (value: string | number): number => {
  if (typeof value === 'number') return value;
  const trimmed = value.trim();
  const sign = trimmed.startsWith('-') ? -1 : 1;
  return sign * parseCurrency(trimmed);
};

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
   * @param original - Al EDITAR: la transacción original, que se excluye del
   *   cálculo de saldo/cupo (en el alta se omite). Sin esto, editar cerca del
   *   límite daría falsos rechazos por doble conteo.
   * @returns Resultado de validación con errores si los hay
   */
  static validate(
    transaction: NewTransaction,
    account?: Account,
    transactions?: Transaction[],
    original?: Transaction
  ): ValidationResult {
    const errors: string[] = [];

    // ===== VALIDACIONES BÁSICAS =====

    // Validar descripción (opcional, pero si existe debe ser válida)
    if (transaction.description && transaction.description.length > TRANSACTION_VALIDATION.description.maxLength) {
      errors.push(
        `La descripción no puede tener más de ${TRANSACTION_VALIDATION.description.maxLength} caracteres`
      );
    }

    // Validar categoría (excepto para transferencias y pagos de Crédito)
    const isTCPayment = account?.type === 'credit' && transaction.type === 'income';
    if (transaction.type !== 'transfer' && !isTCPayment && !transaction.category) {
      errors.push(ERROR_MESSAGES.EMPTY_CATEGORY);
    }

    // Validar cuenta destino para transferencias
    if (transaction.type === 'transfer' && !transaction.toAccountId) {
      errors.push(ERROR_MESSAGES.EMPTY_TO_ACCOUNT);
    }

    // Pagos de crédito: cuenta origen es opcional (permite pagos externos)

    // Validar que no se transfiera a la misma cuenta
    if (
      transaction.type === 'transfer' &&
      transaction.accountId &&
      transaction.accountId === transaction.toAccountId
    ) {
      errors.push(ERROR_MESSAGES.SAME_ACCOUNT_TRANSFER);
    }

    // ===== VALIDACIÓN DE MONTO =====

    const amount = parseValidationAmount(transaction.amount);
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
      // El formulario conserva sus errores de esquema, pero la previsualización
      // financiera usa el mismo planner before/after que la escritura canónica.
      // Las tarjetas conservan además la validación de cupo de producto.
      let validationAccount = account;
      let validationTxs = transactions;
      if (original?.id) {
        validationTxs = transactions.filter((t) => t.id !== original.id);
        if (account.type === 'credit' && account.usedCredit != null) {
          validationAccount = {
            ...account,
            usedCredit: Math.max(
              0,
              roundMoney(account.usedCredit - getCreditDelta(original, account.id!))
            ),
          };
        }
      }

      try {
        const strategy = AccountStrategyFactory.getStrategy(validationAccount.type);

        if (validationAccount.type === 'credit') {
          const authority = getCreditAuthorityState(validationAccount);
          if (!authority.ready) {
            errors.push('La deuda persistida de esta tarjeta requiere conciliación antes de continuar');
          } else {
            const validation = strategy.validateTransaction(
              validationAccount,
              amount,
              validationTxs,
              transaction.type
            );
            if (!validation.valid && validation.error) errors.push(validation.error);
          }
        } else {
          const afterEffect = {
            id: original?.id,
            type: transaction.type,
            amount,
            date: original?.date ?? new Date(0),
            paid: transaction.paid ?? original?.paid ?? true,
            accountId: transaction.accountId || validationAccount.id || '',
            toAccountId: transaction.toAccountId || undefined,
            linkedTransactionId: original?.linkedTransactionId,
          };
          planLedgerMutation(
            {
              kind: original ? 'edit' : 'create',
              before: original ? [original] : [],
              after: [afterEffect],
            },
            [{
              account: validationAccount,
              currentBalance: strategy.calculateBalance(validationAccount, transactions),
            }]
          );
        }
      } catch (error) {
        errors.push(
          error instanceof LedgerMutationValidationError
            ? error.message
            : 'Tipo de cuenta no válido'
        );
      }
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
    const numAmount = parseValidationAmount(amount);

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

        const monthlySpendingLimit = parseFloat(account.monthlySpendingLimit.toString());
        if (
          isNaN(monthlySpendingLimit) ||
          monthlySpendingLimit < ACCOUNT_VALIDATION.monthlySpendingLimit.min ||
          monthlySpendingLimit > ACCOUNT_VALIDATION.monthlySpendingLimit.max ||
          monthlySpendingLimit > creditLimit
        ) {
          errors.push(ERROR_MESSAGES.INVALID_MONTHLY_SPENDING_LIMIT);
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
