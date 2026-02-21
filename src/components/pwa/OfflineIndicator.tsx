'use client';

import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { WifiOff, RefreshCw, CheckCircle } from 'lucide-react';

/**
 * Indicator that shows offline status and sync progress
 * Displays at the top of the page when offline or syncing
 */
export function OfflineIndicator() {
    const { isOnline, queueLength, isSyncing, retrySync } = useOfflineQueue();

    // Don't show anything if online and no pending operations
    if (isOnline && queueLength === 0 && !isSyncing) {
        return null;
    }

    return (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white px-4 py-3 shadow-lg">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    {!isOnline ? (
                        <>
                            <WifiOff className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm font-medium">
                                Sin conexión - Los cambios se guardarán cuando vuelvas a estar en línea
                            </span>
                        </>
                    ) : isSyncing ? (
                        <>
                            <RefreshCw className="w-5 h-5 flex-shrink-0 animate-spin" />
                            <span className="text-sm font-medium">
                                Sincronizando {queueLength} {queueLength === 1 ? 'operación' : 'operaciones'} pendiente{queueLength === 1 ? '' : 's'}...
                            </span>
                        </>
                    ) : queueLength > 0 ? (
                        <>
                            <CheckCircle className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm font-medium">
                                {queueLength} {queueLength === 1 ? 'operación' : 'operaciones'} pendiente{queueLength === 1 ? '' : 's'} de sincronizar
                            </span>
                        </>
                    ) : null}
                </div>

                {isOnline && queueLength > 0 && !isSyncing && (
                    <button
                        onClick={retrySync}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white text-amber-600 rounded-md text-sm font-medium hover:bg-amber-50 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Reintentar
                    </button>
                )}
            </div>
        </div>
    );
}
