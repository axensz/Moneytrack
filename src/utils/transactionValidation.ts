/**
 * Validación de actualizaciones de transacciones (sin dependencias de Firebase)
 */

import type { Transaction } from '../types/finance';

/**
 * Interfaces para validación de transacciones
 */
export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Valida los campos de una actualización de transacción
 * Verifica que todos los campos presentes sean válidos
 *
 * Nota: la descripción vacía ('' o '   ') se acepta intencionalmente (fix #17);
 * solo se valida que, si está presente, sea texto.
 */
export function validateTransactionUpdate(updates: Partial<Transaction>): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate amount if present
  if ('amount' in updates) {
    if (updates.amount === undefined || updates.amount === null) {
      errors.push({ field: 'amount', message: 'El monto es requerido' });
    } else if (typeof updates.amount !== 'number' || isNaN(updates.amount)) {
      errors.push({ field: 'amount', message: 'El monto debe ser un número válido' });
    } else if (updates.amount <= 0) {
      errors.push({ field: 'amount', message: 'El monto debe ser mayor a 0' });
    }
  }

  // Validate description if present
  if ('description' in updates) {
    if (updates.description === undefined || updates.description === null) {
      errors.push({ field: 'description', message: 'La descripción es requerida' });
    } else if (typeof updates.description !== 'string') {
      errors.push({ field: 'description', message: 'La descripción debe ser texto' });
    }
  }

  // Validate date if present
  if ('date' in updates) {
    if (updates.date === undefined || updates.date === null) {
      errors.push({ field: 'date', message: 'La fecha es requerida' });
    } else if (!(updates.date instanceof Date)) {
      errors.push({ field: 'date', message: 'La fecha debe ser un objeto Date válido' });
    } else if (isNaN(updates.date.getTime())) {
      errors.push({ field: 'date', message: 'La fecha no es válida' });
    }
  }

  // Validate category if present
  if ('category' in updates) {
    if (updates.category === undefined || updates.category === null) {
      errors.push({ field: 'category', message: 'La categoría es requerida' });
    } else if (typeof updates.category !== 'string') {
      errors.push({ field: 'category', message: 'La categoría debe ser texto' });
    } else if (updates.category.trim() === '') {
      errors.push({ field: 'category', message: 'La categoría no puede estar vacía' });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
