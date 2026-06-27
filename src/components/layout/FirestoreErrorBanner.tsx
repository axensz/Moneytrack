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
            <div className="bg-destructive-muted border border-destructive/40 rounded-xl p-5">
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                        <Icon className="h-5 w-5 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-destructive">
                            {title}
                        </h3>
                        <p className="mt-1 text-sm text-destructive">
                            {description}
                        </p>
                        <button
                            onClick={onRetry}
                            className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-destructive hover:opacity-90 rounded-lg transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
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
