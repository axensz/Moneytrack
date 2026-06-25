/**
 * Service Worker Registration Utility
 * Handles registration, updates, and lifecycle management
 */

export interface ServiceWorkerConfig {
    onSuccess?: (registration: ServiceWorkerRegistration) => void;
    onUpdate?: (registration: ServiceWorkerRegistration) => void;
    onError?: (error: Error) => void;
}

function getBasePath(): string {
    const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    if (configuredBasePath) {
        return configuredBasePath;
    }

    if (typeof window === "undefined") {
        return "";
    }

    // Nota seguridad (CodeQL js/incomplete-url-substring-sanitization #10):
    // se exige el punto inicial ".github.io" para que un host malicioso como
    // "evilgithub.io" NO matchee; solo "<usuario>.github.io" es válido.
    const { hostname } = window.location;
    if (hostname === "github.io" || hostname.endsWith(".github.io")) {
        const [firstSegment] = window.location.pathname.split("/").filter(Boolean);
        return firstSegment ? `/${firstSegment}` : "";
    }

    return "";
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

        const basePath = getBasePath();
        const registration = await navigator.serviceWorker.register(`${basePath}/sw.js`, {
            scope: `${basePath}/`,
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

// ponytail: borradas unregisterServiceWorker/skipWaiting/clearCaches/
// isServiceWorkerActive/getServiceWorkerRegistration — sin uso (knip). Recuperar
// de git si vuelven a hacer falta.
