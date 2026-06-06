'use client';

import React from 'react';
import { captureError } from '../../lib/errorReporter';

interface Props {
  children: React.ReactNode;
  /** Nodo alternativo a renderizar cuando hay error (override del fallback por defecto). */
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * S8: Captura errores en el árbol de React y los envía al errorReporter.
 * Sin este componente, los errores de render dejan la app en blanco sin registro.
 *
 * Uso: envuelve el root del árbol de componentes.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    captureError(error, {
      componentStack: info.componentStack ?? undefined,
      type: 'react-error-boundary',
    });
  }

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex min-h-screen items-center justify-center p-8 bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <span className="text-3xl" aria-hidden="true">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Algo salió mal
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Ocurrió un error inesperado. El problema fue registrado automáticamente.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            Recargar aplicación
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mt-6 text-left">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                Detalles del error (solo en desarrollo)
              </summary>
              <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-auto text-red-600 dark:text-red-400 whitespace-pre-wrap">
                {this.state.error.message}
                {'\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
