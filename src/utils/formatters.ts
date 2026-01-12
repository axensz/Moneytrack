/**
 * Utilidades de formato para la aplicación
 */

import { APP_CONFIG, NUMBER_FORMAT_THRESHOLDS } from '../config/constants';

/**
 * Formateador de moneda (singleton)
 */
class CurrencyFormatter {
  private static _formatter: Intl.NumberFormat | null = null;
  private static _compactFormatter: Intl.NumberFormat | null = null;

  private static get formatter(): Intl.NumberFormat {
    if (!this._formatter) {
      this._formatter = new Intl.NumberFormat(APP_CONFIG.locale, {
        style: 'currency',
        currency: APP_CONFIG.currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
    }
    return this._formatter;
  }

  private static get compactFormatter(): Intl.NumberFormat {
    if (!this._compactFormatter) {
      this._compactFormatter = new Intl.NumberFormat(APP_CONFIG.locale, {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1
      });
    }
    return this._compactFormatter;
  }

  /**
   * Formatea un número como moneda
   * @param amount - Cantidad a formatear
   * @returns String formateado como moneda (ej: "$50.000")
   */
  static format(amount: number): string {
    return this.formatter.format(amount);
  }

  /**
   * Formatea un número en formato compacto
   * @param amount - Cantidad a formatear
   * @returns String formateado compacto (ej: "1.5M", "50K")
   */
  static formatCompact(amount: number): string {
    return this.compactFormatter.format(amount);
  }

  /**
   * Formatea un número con símbolo de moneda manualmente
   * Útil para cantidades muy grandes
   */
  static formatLarge(amount: number): string {
    if (amount >= NUMBER_FORMAT_THRESHOLDS.BILLION) {
      return `$${(amount / NUMBER_FORMAT_THRESHOLDS.BILLION).toFixed(1)}B`;
    }
    if (amount >= NUMBER_FORMAT_THRESHOLDS.MILLION) {
      return `$${(amount / NUMBER_FORMAT_THRESHOLDS.MILLION).toFixed(1)}M`;
    }
    if (amount >= NUMBER_FORMAT_THRESHOLDS.THOUSAND) {
      return `$${(amount / NUMBER_FORMAT_THRESHOLDS.THOUSAND).toFixed(1)}K`;
    }
    return this.format(amount);
  }
}

/**
 * Formateador de fechas (singleton)
 */
class DateFormatter {
  /**
   * Formatea una fecha en formato local
   * @param date - Fecha a formatear
   * @returns String formateado (ej: "15/01/2024")
   */
  static formatDate(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString(APP_CONFIG.locale);
  }

  /**
   * Formatea una fecha en formato largo
   * @param date - Fecha a formatear
   * @returns String formateado (ej: "15 de enero de 2024")
   */
  static formatDateLong(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString(APP_CONFIG.locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Formatea una fecha para input HTML date
   * @param date - Fecha a formatear
   * @returns String en formato YYYY-MM-DD
   */
  static formatDateForInput(date: Date = new Date()): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Formatea mes y año
   * @param date - Fecha a formatear
   * @returns String formateado (ej: "ene. 2024")
   */
  static formatMonthYear(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString(APP_CONFIG.locale, {
      year: 'numeric',
      month: 'short'
    });
  }

  /**
   * Obtiene el nombre del mes
   * @param monthNumber - Número del mes (1-12)
   * @returns Nombre del mes
   */
  static getMonthName(monthNumber: number): string {
    const date = new Date(2024, monthNumber - 1, 1);
    return date.toLocaleDateString(APP_CONFIG.locale, { month: 'long' });
  }
}

/**
 * Utilidades de números
 */
class NumberFormatter {
  /**
   * Formatea un número para mostrar en input con separadores de miles
   * @param value - Valor a formatear
   * @returns String formateado con separadores (ej: "1.234.567")
   */
  static formatForInput(value: string | number): string {
    const numStr = value.toString().replace(/[^\d]/g, '');
    if (!numStr) return '';
    return new Intl.NumberFormat('es-CO').format(parseInt(numStr));
  }

  /**
   * Remueve formato de un string para obtener el número
   * @param value - String formateado
   * @returns Número sin formato
   */
  static unformat(value: string): string {
    return value.replace(/[^\d]/g, '');
  }
  /**
   * Parsea un string a número de forma segura
   * @param value - Valor a parsear
   * @param defaultValue - Valor por defecto si el parseo falla
   * @returns Número parseado o valor por defecto
   */
  static parseFloat(value: string | number, defaultValue: number = 0): number {
    const parsed = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Parsea un string a entero de forma segura
   * @param value - Valor a parsear
   * @param defaultValue - Valor por defecto si el parseo falla
   * @returns Entero parseado o valor por defecto
   */
  static parseInt(value: string | number, defaultValue: number = 0): number {
    const parsed = typeof value === 'string' ? parseInt(value, 10) : Math.floor(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Limita un número entre un rango
   * @param value - Valor a limitar
   * @param min - Valor mínimo
   * @param max - Valor máximo
   * @returns Valor limitado
   */
  static clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}

/**
 * Genera un ID único simple
 * Nota: Solo para uso local, no usar para IDs de base de datos
 */
export const generateId = (): string => {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
};

// Exportar funciones directas para compatibilidad
export const formatCurrency = (amount: number): string => CurrencyFormatter.format(amount);
export const formatCurrencyCompact = (amount: number): string => CurrencyFormatter.formatCompact(amount);
export const formatCurrencyLarge = (amount: number): string => CurrencyFormatter.formatLarge(amount);

export const formatDate = (date: Date | string): string => DateFormatter.formatDate(date);
export const formatDateLong = (date: Date | string): string => DateFormatter.formatDateLong(date);
export const formatDateForInput = (date?: Date): string => DateFormatter.formatDateForInput(date);
export const formatMonthYear = (date: Date | string): string => DateFormatter.formatMonthYear(date);
export const getMonthName = (monthNumber: number): string => DateFormatter.getMonthName(monthNumber);

export const parseFloatSafe = (value: string | number, defaultValue?: number): number => NumberFormatter.parseFloat(value, defaultValue);
export const parseIntSafe = (value: string | number, defaultValue?: number): number => NumberFormatter.parseInt(value, defaultValue);
export const clamp = (value: number, min: number, max: number): number => NumberFormatter.clamp(value, min, max);
export const formatNumberForInput = (value: string | number): string => NumberFormatter.formatForInput(value);
export const unformatNumber = (value: string): string => NumberFormatter.unformat(value);

// Exportar clases para uso avanzado
export { CurrencyFormatter, DateFormatter, NumberFormatter };