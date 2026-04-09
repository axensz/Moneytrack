'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';

interface FirestoreErrorBannerProps {
    error: Error;
    onRetry: () => void;
    isOnline: boolean;
}

/**
 * Banner visible cuando Firestore falla en la carga inicial.
 * Reemplaza el loading infinito con un mensaje accionable.
 */
export const FirestoreErrorBanner: React.FC<FirestoreErrorBannerProps> = ({ error, onRetry, isOnline }) => {
    const isTimeout = error.message.includes('Tiempo de espera');
    const isOffline = !isOnline;

    const icon = isOffline ? WifiOff : AlertTriangle;
    const Icon = icon;

    const title = isOffline
        ? 'Sin conexión a internet'
        : isTimeout
            ? 'No se pudieron cargar los datos'
            : 'Error al conectar con el servidor';

    const description = isOffline
        ? 'Reconecta a internet para ver tus datos actualizados.'
        : isTimeout
            ? 'La conexión tardó demasiado. Verifica tu internet e intenta de nuevo.'
            : error.message;

    return (
        <div className="mx-auto max-w-lg mt-6 mb-4" role="alert">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-5">
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                        <Icon className="h-5 w-5 text-red-500 dark:text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">
                            {title}
                        </h3>
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                            {description}
                        </p>
                        <button
                            onClick={onRetry}
                            className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 rounded-lg transition-colors"
                        >
                            <RefreshCw size={14} />
                            Reintentar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
