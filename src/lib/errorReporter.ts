/**
 * S8: Sistema de reporte de errores pluggable.
 *
 * Por defecto es un no-op. En producción se puede conectar a Sentry, LogRocket
 * u otro servicio llamando a `configureErrorReporter()` antes del primer render.
 *
 * Ejemplo con Sentry:
 *   import * as Sentry from '@sentry/nextjs';
 *   configureErrorReporter({
 *     captureError: (err, ctx) => Sentry.captureException(err, { extra: ctx }),
 *     captureMessage: (msg, ctx) => Sentry.captureMessage(msg, { extra: ctx }),
 *   });
 *
 * El logger llama a captureError() en cada `logger.error()`.
 * installGlobalErrorHandlers() captura errores no atrapados (window.onerror,
 * unhandledrejection) y los envía al reporter activo.
 */

export interface ErrorReporter {
  captureError(error: unknown, context?: Record<string, unknown>): void;
  captureMessage(message: string, context?: Record<string, unknown>): void;
}

const noop: ErrorReporter = {
  captureError: () => {},
  captureMessage: () => {},
};

let _reporter: ErrorReporter = noop;

/** Reemplaza el reporter activo. Llamar antes del primer render. */
export function configureErrorReporter(reporter: ErrorReporter): void {
  _reporter = reporter;
}

/** Envía un error al reporter activo. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  try {
    _reporter.captureError(error, context);
  } catch {
    // El reporter nunca debe hacer caer la app
  }
}

/** Envía un mensaje al reporter activo. */
export function captureMessage(message: string, context?: Record<string, unknown>): void {
  try {
    _reporter.captureMessage(message, context);
  } catch {
    // El reporter nunca debe hacer caer la app
  }
}

/**
 * Instala listeners globales para capturar errores no controlados.
 * Llamar una sola vez, lo antes posible (ej: en el root component con useEffect).
 * Es idempotente: múltiples llamadas no duplican los handlers.
 */
let _handlersInstalled = false;

export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined' || _handlersInstalled) return;
  _handlersInstalled = true;

  // Errores de JS síncronos no capturados
  window.addEventListener('error', (e) => {
    captureError(e.error ?? new Error(e.message), {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      type: 'uncaught-error',
    });
  });

  // Promesas rechazadas sin .catch()
  window.addEventListener('unhandledrejection', (e) => {
    const error =
      e.reason instanceof Error ? e.reason : new Error(String(e.reason ?? 'UnhandledRejection'));
    captureError(error, { type: 'unhandled-rejection' });
  });
}
