import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getOrCreateDeviceId,
  inspectNativePush,
  subscribeCurrentDevice,
  unsubscribeCurrentDevice,
} from '../../lib/webPush';

const DEVICE_ID_STORAGE_KEY = 'moneytrack.notificationDeviceId';

// A valid base64url VAPID public key (65-byte P-256 point, uncompressed 0x04 prefix).
const VAPID_KEY =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8';

function decodeVapidKey(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

function bufferFromKey(base64url: string): ArrayBuffer {
  const bytes = decodeVapidKey(base64url);
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

interface FakeSubscription {
  options: { applicationServerKey: ArrayBuffer | null };
  unsubscribe: ReturnType<typeof vi.fn>;
}

function makeSubscription(key: ArrayBuffer | null): FakeSubscription {
  return {
    options: { applicationServerKey: key },
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

interface FakeRegistration {
  pushManager: {
    getSubscription: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  };
}

function makeRegistration(subscription: FakeSubscription | null): FakeRegistration {
  return {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(subscription),
      subscribe: vi.fn(),
    },
  };
}

type NotificationStub = {
  permission: NotificationPermission;
  requestPermission: ReturnType<typeof vi.fn>;
};

function stubEnvironment(overrides: {
  secureContext?: boolean;
  permission?: NotificationPermission;
  hasNotification?: boolean;
  hasServiceWorker?: boolean;
  hasPushManager?: boolean;
  registration?: FakeRegistration | null;
  userAgent?: string;
  standalone?: boolean;
} = {}): { notification: NotificationStub } {
  const {
    secureContext = true,
    permission = 'granted',
    hasNotification = true,
    hasServiceWorker = true,
    hasPushManager = true,
    registration = makeRegistration(null),
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    standalone = false,
  } = overrides;

  const notification: NotificationStub = {
    permission,
    requestPermission: vi.fn().mockResolvedValue(permission === 'default' ? 'granted' : permission),
  };

  if (hasNotification) {
    vi.stubGlobal('Notification', notification);
  } else {
    vi.stubGlobal('Notification', undefined);
  }

  if (hasPushManager) {
    vi.stubGlobal('PushManager', function PushManager() {});
  } else {
    vi.stubGlobal('PushManager', undefined);
  }

  const serviceWorker = hasServiceWorker
    ? { ready: Promise.resolve(registration) }
    : undefined;

  vi.stubGlobal('navigator', {
    serviceWorker,
    userAgent,
    ...(standalone ? { standalone: true } : {}),
  });

  vi.stubGlobal('window', {
    isSecureContext: secureContext,
    Notification: hasNotification ? notification : undefined,
    matchMedia: vi.fn().mockImplementation((query: string) => ({
      matches: standalone && query.includes('standalone'),
      media: query,
    })),
  });

  return { notification };
}

describe('getOrCreateDeviceId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('crea un UUID canonico de 36 chars y lo persiste solo bajo la clave del dispositivo', () => {
    const id = getOrCreateDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(id);
  });

  it('devuelve el mismo id en llamadas sucesivas (creado una sola vez)', () => {
    const spy = vi.spyOn(crypto, 'randomUUID');
    const first = getOrCreateDeviceId();
    const second = getOrCreateDeviceId();
    expect(first).toBe(second);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('inspectNativePush', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devuelve unsupported cuando falta Notification', async () => {
    stubEnvironment({ hasNotification: false });
    await expect(inspectNativePush(VAPID_KEY)).resolves.toEqual({ kind: 'unsupported' });
  });

  it('devuelve unsupported cuando falta serviceWorker', async () => {
    stubEnvironment({ hasServiceWorker: false });
    await expect(inspectNativePush(VAPID_KEY)).resolves.toEqual({ kind: 'unsupported' });
  });

  it('devuelve unsupported cuando falta PushManager', async () => {
    stubEnvironment({ hasPushManager: false });
    await expect(inspectNativePush(VAPID_KEY)).resolves.toEqual({ kind: 'unsupported' });
  });

  it('devuelve insecure-context cuando isSecureContext es false', async () => {
    stubEnvironment({ secureContext: false });
    await expect(inspectNativePush(VAPID_KEY)).resolves.toEqual({ kind: 'insecure-context' });
  });

  it('devuelve ios-not-installed en Safari iOS fuera de standalone', async () => {
    stubEnvironment({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      standalone: false,
    });
    await expect(inspectNativePush(VAPID_KEY)).resolves.toEqual({ kind: 'ios-not-installed' });
  });

  it('no devuelve ios-not-installed cuando iOS esta en standalone (home screen)', async () => {
    stubEnvironment({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      standalone: true,
      registration: makeRegistration(null),
    });
    const result = await inspectNativePush(VAPID_KEY);
    expect(result.kind).toBe('subscription-missing');
  });

  it('devuelve permission-blocked cuando el permiso esta denegado', async () => {
    stubEnvironment({ permission: 'denied' });
    await expect(inspectNativePush(VAPID_KEY)).resolves.toEqual({ kind: 'permission-blocked' });
  });

  it('devuelve permission-required cuando el permiso es default', async () => {
    stubEnvironment({ permission: 'default' });
    await expect(inspectNativePush(VAPID_KEY)).resolves.toEqual({ kind: 'permission-required' });
  });

  it('devuelve subscription-missing cuando no hay suscripcion', async () => {
    const registration = makeRegistration(null);
    stubEnvironment({ registration });
    const result = await inspectNativePush(VAPID_KEY);
    expect(result).toMatchObject({ kind: 'subscription-missing' });
    if (result.kind === 'subscription-missing') {
      expect(result.registration).toBe(registration);
    }
  });

  it('devuelve subscribed cuando la suscripcion coincide byte a byte con la VAPID key', async () => {
    const subscription = makeSubscription(bufferFromKey(VAPID_KEY));
    const registration = makeRegistration(subscription);
    stubEnvironment({ registration });
    const result = await inspectNativePush(VAPID_KEY);
    expect(result.kind).toBe('subscribed');
    if (result.kind === 'subscribed') {
      expect(result.subscription).toBe(subscription);
    }
  });

  it('devuelve vapid-key-mismatch cuando la applicationServerKey difiere', async () => {
    const otherKey = new Uint8Array(bufferFromKey(VAPID_KEY));
    otherKey[1] ^= 0xff;
    const subscription = makeSubscription(otherKey.buffer);
    const registration = makeRegistration(subscription);
    stubEnvironment({ registration });
    const result = await inspectNativePush(VAPID_KEY);
    expect(result.kind).toBe('vapid-key-mismatch');
  });

  it('devuelve vapid-key-mismatch cuando la suscripcion no tiene applicationServerKey', async () => {
    const subscription = makeSubscription(null);
    const registration = makeRegistration(subscription);
    stubEnvironment({ registration });
    const result = await inspectNativePush(VAPID_KEY);
    expect(result.kind).toBe('vapid-key-mismatch');
  });

  it('nunca solicita permiso ni crea suscripciones (solo inspecciona)', async () => {
    const registration = makeRegistration(null);
    const { notification } = stubEnvironment({ registration });
    await inspectNativePush(VAPID_KEY);
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  });
});

describe('subscribeCurrentDevice', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lanza un error acotado cuando la VAPID key esta vacia', async () => {
    stubEnvironment();
    const registration = makeRegistration(null) as unknown as ServiceWorkerRegistration;
    await expect(subscribeCurrentDevice(registration, '')).rejects.toThrow();
  });

  it('lanza un error acotado y no suscribe cuando se deniega el permiso', async () => {
    const { notification } = stubEnvironment({ permission: 'default' });
    notification.requestPermission.mockResolvedValue('denied');
    const registration = makeRegistration(null);
    await expect(
      subscribeCurrentDevice(registration as unknown as ServiceWorkerRegistration, VAPID_KEY),
    ).rejects.toThrow(/permiso/i);
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('solicita permiso y suscribe con applicationServerKey convertida desde base64url', async () => {
    const { notification } = stubEnvironment({ permission: 'default' });
    const created = makeSubscription(bufferFromKey(VAPID_KEY));
    const registration = makeRegistration(null);
    registration.pushManager.subscribe.mockResolvedValue(created);

    const result = await subscribeCurrentDevice(
      registration as unknown as ServiceWorkerRegistration,
      VAPID_KEY,
    );

    expect(notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1);
    const arg = registration.pushManager.subscribe.mock.calls[0][0];
    expect(arg.userVisibleOnly).toBe(true);
    const sentKey = new Uint8Array(arg.applicationServerKey);
    expect(Array.from(sentKey)).toEqual(Array.from(decodeVapidKey(VAPID_KEY)));
    expect(result).toBe(created);
  });
});

describe('unsubscribeCurrentDevice', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('desuscribe la suscripcion actual y devuelve el booleano', async () => {
    const subscription = makeSubscription(bufferFromKey(VAPID_KEY));
    const registration = makeRegistration(subscription);
    const ok = await unsubscribeCurrentDevice(
      registration as unknown as ServiceWorkerRegistration,
    );
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(ok).toBe(true);
  });

  it('devuelve false cuando no hay suscripcion', async () => {
    const registration = makeRegistration(null);
    const ok = await unsubscribeCurrentDevice(
      registration as unknown as ServiceWorkerRegistration,
    );
    expect(ok).toBe(false);
  });
});
