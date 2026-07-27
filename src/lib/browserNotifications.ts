'use client';

import type { Notification as AppNotification } from '../types/finance';
import { canonicalizeActionUrl } from '../hooks/useViewRouting';

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

interface BrowserNotificationPayload {
    title: string;
    body: string;
    tag?: string;
    url?: string;
}

const SERVICE_WORKER_READY_TIMEOUT_MS = 800;
const DEFAULT_ICON_PATH = '/icons/icon-192x192.png';
const DEFAULT_BADGE_PATH = '/icons/icon-96x96.png';

function getBasePath(): string {
    const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

    if (configuredBasePath) {
        return configuredBasePath;
    }

    if (typeof window === 'undefined') {
        return '';
    }

    const { hostname } = window.location;
    if (hostname === 'github.io' || hostname.endsWith('.github.io')) {
        const [firstSegment] = window.location.pathname.split('/').filter(Boolean);
        return firstSegment ? `/${firstSegment}` : '';
    }

    return '';
}

function withBasePath(path: string): string {
    return `${getBasePath()}${path}`;
}

export function normalizeAppUrl(url?: string): string {
    if (!url) {
        return withBasePath('/');
    }

    if (/^https?:\/\//.test(url)) {
        return url;
    }

    const canonicalUrl = canonicalizeActionUrl(url) ?? url;
    const basePath = getBasePath();
    if (
        basePath &&
        canonicalUrl.startsWith('/') &&
        !canonicalUrl.startsWith(`${basePath}/`)
    ) {
        return `${basePath}${canonicalUrl}`;
    }

    return canonicalUrl;
}

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return 'unsupported';
    }

    return window.Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return 'unsupported';
    }

    if (window.Notification.permission !== 'default') {
        return window.Notification.permission;
    }

    return window.Notification.requestPermission();
}

async function getReadyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        return null;
    }

    return Promise.race<ServiceWorkerRegistration | null>([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), SERVICE_WORKER_READY_TIMEOUT_MS);
        }),
    ]);
}

export async function showBrowserNotification(payload: BrowserNotificationPayload): Promise<boolean> {
    if (typeof window === 'undefined' || getBrowserNotificationPermission() !== 'granted') {
        return false;
    }

    const url = normalizeAppUrl(payload.url);
    const options: NotificationOptions = {
        body: payload.body,
        icon: withBasePath(DEFAULT_ICON_PATH),
        badge: withBasePath(DEFAULT_BADGE_PATH),
        tag: payload.tag,
        data: { url },
    };

    try {
        const registration = await getReadyServiceWorkerRegistration();
        if (registration?.showNotification) {
            await registration.showNotification(payload.title, options);
            return true;
        }
    } catch {
        // Fall back to the page-level Notification constructor.
    }

    try {
        const browserNotification = new window.Notification(payload.title, options);
        browserNotification.onclick = () => {
            window.focus();
            if (url) {
                window.location.assign(url);
            }
            browserNotification.close();
        };
        return true;
    } catch {
        return false;
    }
}

export function appNotificationToBrowserPayload(
    notification: Omit<AppNotification, 'id' | 'createdAt'>
): BrowserNotificationPayload {
    return {
        title: notification.title,
        body: notification.message,
        tag: [
            'moneytrack',
            notification.type,
            notification.metadata?.reminderKey,
            notification.metadata?.budgetId,
            notification.metadata?.recurringPaymentId,
            notification.metadata?.debtId,
            notification.metadata?.accountId,
        ].filter(Boolean).join(':') || 'moneytrack',
        url: notification.actionUrl,
    };
}
