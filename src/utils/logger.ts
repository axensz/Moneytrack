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
import { sanitize, sanitizeContext } from './sanitize';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogContext {
  [key: string]: unknown;
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
