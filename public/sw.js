// Service Worker for MoneyTrack PWA
// Bump CACHE_VERSION on each deploy to invalidate old caches
const CACHE_VERSION = 'v3-5591401';
const APP_BASE_PATH = (() => {
    const scopePath = new URL(self.registration.scope).pathname.replace(/\/$/, '');
    return scopePath === '' ? '' : scopePath;
})();
const CACHE_NAMES = {
    static: 'moneytrack-static',
    api: `moneytrack-api-${CACHE_VERSION}`,
    images: `moneytrack-images-${CACHE_VERSION}`
};

function withBasePath(path) {
    return `${APP_BASE_PATH}${path}`;
}

function getAppPath(pathname) {
    if (APP_BASE_PATH && pathname.startsWith(APP_BASE_PATH)) {
        return pathname.slice(APP_BASE_PATH.length) || '/';
    }

    return pathname;
}

// Critical assets to precache on install
const PRECACHE_ASSETS = [
    withBasePath('/'),
    withBasePath('/manifest.json'),
    withBasePath('/offline.html')
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
                            // Keep static build assets across deploys so older open tabs can still load chunks.
                            if (cacheName.startsWith('moneytrack-static')) {
                                return false;
                            }

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
    const appPath = getAppPath(url.pathname);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip chrome-extension and other non-http(s) requests
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // API requests - network first with cache fallback
    if (appPath.includes('/api/') ||
        url.hostname.includes('firestore') ||
        url.hostname.includes('firebase')) {
        event.respondWith(networkFirst(request, CACHE_NAMES.api));
        return;
    }

    // App pages - prefer fresh HTML so it points at the current Next.js chunks.
    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request, CACHE_NAMES.static));
        return;
    }

    // Images - stale while revalidate
    if (request.destination === 'image' ||
        appPath.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)$/)) {
        event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.images));
        return;
    }

    // Static assets - cache first
    if (appPath.match(/\.(js|css|woff|woff2|ttf|eot)$/) ||
        appPath.startsWith('/_next/')) {
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
            const offlineResponse = await caches.match(withBasePath('/offline.html'));
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
            const offlineResponse = await caches.match(withBasePath('/offline.html'));
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

    if (event.data && event.data.type === 'NOTIFICATIONS_CLEAR_ACCOUNT') {
        event.waitUntil(serializePush(() => clearAccount(event.data.accountScope)));
    }

    if (event.data && event.data.type === 'NOTIFICATIONS_SET_ACCOUNT') {
        event.waitUntil(serializePush(() => setAccount(event.data.accountScope)));
    }
});

// ---------------------------------------------------------------------------
// Web Push hardening: private, deduplicated notifications.
//
// The service worker treats every push as untrusted. It only shows a
// notification when the payload matches the approved wire contract AND the
// approved copy table, targets the currently active (non-blocked) account, and
// has not already been shown. All durable state lives in a dedicated versioned
// cache and never contains endpoint/capability data.
// ---------------------------------------------------------------------------

const PUSH_STATE_CACHE = 'moneytrack-push-state-v1';
const PUSH_MAX_RAW_BYTES = 4096;
const PUSH_SCHEMA_VERSION = 1;
const PUSH_MAX_DELIVERIES_PER_SCOPE = 256;
const PUSH_MAX_REVISIONS_PER_SCOPE = 256;
const PUSH_MAX_BLOCKED_ACCOUNTS = 16;
const PUSH_STATE_KEY_PREFIX = '/__push-state__/';

// Approved copy table. A payload must match title + body + actionUrl for its
// kind EXACTLY, otherwise we show nothing.
const PUSH_COPY = {
    daily: {
        title: 'Registro diario pendiente',
        body: 'Abre MoneyTrack para revisar tu registro diario.',
        actionUrl: '/'
    },
    recurring: {
        title: 'Recordatorio de pago',
        body: 'Abre MoneyTrack para revisar un pago recurrente.',
        actionUrl: '/?view=recurring'
    },
    debt: {
        title: 'Recordatorio de deuda',
        body: 'Abre MoneyTrack para revisar una deuda.',
        actionUrl: '/?view=debts'
    },
    test: {
        title: 'Prueba de notificaciones',
        body: 'MoneyTrack puede enviar notificaciones a este dispositivo.',
        actionUrl: '/'
    }
};

const PUSH_ICON_PATH = '/icons/icon-192x192.png';
const PUSH_BADGE_PATH = '/icons/icon-96x96.png';

// Serialize ALL push handling through a single promise chain so concurrent
// pushes are checked and updated atomically (dedupe, revisions, active scope).
let pushChain = Promise.resolve();

function serializePush(task) {
    const run = pushChain.then(task, task);
    // Never let a rejection break the chain for subsequent pushes.
    pushChain = run.catch(() => undefined);
    return run;
}

function pushStateKey(name) {
    return `${self.location.origin}${PUSH_STATE_KEY_PREFIX}${name}`;
}

async function readPushState(name, fallback) {
    try {
        const cache = await caches.open(PUSH_STATE_CACHE);
        const response = await cache.match(pushStateKey(name));
        if (!response) {
            return fallback;
        }
        const text = await response.text();
        return JSON.parse(text);
    } catch (error) {
        console.error('[Service Worker] Failed to read push state:', error);
        return fallback;
    }
}

async function writePushState(name, value) {
    const cache = await caches.open(PUSH_STATE_CACHE);
    await cache.put(pushStateKey(name), new Response(JSON.stringify(value)));
}

// State layout (all partitioned by accountScope):
//   activeScope: string | null
//   blocked: string[]                          (tombstoned scopes, max 16)
//   deliveries: { [scope]: { [deliveryId]: expiresAtMs } }
//   revisions:  { [scope]: { [eventId]: { revision, expiresAtMs } } }
async function readAccountState() {
    return readPushState('accounts', { activeScope: null, blocked: [] });
}

async function writeAccountState(state) {
    await writePushState('accounts', state);
}

async function readDeliveries() {
    return readPushState('deliveries', {});
}

async function writeDeliveries(state) {
    await writePushState('deliveries', state);
}

async function readRevisions() {
    return readPushState('revisions', {});
}

async function writeRevisions(state) {
    await writePushState('revisions', state);
}

function bytesFromBase64Url(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function computeTopic(accountScope, eventId) {
    const input = `${accountScope}:${eventId}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return bytesFromBase64Url(digest).slice(0, 32);
}

function isAllowedActionUrl(kind, actionUrl) {
    const expected = PUSH_COPY[kind] && PUSH_COPY[kind].actionUrl;
    return typeof expected === 'string' && actionUrl === expected;
}

// Validate the raw text into a normalized payload, or return null to show
// nothing. Never throws.
async function parsePushPayload(rawText) {
    if (typeof rawText !== 'string') {
        return null;
    }

    // Enforce the byte budget BEFORE parsing.
    if (new TextEncoder().encode(rawText).byteLength > PUSH_MAX_RAW_BYTES) {
        return null;
    }

    let payload;
    try {
        payload = JSON.parse(rawText);
    } catch {
        return null;
    }

    if (!payload || typeof payload !== 'object') {
        return null;
    }

    if (payload.schemaVersion !== PUSH_SCHEMA_VERSION) {
        return null;
    }

    const {
        accountScope,
        deliveryId,
        eventId,
        eventRevision,
        expiresAt,
        kind,
        title,
        body,
        notificationTag,
        actionUrl
    } = payload;

    if (typeof accountScope !== 'string' || accountScope.length === 0) {
        return null;
    }
    if (typeof deliveryId !== 'string' || deliveryId.length === 0) {
        return null;
    }
    if (typeof eventId !== 'string' || eventId.length === 0) {
        return null;
    }
    if (typeof eventRevision !== 'number' || !Number.isInteger(eventRevision) || eventRevision < 0) {
        return null;
    }
    if (typeof expiresAt !== 'string') {
        return null;
    }

    const expiresAtMs = Date.parse(expiresAt);
    if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
        return null;
    }

    const copy = PUSH_COPY[kind];
    if (!copy) {
        return null;
    }
    if (title !== copy.title || body !== copy.body) {
        return null;
    }
    if (!isAllowedActionUrl(kind, actionUrl)) {
        return null;
    }

    // Recompute the topic and require the stable, deterministic tag.
    const topic = await computeTopic(accountScope, eventId);
    if (notificationTag !== `moneytrack-${topic}`) {
        return null;
    }

    return {
        accountScope,
        deliveryId,
        eventId,
        eventRevision,
        expiresAtMs,
        kind,
        title,
        body,
        actionUrl,
        notificationTag
    };
}

function pruneMap(entries, expiresAtOf, max) {
    const now = Date.now();
    let kept = Object.entries(entries).filter(([, value]) => expiresAtOf(value) > now);

    if (kept.length > max) {
        kept = kept
            .sort((a, b) => expiresAtOf(a[1]) - expiresAtOf(b[1]))
            .slice(kept.length - max);
    }

    const result = {};
    for (const [key, value] of kept) {
        result[key] = value;
    }
    return result;
}

// Same-origin, allowlisted URL for the notification action.
function canonicalActionUrl(actionUrl) {
    const target = new URL(withBasePath(actionUrl), self.location.origin);
    if (target.origin !== self.location.origin) {
        return null;
    }
    return target.href;
}

async function showValidatedNotification(payload) {
    const targetUrl = canonicalActionUrl(payload.actionUrl);
    if (!targetUrl) {
        return false;
    }

    await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: withBasePath(PUSH_ICON_PATH),
        badge: withBasePath(PUSH_BADGE_PATH),
        tag: payload.notificationTag,
        data: {
            url: targetUrl,
            accountScope: payload.accountScope
        }
    });
    return true;
}

async function handlePush(rawText) {
    const payload = await parsePushPayload(rawText);
    if (!payload) {
        return;
    }

    const accounts = await readAccountState();

    // Eligible only when scope is active AND not blocked.
    if (accounts.activeScope !== payload.accountScope) {
        return;
    }
    if (Array.isArray(accounts.blocked) && accounts.blocked.includes(payload.accountScope)) {
        return;
    }

    // Dedupe by deliveryId (partitioned by scope).
    const deliveries = await readDeliveries();
    const scopeDeliveries = deliveries[payload.accountScope] || {};
    if (Object.prototype.hasOwnProperty.call(scopeDeliveries, payload.deliveryId)) {
        return;
    }

    // Enforce monotonic revisions per (scope, event).
    const revisions = await readRevisions();
    const scopeRevisions = revisions[payload.accountScope] || {};
    const previous = scopeRevisions[payload.eventId];
    if (previous && payload.eventRevision < previous.revision) {
        return;
    }

    const shown = await showValidatedNotification(payload);
    if (!shown) {
        return;
    }

    // Record delivery + revision atomically, pruning per scope.
    scopeDeliveries[payload.deliveryId] = payload.expiresAtMs;
    deliveries[payload.accountScope] = pruneMap(
        scopeDeliveries,
        (value) => value,
        PUSH_MAX_DELIVERIES_PER_SCOPE
    );
    await writeDeliveries(deliveries);

    scopeRevisions[payload.eventId] = {
        revision: payload.eventRevision,
        expiresAtMs: payload.expiresAtMs
    };
    revisions[payload.accountScope] = pruneMap(
        scopeRevisions,
        (value) => value.expiresAtMs,
        PUSH_MAX_REVISIONS_PER_SCOPE
    );
    await writeRevisions(revisions);
}

self.addEventListener('push', (event) => {
    let rawText = '';
    try {
        rawText = event.data ? event.data.text() : '';
    } catch {
        rawText = '';
    }

    event.waitUntil(serializePush(() => handlePush(rawText)));
});

self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    client.postMessage({ type: 'WEB_PUSH_RECOVERY_REQUIRED' });
                }
            })
    );
});

async function clearAccount(accountScope) {
    if (typeof accountScope !== 'string' || accountScope.length === 0) {
        return;
    }

    // Close only this account's visible notifications.
    if (self.registration.getNotifications) {
        const notifications = await self.registration.getNotifications();
        for (const notification of notifications) {
            if (notification.data && notification.data.accountScope === accountScope) {
                notification.close();
            }
        }
    }

    // Remove only this account's dedupe + revision state.
    const deliveries = await readDeliveries();
    if (deliveries[accountScope]) {
        delete deliveries[accountScope];
        await writeDeliveries(deliveries);
    }
    const revisions = await readRevisions();
    if (revisions[accountScope]) {
        delete revisions[accountScope];
        await writeRevisions(revisions);
    }

    // Persist a blocked-account tombstone and clear the active account.
    const accounts = await readAccountState();
    const blocked = Array.isArray(accounts.blocked) ? accounts.blocked : [];
    const nextBlocked = blocked.filter((scope) => scope !== accountScope);
    nextBlocked.push(accountScope);
    while (nextBlocked.length > PUSH_MAX_BLOCKED_ACCOUNTS) {
        nextBlocked.shift();
    }

    await writeAccountState({
        activeScope: accounts.activeScope === accountScope ? null : accounts.activeScope,
        blocked: nextBlocked
    });
}

async function setAccount(accountScope) {
    if (typeof accountScope !== 'string' || accountScope.length === 0) {
        return;
    }

    const accounts = await readAccountState();
    const blocked = Array.isArray(accounts.blocked) ? accounts.blocked : [];

    await writeAccountState({
        activeScope: accountScope,
        // Remove only this scope's prior tombstone; others stay blocked.
        blocked: blocked.filter((scope) => scope !== accountScope)
    });
}

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // Re-validate the stored URL: only ever navigate to a same-origin target.
    const rawUrl = event.notification.data && event.notification.data.url;
    let targetUrl;
    try {
        const candidate = new URL(rawUrl || withBasePath('/'), self.location.origin);
        targetUrl = candidate.origin === self.location.origin
            ? candidate.href
            : new URL(withBasePath('/'), self.location.origin).href;
    } catch {
        targetUrl = new URL(withBasePath('/'), self.location.origin).href;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                const sameOrigin = clientList.filter((client) => {
                    try {
                        return new URL(client.url).origin === self.location.origin;
                    } catch {
                        return false;
                    }
                });

                const exact = sameOrigin.find((client) => client.url === targetUrl);
                if (exact) {
                    return exact.focus();
                }

                const existing = sameOrigin[0];
                if (existing) {
                    if (typeof existing.navigate === 'function') {
                        return existing.navigate(targetUrl).then((client) => {
                            return client && client.focus ? client.focus() : client;
                        });
                    }
                    return existing.focus();
                }

                return clients.openWindow(targetUrl);
            })
    );
});
