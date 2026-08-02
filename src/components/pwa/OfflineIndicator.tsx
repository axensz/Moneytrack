'use client';

import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

/**
 * Banner de estado offline.
 *
 * Firestore (persistentLocalCache) permite VER los datos sin conexión, pero las
 * escrituras requieren conexión (ver useTransactionsCRUD). Este banner informa
 * ese estado en vez de prometer una sincronización que no ocurre.
 */
export function OfflineIndicator() {
    const isOnline = useNetworkStatus();
    const wasOffline = useRef(false);
    const [showReconnected, setShowReconnected] = useState(false);

    useEffect(() => {
        if (!isOnline) {
            wasOffline.current = true;
            setShowReconnected(false);
            return;
        }

        if (!wasOffline.current) return;

        wasOffline.current = false;
        setShowReconnected(true);
        const timer = window.setTimeout(() => setShowReconnected(false), 4_000);
        return () => window.clearTimeout(timer);
    }, [isOnline]);

    if (showReconnected) {
        return (
            <div
                role="status"
                className="fixed top-0 left-0 right-0 z-50 border-b border-success bg-success-muted px-4 py-3 text-success shadow-lg"
            >
                <div className="max-w-7xl mx-auto flex items-center gap-3">
                    <Wifi className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                    <span className="text-sm font-medium">
                        Conexión restablecida — ya puedes guardar cambios.
                    </span>
                </div>
            </div>
        );
    }

    if (isOnline) return null;

    return (
        <div
            role="status"
            className="fixed top-0 left-0 right-0 z-50 bg-warning-muted text-warning border-b border-warning px-4 py-3 shadow-lg"
        >
            <div className="max-w-7xl mx-auto flex items-center gap-3">
                <WifiOff className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm font-medium">
                    Sin conexión — puedes consultar tus datos ya cacheados, pero para guardar cambios necesitas conexión.
                </span>
            </div>
        </div>
    );
}
