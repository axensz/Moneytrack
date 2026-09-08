'use client';

/**
 * useCurrentDeviceNotifications — reconcile ONE current device across session
 * start, focus/visibility, account switch, and sign-out.
 *
 * Privacy: this hook persists ONLY three things and NEVER an endpoint or key:
 *   - `moneytrack.notificationDeviceId`      (opaque device id, via webPush)
 *   - `moneytrack.notificationDeviceOwner.v1`= { userId, accountScope }
 *   - `moneytrack.notificationBackendConfirmed.v1` = bounded UID set
 *
 * All side-effecting boundaries (device callable API, native web-push
 * primitives, service-worker messaging, clock, preference store, browser IANA
 * zone) are injected so behaviour is fully deterministic under test.
 * `useCurrentDeviceNotifications(userId)` works in production via defaults.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    getOrCreateDeviceId as defaultGetOrCreateDeviceId,
    inspectNativePush as defaultInspectNativePush,
    subscribeCurrentDevice as defaultSubscribeCurrentDevice,
    unsubscribeCurrentDevice as defaultUnsubscribeCurrentDevice,
    type NativePushInspection,
} from '../lib/webPush';
import {
    notificationDeviceApi as defaultDeviceApi,
    type SanitizedDeviceStatus,
    type TestDeliveryResult,
} from '../lib/notificationDeviceApi';
import {
    useNotificationPreferences,
    normalizeTimeZone,
    FALLBACK_TIME_ZONE,
} from './useNotificationPreferences';
import { logger } from '../utils/logger';

export type ActionReason =
    | 'permission-required'
    | 'permission-blocked'
    | 'ios-install-required'
    | 'subscription-missing'
    | 'registration-missing'
    | 'endpoint-expired'
    | 'account-mismatch'
    | 'vapid-key-mismatch';

export type StableDeviceState =
    | { kind: 'active'; accountScope: string; timeZone: string }
    | { kind: 'action-required'; reason: ActionReason }
    | { kind: 'unavailable'; reason: 'unsupported' | 'insecure-context' };

export type CurrentDeviceState =
    | { kind: 'guest' }
    | { kind: 'checking' }
    | { kind: 'active'; accountScope: string; timeZone: string }
    | { kind: 'action-required'; reason: ActionReason }
    | { kind: 'unavailable'; reason: 'unsupported' | 'insecure-context' }
    | { kind: 'check-failed'; previous?: StableDeviceState };

export type DeviceActionResult =
    | { kind: 'success'; message: string }
    | { kind: 'rate-limited'; retryAt: string }
    | { kind: 'error'; message: string };

export type DevicePendingAction = 'check' | 'activate' | 'disable' | 'test' | 'time-zone' | null;

export interface CurrentDeviceNotifications {
    state: CurrentDeviceState;
    pendingAction: DevicePendingAction;
    result: DeviceActionResult | null;
    reconcile(): Promise<void>;
    activate(): Promise<void>;
    disable(): Promise<void>;
    sendTest(): Promise<void>;
    updateTimeZone(): Promise<void>;
    prepareForSignOut(): Promise<void>;
    /**
     * The foreground OS-presentation gate. NOT part of the Step 3 interface
     * contract, but the switch NotificationManager consumes to decide whether a
     * foreground event may raise an OS notification.
     */
    canShowBrowserNotification(): boolean;
}

interface DeviceApiLike {
    register: (input: import('../lib/notificationDeviceApi').RegisterNotificationDeviceInput) => Promise<SanitizedDeviceStatus>;
    status: (input: { deviceId: string }) => Promise<SanitizedDeviceStatus>;
    revoke: (input: { deviceId: string }) => Promise<void>;
    sendTest: (input: { deviceId: string; testRequestId: string }) => Promise<TestDeliveryResult>;
}

interface WebPushLike {
    inspectNativePush: (vapidKey: string) => Promise<NativePushInspection>;
    subscribeCurrentDevice: (registration: ServiceWorkerRegistration, vapidKey: string) => Promise<PushSubscription>;
    unsubscribeCurrentDevice: (registration: ServiceWorkerRegistration) => Promise<boolean>;
    getOrCreateDeviceId: () => string;
    getLocalSubscription: (registration: ServiceWorkerRegistration) => Promise<PushSubscription | null>;
}

type WorkerMessage =
    | { type: 'NOTIFICATIONS_SET_ACCOUNT'; accountScope: string }
    | { type: 'NOTIFICATIONS_CLEAR_ACCOUNT'; accountScope: string };

export interface CurrentDeviceDeps {
    configuredVapidKey: string;
    deviceApi: DeviceApiLike;
    webPush: WebPushLike;
    postToWorker: (message: WorkerMessage) => void;
    requestPermission: () => Promise<NotificationPermission>;
    storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    resolveBrowserTimeZone: () => string;
    getPreferenceTimeZone: () => string | undefined;
    updatePreferences: (updates: { timeZone: string }) => Promise<void>;
    hasServiceWorkerClient: () => boolean;
    /** Legacy compatibility gate: browserNotifications.enabled && permission granted. */
    legacyGate: () => boolean;
    /** Solo el permiso de notificaciones del navegador está concedido. */
    permissionGranted: () => boolean;
    runtimeDocumentPresent: () => boolean;
    now: () => number;
}

const OWNER_KEY = 'moneytrack.notificationDeviceOwner.v1';
const CONFIRMED_KEY = 'moneytrack.notificationBackendConfirmed.v1';
const CONFIRMED_MAX = 32;
const CLEANUP_TIMEOUT_MS = 1500;

interface OwnerRecord {
    userId: string;
    accountScope: string;
}

function readConfirmedSet(storage: Pick<Storage, 'getItem'>): string[] {
    try {
        const raw = storage.getItem(CONFIRMED_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

function readOwner(storage: Pick<Storage, 'getItem'>): OwnerRecord | null {
    try {
        const raw = storage.getItem(OWNER_KEY);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (
            parsed && typeof parsed === 'object'
            && typeof (parsed as OwnerRecord).userId === 'string'
            && typeof (parsed as OwnerRecord).accountScope === 'string'
        ) {
            return parsed as OwnerRecord;
        }
        return null;
    } catch {
        return null;
    }
}

function toStableState(state: CurrentDeviceState): StableDeviceState | undefined {
    switch (state.kind) {
        case 'active':
            return { kind: 'active', accountScope: state.accountScope, timeZone: state.timeZone };
        case 'action-required':
            return { kind: 'action-required', reason: state.reason };
        case 'unavailable':
            return { kind: 'unavailable', reason: state.reason };
        default:
            return undefined;
    }
}

type RegisterInput = import('../lib/notificationDeviceApi').RegisterNotificationDeviceInput;

function detectPlatform(): RegisterInput['platform'] {
    if (typeof navigator === 'undefined') return 'unknown';
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'desktop';
}

function detectDisplayMode(): RegisterInput['displayMode'] {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(display-mode: standalone)').matches) {
        return 'standalone';
    }
    return 'browser';
}

function subscriptionToWire(subscription: PushSubscription): {
    endpoint: string;
    expirationTime: number | null;
    keys: { p256dh: string; auth: string };
} {
    const json = subscription.toJSON();
    return {
        endpoint: json.endpoint ?? subscription.endpoint,
        expirationTime: json.expirationTime ?? null,
        keys: {
            p256dh: json.keys?.p256dh ?? '',
            auth: json.keys?.auth ?? '',
        },
    };
}

function createDefaultDeps(
    getPreferenceTimeZone: () => string | undefined,
    updatePreferences: (updates: { timeZone: string }) => Promise<void>,
    getPreferenceBrowserEnabled: () => boolean,
): CurrentDeviceDeps {
    return {
        configuredVapidKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
        deviceApi: defaultDeviceApi,
        webPush: {
            inspectNativePush: defaultInspectNativePush,
            subscribeCurrentDevice: defaultSubscribeCurrentDevice,
            unsubscribeCurrentDevice: defaultUnsubscribeCurrentDevice,
            getOrCreateDeviceId: defaultGetOrCreateDeviceId,
            getLocalSubscription: async (registration) => registration.pushManager.getSubscription(),
        },
        postToWorker: (message) => {
            if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
                navigator.serviceWorker.controller.postMessage(message);
            }
        },
        requestPermission: async () => {
            if (typeof Notification === 'undefined') return 'denied';
            return Notification.requestPermission();
        },
        storage: typeof window !== 'undefined'
            ? window.localStorage
            : { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
        resolveBrowserTimeZone: () => {
            try {
                return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
            } catch {
                return '';
            }
        },
        getPreferenceTimeZone,
        updatePreferences,
        hasServiceWorkerClient: () => typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller),
        legacyGate: () => {
            if (typeof Notification === 'undefined') return false;
            return getPreferenceBrowserEnabled() && Notification.permission === 'granted';
        },
        permissionGranted: () => typeof Notification !== 'undefined' && Notification.permission === 'granted',
        runtimeDocumentPresent: () => false,
        now: () => Date.now(),
    };
}

export function useCurrentDeviceNotifications(
    userId: string | null,
    injectedDeps?: CurrentDeviceDeps,
): CurrentDeviceNotifications {
    const prefs = useNotificationPreferences(injectedDeps ? null : userId);

    const deps = useMemo<CurrentDeviceDeps>(() => {
        if (injectedDeps) return injectedDeps;
        return createDefaultDeps(
            () => prefs.preferences.timeZone,
            (updates) => prefs.updatePreferences(updates),
            () => Boolean(prefs.preferences.browserNotifications?.enabled),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [injectedDeps, prefs.preferences.timeZone, prefs.preferences.browserNotifications?.enabled, prefs.updatePreferences]);

    const [state, setState] = useState<CurrentDeviceState>(userId ? { kind: 'checking' } : { kind: 'guest' });
    const [pendingAction, setPendingAction] = useState<DevicePendingAction>(null);
    const [result, setResult] = useState<DeviceActionResult | null>(null);

    // Refs that must survive re-renders / concurrent operations.
    const inFlightRef = useRef<Promise<void> | null>(null);
    const lastStableRef = useRef<StableDeviceState | undefined>(undefined);
    const deviceStateRef = useRef<CurrentDeviceState>(state);
    deviceStateRef.current = state;
    const userIdRef = useRef(userId);
    userIdRef.current = userId;
    const depsRef = useRef(deps);
    depsRef.current = deps;

    const setDeviceState = useCallback((next: CurrentDeviceState) => {
        const stable = toStableState(next);
        if (stable) lastStableRef.current = stable;
        setState(next);
    }, []);

    // ---- backend-confirmed marker helpers -----------------------------------
    const isBackendConfirmed = useCallback((uid: string): boolean => {
        return readConfirmedSet(depsRef.current.storage).includes(uid);
    }, []);

    const markBackendConfirmed = useCallback((uid: string): void => {
        const storage = depsRef.current.storage;
        const current = readConfirmedSet(storage).filter((x) => x !== uid);
        current.push(uid);
        // Bounded set: drop oldest first.
        while (current.length > CONFIRMED_MAX) current.shift();
        storage.setItem(CONFIRMED_KEY, JSON.stringify(current));
    }, []);

    const writeOwner = useCallback((uid: string, accountScope: string): void => {
        depsRef.current.storage.setItem(OWNER_KEY, JSON.stringify({ userId: uid, accountScope }));
    }, []);

    // ---- timezone bootstrap --------------------------------------------------
    const initTimeZoneIfMissing = useCallback(async (): Promise<void> => {
        const d = depsRef.current;
        const existing = d.getPreferenceTimeZone();
        if (existing && existing.trim().length > 0) return; // never overwrite a stored zone
        const zone = normalizeTimeZone(d.resolveBrowserTimeZone());
        await d.updatePreferences({ timeZone: zone });
    }, []);

    // ---- registration --------------------------------------------------------
    const registerDevice = useCallback(async (
        deviceId: string,
        subscription: PushSubscription,
        uid: string,
    ): Promise<SanitizedDeviceStatus> => {
        const d = depsRef.current;
        const zone = d.getPreferenceTimeZone();
        const status = await d.deviceApi.register({
            deviceId,
            subscription: subscriptionToWire(subscription),
            timeZone: zone && zone.trim().length > 0 ? zone : FALLBACK_TIME_ZONE,
            platform: detectPlatform(),
            displayMode: detectDisplayMode(),
        });
        markBackendConfirmed(uid);
        return status;
    }, [markBackendConfirmed]);

    // ---- core reconciliation -------------------------------------------------
    const runReconcile = useCallback(async (): Promise<void> => {
        const d = depsRef.current;
        const uid = userIdRef.current;
        if (!uid) {
            setDeviceState({ kind: 'guest' });
            return;
        }

        const previous = lastStableRef.current;

        try {
            const deviceId = d.webPush.getOrCreateDeviceId();
            const inspection = await d.webPush.inspectNativePush(d.configuredVapidKey);

            switch (inspection.kind) {
                case 'unsupported':
                    setDeviceState({ kind: 'unavailable', reason: 'unsupported' });
                    return;
                case 'insecure-context':
                    setDeviceState({ kind: 'unavailable', reason: 'insecure-context' });
                    return;
                case 'ios-not-installed':
                    setDeviceState({ kind: 'action-required', reason: 'ios-install-required' });
                    return;
                case 'permission-blocked':
                    setDeviceState({ kind: 'action-required', reason: 'permission-blocked' });
                    return;
                case 'permission-required':
                    setDeviceState({ kind: 'action-required', reason: 'permission-required' });
                    return;
                case 'vapid-key-mismatch': {
                    // R3: own the orchestration — revoke + unsubscribe (bounded),
                    // request NO permission, report action-required.
                    await Promise.allSettled([
                        d.deviceApi.revoke({ deviceId }),
                        d.webPush.unsubscribeCurrentDevice(inspection.registration),
                    ]);
                    setDeviceState({ kind: 'action-required', reason: 'vapid-key-mismatch' });
                    return;
                }
                case 'subscription-missing': {
                    const localSub = await d.webPush.getLocalSubscription(inspection.registration);
                    const serverStatus = await d.deviceApi.status({ deviceId });
                    markBackendConfirmed(uid);
                    const serverActive = serverStatus.state === 'active';

                    if (localSub && !serverActive) {
                        // Local subscription exists but server registration absent →
                        // register automatically WITHOUT asking permission.
                        await initTimeZoneIfMissing();
                        const registered = await registerDevice(deviceId, localSub, uid);
                        writeOwner(uid, registered.accountScope ?? uid);
                        d.postToWorker({ type: 'NOTIFICATIONS_SET_ACCOUNT', accountScope: registered.accountScope ?? uid });
                        setDeviceState({
                            kind: 'active',
                            accountScope: registered.accountScope ?? uid,
                            timeZone: registered.timeZone,
                        });
                        return;
                    }

                    if (!localSub && serverActive) {
                        // Server has stale active registration but no local sub →
                        // revoke stale server state and ask the user to re-activate.
                        await d.deviceApi.revoke({ deviceId });
                        setDeviceState({ kind: 'action-required', reason: 'subscription-missing' });
                        return;
                    }

                    // Both absent (or server missing/disabled/expired without local
                    // sub) → nothing to reconcile automatically.
                    setDeviceState({ kind: 'action-required', reason: 'subscription-missing' });
                    return;
                }
                case 'subscribed': {
                    const serverStatus = await d.deviceApi.status({ deviceId });
                    markBackendConfirmed(uid);

                    if (serverStatus.state === 'expired') {
                        await Promise.allSettled([
                            d.webPush.unsubscribeCurrentDevice(inspection.registration),
                            d.deviceApi.revoke({ deviceId }),
                        ]);
                        setDeviceState({ kind: 'action-required', reason: 'endpoint-expired' });
                        return;
                    }

                    if (serverStatus.state === 'missing' || serverStatus.state === 'disabled') {
                        setDeviceState({ kind: 'action-required', reason: 'registration-missing' });
                        return;
                    }

                    // state === 'active'
                    const owner = readOwner(d.storage);
                    const serverScope = serverStatus.accountScope;
                    const scopeMatches = serverScope === uid || serverScope === owner?.accountScope;
                    const ownerMatches = !owner || owner.userId === uid;

                    if (!ownerMatches || !scopeMatches) {
                        // Account mismatch: clean the previous account (CLEAR_ACCOUNT +
                        // revoke) before registering the current one; B never inherits
                        // A's scope.
                        const previousScope = owner?.accountScope ?? serverScope ?? '';
                        if (previousScope) {
                            d.postToWorker({ type: 'NOTIFICATIONS_CLEAR_ACCOUNT', accountScope: previousScope });
                        }
                        await d.deviceApi.revoke({ deviceId });

                        const localSub = await d.webPush.getLocalSubscription(inspection.registration);
                        if (localSub) {
                            await initTimeZoneIfMissing();
                            const registered = await registerDevice(deviceId, localSub, uid);
                            writeOwner(uid, registered.accountScope ?? uid);
                            d.postToWorker({ type: 'NOTIFICATIONS_SET_ACCOUNT', accountScope: registered.accountScope ?? uid });
                            setDeviceState({
                                kind: 'active',
                                accountScope: registered.accountScope ?? uid,
                                timeZone: registered.timeZone,
                            });
                            return;
                        }
                        setDeviceState({ kind: 'action-required', reason: 'account-mismatch' });
                        return;
                    }

                    // Subscribed + server active + same account → active.
                    await initTimeZoneIfMissing();
                    writeOwner(uid, serverScope ?? uid);
                    d.postToWorker({ type: 'NOTIFICATIONS_SET_ACCOUNT', accountScope: serverScope ?? uid });
                    setDeviceState({ kind: 'active', accountScope: serverScope ?? uid, timeZone: serverStatus.timeZone });
                    return;
                }
                default:
                    return;
            }
        } catch (error) {
            // Transient network/backend failure: keep last stable state, report
            // check-failed. NEVER clear a confirmed UID here.
            logger.error('Current-device reconcile failed', error);
            setState({ kind: 'check-failed', previous });
        }
    }, [initTimeZoneIfMissing, markBackendConfirmed, registerDevice, setDeviceState, writeOwner]);

    const reconcile = useCallback(async (): Promise<void> => {
        if (!userIdRef.current) {
            setDeviceState({ kind: 'guest' });
            return;
        }
        // Coalesce concurrent calls: if one is in flight, reuse it.
        if (inFlightRef.current) {
            return inFlightRef.current;
        }
        const p = (async () => {
            try {
                await runReconcile();
            } finally {
                inFlightRef.current = null;
            }
        })();
        inFlightRef.current = p;
        return p;
    }, [runReconcile, setDeviceState]);

    // ---- explicit user actions ----------------------------------------------
    const activate = useCallback(async (): Promise<void> => {
        const d = depsRef.current;
        const uid = userIdRef.current;
        if (!uid) return;
        setPendingAction('activate');
        try {
            const inspection = await d.webPush.inspectNativePush(d.configuredVapidKey);
            if (inspection.kind === 'unsupported' || inspection.kind === 'insecure-context') {
                setDeviceState({ kind: 'unavailable', reason: inspection.kind });
                return;
            }
            const registration = 'registration' in inspection ? inspection.registration : undefined;
            if (!registration) {
                // No registration available (ios-not-installed / permission blocked
                // cannot be resolved by activate) — surface the reconcile mapping.
                await runReconcile();
                return;
            }
            // The ONLY path that may request permission + subscribe + register.
            const subscription = await d.webPush.subscribeCurrentDevice(registration, d.configuredVapidKey);
            const deviceId = d.webPush.getOrCreateDeviceId();
            await initTimeZoneIfMissing();
            const registered = await registerDevice(deviceId, subscription, uid);
            writeOwner(uid, registered.accountScope ?? uid);
            d.postToWorker({ type: 'NOTIFICATIONS_SET_ACCOUNT', accountScope: registered.accountScope ?? uid });
            setDeviceState({ kind: 'active', accountScope: registered.accountScope ?? uid, timeZone: registered.timeZone });
            setResult({ kind: 'success', message: 'Notificaciones activadas en este dispositivo.' });
        } catch (error) {
            logger.error('Activate current device failed', error);
            setResult({ kind: 'error', message: 'No se pudo activar las notificaciones en este dispositivo.' });
        } finally {
            setPendingAction(null);
        }
    }, [initTimeZoneIfMissing, registerDevice, runReconcile, setDeviceState, writeOwner]);

    const disable = useCallback(async (): Promise<void> => {
        const d = depsRef.current;
        const uid = userIdRef.current;
        if (!uid) return;
        setPendingAction('disable');
        try {
            const deviceId = d.webPush.getOrCreateDeviceId();
            const inspection = await d.webPush.inspectNativePush(d.configuredVapidKey);
            const registration = 'registration' in inspection ? inspection.registration : undefined;
            await Promise.allSettled([
                d.deviceApi.revoke({ deviceId }),
                registration ? d.webPush.unsubscribeCurrentDevice(registration) : Promise.resolve(),
            ]);
            setDeviceState({ kind: 'action-required', reason: 'subscription-missing' });
            setResult({ kind: 'success', message: 'Notificaciones desactivadas en este dispositivo.' });
        } catch (error) {
            logger.error('Disable current device failed', error);
            setResult({ kind: 'error', message: 'No se pudo desactivar las notificaciones.' });
        } finally {
            setPendingAction(null);
        }
    }, [setDeviceState]);

    const sendTest = useCallback(async (): Promise<void> => {
        const d = depsRef.current;
        const uid = userIdRef.current;
        if (!uid) return;
        setPendingAction('test');
        try {
            const deviceId = d.webPush.getOrCreateDeviceId();
            const testRequestId = (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : `test-${d.now()}`;
            const delivery = await d.deviceApi.sendTest({ deviceId, testRequestId });
            if (delivery.status === 'accepted') {
                setResult({ kind: 'success', message: 'Enviamos una notificación de prueba.' });
            } else if (delivery.status === 'rate-limited') {
                setResult({ kind: 'rate-limited', retryAt: delivery.retryAt });
            } else {
                setResult({ kind: 'error', message: 'No se pudo enviar la notificación de prueba.' });
            }
        } finally {
            setPendingAction(null);
        }
    }, []);

    const updateTimeZone = useCallback(async (): Promise<void> => {
        const d = depsRef.current;
        if (!userIdRef.current) return;
        setPendingAction('time-zone');
        try {
            const zone = normalizeTimeZone(d.resolveBrowserTimeZone());
            await d.updatePreferences({ timeZone: zone });
            setResult({ kind: 'success', message: 'Actualizamos la zona horaria.' });
        } catch (error) {
            logger.error('Update time zone failed', error);
            setResult({ kind: 'error', message: 'No se pudo actualizar la zona horaria.' });
        } finally {
            setPendingAction(null);
        }
    }, []);

    const prepareForSignOut = useCallback(async (): Promise<void> => {
        const d = depsRef.current;
        const owner = readOwner(d.storage);
        const accountScope = owner?.accountScope ?? userIdRef.current ?? '';

        const cleanup = (async () => {
            const deviceId = d.webPush.getOrCreateDeviceId();
            let registration: ServiceWorkerRegistration | undefined;
            try {
                const inspection = await d.webPush.inspectNativePush(d.configuredVapidKey);
                registration = 'registration' in inspection ? inspection.registration : undefined;
            } catch {
                registration = undefined;
            }
            if (accountScope) {
                d.postToWorker({ type: 'NOTIFICATIONS_CLEAR_ACCOUNT', accountScope });
            }
            await Promise.allSettled([
                d.deviceApi.revoke({ deviceId }),
                registration ? d.webPush.unsubscribeCurrentDevice(registration) : Promise.resolve(),
            ]);
        })();

        await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                resolve();
            };
            const timer = setTimeout(finish, CLEANUP_TIMEOUT_MS);
            cleanup.then(() => { clearTimeout(timer); finish(); }, () => { clearTimeout(timer); finish(); });
        });
    }, []);

    const canShowBrowserNotification = useCallback((): boolean => {
        const uid = userIdRef.current;
        const d = depsRef.current;
        // Guest / runtime-absent-never-confirmed accounts keep the legacy gate.
        if (!uid) {
            return d.legacyGate();
        }
        if (!isBackendConfirmed(uid) && !d.runtimeDocumentPresent()) {
            return d.legacyGate();
        }
        // Authenticated + backend-confirmed: active device + permission.
        return deviceStateRef.current.kind === 'active' && d.permissionGranted();
    }, [isBackendConfirmed]);

    // ---- lifecycle triggers --------------------------------------------------
    // Reconcile on mount and whenever userId changes.
    useEffect(() => {
        if (!userId) {
            setDeviceState({ kind: 'guest' });
            return;
        }
        void reconcile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    // visibilitychange (visible) + window.focus → reconcile.
    useEffect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return;
        const onVisible = () => {
            if (document.visibilityState === 'visible' && userIdRef.current) void reconcile();
        };
        const onFocus = () => {
            if (userIdRef.current) void reconcile();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onFocus);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onFocus);
        };
    }, [reconcile]);

    // Worker recovery hint (WEB_PUSH_RECOVERY_REQUIRED) → reconcile only while a
    // client exists.
    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
        const sw = navigator.serviceWorker;
        const onMessage = (event: MessageEvent | { data?: { type?: string } }) => {
            const data = (event as { data?: { type?: string } }).data;
            if (data?.type === 'WEB_PUSH_RECOVERY_REQUIRED'
                && userIdRef.current
                && depsRef.current.hasServiceWorkerClient()) {
                void reconcile();
            }
        };
        sw.addEventListener('message', onMessage as EventListener);
        return () => sw.removeEventListener('message', onMessage as EventListener);
    }, [reconcile]);

    return {
        state,
        pendingAction,
        result,
        reconcile,
        activate,
        disable,
        sendTest,
        updateTimeZone,
        prepareForSignOut,
        canShowBrowserNotification,
    };
}
