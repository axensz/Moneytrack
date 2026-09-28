/**
 * Task 5: Harden the real service worker for private, deduplicated Web Push.
 *
 * These tests load the REAL public/sw.js inside a node:vm sandbox with narrow
 * fakes for the service-worker globals. No fake-indexeddb, no extra deps.
 *
 * The worker persists all durable state in the Cache Storage API (which we back
 * with an in-memory Map), so the harness gives it a working CacheStorage and
 * lets each test dispatch synthetic push / notificationclick / message /
 * pushsubscriptionchange events, awaiting the promises the worker passes to
 * event.waitUntil().
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SW_PATH = path.resolve(__dirname, '../../../public/sw.js');
const SW_SOURCE = readFileSync(SW_PATH, 'utf8');

const ORIGIN = 'https://moneytrack.app';
const SCOPE = `${ORIGIN}/`;

const ICON_192 = '/icons/icon-192x192.png';
const BADGE_96 = '/icons/icon-96x96.png';

// ---------------------------------------------------------------------------
// Approved COPY table (must match the worker exactly).
// ---------------------------------------------------------------------------
const COPY = {
    daily: {
        title: 'Registro diario pendiente',
        body: 'Abre MoneyTrack para revisar tu registro diario.',
        actionUrl: '/',
    },
    recurring: {
        title: 'Recordatorio de pago',
        body: 'Abre MoneyTrack para revisar un pago recurrente.',
        actionUrl: '/?view=recurring',
    },
    debt: {
        title: 'Recordatorio de deuda',
        body: 'Abre MoneyTrack para revisar una deuda.',
        actionUrl: '/?view=debts',
    },
    test: {
        title: 'Prueba de notificaciones',
        body: 'MoneyTrack puede enviar notificaciones a este dispositivo.',
        actionUrl: '/',
    },
} as const;

type Kind = keyof typeof COPY;

// ---------------------------------------------------------------------------
// In-memory Cache Storage implementation.
// ---------------------------------------------------------------------------
function requestUrl(req: unknown): string {
    if (typeof req === 'string') return req;
    if (req && typeof (req as { url?: unknown }).url === 'string') {
        return (req as { url: string }).url;
    }
    return String(req);
}

class FakeResponse {
    private readonly bodyText: string;
    readonly status: number;
    constructor(body: string, init?: { status?: number }) {
        this.bodyText = typeof body === 'string' ? body : String(body ?? '');
        this.status = init?.status ?? 200;
    }
    clone() {
        return new FakeResponse(this.bodyText, { status: this.status });
    }
    async text() {
        return this.bodyText;
    }
    async json() {
        return JSON.parse(this.bodyText);
    }
}

class FakeCache {
    store = new Map<string, FakeResponse>();
    async match(req: unknown) {
        return this.store.get(requestUrl(req)) ?? undefined;
    }
    async put(req: unknown, res: FakeResponse) {
        this.store.set(requestUrl(req), res);
    }
    async delete(req: unknown) {
        return this.store.delete(requestUrl(req));
    }
    async keys() {
        return [...this.store.keys()].map((url) => ({ url }));
    }
}

class FakeCacheStorage {
    caches = new Map<string, FakeCache>();
    async open(name: string) {
        let cache = this.caches.get(name);
        if (!cache) {
            cache = new FakeCache();
            this.caches.set(name, cache);
        }
        return cache;
    }
    async has(name: string) {
        return this.caches.has(name);
    }
    async keys() {
        return [...this.caches.keys()];
    }
    async delete(name: string) {
        return this.caches.delete(name);
    }
    async match(req: unknown) {
        for (const cache of this.caches.values()) {
            const hit = await cache.match(req);
            if (hit) return hit;
        }
        return undefined;
    }
}

// ---------------------------------------------------------------------------
// Fake notification (tracked by registration.getNotifications).
// ---------------------------------------------------------------------------
interface ShownNotification {
    title: string;
    options: {
        body?: string;
        icon?: string;
        badge?: string;
        tag?: string;
        data?: { url?: string; accountScope?: string };
    };
    closed: boolean;
    close: () => void;
}

// ---------------------------------------------------------------------------
// Harness that builds a sandbox, runs sw.js in it, and dispatches events.
// ---------------------------------------------------------------------------
interface Harness {
    dispatch: (type: string, event: Record<string, unknown>) => Promise<void>;
    showNotification: ReturnType<typeof vi.fn>;
    shown: ShownNotification[];
    clientsList: FakeClient[];
    openWindow: ReturnType<typeof vi.fn>;
    postedMessages: Array<{ client: FakeClient; message: unknown }>;
    sandbox: Record<string, unknown>;
}

interface FakeClient {
    url: string;
    focused: boolean;
    focus: () => Promise<FakeClient>;
    navigate?: (url: string) => Promise<FakeClient>;
    postMessage: (message: unknown) => void;
}

function buildHarness(): Harness {
    const listeners = new Map<string, ((event: unknown) => void)>();
    const shown: ShownNotification[] = [];
    const clientsList: FakeClient[] = [];
    const postedMessages: Array<{ client: FakeClient; message: unknown }> = [];

    const showNotification = vi.fn(async (title: string, options: ShownNotification['options'] = {}) => {
        // Emulate the real tag-replacement behavior: same tag replaces prior.
        if (options.tag) {
            for (let i = shown.length - 1; i >= 0; i -= 1) {
                if (!shown[i].closed && shown[i].options.tag === options.tag) {
                    shown[i].closed = true;
                }
            }
        }
        const notif: ShownNotification = {
            title,
            options,
            closed: false,
            close() {
                this.closed = true;
            },
        };
        shown.push(notif);
    });

    const getNotifications = vi.fn(async (filter?: { tag?: string }) => {
        // Real Notification objects expose `data`/`tag`/`title` at the top level.
        return shown
            .filter((n) => !n.closed && (!filter?.tag || n.options.tag === filter.tag))
            .map((n) => ({
                title: n.title,
                tag: n.options.tag,
                data: n.options.data,
                close: () => {
                    n.closed = true;
                },
            }));
    });

    const openWindow = vi.fn(async (url: string) => {
        const client: FakeClient = {
            url,
            focused: true,
            focus: async () => client,
            navigate: async (next: string) => {
                client.url = next;
                return client;
            },
            postMessage: (message: unknown) => postedMessages.push({ client, message }),
        };
        clientsList.push(client);
        return client;
    });

    const cacheStorage = new FakeCacheStorage();

    const sandbox: Record<string, unknown> = {};

    const self: Record<string, unknown> = {
        addEventListener: (type: string, listener: (event: unknown) => void) => {
            listeners.set(type, listener);
        },
        registration: {
            scope: SCOPE,
            showNotification,
            getNotifications,
        },
        location: { origin: ORIGIN, href: SCOPE },
        skipWaiting: vi.fn(async () => undefined),
        clients: {
            matchAll: vi.fn(async () => clientsList),
            openWindow,
            claim: vi.fn(async () => undefined),
        },
    };

    sandbox.self = self;
    sandbox.registration = self.registration;
    sandbox.location = self.location;
    sandbox.clients = self.clients;
    sandbox.caches = cacheStorage;
    sandbox.fetch = vi.fn(async () => new FakeResponse('', { status: 200 }));
    sandbox.Response = FakeResponse;
    sandbox.Request = class FakeRequest {
        url: string;
        constructor(url: string) {
            this.url = url;
        }
    };
    sandbox.URL = URL;
    sandbox.URLSearchParams = URLSearchParams;
    sandbox.TextEncoder = TextEncoder;
    sandbox.TextDecoder = TextDecoder;
    sandbox.btoa = (data: string) => Buffer.from(data, 'binary').toString('base64');
    sandbox.atob = (data: string) => Buffer.from(data, 'base64').toString('binary');
    sandbox.crypto = globalThis.crypto;
    sandbox.Notification = function Notification() {};
    sandbox.console = { log: () => {}, warn: () => {}, error: () => {}, info: () => {} };
    sandbox.Promise = Promise;
    sandbox.setTimeout = setTimeout;
    sandbox.clearTimeout = clearTimeout;
    sandbox.globalThis = sandbox;

    const context = vm.createContext(sandbox);
    vm.runInContext(SW_SOURCE, context, { filename: 'sw.js' });

    async function dispatch(type: string, event: Record<string, unknown>) {
        const listener = listeners.get(type);
        if (!listener) {
            throw new Error(`No listener registered for "${type}"`);
        }
        const waits: Array<Promise<unknown>> = [];
        const wrapped = {
            ...event,
            waitUntil: (p: Promise<unknown>) => {
                waits.push(Promise.resolve(p));
            },
        };
        listener(wrapped);
        await Promise.all(waits);
        // Drain any follow-up microtasks the serialized chain may schedule.
        await Promise.resolve();
    }

    return {
        dispatch,
        showNotification,
        shown,
        clientsList,
        openWindow,
        postedMessages,
        sandbox,
    };
}

// ---------------------------------------------------------------------------
// Payload helpers.
// ---------------------------------------------------------------------------
async function sha256Base64Url(input: string): Promise<string> {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const b64 = Buffer.from(new Uint8Array(digest)).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function tagFor(accountScope: string, eventId: string): Promise<string> {
    const topic = (await sha256Base64Url(`${accountScope}:${eventId}`)).slice(0, 32);
    return `moneytrack-${topic}`;
}

interface PayloadOverrides {
    schemaVersion?: number;
    accountScope?: string;
    deliveryId?: string;
    eventId?: string;
    eventRevision?: number;
    expiresAt?: string;
    kind?: Kind;
    title?: string;
    body?: string;
    notificationTag?: string;
    actionUrl?: string;
}

async function makePayload(kind: Kind, overrides: PayloadOverrides = {}): Promise<Record<string, unknown>> {
    const accountScope = overrides.accountScope ?? 'account-a';
    const eventId = overrides.eventId ?? 'event-1';
    const copy = COPY[kind];
    return {
        schemaVersion: overrides.schemaVersion ?? 1,
        accountScope,
        deliveryId: overrides.deliveryId ?? 'delivery-1',
        eventId,
        eventRevision: overrides.eventRevision ?? 1,
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
        kind,
        title: overrides.title ?? copy.title,
        body: overrides.body ?? copy.body,
        notificationTag: overrides.notificationTag ?? (await tagFor(accountScope, eventId)),
        actionUrl: overrides.actionUrl ?? copy.actionUrl,
    };
}

function pushEvent(rawText: string) {
    return {
        data: {
            text: () => rawText,
            json: () => JSON.parse(rawText),
        },
    };
}

async function activateAccount(h: Harness, accountScope: string) {
    await h.dispatch('message', {
        data: { type: 'NOTIFICATIONS_SET_ACCOUNT', accountScope },
    });
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------
describe('service worker web push hardening', () => {
    let h: Harness;

    beforeEach(async () => {
        vi.useRealTimers();
        h = buildHarness();
        await activateAccount(h, 'account-a');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('valid payloads', () => {
        for (const kind of ['daily', 'recurring', 'debt', 'test'] as Kind[]) {
            it(`displays exact constant copy for kind "${kind}"`, async () => {
                const payload = await makePayload(kind);
                await h.dispatch('push', pushEvent(JSON.stringify(payload)));

                expect(h.showNotification).toHaveBeenCalledTimes(1);
                const [title, options] = h.showNotification.mock.calls[0];
                expect(title).toBe(COPY[kind].title);
                expect(options.body).toBe(COPY[kind].body);
                expect(options.icon).toContain(ICON_192);
                expect(options.badge).toContain(BADGE_96);
                expect(options.data?.url).toContain(COPY[kind].actionUrl === '/' ? '/' : 'view=');
            });
        }
    });

    describe('rejected payloads (show nothing)', () => {
        it('rejects rawText over 4096 bytes', async () => {
            const payload = await makePayload('daily');
            const padded = JSON.stringify(payload) + ' '.repeat(4096);
            expect(new TextEncoder().encode(padded).byteLength).toBeGreaterThan(4096);
            await h.dispatch('push', pushEvent(padded));
            expect(h.showNotification).not.toHaveBeenCalled();
        });

        it('rejects invalid JSON', async () => {
            await h.dispatch('push', pushEvent('{ not json'));
            expect(h.showNotification).not.toHaveBeenCalled();
        });

        it('rejects unknown schemaVersion', async () => {
            const payload = await makePayload('daily', { schemaVersion: 2 });
            await h.dispatch('push', pushEvent(JSON.stringify(payload)));
            expect(h.showNotification).not.toHaveBeenCalled();
        });

        it('rejects expired payloads', async () => {
            const payload = await makePayload('daily', {
                expiresAt: new Date(Date.now() - 1000).toISOString(),
            });
            await h.dispatch('push', pushEvent(JSON.stringify(payload)));
            expect(h.showNotification).not.toHaveBeenCalled();
        });

        it('rejects copy that does not match the table', async () => {
            const payload = await makePayload('daily', { body: 'Texto manipulado' });
            await h.dispatch('push', pushEvent(JSON.stringify(payload)));
            expect(h.showNotification).not.toHaveBeenCalled();
        });

        it('rejects mismatched title', async () => {
            const payload = await makePayload('recurring', { title: 'Otro titulo' });
            await h.dispatch('push', pushEvent(JSON.stringify(payload)));
            expect(h.showNotification).not.toHaveBeenCalled();
        });

        it('rejects invalid accountScope', async () => {
            const payload = await makePayload('daily', { accountScope: '' });
            await h.dispatch('push', pushEvent(JSON.stringify(payload)));
            expect(h.showNotification).not.toHaveBeenCalled();
        });

        it('rejects negative revision', async () => {
            const payload = await makePayload('daily', { eventRevision: -3 });
            await h.dispatch('push', pushEvent(JSON.stringify(payload)));
            expect(h.showNotification).not.toHaveBeenCalled();
        });

        it('rejects non-numeric revision', async () => {
            const payload = await makePayload('daily', {
                eventRevision: 'one' as unknown as number,
            });
            await h.dispatch('push', pushEvent(JSON.stringify(payload)));
            expect(h.showNotification).not.toHaveBeenCalled();
        });

        it('rejects external / non-allowlisted actionUrl', async () => {
            const payload = await makePayload('daily', {
                actionUrl: 'https://evil.example.com/steal',
            });
            await h.dispatch('push', pushEvent(JSON.stringify(payload)));
            expect(h.showNotification).not.toHaveBeenCalled();
        });

        it('rejects a mismatched notificationTag', async () => {
            const payload = await makePayload('daily', {
                notificationTag: 'moneytrack-not-the-topic',
            });
            await h.dispatch('push', pushEvent(JSON.stringify(payload)));
            expect(h.showNotification).not.toHaveBeenCalled();
        });

        it('rejects an actionUrl that is valid but wrong for the kind', async () => {
            // recurring copy but daily action url
            const payload = await makePayload('recurring', { actionUrl: '/' });
            await h.dispatch('push', pushEvent(JSON.stringify(payload)));
            expect(h.showNotification).not.toHaveBeenCalled();
        });
    });

    describe('deduplication and revisions', () => {
        it('shows once for two simultaneous identical deliveryIds', async () => {
            const payload = await makePayload('daily', { deliveryId: 'dup-1' });
            const raw = JSON.stringify(payload);
            await Promise.all([
                h.dispatch('push', pushEvent(raw)),
                h.dispatch('push', pushEvent(raw)),
            ]);
            expect(h.showNotification).toHaveBeenCalledTimes(1);
        });

        it('drops a lower revision that arrives after a higher one', async () => {
            const high = await makePayload('daily', {
                deliveryId: 'd-high',
                eventRevision: 5,
            });
            await h.dispatch('push', pushEvent(JSON.stringify(high)));
            expect(h.showNotification).toHaveBeenCalledTimes(1);

            const low = await makePayload('daily', {
                deliveryId: 'd-low',
                eventRevision: 3,
            });
            await h.dispatch('push', pushEvent(JSON.stringify(low)));
            expect(h.showNotification).toHaveBeenCalledTimes(1);
        });

        it('replaces an earlier revision using the stable tag', async () => {
            const first = await makePayload('daily', {
                deliveryId: 'r-1',
                eventRevision: 1,
            });
            const second = await makePayload('daily', {
                deliveryId: 'r-2',
                eventRevision: 2,
            });
            await h.dispatch('push', pushEvent(JSON.stringify(first)));
            await h.dispatch('push', pushEvent(JSON.stringify(second)));

            expect(h.showNotification).toHaveBeenCalledTimes(2);
            const firstTag = h.showNotification.mock.calls[0][1].tag;
            const secondTag = h.showNotification.mock.calls[1][1].tag;
            // Aserción load-bearing: el worker computa un tag determinista por
            // (accountScope,eventId) y deja pasar la revisión superior. El colapso
            // visual bajo un mismo tag es comportamiento del navegador que el fake
            // modela (no lógica del worker), por eso esta última aserción valida el
            // fake; las dos anteriores validan el worker.
            expect(firstTag).toBe(secondTag);
            const visible = h.shown.filter((n) => !n.closed);
            expect(visible).toHaveLength(1);
            expect(visible[0].title).toBe(COPY.daily.title);
        });

        it('isolates the same eventId across two accounts', async () => {
            const a = await makePayload('daily', {
                accountScope: 'account-a',
                eventId: 'shared-event',
                deliveryId: 'a-1',
            });
            await h.dispatch('push', pushEvent(JSON.stringify(a)));
            expect(h.showNotification).toHaveBeenCalledTimes(1);

            await activateAccount(h, 'account-b');
            const b = await makePayload('daily', {
                accountScope: 'account-b',
                eventId: 'shared-event',
                deliveryId: 'b-1',
            });
            await h.dispatch('push', pushEvent(JSON.stringify(b)));
            expect(h.showNotification).toHaveBeenCalledTimes(2);

            const tagA = h.showNotification.mock.calls[0][1].tag;
            const tagB = h.showNotification.mock.calls[1][1].tag;
            expect(tagA).not.toBe(tagB);
        });
    });

    describe('account lifecycle messages', () => {
        it('CLEAR_ACCOUNT closes visible notifications, drops dedupe, blocks queued pushes', async () => {
            const payload = await makePayload('daily', { deliveryId: 'pre-clear' });
            await h.dispatch('push', pushEvent(JSON.stringify(payload)));
            expect(h.shown.filter((n) => !n.closed)).toHaveLength(1);

            await h.dispatch('message', {
                data: { type: 'NOTIFICATIONS_CLEAR_ACCOUNT', accountScope: 'account-a' },
            });
            expect(h.shown.filter((n) => !n.closed)).toHaveLength(0);

            // A queued account-a push after logout is discarded (no active account).
            const queued = await makePayload('daily', { deliveryId: 'post-clear' });
            await h.dispatch('push', pushEvent(JSON.stringify(queued)));
            expect(h.showNotification).toHaveBeenCalledTimes(1);
        });

        it('CLEAR_ACCOUNT only touches its own account, not others', async () => {
            await activateAccount(h, 'account-b');
            const bPayload = await makePayload('daily', {
                accountScope: 'account-b',
                deliveryId: 'b-visible',
            });
            await h.dispatch('push', pushEvent(JSON.stringify(bPayload)));
            expect(h.shown.filter((n) => !n.closed)).toHaveLength(1);

            // Clearing account-a should not close account-b's notification.
            await h.dispatch('message', {
                data: { type: 'NOTIFICATIONS_CLEAR_ACCOUNT', accountScope: 'account-a' },
            });
            expect(h.shown.filter((n) => !n.closed)).toHaveLength(1);
        });

        it('a queued account-A push after SET_ACCOUNT to B is discarded', async () => {
            await activateAccount(h, 'account-b');
            const queuedA = await makePayload('daily', {
                accountScope: 'account-a',
                deliveryId: 'stale-a',
            });
            await h.dispatch('push', pushEvent(JSON.stringify(queuedA)));
            expect(h.showNotification).not.toHaveBeenCalled();
        });

        it('SET_ACCOUNT activates exactly one scope and rejects others', async () => {
            await activateAccount(h, 'account-b');
            const bPayload = await makePayload('daily', {
                accountScope: 'account-b',
                deliveryId: 'b-ok',
            });
            await h.dispatch('push', pushEvent(JSON.stringify(bPayload)));
            expect(h.showNotification).toHaveBeenCalledTimes(1);

            const cPayload = await makePayload('daily', {
                accountScope: 'account-c',
                deliveryId: 'c-reject',
            });
            await h.dispatch('push', pushEvent(JSON.stringify(cPayload)));
            expect(h.showNotification).toHaveBeenCalledTimes(1);
        });

        it('SET_ACCOUNT removes its own prior tombstone so pushes resume', async () => {
            // Block account-a via CLEAR_ACCOUNT, then re-activate it.
            await h.dispatch('message', {
                data: { type: 'NOTIFICATIONS_CLEAR_ACCOUNT', accountScope: 'account-a' },
            });
            await activateAccount(h, 'account-a');

            const payload = await makePayload('daily', { deliveryId: 'after-reactivate' });
            await h.dispatch('push', pushEvent(JSON.stringify(payload)));
            expect(h.showNotification).toHaveBeenCalledTimes(1);
        });
    });

    describe('notificationclick', () => {
        it('focuses an existing MoneyTrack client', async () => {
            const existing: FakeClient = {
                url: `${ORIGIN}/?view=recurring`,
                focused: false,
                focus: vi.fn(async function (this: FakeClient) {
                    this.focused = true;
                    return this;
                }),
                navigate: vi.fn(async function (this: FakeClient, next: string) {
                    this.url = next;
                    return this;
                }),
                postMessage: () => {},
            };
            h.clientsList.push(existing);

            await h.dispatch('notificationclick', {
                notification: {
                    data: { url: `${ORIGIN}/?view=recurring` },
                    close: () => {},
                },
            });

            expect(existing.focus).toHaveBeenCalled();
            expect(h.openWindow).not.toHaveBeenCalled();
        });

        it('opens exactly one same-origin window when none exist', async () => {
            await h.dispatch('notificationclick', {
                notification: {
                    data: { url: `${ORIGIN}/?view=debts` },
                    close: () => {},
                },
            });
            expect(h.openWindow).toHaveBeenCalledTimes(1);
            const opened = h.openWindow.mock.calls[0][0] as string;
            const openedUrl = new URL(opened);
            expect(openedUrl.origin).toBe(ORIGIN);
        });

        it('never navigates to a cross-origin url', async () => {
            // Sin clientes abiertos, el worker DEBE abrir exactamente una ventana
            // y saneada al mismo origen (nunca al host hostil almacenado).
            await h.dispatch('notificationclick', {
                notification: {
                    data: { url: 'https://evil.example.com/phish' },
                    close: () => {},
                },
            });
            expect(h.openWindow).toHaveBeenCalledTimes(1);
            const opened = h.openWindow.mock.calls[0][0] as string;
            const openedUrl = new URL(opened);
            expect(openedUrl.origin).toBe(ORIGIN);
            expect(opened).not.toContain('evil.example.com');
        });
    });

    describe('pushsubscriptionchange', () => {
        it('posts only WEB_PUSH_RECOVERY_REQUIRED to open clients', async () => {
            const client: FakeClient = {
                url: `${ORIGIN}/`,
                focused: true,
                focus: async () => client,
                postMessage: (message: unknown) =>
                    h.postedMessages.push({ client, message }),
            };
            h.clientsList.push(client);
            h.postedMessages.length = 0;

            await h.dispatch('pushsubscriptionchange', {});

            expect(h.postedMessages.length).toBeGreaterThan(0);
            for (const { message } of h.postedMessages) {
                expect(message).toEqual({ type: 'WEB_PUSH_RECOVERY_REQUIRED' });
            }
        });
    });
});
