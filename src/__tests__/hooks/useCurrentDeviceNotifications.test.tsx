/**
 * Task 7 — useCurrentDeviceNotifications: reconcile ONE current device across
 * session, focus, account switch, and sign-out.
 *
 * Fully deterministic: every side-effecting boundary (device callable API,
 * native web-push primitives, service-worker messaging, clock/timer, preference
 * store, browser IANA zone) is injected. `useCurrentDeviceNotifications(userId)`
 * still works in production via defaults.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// The hook statically imports the device callable API and web-push modules,
// which touch Firebase at load. All of these boundaries are INJECTED in these
// tests, so we stub the modules to keep import side-effect-free.
vi.mock('../../lib/notificationDeviceApi', () => ({
    notificationDeviceApi: {
        register: vi.fn(),
        status: vi.fn(),
        revoke: vi.fn(),
        sendTest: vi.fn(),
    },
}));
vi.mock('../../lib/webPush', () => ({
    getOrCreateDeviceId: vi.fn(() => 'device-abc'),
    inspectNativePush: vi.fn(),
    subscribeCurrentDevice: vi.fn(),
    unsubscribeCurrentDevice: vi.fn(),
}));
vi.mock('../../hooks/useNotificationPreferences', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../hooks/useNotificationPreferences')>();
    return {
        ...actual,
        useNotificationPreferences: () => ({
            preferences: {},
            loading: false,
            updatePreferences: vi.fn(),
        }),
    };
});

import {
    useCurrentDeviceNotifications,
    type CurrentDeviceDeps,
} from '../../hooks/useCurrentDeviceNotifications';
import type {
    NativePushInspection,
} from '../../lib/webPush';
import type { SanitizedDeviceStatus, TestDeliveryResult } from '../../lib/notificationDeviceApi';

const VAPID_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8';
const DEVICE_ID = 'device-abc';

function makeRegistration() {
    return {
        pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
            subscribe: vi.fn(),
        },
    } as unknown as ServiceWorkerRegistration;
}

function makeSubscription() {
    return {
        endpoint: 'https://push.example/endpoint',
        expirationTime: null,
        toJSON: () => ({
            endpoint: 'https://push.example/endpoint',
            expirationTime: null,
            keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
        }),
        options: { applicationServerKey: new ArrayBuffer(65) },
        unsubscribe: vi.fn().mockResolvedValue(true),
    } as unknown as PushSubscription;
}

function status(overrides: Partial<SanitizedDeviceStatus> = {}): SanitizedDeviceStatus {
    return {
        deviceId: DEVICE_ID,
        state: 'active',
        accountScope: 'user-1',
        endpointFingerprint: 'fp',
        platform: 'desktop',
        displayMode: 'browser',
        timeZone: 'America/Bogota',
        ...overrides,
    };
}

interface HarnessOptions {
    inspection?: NativePushInspection;
    statusResult?: SanitizedDeviceStatus | (() => Promise<SanitizedDeviceStatus>);
    registerResult?: SanitizedDeviceStatus | (() => Promise<SanitizedDeviceStatus>);
    sendTestResult?: TestDeliveryResult;
    localSubscription?: PushSubscription | null;
    ownerRecord?: { userId: string; accountScope: string } | null;
    backendConfirmed?: string[];
    legacyEnabled?: boolean;
    permissionGranted?: boolean;
    browserTimeZone?: string;
    prefsTimeZone?: string | undefined;
    runtimePresent?: boolean;
}

function makeDeps(opts: HarnessOptions = {}) {
    const registration = makeRegistration();
    const inspection: NativePushInspection = opts.inspection ?? { kind: 'subscription-missing', registration };

    const store: Record<string, string> = {};
    if (opts.ownerRecord !== undefined && opts.ownerRecord !== null) {
        store['moneytrack.notificationDeviceOwner.v1'] = JSON.stringify(opts.ownerRecord);
    }
    if (opts.backendConfirmed) {
        store['moneytrack.notificationBackendConfirmed.v1'] = JSON.stringify(opts.backendConfirmed);
    }

    const storage = {
        getItem: vi.fn((k: string) => (k in store ? store[k] : null)),
        setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
        removeItem: vi.fn((k: string) => { delete store[k]; }),
    };

    const deviceApi = {
        register: vi.fn(async () => (
            typeof opts.registerResult === 'function'
                ? await opts.registerResult()
                : (opts.registerResult ?? status())
        )),
        status: vi.fn(async () => (
            typeof opts.statusResult === 'function'
                ? await opts.statusResult()
                : (opts.statusResult ?? status({ state: 'missing', accountScope: null }))
        )),
        revoke: vi.fn(async () => undefined),
        sendTest: vi.fn(async () => opts.sendTestResult ?? ({ status: 'accepted', deliveryId: 'd1' } as TestDeliveryResult)),
    };

    const webPush = {
        inspectNativePush: vi.fn(async () => inspection),
        subscribeCurrentDevice: vi.fn(async () => makeSubscription()),
        unsubscribeCurrentDevice: vi.fn(async () => true),
        getOrCreateDeviceId: vi.fn(() => DEVICE_ID),
        getLocalSubscription: vi.fn(async () => opts.localSubscription ?? null),
    };

    const postToWorker = vi.fn();
    const requestPermission = vi.fn(async () => 'granted' as NotificationPermission);

    let currentTz = opts.prefsTimeZone;
    const updatePreferences = vi.fn(async (updates: { timeZone?: string }) => {
        if (updates.timeZone !== undefined) currentTz = updates.timeZone;
    });

    const deps: CurrentDeviceDeps = {
        configuredVapidKey: VAPID_KEY,
        deviceApi,
        webPush,
        postToWorker,
        requestPermission,
        storage: storage as unknown as Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
        resolveBrowserTimeZone: () => opts.browserTimeZone ?? 'America/New_York',
        getPreferenceTimeZone: () => currentTz,
        updatePreferences,
        hasServiceWorkerClient: () => true,
        legacyGate: () => Boolean(opts.legacyEnabled && opts.permissionGranted),
        permissionGranted: () => Boolean(opts.permissionGranted),
        runtimeDocumentPresent: () => Boolean(opts.runtimePresent),
        now: () => 1_000,
    };

    return { deps, deviceApi, webPush, postToWorker, storage, requestPermission, updatePreferences, registration, store };
}

const OWNER_KEY = 'moneytrack.notificationDeviceOwner.v1';
const CONFIRMED_KEY = 'moneytrack.notificationBackendConfirmed.v1';

beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    // Keep jsdom's real document/window (renderHook needs a real container).
    // navigator.serviceWorker is absent in jsdom → default to no SW client so
    // the worker-recovery listener is a no-op unless a test provides one.
    vi.stubGlobal('navigator', { userAgent: 'node', serviceWorker: undefined });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('useCurrentDeviceNotifications — guest', () => {
    it('guest (userId null): no backend/permission work, state guest', async () => {
        const { deps, deviceApi, webPush, requestPermission } = makeDeps();
        const { result } = renderHook(() => useCurrentDeviceNotifications(null, deps));

        await act(async () => { await result.current.reconcile(); });

        expect(result.current.state.kind).toBe('guest');
        expect(deviceApi.status).not.toHaveBeenCalled();
        expect(deviceApi.register).not.toHaveBeenCalled();
        expect(webPush.inspectNativePush).not.toHaveBeenCalled();
        expect(requestPermission).not.toHaveBeenCalled();
    });
});

describe('useCurrentDeviceNotifications — backend-confirmation bootstrap', () => {
    it('runtime-absent + never-confirmed: keeps legacy gate, creates nothing (no sub/register)', async () => {
        const { deps, deviceApi, webPush } = makeDeps({
            runtimePresent: false,
            backendConfirmed: [],
            legacyEnabled: true,
            permissionGranted: true,
            statusResult: () => new Promise<SanitizedDeviceStatus>(() => {}), // never resolves (checking/unreachable)
            inspection: { kind: 'permission-required' },
        });

        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { void result.current.reconcile(); });

        // Legacy gate stays usable while checking/unreachable.
        expect(result.current.canShowBrowserNotification()).toBe(true);
        expect(webPush.subscribeCurrentDevice).not.toHaveBeenCalled();
        expect(deviceApi.register).not.toHaveBeenCalled();
    });

    it('first successful status (state:missing) persists UID-scoped backend-confirmed marker', async () => {
        const { deps, storage } = makeDeps({
            inspection: { kind: 'subscription-missing', registration: makeRegistration() },
            statusResult: status({ state: 'missing', accountScope: null }),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });

        const confirmed = JSON.parse((storage.setItem.mock.calls.find(c => c[0] === CONFIRMED_KEY) ?? [])[1] ?? '[]');
        expect(confirmed).toContain('user-1');
    });

    it('after confirmation a later failure reuses last state / check-failed and does NOT re-enable legacy gate', async () => {
        let call = 0;
        const { deps } = makeDeps({
            backendConfirmed: ['user-1'],
            legacyEnabled: true,
            permissionGranted: true,
            inspection: { kind: 'subscribed', registration: makeRegistration(), subscription: makeSubscription() },
            statusResult: () => {
                call += 1;
                if (call === 1) return Promise.resolve(status({ state: 'active', accountScope: 'user-1' }));
                return Promise.reject(new Error('network'));
            },
            localSubscription: makeSubscription(),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));

        await act(async () => { await result.current.reconcile(); });
        expect(result.current.state.kind).toBe('active');

        await act(async () => { await result.current.reconcile(); });
        expect(result.current.state.kind).toBe('check-failed');
        if (result.current.state.kind === 'check-failed') {
            expect(result.current.state.previous?.kind).toBe('active');
        }
        // Backend already confirmed for this UID → legacy gate does NOT come back.
        expect(result.current.canShowBrowserNotification()).toBe(false);
    });
});

describe('useCurrentDeviceNotifications — reconcile coalescing', () => {
    it('coalesces concurrent reconcile calls (only one inspection in flight)', async () => {
        let resolveInspect: (v: NativePushInspection) => void = () => {};
        const { deps, webPush } = makeDeps();
        webPush.inspectNativePush.mockImplementation(
            () => new Promise<NativePushInspection>((res) => { resolveInspect = res; }),
        );
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));

        await act(async () => {
            void result.current.reconcile();
            void result.current.reconcile();
            void result.current.reconcile();
            resolveInspect({ kind: 'subscription-missing', registration: makeRegistration() });
            await Promise.resolve();
        });

        expect(webPush.inspectNativePush).toHaveBeenCalledTimes(1);
    });
});

describe('useCurrentDeviceNotifications — mount / focus / visibility / worker recovery', () => {
    it('reconciles on mount for an authenticated user', async () => {
        const { deps, webPush } = makeDeps({
            inspection: { kind: 'subscription-missing', registration: makeRegistration() },
            statusResult: status({ state: 'missing', accountScope: null }),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await waitFor(() => expect(webPush.inspectNativePush).toHaveBeenCalled());
        expect(result.current.state.kind).not.toBe('guest');
    });

    it('visibilitychange (visible) and window.focus trigger reconcile', async () => {
        const docListeners: Record<string, ((e?: unknown) => void)[]> = {};
        const winListeners: Record<string, ((e?: unknown) => void)[]> = {};
        vi.spyOn(document, 'addEventListener').mockImplementation(((type: string, cb: EventListenerOrEventListenerObject) => {
            (docListeners[type] ??= []).push(cb as () => void);
        }) as typeof document.addEventListener);
        vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, cb: EventListenerOrEventListenerObject) => {
            (winListeners[type] ??= []).push(cb as () => void);
        }) as typeof window.addEventListener);
        // document.visibilityState is 'visible' in jsdom by default.

        const { deps, webPush } = makeDeps({
            inspection: { kind: 'subscription-missing', registration: makeRegistration() },
            statusResult: status({ state: 'missing', accountScope: null }),
        });
        renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await waitFor(() => expect(webPush.inspectNativePush).toHaveBeenCalledTimes(1));

        await act(async () => {
            (docListeners['visibilitychange'] ?? []).forEach((cb) => cb());
            await Promise.resolve();
        });
        await waitFor(() => expect(webPush.inspectNativePush).toHaveBeenCalledTimes(2));

        await act(async () => {
            (winListeners['focus'] ?? []).forEach((cb) => cb());
            await Promise.resolve();
        });
        await waitFor(() => expect(webPush.inspectNativePush).toHaveBeenCalledTimes(3));
    });

    it('WEB_PUSH_RECOVERY_REQUIRED triggers reconcile only while a client exists', async () => {
        const swListeners: ((e: { data?: { type?: string } }) => void)[] = [];
        const swAdd = vi.fn((type: string, cb: (e: { data?: { type?: string } }) => void) => {
            if (type === 'message') swListeners.push(cb);
        });
        vi.stubGlobal('navigator', { serviceWorker: { addEventListener: swAdd, removeEventListener: vi.fn(), controller: {} } });

        const hasClient = { value: true };
        const base = makeDeps({
            inspection: { kind: 'subscription-missing', registration: makeRegistration() },
            statusResult: status({ state: 'missing', accountScope: null }),
        });
        base.deps.hasServiceWorkerClient = () => hasClient.value;
        const { webPush } = base;

        renderHook(() => useCurrentDeviceNotifications('user-1', base.deps));
        await waitFor(() => expect(webPush.inspectNativePush).toHaveBeenCalledTimes(1));

        hasClient.value = false;
        await act(async () => {
            swListeners.forEach((cb) => cb({ data: { type: 'WEB_PUSH_RECOVERY_REQUIRED' } }));
            await Promise.resolve();
        });
        // no client → no extra reconcile
        expect(webPush.inspectNativePush).toHaveBeenCalledTimes(1);

        hasClient.value = true;
        await act(async () => {
            swListeners.forEach((cb) => cb({ data: { type: 'WEB_PUSH_RECOVERY_REQUIRED' } }));
            await Promise.resolve();
        });
        await waitFor(() => expect(webPush.inspectNativePush).toHaveBeenCalledTimes(2));
    });
});

describe('useCurrentDeviceNotifications — subscription reconciliation', () => {
    it('local subscription present + server registration absent → auto-register WITHOUT permission → active', async () => {
        const { deps, deviceApi, webPush, requestPermission } = makeDeps({
            inspection: { kind: 'subscription-missing', registration: makeRegistration() },
            localSubscription: makeSubscription(),
            statusResult: status({ state: 'missing', accountScope: null }),
            registerResult: status({ state: 'active', accountScope: 'user-1' }),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });

        expect(deviceApi.register).toHaveBeenCalledTimes(1);
        expect(requestPermission).not.toHaveBeenCalled();
        expect(webPush.subscribeCurrentDevice).not.toHaveBeenCalled();
        expect(result.current.state.kind).toBe('active');
    });

    it('server active but no local subscription → revoke stale server state + action-required subscription-missing', async () => {
        const { deps, deviceApi } = makeDeps({
            inspection: { kind: 'subscription-missing', registration: makeRegistration() },
            localSubscription: null,
            statusResult: status({ state: 'active', accountScope: 'user-1' }),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });

        expect(deviceApi.revoke).toHaveBeenCalledWith({ deviceId: DEVICE_ID });
        expect(result.current.state).toMatchObject({ kind: 'action-required', reason: 'subscription-missing' });
    });

    it('both local subscription absent AND server registration absent → action-required subscription-missing', async () => {
        const { deps } = makeDeps({
            inspection: { kind: 'subscription-missing', registration: makeRegistration() },
            localSubscription: null,
            statusResult: status({ state: 'missing', accountScope: null }),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });
        expect(result.current.state).toMatchObject({ kind: 'action-required', reason: 'subscription-missing' });
    });

    it('subscribed but server expired → unsubscribe + revoke + action-required endpoint-expired', async () => {
        const { deps, deviceApi, webPush } = makeDeps({
            inspection: { kind: 'subscribed', registration: makeRegistration(), subscription: makeSubscription() },
            localSubscription: makeSubscription(),
            statusResult: status({ state: 'expired', accountScope: 'user-1' }),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });

        expect(webPush.unsubscribeCurrentDevice).toHaveBeenCalled();
        expect(deviceApi.revoke).toHaveBeenCalledWith({ deviceId: DEVICE_ID });
        expect(result.current.state).toMatchObject({ kind: 'action-required', reason: 'endpoint-expired' });
    });

    it('subscribed + server active + same account → active', async () => {
        const { deps } = makeDeps({
            inspection: { kind: 'subscribed', registration: makeRegistration(), subscription: makeSubscription() },
            localSubscription: makeSubscription(),
            statusResult: status({ state: 'active', accountScope: 'user-1' }),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });
        expect(result.current.state.kind).toBe('active');
    });
});

describe('useCurrentDeviceNotifications — vapid-key-mismatch (R3 orchestration)', () => {
    it('gets deviceId, allSettled revoke + unsubscribe, NO permission, action-required vapid-key-mismatch', async () => {
        const { deps, deviceApi, webPush, requestPermission } = makeDeps({
            inspection: { kind: 'vapid-key-mismatch', registration: makeRegistration(), subscription: makeSubscription() },
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });

        expect(webPush.getOrCreateDeviceId).toHaveBeenCalled();
        expect(deviceApi.revoke).toHaveBeenCalledWith({ deviceId: DEVICE_ID });
        expect(webPush.unsubscribeCurrentDevice).toHaveBeenCalled();
        expect(requestPermission).not.toHaveBeenCalled();
        expect(result.current.state).toMatchObject({ kind: 'action-required', reason: 'vapid-key-mismatch' });
    });
});

describe('useCurrentDeviceNotifications — inspection → unavailable / action-required mapping', () => {
    it('unsupported → unavailable unsupported', async () => {
        const { deps } = makeDeps({ inspection: { kind: 'unsupported' } });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });
        expect(result.current.state).toEqual({ kind: 'unavailable', reason: 'unsupported' });
    });

    it('insecure-context → unavailable insecure-context', async () => {
        const { deps } = makeDeps({ inspection: { kind: 'insecure-context' } });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });
        expect(result.current.state).toEqual({ kind: 'unavailable', reason: 'insecure-context' });
    });

    it('ios-not-installed → action-required ios-install-required', async () => {
        const { deps } = makeDeps({ inspection: { kind: 'ios-not-installed' } });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });
        expect(result.current.state).toMatchObject({ kind: 'action-required', reason: 'ios-install-required' });
    });

    it('permission-blocked → action-required permission-blocked; reconcile never requests permission', async () => {
        const { deps, requestPermission } = makeDeps({ inspection: { kind: 'permission-blocked' } });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });
        expect(result.current.state).toMatchObject({ kind: 'action-required', reason: 'permission-blocked' });
        expect(requestPermission).not.toHaveBeenCalled();
    });

    it('permission-required → action-required permission-required', async () => {
        const { deps } = makeDeps({ inspection: { kind: 'permission-required' } });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });
        expect(result.current.state).toMatchObject({ kind: 'action-required', reason: 'permission-required' });
    });
});

describe('useCurrentDeviceNotifications — account mismatch A→B', () => {
    it('owner record for A differs from current B → clean A (CLEAR_ACCOUNT + revoke) before registering B; B never inherits A scope', async () => {
        const { deps, deviceApi, postToWorker } = makeDeps({
            ownerRecord: { userId: 'user-A', accountScope: 'user-A' },
            inspection: { kind: 'subscribed', registration: makeRegistration(), subscription: makeSubscription() },
            localSubscription: makeSubscription(),
            statusResult: status({ state: 'active', accountScope: 'user-A' }),
            registerResult: status({ state: 'active', accountScope: 'user-B' }),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-B', deps));
        await act(async () => { await result.current.reconcile(); });

        const clearCall = postToWorker.mock.calls.find(
            (c) => c[0]?.type === 'NOTIFICATIONS_CLEAR_ACCOUNT' && c[0]?.accountScope === 'user-A',
        );
        expect(clearCall).toBeTruthy();
        expect(deviceApi.revoke).toHaveBeenCalledWith({ deviceId: DEVICE_ID });
        // never sends SET_ACCOUNT for A
        const setForA = postToWorker.mock.calls.find(
            (c) => c[0]?.type === 'NOTIFICATIONS_SET_ACCOUNT' && c[0]?.accountScope === 'user-A',
        );
        expect(setForA).toBeFalsy();
    });
});

describe('useCurrentDeviceNotifications — worker messaging', () => {
    it('after successful authenticated reconciliation sends NOTIFICATIONS_SET_ACCOUNT', async () => {
        const { deps, postToWorker } = makeDeps({
            inspection: { kind: 'subscribed', registration: makeRegistration(), subscription: makeSubscription() },
            localSubscription: makeSubscription(),
            statusResult: status({ state: 'active', accountScope: 'user-1' }),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });

        const setCall = postToWorker.mock.calls.find(
            (c) => c[0]?.type === 'NOTIFICATIONS_SET_ACCOUNT' && c[0]?.accountScope === 'user-1',
        );
        expect(setCall).toBeTruthy();
    });
});

describe('useCurrentDeviceNotifications — timezone', () => {
    it('initializes timezone once from a valid browser IANA zone when preference missing', async () => {
        const { deps, updatePreferences } = makeDeps({
            prefsTimeZone: undefined,
            browserTimeZone: 'America/New_York',
            inspection: { kind: 'subscribed', registration: makeRegistration(), subscription: makeSubscription() },
            localSubscription: makeSubscription(),
            statusResult: status({ state: 'active', accountScope: 'user-1' }),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });
        expect(updatePreferences).toHaveBeenCalledWith(expect.objectContaining({ timeZone: 'America/New_York' }));
    });

    it('falls back to America/Bogota when browser zone is invalid/empty', async () => {
        const { deps, updatePreferences } = makeDeps({
            prefsTimeZone: undefined,
            browserTimeZone: '',
            inspection: { kind: 'subscribed', registration: makeRegistration(), subscription: makeSubscription() },
            localSubscription: makeSubscription(),
            statusResult: status({ state: 'active', accountScope: 'user-1' }),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });
        expect(updatePreferences).toHaveBeenCalledWith(expect.objectContaining({ timeZone: 'America/Bogota' }));
    });

    it('never overwrites an existing stored zone', async () => {
        const { deps, updatePreferences } = makeDeps({
            prefsTimeZone: 'Europe/Madrid',
            browserTimeZone: 'America/New_York',
            inspection: { kind: 'subscribed', registration: makeRegistration(), subscription: makeSubscription() },
            localSubscription: makeSubscription(),
            statusResult: status({ state: 'active', accountScope: 'user-1' }),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });
        expect(updatePreferences).not.toHaveBeenCalled();
    });

    it('updateTimeZone() validates and writes through the preference store', async () => {
        const { deps, updatePreferences } = makeDeps({
            prefsTimeZone: 'Europe/Madrid',
            browserTimeZone: 'America/New_York',
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.updateTimeZone(); });
        expect(updatePreferences).toHaveBeenCalledWith(expect.objectContaining({ timeZone: 'America/New_York' }));
    });
});

describe('useCurrentDeviceNotifications — transient failure', () => {
    it('transient network/backend failure keeps last stable state, reports check-failed with previous', async () => {
        let call = 0;
        const { deps } = makeDeps({
            inspection: { kind: 'subscribed', registration: makeRegistration(), subscription: makeSubscription() },
            localSubscription: makeSubscription(),
            backendConfirmed: ['user-1'],
            statusResult: () => {
                call += 1;
                if (call === 1) return Promise.resolve(status({ state: 'active', accountScope: 'user-1' }));
                return Promise.reject(new Error('boom'));
            },
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });
        expect(result.current.state.kind).toBe('active');
        await act(async () => { await result.current.reconcile(); });
        expect(result.current.state.kind).toBe('check-failed');
        if (result.current.state.kind === 'check-failed') {
            expect(result.current.state.previous).toMatchObject({ kind: 'active' });
        }
    });
});

describe('useCurrentDeviceNotifications — canShowBrowserNotification gate', () => {
    it('after confirmation: gate true only when device active + permission granted', async () => {
        const { deps } = makeDeps({
            permissionGranted: true,
            backendConfirmed: ['user-1'],
            inspection: { kind: 'subscribed', registration: makeRegistration(), subscription: makeSubscription() },
            localSubscription: makeSubscription(),
            statusResult: status({ state: 'active', accountScope: 'user-1' }),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });
        expect(result.current.state.kind).toBe('active');
        expect(result.current.canShowBrowserNotification()).toBe(true);
    });

    it('guest uses legacy gate', async () => {
        const { deps } = makeDeps({ legacyEnabled: true, permissionGranted: true });
        const { result } = renderHook(() => useCurrentDeviceNotifications(null, deps));
        expect(result.current.canShowBrowserNotification()).toBe(true);
    });
});

describe('useCurrentDeviceNotifications — prepareForSignOut', () => {
    it('starts unsubscribe + revoke + CLEAR_ACCOUNT together and resolves, never rejects', async () => {
        const { deps, deviceApi, webPush, postToWorker } = makeDeps({
            ownerRecord: { userId: 'user-1', accountScope: 'user-1' },
            inspection: { kind: 'subscribed', registration: makeRegistration(), subscription: makeSubscription() },
        });
        deviceApi.revoke.mockRejectedValueOnce(new Error('revoke failed'));
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));

        await expect(act(async () => { await result.current.prepareForSignOut(); })).resolves.toBeUndefined();
        expect(webPush.unsubscribeCurrentDevice).toHaveBeenCalled();
        expect(deviceApi.revoke).toHaveBeenCalled();
        const clear = postToWorker.mock.calls.find((c) => c[0]?.type === 'NOTIFICATIONS_CLEAR_ACCOUNT');
        expect(clear).toBeTruthy();
    });

    it('resolves within the 1.5s timeout even if cleanup hangs', async () => {
        vi.useFakeTimers();
        try {
            const { deps, webPush } = makeDeps({
                ownerRecord: { userId: 'user-1', accountScope: 'user-1' },
            });
            webPush.unsubscribeCurrentDevice.mockImplementation(() => new Promise(() => {})); // hangs
            const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));

            let settled = false;
            const p = result.current.prepareForSignOut().then(() => { settled = true; });
            await vi.advanceTimersByTimeAsync(1500);
            await p;
            expect(settled).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('useCurrentDeviceNotifications — sendTest', () => {
    it('maps rate-limited result', async () => {
        const { deps } = makeDeps({
            backendConfirmed: ['user-1'],
            inspection: { kind: 'subscribed', registration: makeRegistration(), subscription: makeSubscription() },
            localSubscription: makeSubscription(),
            statusResult: status({ state: 'active', accountScope: 'user-1' }),
            sendTestResult: { status: 'rate-limited', retryAt: '2026-01-01T00:00:00Z' },
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });
        await act(async () => { await result.current.sendTest(); });
        expect(result.current.result).toMatchObject({ kind: 'rate-limited', retryAt: '2026-01-01T00:00:00Z' });
    });
});

describe('useCurrentDeviceNotifications — backend-confirmed set is bounded', () => {
    it('prunes to <= 32, dropping the oldest', async () => {
        const seeded = Array.from({ length: 32 }, (_, i) => `old-${i}`);
        const { deps, storage } = makeDeps({
            backendConfirmed: seeded,
            inspection: { kind: 'subscription-missing', registration: makeRegistration() },
            statusResult: status({ state: 'missing', accountScope: null }),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });

        const written = JSON.parse((storage.setItem.mock.calls.filter(c => c[0] === CONFIRMED_KEY).pop() ?? [])[1] ?? '[]');
        expect(written.length).toBeLessThanOrEqual(32);
        expect(written).toContain('user-1');
        expect(written).not.toContain('old-0');
    });

    it('never clears a confirmed UID because a later network check fails', async () => {
        const { deps, storage } = makeDeps({
            backendConfirmed: ['user-1'],
            inspection: { kind: 'subscribed', registration: makeRegistration(), subscription: makeSubscription() },
            localSubscription: makeSubscription(),
            statusResult: () => Promise.reject(new Error('network')),
        });
        const { result } = renderHook(() => useCurrentDeviceNotifications('user-1', deps));
        await act(async () => { await result.current.reconcile(); });

        const removed = storage.removeItem.mock.calls.some((c) => c[0] === CONFIRMED_KEY);
        expect(removed).toBe(false);
        // and if it re-writes the set, user-1 stays
        const lastWrite = storage.setItem.mock.calls.filter(c => c[0] === CONFIRMED_KEY).pop();
        if (lastWrite) {
            expect(JSON.parse(lastWrite[1])).toContain('user-1');
        }
        expect(OWNER_KEY).toBeTruthy();
        await waitFor(() => expect(result.current.state.kind).toBe('check-failed'));
    });
});
