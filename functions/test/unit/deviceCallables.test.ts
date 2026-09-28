import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerDeviceCore,
  deviceStatusCore,
  revokeDeviceCore,
  testDeliveryCore,
  CallableError,
  type DeviceStore,
  type EndpointResolver,
  type RateLimiter,
  type Clock,
  type TestSender,
  type EndpointBinding,
} from '../../src/notifications/deviceCallables.js';
import type { DeviceDocument } from '../../src/notifications/types.js';
import { endpointHashFor } from '../../src/notifications/contracts.js';

const SCOPE = 'AAAAAAAAAAAAAAAAAAAAAA';
const DEVICE_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_DEVICE = '223e4567-e89b-12d3-a456-426614174000';
const P256DH = Buffer.alloc(65, 7).toString('base64url');
const AUTH = Buffer.alloc(16, 9).toString('base64url');
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';

const payload = (o: Record<string, unknown> = {}) => ({
  deviceId: DEVICE_ID,
  accountScope: SCOPE,
  platform: 'android',
  serviceWorkerScope: '/',
  subscription: { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } },
  ...o,
});

const fixedClock = (iso = '2026-08-30T09:00:00.000Z'): Clock => ({ now: () => new Date(iso) });
const okResolver: EndpointResolver = { assertPubliclyRoutable: async () => {} };
const noLimiter: RateLimiter = { consume: async () => {} };

class MemoryStore implements DeviceStore {
  devices = new Map<string, DeviceDocument>();
  bindings = new Map<string, EndpointBinding>();
  testResults = new Set<string>();
  commits: Array<{ scrubPrevious: { uid: string; deviceId: string } | null }> = [];

  private key(uid: string, deviceId: string) { return `${uid}/${deviceId}`; }

  async getDevice(uid: string, deviceId: string) { return this.devices.get(this.key(uid, deviceId)) ?? null; }
  async getEndpointBinding(endpointHash: string) { return this.bindings.get(endpointHash) ?? null; }
  async listEnabledDeviceIds(uid: string) {
    return [...this.devices.values()].filter((d) => d.accountScope && d.enabled && this.ownerOf(d) === uid).map((d) => d.deviceId);
  }
  private owners = new Map<string, string>();
  private ownerOf(d: DeviceDocument) { return this.owners.get(d.deviceId) ?? 'u1'; }

  async commitRegistration(input: { uid: string; device: DeviceDocument; endpointHash: string; scrubPrevious: { uid: string; deviceId: string } | null }) {
    this.commits.push({ scrubPrevious: input.scrubPrevious });
    if (input.scrubPrevious) {
      this.devices.delete(this.key(input.scrubPrevious.uid, input.scrubPrevious.deviceId));
    }
    this.owners.set(input.device.deviceId, input.uid);
    this.devices.set(this.key(input.uid, input.device.deviceId), input.device);
    this.bindings.set(input.endpointHash, {
      uid: input.uid, deviceId: input.device.deviceId,
      capabilityFingerprint: input.device.capabilityFingerprint, enabled: true,
    });
  }
  async revokeDevice(uid: string, deviceId: string, now: string) {
    const existing = this.devices.get(this.key(uid, deviceId));
    if (!existing) return null;
    const disabled = { ...existing, enabled: false, disabledAt: now, endpoint: '', p256dh: '', auth: '' };
    this.devices.set(this.key(uid, deviceId), disabled);
    return disabled;
  }
  async recordTestResult(input: { uid: string; deviceId: string; requestId: string }) {
    const key = `${input.uid}/${input.deviceId}/${input.requestId}`;
    if (this.testResults.has(key)) return 'duplicate' as const;
    this.testResults.add(key);
    return 'sent' as const;
  }
}

let store: MemoryStore;
beforeEach(() => { store = new MemoryStore(); });

describe('registerDeviceCore', () => {
  const deps = () => ({ store, resolver: okResolver, rateLimiter: noLimiter, clock: fixedClock() });

  it('rejects an unauthenticated caller', async () => {
    await expect(registerDeviceCore({ uid: null }, payload(), deps())).rejects.toBeInstanceOf(CallableError);
  });

  it('creates a device and returns a sanitized result', async () => {
    const result = await registerDeviceCore({ uid: 'u1' }, payload(), deps());
    expect(result.recognized).toBe(true);
    expect(result.device?.deviceId).toBe(DEVICE_ID);
    expect(result.device).not.toHaveProperty('endpoint');
    expect(result.activeDeviceCount).toBe(1);
    expect(store.bindings.get(endpointHashFor(ENDPOINT))?.uid).toBe('u1');
  });

  it('derives uid from auth, ignoring any uid in the payload', async () => {
    await registerDeviceCore({ uid: 'u1' }, payload({ uid: 'attacker' }), deps());
    expect(store.commits[0]).toBeDefined();
    expect([...store.devices.keys()][0]).toContain('u1/');
  });

  it('rejects an invalid subscription with invalid-argument', async () => {
    await expect(
      registerDeviceCore({ uid: 'u1' }, payload({ subscription: { endpoint: 'http://x', keys: { p256dh: P256DH, auth: AUTH } } }), deps()),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects a non-routable endpoint via the resolver', async () => {
    const resolver: EndpointResolver = { assertPubliclyRoutable: async () => { throw new Error('resolves to private IP'); } };
    await expect(
      registerDeviceCore({ uid: 'u1' }, payload(), { ...deps(), resolver }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('enforces the five-device cap for a new device', async () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      store.devices.set(`u1/${id}`, { deviceId: id, enabled: true, accountScope: SCOPE } as DeviceDocument);
    }
    await expect(registerDeviceCore({ uid: 'u1' }, payload(), deps())).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('rebinds an endpoint that moved accounts with a matching fingerprint and scrubs the old device', async () => {
    await registerDeviceCore({ uid: 'u1' }, payload(), deps());
    // Same physical subscription now registers under u2 with a different deviceId.
    const result = await registerDeviceCore({ uid: 'u2' }, payload({ deviceId: OTHER_DEVICE }), deps());
    expect(result.recognized).toBe(true);
    expect(store.commits.at(-1)?.scrubPrevious).toEqual({ uid: 'u1', deviceId: DEVICE_ID });
    expect(store.devices.has(`u1/${DEVICE_ID}`)).toBe(false);
  });

  it('rejects a mismatched-fingerprint replay with permission-denied', async () => {
    store.bindings.set(endpointHashFor(ENDPOINT), { uid: 'u1', deviceId: 'old', capabilityFingerprint: 'different', enabled: true });
    await expect(registerDeviceCore({ uid: 'u2' }, payload(), deps())).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('deviceStatusCore', () => {
  it('reports recognized for an enabled device', async () => {
    await registerDeviceCore({ uid: 'u1' }, payload(), { store, resolver: okResolver, rateLimiter: noLimiter, clock: fixedClock() });
    const status = await deviceStatusCore({ uid: 'u1' }, { deviceId: DEVICE_ID }, { store });
    expect(status.recognized).toBe(true);
    expect(status.device?.deviceId).toBe(DEVICE_ID);
  });

  it('reports not recognized for an unknown device', async () => {
    const status = await deviceStatusCore({ uid: 'u1' }, { deviceId: DEVICE_ID }, { store });
    expect(status.recognized).toBe(false);
    expect(status.device).toBeNull();
  });
});

describe('revokeDeviceCore', () => {
  it('disables and scrubs a device', async () => {
    await registerDeviceCore({ uid: 'u1' }, payload(), { store, resolver: okResolver, rateLimiter: noLimiter, clock: fixedClock() });
    const result = await revokeDeviceCore({ uid: 'u1' }, { deviceId: DEVICE_ID }, { store, clock: fixedClock() });
    expect(result.revoked).toBe(true);
    const device = await store.getDevice('u1', DEVICE_ID);
    expect(device?.enabled).toBe(false);
    expect(device?.endpoint).toBe('');
  });

  it('returns revoked=false for an unknown device', async () => {
    const result = await revokeDeviceCore({ uid: 'u1' }, { deviceId: DEVICE_ID }, { store, clock: fixedClock() });
    expect(result.revoked).toBe(false);
  });
});

describe('testDeliveryCore', () => {
  const sender = (statusCode: number): TestSender => ({ send: async () => ({ statusCode }) });

  const register = () => registerDeviceCore({ uid: 'u1' }, payload(), { store, resolver: okResolver, rateLimiter: noLimiter, clock: fixedClock() });

  it('returns accepted on a 2xx push', async () => {
    await register();
    const out = await testDeliveryCore({ uid: 'u1' }, { deviceId: DEVICE_ID, requestId: 'r1' }, { store, sender: sender(201), rateLimiter: noLimiter, clock: fixedClock() });
    expect(out).toEqual({ outcome: 'accepted' });
  });

  it('returns duplicate without a second send for a repeated requestId', async () => {
    await register();
    let sends = 0;
    const countingSender: TestSender = { send: async () => { sends += 1; return { statusCode: 201 }; } };
    const deps = { store, sender: countingSender, rateLimiter: noLimiter, clock: fixedClock() };
    await testDeliveryCore({ uid: 'u1' }, { deviceId: DEVICE_ID, requestId: 'same' }, deps);
    const second = await testDeliveryCore({ uid: 'u1' }, { deviceId: DEVICE_ID, requestId: 'same' }, deps);
    expect(second).toEqual({ outcome: 'duplicate' });
    expect(sends).toBe(1);
  });

  it('returns a failure code on a non-2xx push', async () => {
    await register();
    const out = await testDeliveryCore({ uid: 'u1' }, { deviceId: DEVICE_ID, requestId: 'r2' }, { store, sender: sender(410), rateLimiter: noLimiter, clock: fixedClock() });
    expect(out).toEqual({ outcome: 'failed', failureCode: '410' });
  });

  it('rejects a test for an unregistered device', async () => {
    await expect(
      testDeliveryCore({ uid: 'u1' }, { deviceId: DEVICE_ID, requestId: 'r3' }, { store, sender: sender(201), rateLimiter: noLimiter, clock: fixedClock() }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('propagates a rate-limit rejection', async () => {
    await register();
    const limiter: RateLimiter = { consume: async () => { throw new CallableError('resource-exhausted', 'too many'); } };
    await expect(
      testDeliveryCore({ uid: 'u1' }, { deviceId: DEVICE_ID, requestId: 'r4' }, { store, sender: sender(201), rateLimiter: limiter, clock: fixedClock() }),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});
