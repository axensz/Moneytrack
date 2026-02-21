/**
 * Service Worker Registration Utility
 * Handles registration, updates, and lifecycle management
 */

export interface ServiceWorkerConfig {
    onSuccess?: (registration: ServiceWorkerRegistration) => void;
    onUpdate?: (registration: ServiceWorkerRegistration) => void;
    onError?: (error: Error) => void;
}

/**
 * Register the service worker
 * @param config Optional callbacks for success, update, and error events
 */
export async function registerServiceWorker(
    config?: ServiceWorkerConfig
): Promise<void> {
    // Check if service workers are supported
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        console.log('[SW] Service Worker not supported in this browser');
        return;
    }

    // Only register in production or when explicitly enabled
    if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_SW_DEV) {
        console.log('[SW] Service Worker disabled in development');
        return;
    }

    try {
        // Wait for page load to avoid impacting initial load performance
        if (document.readyState === 'loading') {
            await new Promise((resolve) => {
                window.addEventListener('load', resolve, { once: true });
            });
        }

        console.log('[SW] Registering service worker...');

        const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
        });

        console.log('[SW] Service worker registered successfully');

        // Check for updates
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            console.log('[SW] New service worker found, installing...');

            newWorker.addEventListener('statechange', () => {
                console.log('[SW] Service worker state:', newWorker.state);

                if (newWorker.state === 'installed') {
                    if (navigator.serviceWorker.controller) {
                        // New service worker available
                        console.log('[SW] New service worker available');
                        config?.onUpdate?.(registration);
                    } else {
                        // Service worker installed for the first time
                        console.log('[SW] Service worker installed for the first time');
                        config?.onSuccess?.(registration);
                    }
                }
            });
        });

        // Check for updates periodically (every hour)
        setInterval(() => {
            registration.update();
        }, 60 * 60 * 1000);

        // Initial success callback if no update is pending
        if (!registration.installing && !registration.waiting) {
            config?.onSuccess?.(registration);
        }
    } catch (error) {
        console.error('[SW] Service worker registration failed:', error);
        config?.onError?.(error as Error);
    }
}

/**
 * Unregister the service worker
 * @returns Promise that resolves to true if unregistration was successful
 */
export async function unregisterServiceWorker(): Promise<boolean> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        return false;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        const success = await registration.unregister();

        if (success) {
            console.log('[SW] Service worker unregistered successfully');
        }

        return success;
    } catch (error) {
        console.error('[SW] Service worker unregistration failed:', error);
        return false;
    }
}

/**
 * Skip waiting and activate new service worker immediately
 */
export function skipWaiting(): void {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        return;
    }

    navigator.serviceWorker.ready.then((registration) => {
        if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    });
}

/**
 * Clear all caches
 */
export async function clearCaches(): Promise<void> {
    if (typeof window === 'undefined' || !('caches' in window)) {
        return;
    }

    try {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames.map((cacheName) => caches.delete(cacheName))
        );
        console.log('[SW] All caches cleared');
    } catch (error) {
        console.error('[SW] Failed to clear caches:', error);
    }
}

/**
 * Check if service worker is registered and active
 */
export function isServiceWorkerActive(): boolean {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        return false;
    }

    return !!navigator.serviceWorker.controller;
}

/**
 * Get service worker registration
 */
export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration || null;
    } catch (error) {
        console.error('[SW] Failed to get service worker registration:', error);
        return null;
    }
}
