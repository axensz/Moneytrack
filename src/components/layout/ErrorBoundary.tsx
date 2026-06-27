'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
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
 * S8 / Q-errboundary: ÚNICO Error Boundary de la app. Captura errores del árbol
 * de React, los reporta al errorReporter (con componentStack) y muestra una UI de
 * recuperación. Consolida los dos boundaries previos (este + el antiguo
 * `components/ErrorBoundary`) en uno solo, conservando: reporte vía captureError,
 * detección del error de configuración de Firebase (ayuda en dev) y retry suave.
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

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const errorMessage = this.state.error?.message || 'Error desconocido';
    const isFirebaseError =
      errorMessage.includes('Firebase') || errorMessage.includes('API key');

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">
            {isFirebaseError ? '🔥 Error de configuración Firebase' : 'Algo salió mal'}
          </h1>

          {isFirebaseError ? (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm font-mono text-red-800 dark:text-red-400 whitespace-pre-wrap">
                  {errorMessage}
                </p>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  📋 Solución rápida:
                </h3>
                <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-2 list-decimal list-inside">
                  <li>Abre el archivo <code className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">.env.local</code></li>
                  <li>Ve a <a href="https://console.firebase.google.com" target="_blank" rel="noopener" className="underline">Firebase Console</a></li>
                  <li>Copia tus credenciales reales</li>
                  <li>Reemplaza los valores placeholder</li>
                  <li>Reinicia el servidor: <code className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">npm run dev</code></li>
                </ol>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-3">
                  Ver <strong>FIREBASE_SETUP.md</strong> para instrucciones detalladas
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-gray-600 dark:text-gray-400 mb-6 text-center">
                Ocurrió un error inesperado. El problema fue registrado automáticamente.
              </p>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-left overflow-auto max-h-40">
                  <pre className="text-xs font-mono text-red-600 dark:text-red-400 whitespace-pre-wrap">
                    {errorMessage}
                    {'\n'}
                    {this.state.error.stack}
                  </pre>
                </div>
              )}
            </>
          )}

          <div className="flex gap-3 justify-center mt-6">
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <RefreshCw className="w-4 h-4" />
              Reintentar
            </button>

            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
            >
              Recargar página
            </button>
          </div>
        </div>
      </div>
    );
  }
}
