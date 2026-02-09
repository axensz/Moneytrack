'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logger } from '../utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary para capturar errores en componentes hijos
 * y mostrar una UI de fallback en lugar de colapsar la app
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ErrorBoundary caught an error', error, { errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Detectar error de Firebase
      const isFirebaseError = this.state.error?.message.includes('Firebase') || 
                              this.state.error?.message.includes('API key');
      const errorMessage = this.state.error?.message || 'Error desconocido';

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
                  Ha ocurrido un error inesperado. Por favor, intenta recargar la página.
                </p>

                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-left overflow-auto max-h-32">
                    <p className="text-xs font-mono text-red-600 dark:text-red-400">
                      {errorMessage}
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-3 justify-center mt-6">
              <button
                onClick={this.handleRetry}
                className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors"
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

    return this.props.children;
  }
}
