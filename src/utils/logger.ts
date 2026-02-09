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

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogContext {
  [key: string]: any;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  /**
   * Registra un error crítico
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    this.log('error', message, error, context);

    // TODO: En producción, enviar a Sentry
    // if (!this.isDevelopment && typeof window !== 'undefined') {
    //   Sentry.captureException(error, { extra: { message, ...context } });
    // }
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

    switch (level) {
      case 'error':
        console.error(prefix, message, error || '', context || '');
        break;
      case 'warn':
        console.warn(prefix, message, context || '');
        break;
      case 'info':
        console.info(prefix, message, context || '');
        break;
      case 'debug':
        console.debug(prefix, message, context || '');
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
