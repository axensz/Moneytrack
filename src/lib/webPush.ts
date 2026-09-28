'use client';

/**
 * Native Web Push primitives for the CURRENT device.
 *
 * Task 6 scope: detection (`inspectNativePush`) plus local primitives
 * (`subscribeCurrentDevice`, `unsubscribeCurrentDevice`, `getOrCreateDeviceId`).
 * The combined VAPID-mismatch orchestration (revoke + unsubscribe +
 * action-required) belongs to Task 7 and is intentionally NOT wired here.
 *
 * Privacy: the only thing this module persists is a stable, opaque device id
 * under a single localStorage key. Push endpoints and keys live exclusively in
 * the browser-managed PushSubscription and are never written to storage.
 */

const DEVICE_ID_STORAGE_KEY = 'moneytrack.notificationDeviceId';

export type NativePushInspection =
  | { kind: 'unsupported' | 'insecure-context' | 'ios-not-installed' }
  | { kind: 'permission-required' | 'permission-blocked' }
  | { kind: 'subscription-missing'; registration: ServiceWorkerRegistration }
  | { kind: 'vapid-key-mismatch'; registration: ServiceWorkerRegistration; subscription: PushSubscription }
  | { kind: 'subscribed'; registration: ServiceWorkerRegistration; subscription: PushSubscription };

/**
 * Return a stable, opaque device id, creating it once if absent. Only the
 * canonical 36-char UUID is stored, under a single dedicated key.
 */
export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const created = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
  return created;
}

function pushApisAvailable(): boolean {
  return (
    typeof Notification !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    Boolean(navigator.serviceWorker) &&
    typeof PushManager !== 'undefined'
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandaloneDisplayMode(): boolean {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { standalone?: boolean }) : undefined;
  if (nav?.standalone === true) {
    return true;
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(display-mode: standalone)').matches;
  }
  return false;
}

/**
 * Decode a base64url-encoded VAPID public key into raw bytes.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

function bytesEqual(a: ArrayBufferLike, b: ArrayBufferLike): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  for (let i = 0; i < viewA.length; i += 1) {
    if (viewA[i] !== viewB[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Inspect (never mutate) the native push state for the current device.
 * Returns the highest-priority blocking condition, or the current subscription
 * state. Never prompts for permission and never creates a subscription.
 */
export async function inspectNativePush(vapidPublicKey: string): Promise<NativePushInspection> {
  if (!pushApisAvailable()) {
    return { kind: 'unsupported' };
  }

  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return { kind: 'insecure-context' };
  }

  if (isIosSafari() && !isStandaloneDisplayMode()) {
    return { kind: 'ios-not-installed' };
  }

  if (Notification.permission === 'denied') {
    return { kind: 'permission-blocked' };
  }

  if (Notification.permission === 'default') {
    return { kind: 'permission-required' };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return { kind: 'subscription-missing', registration };
  }

  const configuredKey = urlBase64ToUint8Array(vapidPublicKey);
  const subscriptionKey = subscription.options.applicationServerKey;

  if (!subscriptionKey || !bytesEqual(subscriptionKey, configuredKey.buffer)) {
    return { kind: 'vapid-key-mismatch', registration, subscription };
  }

  return { kind: 'subscribed', registration, subscription };
}

/**
 * The ONLY function that requests notification permission and creates a push
 * subscription for the current device.
 */
export async function subscribeCurrentDevice(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string,
): Promise<PushSubscription> {
  if (!vapidPublicKey || vapidPublicKey.trim().length === 0) {
    throw new Error('Falta la clave pública VAPID para suscribir el dispositivo.');
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  // Revalida tras el prompt: una denegación devuelve un error acotado del
  // producto en vez de dejar que subscribe() rechace con el error crudo del
  // navegador.
  if (permission !== 'granted') {
    throw new Error('No se concedió permiso de notificaciones en este dispositivo.');
  }

  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });
}

/**
 * Local primitive: unsubscribe the current subscription if present. Does NOT
 * call the revoke callable (Task 7 owns that combined orchestration).
 */
export async function unsubscribeCurrentDevice(
  registration: ServiceWorkerRegistration,
): Promise<boolean> {
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return false;
  }
  return subscription.unsubscribe();
}
