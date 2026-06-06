/**
 * 🟢 LOGGER PROFESIONAL
 *
 * Sistema centralizado de logging con niveles y opciones de envío a servicios externos
 * (Sentry, LogRocket, etc.)
 *
 * NIVELES:
 * - error: Errores críticos que requieren atención
 * - warn: Advertencias que no bloquean la funcionalidad
 * - info: Información general de la aplicación
 * - debug: Información detallada solo en desarrollo
 *
 * CONFIGURACIÓN:
 * - Solo registra en consola en desarrollo
 * - En producción, envía a servicio de monitoreo (futuro)
 */

import { captureError } from '../lib/errorReporter';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogContext {
  [key: string]: unknown;
}

/**
 * Campos sensibles que NO deben llegar a consola ni a un servicio de monitoreo
 * (S7). Se redactan recursivamente conservando ids/tipos/conteos para poder
 * depurar sin exponer montos ni descripciones financieras.
 */
const SENSITIVE_KEYS = new Set<string>([
  'amount', 'originalAmount', 'monthlyInstallmentAmount', 'totalInterestAmount',
  'remainingAmount', 'declaredIncome', 'monthlyLimit', 'currentAmount', 'targetAmount',
  'initialBalance', 'balance', 'usedCredit', 'creditLimit', 'lastPaidAmount',
  'description', 'notes', 'personName', 'title', 'message', 'raw', 'geminiApiKey', 'apiKey',
]);

const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const REDACTED = '[redacted]';

/** Redacta recursivamente los campos sensibles de un valor para logging seguro. */
function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[depth-limit]';

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitize(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`…(+${value.length - MAX_ARRAY_ITEMS} more)`);
    return items;
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      out[key] = val == null ? val : REDACTED;
    } else {
      out[key] = sanitize(val, depth + 1);
    }
  }
  return out;
}

function sanitizeContext(context?: LogContext): LogContext | undefined {
  if (!context) return undefined;
  return sanitize(context) as LogContext;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  /**
   * Registra un error crítico
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    this.log('error', message, error, context);
    // S8: delegar al reporter activo (Sentry u otro servicio configurado con
    // configureErrorReporter). El reporter por defecto es un no-op.
    captureError(error ?? new Error(message), context as Record<string, unknown> | undefined);
  }

  /**
   * Registra una advertencia
   */
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, undefined, context);
  }

  /**
   * Registra información general
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, undefined, context);
  }

  /**
   * Registra información de depuración (solo en desarrollo)
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      this.log('debug', message, undefined, context);
    }
  }

  /**
   * Método interno para registrar mensajes
   */
  private log(
    level: LogLevel,
    message: string,
    error?: Error | unknown,
    context?: LogContext
  ): void {
    if (!this.isDevelopment) {
      // En producción, solo registrar errores y advertencias
      if (level !== 'error' && level !== 'warn') {
        return;
      }
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    // S7: redactar campos sensibles antes de que lleguen a consola/monitoreo.
    const safeContext = sanitizeContext(context);

    switch (level) {
      case 'error':
        console.error(prefix, message, error || '', safeContext || '');
        break;
      case 'warn':
        console.warn(prefix, message, safeContext || '');
        break;
      case 'info':
        console.info(prefix, message, safeContext || '');
        break;
      case 'debug':
        console.debug(prefix, message, safeContext || '');
        break;
    }
  }

  /**
   * Registra el inicio de una operación (útil para performance tracking)
   */
  startOperation(operationName: string): () => void {
    const startTime = performance.now();
    this.debug(`Starting operation: ${operationName}`);

    return () => {
      const duration = performance.now() - startTime;
      this.debug(`Operation completed: ${operationName}`, { duration: `${duration.toFixed(2)}ms` });
    };
  }
}

// Exportar instancia singleton
export const logger = new Logger();

// Exportado para tests (S7).
export { sanitize as __sanitizeForTest };
