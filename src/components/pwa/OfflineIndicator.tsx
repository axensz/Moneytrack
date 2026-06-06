'use client';

import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { WifiOff } from 'lucide-react';

/**
 * Banner de estado offline.
 *
 * Firestore (persistentLocalCache) permite VER los datos sin conexión, pero las
 * escrituras requieren conexión (ver useTransactionsCRUD). Este banner informa
 * ese estado en vez de prometer una sincronización que no ocurre.
 */
export function OfflineIndicator() {
    const isOnline = useNetworkStatus();

    if (isOnline) return null;

    return (
        <div
            role="status"
            className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white px-4 py-3 shadow-lg"
        >
            <div className="max-w-7xl mx-auto flex items-center gap-3">
                <WifiOff className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm font-medium">
                    Sin conexión — puedes consultar tus datos, pero para guardar cambios necesitas conexión.
                </span>
            </div>
        </div>
    );
}
