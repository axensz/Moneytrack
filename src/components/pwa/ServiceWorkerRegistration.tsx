'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/serviceWorker';
import toast from 'react-hot-toast';

/**
 * Component that registers the service worker on mount
 * Should be included in the root layout
 */
export function ServiceWorkerRegistration() {
    useEffect(() => {
        registerServiceWorker({
            onSuccess: () => {
                console.log('Service worker registered successfully');
            },
            onUpdate: () => {
                toast.success(
                    'Nueva versión disponible. Recarga la página para actualizar.',
                    {
                        duration: 10000,
                        position: 'bottom-center',
                    }
                );
            },
            onError: (error) => {
                console.error('Service worker registration failed:', error);
            },
        });
    }, []);

    return null;
}
