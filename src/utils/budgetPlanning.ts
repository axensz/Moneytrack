import { SPECIAL_CATEGORIES } from '../config/constants';
import type { Transaction } from '../types/finance';

export type BudgetCategoryGroup = 'need' | 'want';

const NEED_CATEGORIES = new Set([
  'alimentacion',
  'arriendo',
  'comida',
  'educacion',
  'hogar',
  'internet',
  'mercado',
  'salud',
  'seguro',
  'seguros',
  'servicios',
  'suscripciones',
  'telefono',
  'transporte',
  'vivienda',
]);

const FIXED_NEED_CATEGORIES = new Set([
  'arriendo',
  'educacion',
  'internet',
  'salud',
  'seguro',
  'seguros',
  'servicios',
  'suscripciones',
  'telefono',
  'vivienda',
]);

export function normalizeBudgetCategory(category: string): string {
  return category
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function classifyBudgetCategory(category: string): BudgetCategoryGroup {
  return NEED_CATEGORIES.has(normalizeBudgetCategory(category)) ? 'need' : 'want';
}

export function isFixedBudgetCategory(category: string): boolean {
  return FIXED_NEED_CATEGORIES.has(normalizeBudgetCategory(category));
}

export function isRealBudgetTransaction(transaction: Transaction): boolean {
  return (
    transaction.paid &&
    transaction.type !== 'transfer' &&
    !SPECIAL_CATEGORIES.adjustmentCategories.includes(transaction.category)
  );
}

export function isRealBudgetExpense(transaction: Transaction): boolean {
  return isRealBudgetTransaction(transaction) && transaction.type === 'expense';
}

export function isRealBudgetIncome(transaction: Transaction): boolean {
  return isRealBudgetTransaction(transaction) && transaction.type === 'income';
}
