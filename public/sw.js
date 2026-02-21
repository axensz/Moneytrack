// Service Worker for MoneyTrack PWA
// Version 1.0.0

const CACHE_VERSION = 'v1';
const CACHE_NAMES = {
    static: `moneytrack-static-${CACHE_VERSION}`,
    api: `moneytrack-api-${CACHE_VERSION}`,
    images: `moneytrack-images-${CACHE_VERSION}`
};

const CACHE_MAX_AGE = {
    static: 30 * 24 * 60 * 60 * 1000,  // 30 days
    api: 5 * 60 * 1000,                 // 5 minutes
    images: 7 * 24 * 60 * 60 * 1000     // 7 days
};

// Critical assets to precache on install
const PRECACHE_ASSETS = [
    '/',
    '/manifest.json',
    '/offline.html'
];

// Install event - precache critical assets
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');

    event.waitUntil(
        caches.open(CACHE_NAMES.static)
            .then((cache) => {
                console.log('[Service Worker] Precaching critical assets');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .then(() => {
                console.log('[Service Worker] Skip waiting');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[Service Worker] Precaching failed:', error);
            })
    );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheName) => {
                            // Delete caches that start with 'moneytrack-' but aren't in current version
                            return cacheName.startsWith('moneytrack-') &&
                                !Object.values(CACHE_NAMES).includes(cacheName);
                        })
                        .map((cacheName) => {
                            console.log('[Service Worker] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => {
                console.log('[Service Worker] Claiming clients');
                return self.clients.claim();
            })
    );
});

// Fetch event - route to appropriate caching strategy
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip chrome-extension and other non-http(s) requests
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // API requests - network first with cache fallback
    if (url.pathname.includes('/api/') ||
        url.hostname.includes('firestore') ||
        url.hostname.includes('firebase')) {
        event.respondWith(networkFirst(request, CACHE_NAMES.api));
        return;
    }

    // Images - stale while revalidate
    if (request.destination === 'image' ||
        url.pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)$/)) {
        event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.images));
        return;
    }

    // Static assets - cache first
    if (url.pathname.match(/\.(js|css|woff|woff2|ttf|eot)$/) ||
        url.pathname === '/' ||
        url.pathname.startsWith('/_next/')) {
        event.respondWith(cacheFirst(request, CACHE_NAMES.static));
        return;
    }

    // Default - network first
    event.respondWith(networkFirst(request, CACHE_NAMES.static));
});

// Cache-first strategy: Check cache first, fallback to network
async function cacheFirst(request, cacheName) {
    try {
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
            console.log('[Service Worker] Cache hit:', request.url);
            return cachedResponse;
        }

        console.log('[Service Worker] Cache miss, fetching:', request.url);
        const networkResponse = await fetch(request);

        // Cache successful responses
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error('[Service Worker] Cache-first failed:', error);

        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
            const offlineResponse = await caches.match('/offline.html');
            if (offlineResponse) {
                return offlineResponse;
            }
        }

        throw error;
    }
}

// Network-first strategy: Try network first, fallback to cache
async function networkFirst(request, cacheName) {
    try {
        console.log('[Service Worker] Network first:', request.url);
        const networkResponse = await fetch(request);

        // Cache successful responses
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('[Service Worker] Network failed, trying cache:', request.url);
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
            console.log('[Service Worker] Serving from cache:', request.url);
            return cachedResponse;
        }

        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
            const offlineResponse = await caches.match('/offline.html');
            if (offlineResponse) {
                return offlineResponse;
            }
        }

        throw error;
    }
}

// Stale-while-revalidate strategy: Serve from cache, update in background
async function staleWhileRevalidate(request, cacheName) {
    const cachedResponse = await caches.match(request);

    const fetchPromise = fetch(request)
        .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                const cache = caches.open(cacheName);
                cache.then((c) => c.put(request, networkResponse.clone()));
            }
            return networkResponse;
        })
        .catch((error) => {
            console.error('[Service Worker] Fetch failed:', error);
            return null;
        });

    // Return cached response immediately if available, otherwise wait for network
    return cachedResponse || fetchPromise;
}

// Message event handler for communication with the app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => caches.delete(cacheName))
                );
            })
        );
    }
});
