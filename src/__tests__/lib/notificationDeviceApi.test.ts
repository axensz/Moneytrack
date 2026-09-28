import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const httpsCallableMock = vi.fn();
const getFunctionsMock = vi.fn();
const registerCallable = vi.fn();
const statusCallable = vi.fn();
const revokeCallable = vi.fn();
const sendTestCallable = vi.fn();

vi.mock('firebase/functions', () => ({
  getFunctions: (...args: unknown[]) => getFunctionsMock(...args),
  httpsCallable: (...args: unknown[]) => httpsCallableMock(...args),
}));

vi.mock('../../lib/firebase', () => ({
  app: { __brand: 'fake-app' },
}));

import type {
  RegisterNotificationDeviceInput,
  SanitizedDeviceStatus,
} from '../../lib/notificationDeviceApi';

const FUNCTIONS_INSTANCE = { __brand: 'functions-us-central1' };

function wireCallables(): void {
  getFunctionsMock.mockReturnValue(FUNCTIONS_INSTANCE);
  httpsCallableMock.mockImplementation((_functions: unknown, name: string) => {
    switch (name) {
      case 'registerNotificationDevice':
        return registerCallable;
      case 'getNotificationDeviceStatus':
        return statusCallable;
      case 'revokeNotificationDevice':
        return revokeCallable;
      case 'sendTestNotification':
        return sendTestCallable;
      default:
        throw new Error(`unexpected callable: ${name}`);
    }
  });
}

const registerInput: RegisterNotificationDeviceInput = {
  deviceId: '11111111-1111-4111-8111-111111111111',
  subscription: {
    endpoint: 'https://push.example.com/abc',
    expirationTime: null,
    keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
  },
  timeZone: 'America/Bogota',
  platform: 'desktop',
  displayMode: 'standalone',
};

const sanitizedStatus: SanitizedDeviceStatus = {
  deviceId: registerInput.deviceId,
  state: 'active',
  accountScope: 'user-123',
  endpointFingerprint: 'fp-abc',
  platform: 'desktop',
  displayMode: 'standalone',
  timeZone: 'America/Bogota',
};

async function importApi() {
  return import('../../lib/notificationDeviceApi');
}

describe('notificationDeviceApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    wireCallables();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('crea los callables contra la instancia de us-central1', async () => {
    const { notificationDeviceApi } = await importApi();
    registerCallable.mockResolvedValue({ data: sanitizedStatus });
    await notificationDeviceApi.register(registerInput);

    expect(getFunctionsMock).toHaveBeenCalledWith(
      { __brand: 'fake-app' },
      'us-central1',
    );
    expect(httpsCallableMock).toHaveBeenCalledWith(
      FUNCTIONS_INSTANCE,
      'registerNotificationDevice',
    );
  });

  it('envia exactamente el DTO de registro sin claves extra', async () => {
    const { notificationDeviceApi } = await importApi();
    registerCallable.mockResolvedValue({ data: sanitizedStatus });

    const dirtyInput = {
      ...registerInput,
      // Campos desconocidos que NO deben viajar al backend.
      rawToken: 'should-not-send',
      subscription: {
        ...registerInput.subscription,
        secret: 'nope',
      },
    } as unknown as RegisterNotificationDeviceInput;

    await notificationDeviceApi.register(dirtyInput);

    const sent = registerCallable.mock.calls[0][0];
    expect(sent).toEqual({
      deviceId: registerInput.deviceId,
      subscription: {
        endpoint: registerInput.subscription.endpoint,
        expirationTime: null,
        keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
      },
      timeZone: 'America/Bogota',
      platform: 'desktop',
      displayMode: 'standalone',
    });
    expect(sent).not.toHaveProperty('rawToken');
    expect(sent.subscription).not.toHaveProperty('secret');
  });

  it('devuelve el DTO saneado que entrega el callable', async () => {
    const { notificationDeviceApi } = await importApi();
    registerCallable.mockResolvedValue({ data: sanitizedStatus });
    const result = await notificationDeviceApi.register(registerInput);
    expect(result).toEqual(sanitizedStatus);
  });

  it('status consulta por deviceId y devuelve el DTO saneado', async () => {
    const { notificationDeviceApi } = await importApi();
    statusCallable.mockResolvedValue({ data: sanitizedStatus });
    const result = await notificationDeviceApi.status({ deviceId: registerInput.deviceId });
    expect(statusCallable).toHaveBeenCalledWith({ deviceId: registerInput.deviceId });
    expect(result).toEqual(sanitizedStatus);
  });

  it('revoke envia solo el deviceId', async () => {
    const { notificationDeviceApi } = await importApi();
    revokeCallable.mockResolvedValue({ data: undefined });
    await notificationDeviceApi.revoke({ deviceId: registerInput.deviceId });
    expect(revokeCallable).toHaveBeenCalledWith({ deviceId: registerInput.deviceId });
  });

  it('sendTest reenvia deviceId + testRequestId y devuelve accepted', async () => {
    const { notificationDeviceApi } = await importApi();
    sendTestCallable.mockResolvedValue({ data: { status: 'accepted', deliveryId: 'd-1' } });
    const result = await notificationDeviceApi.sendTest({
      deviceId: registerInput.deviceId,
      testRequestId: '22222222-2222-4222-8222-222222222222',
    });
    expect(sendTestCallable).toHaveBeenCalledWith({
      deviceId: registerInput.deviceId,
      testRequestId: '22222222-2222-4222-8222-222222222222',
    });
    expect(result).toEqual({ status: 'accepted', deliveryId: 'd-1' });
  });

  it('mapea errores de Firebase a un error acotado sin exponer detalles crudos', async () => {
    const { notificationDeviceApi } = await importApi();
    registerCallable.mockRejectedValue(
      Object.assign(new Error('internal: raw stack trace token=SECRET'), {
        code: 'functions/internal',
        details: { secret: 'SECRET' },
      }),
    );

    await expect(notificationDeviceApi.register(registerInput)).rejects.toThrow();
    const err = await notificationDeviceApi
      .register(registerInput)
      .then(() => null)
      .catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).not.toContain('SECRET');
    expect(err?.message).not.toContain('raw stack trace');
  });

  it('sendTest devuelve la variante failed cuando el callable falla', async () => {
    const { notificationDeviceApi } = await importApi();
    sendTestCallable.mockRejectedValue(
      Object.assign(new Error('boom raw'), { code: 'functions/unavailable' }),
    );
    const result = await notificationDeviceApi.sendTest({
      deviceId: registerInput.deviceId,
      testRequestId: '33333333-3333-4333-8333-333333333333',
    });
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(['device-inactive', 'configuration', 'temporary']).toContain(result.code);
    }
  });
});
