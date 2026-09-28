import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  validateRegistration,
  isPublicHttpsEndpoint,
  decideRebind,
  buildDeviceDocument,
  wouldExceedDeviceCap,
  sanitizeDevice,
  type RegisterDeviceInput,
  type ValidatedRegistration,
} from '../../src/notifications/deviceRegistration.js';
import type { DeviceDocument } from '../../src/notifications/types.js';

const sha256Hex = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

const SCOPE = 'AAAAAAAAAAAAAAAAAAAAAA';
const DEVICE_ID = '123e4567-e89b-12d3-a456-426614174000';
// 65-byte and 16-byte base64url values.
const P256DH = Buffer.alloc(65, 7).toString('base64url');
const AUTH = Buffer.alloc(16, 9).toString('base64url');
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';

const input = (o: Partial<RegisterDeviceInput> = {}): RegisterDeviceInput => ({
  deviceId: DEVICE_ID,
  accountScope: SCOPE,
  platform: 'android',
  serviceWorkerScope: '/',
  subscription: { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } },
  ...o,
});

describe('isPublicHttpsEndpoint', () => {
  it('accepts a public HTTPS hostname endpoint', () => {
    expect(isPublicHttpsEndpoint(ENDPOINT)).toBe(true);
    expect(isPublicHttpsEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
  });

  it('rejects non-https, credentials, IP literals, and private hosts', () => {
    expect(isPublicHttpsEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isPublicHttpsEndpoint('https://user:pass@fcm.googleapis.com/x')).toBe(false);
    expect(isPublicHttpsEndpoint('https://127.0.0.1/x')).toBe(false);
    expect(isPublicHttpsEndpoint('https://192.168.0.1/x')).toBe(false);
    expect(isPublicHttpsEndpoint('https://localhost/x')).toBe(false);
    expect(isPublicHttpsEndpoint('https://router.local/x')).toBe(false);
    expect(isPublicHttpsEndpoint('not a url')).toBe(false);
  });
});

describe('validateRegistration', () => {
  it('derives deterministic endpoint hash and capability fingerprint', () => {
    const v = validateRegistration(input());
    expect(v.endpointHash).toBe(sha256Hex(ENDPOINT));
    expect(v.capabilityFingerprint).toBe(sha256Hex(`${P256DH}\0${AUTH}`));
    expect(v.platform).toBe('android');
  });

  it('normalizes an unknown platform to "other"', () => {
    expect(validateRegistration(input({ platform: 'toaster' })).platform).toBe('other');
  });

  it('rejects a malformed device id', () => {
    expect(() => validateRegistration(input({ deviceId: 'nope' }))).toThrow();
  });

  it('rejects a non-public endpoint', () => {
    expect(() =>
      validateRegistration(input({ subscription: { endpoint: 'https://127.0.0.1/x', keys: { p256dh: P256DH, auth: AUTH } } })),
    ).toThrow();
  });

  it('rejects a p256dh that does not decode to 65 bytes', () => {
    const short = Buffer.alloc(32, 1).toString('base64url');
    expect(() =>
      validateRegistration(input({ subscription: { endpoint: ENDPOINT, keys: { p256dh: short, auth: AUTH } } })),
    ).toThrow();
  });

  it('rejects an auth shorter than 16 bytes', () => {
    const shortAuth = Buffer.alloc(8, 1).toString('base64url');
    expect(() =>
      validateRegistration(input({ subscription: { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: shortAuth } } })),
    ).toThrow();
  });

  it('rejects a non-base64url key', () => {
    expect(() =>
      validateRegistration(input({ subscription: { endpoint: ENDPOINT, keys: { p256dh: 'has padding==', auth: AUTH } } })),
    ).toThrow();
  });
});

describe('decideRebind', () => {
  const validated = (): ValidatedRegistration => validateRegistration(input());

  it('creates when unbound and no device doc exists', () => {
    expect(
      decideRebind({ validated: validated(), callerUid: 'u1', existingDevice: null, existingEndpointBinding: null }),
    ).toEqual({ action: 'create' });
  });

  it('updates in place for the same uid+device', () => {
    const v = validated();
    expect(
      decideRebind({
        validated: v,
        callerUid: 'u1',
        existingDevice: buildDeviceDocument({ validated: v, now: '2026-08-30T00:00:00.000Z', existingDevice: null }),
        existingEndpointBinding: { uid: 'u1', deviceId: DEVICE_ID, capabilityFingerprint: v.capabilityFingerprint, enabled: true },
      }),
    ).toEqual({ action: 'update-same-device' });
  });

  it('rebinds when the endpoint moved accounts with a matching fingerprint', () => {
    const v = validated();
    expect(
      decideRebind({
        validated: v,
        callerUid: 'u2',
        existingDevice: null,
        existingEndpointBinding: { uid: 'u1', deviceId: 'old-device', capabilityFingerprint: v.capabilityFingerprint, enabled: true },
      }),
    ).toEqual({ action: 'rebind', previousDeviceId: 'old-device', previousUid: 'u1' });
  });

  it('rejects a mismatched-fingerprint replay without touching the binding', () => {
    const v = validated();
    expect(
      decideRebind({
        validated: v,
        callerUid: 'u2',
        existingDevice: null,
        existingEndpointBinding: { uid: 'u1', deviceId: 'old-device', capabilityFingerprint: 'different', enabled: true },
      }),
    ).toEqual({ action: 'reject', reason: 'Endpoint bound with a different capability key' });
  });
});

describe('wouldExceedDeviceCap', () => {
  it('excludes the registering device and caps at five', () => {
    expect(wouldExceedDeviceCap(['a', 'b', 'c', 'd'], DEVICE_ID)).toBe(false);
    expect(wouldExceedDeviceCap(['a', 'b', 'c', 'd', 'e'], DEVICE_ID)).toBe(true);
    // Re-registering an already-counted device does not count twice.
    expect(wouldExceedDeviceCap(['a', 'b', 'c', 'd', DEVICE_ID], DEVICE_ID)).toBe(false);
  });
});

describe('buildDeviceDocument and sanitizeDevice', () => {
  it('preserves createdAt/lastAcceptedAt across an update and clears failure/disabled', () => {
    const v = validateRegistration(input());
    const existing: DeviceDocument = {
      ...buildDeviceDocument({ validated: v, now: '2026-08-01T00:00:00.000Z', existingDevice: null }),
      lastAcceptedAt: '2026-08-10T00:00:00.000Z',
      lastFailureCode: '410',
      disabledAt: '2026-08-11T00:00:00.000Z',
    };
    const doc = buildDeviceDocument({ validated: v, now: '2026-08-30T09:00:00.000Z', existingDevice: existing });
    expect(doc.createdAt).toBe('2026-08-01T00:00:00.000Z');
    expect(doc.updatedAt).toBe('2026-08-30T09:00:00.000Z');
    expect(doc.lastAcceptedAt).toBe('2026-08-10T00:00:00.000Z');
    expect(doc.lastFailureCode).toBeNull();
    expect(doc.disabledAt).toBeNull();
    expect(doc.enabled).toBe(true);
  });

  it('sanitize strips raw capability material', () => {
    const v = validateRegistration(input());
    const doc = buildDeviceDocument({ validated: v, now: '2026-08-30T09:00:00.000Z', existingDevice: null });
    const sanitized = sanitizeDevice(doc);
    expect(sanitized).not.toHaveProperty('endpoint');
    expect(sanitized).not.toHaveProperty('p256dh');
    expect(sanitized).not.toHaveProperty('auth');
    expect(sanitized.deviceId).toBe(DEVICE_ID);
    expect(sanitized.enabled).toBe(true);
  });
});
