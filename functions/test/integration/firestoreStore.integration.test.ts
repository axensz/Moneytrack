/**
 * Firestore emulator integration tests for the durable-notification stores.
 *
 * These exercise the REAL Admin SDK transactions of `createDeviceStore` and
 * `createWorkerStore` against the Firestore emulator. They only run when
 * `FIRESTORE_EMULATOR_HOST` is set (the `test:notifications:emulator` script);
 * otherwise the whole suite is skipped so `npm test` stays offline.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createDeviceStore, createWorkerStore } from '../../src/notifications/firestoreStore.js';
import type { RegisterDeviceInput } from '../../src/notifications/deviceRegistration.js';
import { registerDeviceCore } from '../../src/notifications/deviceCallables.js';
import { endpointHashFor } from '../../src/notifications/contracts.js';
import type { DeliveryDocument } from '../../src/notifications/types.js';

const SCOPE = 'AAAAAAAAAAAAAAAAAAAAAA';
const DEVICE_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_DEVICE = '223e4567-e89b-12d3-a456-426614174000';
const P256DH = Buffer.alloc(65, 7).toString('base64url');
const AUTH = Buffer.alloc(16, 9).toString('base64url');
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/int-test';

const okResolver = { assertPubliclyRoutable: async () => {} };
const noLimiter = { consume: async () => {} };
const clock = { now: () => new Date('2026-08-30T09:00:00.000Z') };

const regInput = (o: Partial<RegisterDeviceInput> = {}): RegisterDeviceInput => ({
  deviceId: DEVICE_ID,
  accountScope: SCOPE,
  platform: 'android',
  serviceWorkerScope: '/',
  subscription: { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } },
  ...o,
});

let app: App;
let db: Firestore;

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

describeWithEmulator('firestoreStore (emulator)', () => {
  beforeAll(() => {
    app = initializeApp({ projectId: 'demo-moneytrack' }, `int-${Date.now()}`);
    db = getFirestore(app);
  });

  afterEach(async () => {
    // Clear the collections we touch between tests.
    for (const path of [`users/u1/notificationDevices`, `users/u2/notificationDevices`, `users/u1/notificationDeliveries`]) {
      const snap = await db.collection(path).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
    const bindings = await db.collection('endpointBindings').get();
    await Promise.all(bindings.docs.map((d) => d.ref.delete()));
  });

  afterAll(async () => { await deleteApp(app); });

  it('registers a device and persists a global endpoint binding', async () => {
    const store = createDeviceStore(db);
    const result = await registerDeviceCore({ uid: 'u1' }, regInput(), { store, resolver: okResolver, rateLimiter: noLimiter, clock });
    expect(result.recognized).toBe(true);

    const deviceSnap = await db.doc(`users/u1/notificationDevices/${DEVICE_ID}`).get();
    expect(deviceSnap.exists).toBe(true);
    expect(deviceSnap.data()?.endpoint).toBe(ENDPOINT); // stored server-side
    const binding = await db.doc(`endpointBindings/${endpointHashFor(ENDPOINT)}`).get();
    expect(binding.data()?.uid).toBe('u1');
  });

  it('rebinds an endpoint across accounts and scrubs the previous device', async () => {
    const store = createDeviceStore(db);
    await registerDeviceCore({ uid: 'u1' }, regInput(), { store, resolver: okResolver, rateLimiter: noLimiter, clock });
    await registerDeviceCore({ uid: 'u2' }, regInput({ deviceId: OTHER_DEVICE }), { store, resolver: okResolver, rateLimiter: noLimiter, clock });

    const oldDevice = await db.doc(`users/u1/notificationDevices/${DEVICE_ID}`).get();
    expect(oldDevice.data()?.enabled).toBe(false);
    expect(oldDevice.data()?.endpoint).toBe(''); // scrubbed
    const binding = await db.doc(`endpointBindings/${endpointHashFor(ENDPOINT)}`).get();
    expect(binding.data()?.uid).toBe('u2');
  });

  it('revokes a device and scrubs capability material', async () => {
    const store = createDeviceStore(db);
    await registerDeviceCore({ uid: 'u1' }, regInput(), { store, resolver: okResolver, rateLimiter: noLimiter, clock });
    const revoked = await store.revokeDevice('u1', DEVICE_ID, clock.now().toISOString());
    expect(revoked?.enabled).toBe(false);
    const snap = await db.doc(`users/u1/notificationDevices/${DEVICE_ID}`).get();
    expect(snap.data()?.endpoint).toBe('');
    expect(snap.data()?.p256dh).toBe('');
  });

  it('idempotent test dedup: a repeated requestId returns duplicate', async () => {
    const store = createDeviceStore(db);
    const first = await store.recordTestResult({ uid: 'u1', deviceId: DEVICE_ID, requestId: 'req-1', now: clock.now().toISOString() });
    const second = await store.recordTestResult({ uid: 'u1', deviceId: DEVICE_ID, requestId: 'req-1', now: clock.now().toISOString() });
    expect(first).toBe('sent');
    expect(second).toBe('duplicate');
  });

  it('claims a delivery under lease and rejects a competing claim', async () => {
    const worker = createWorkerStore(db);
    const now = new Date('2026-08-30T09:00:00.000Z');
    const delivery: DeliveryDocument = {
      deliveryId: 'delivery-int-1', accountScope: SCOPE, eventId: 'e1', eventRevision: 1, deviceId: DEVICE_ID,
      authorityConfigVersion: 1, status: 'pending', notBefore: '2026-08-30T08:00:00.000Z', attempts: 0,
      lastAttemptAt: null, acceptedAt: null, failureCode: null, leaseOwner: null, leaseExpiresAt: null,
      retentionExpiresAt: null, updatedAt: now.toISOString(),
    };
    await db.doc(`users/u1/notificationDeliveries/${delivery.deliveryId}`).set(delivery);

    const leaseExpiry = new Date(now.getTime() + 120_000).toISOString();
    const first = await worker.claimDelivery(delivery.deliveryId, 'w1', leaseExpiry, now);
    expect(first?.leaseOwner).toBe('w1');
    const second = await worker.claimDelivery(delivery.deliveryId, 'w2', leaseExpiry, now);
    expect(second).toBeNull(); // w1 still owns a valid lease
  });

  it('commits a delivery result only while the lease is owned', async () => {
    const worker = createWorkerStore(db);
    const now = new Date('2026-08-30T09:00:00.000Z');
    const delivery: DeliveryDocument = {
      deliveryId: 'delivery-int-2', accountScope: SCOPE, eventId: 'e1', eventRevision: 1, deviceId: DEVICE_ID,
      authorityConfigVersion: 1, status: 'sending', notBefore: '2026-08-30T08:00:00.000Z', attempts: 0,
      lastAttemptAt: null, acceptedAt: null, failureCode: null,
      leaseOwner: 'w1', leaseExpiresAt: new Date(now.getTime() + 120_000).toISOString(),
      retentionExpiresAt: null, updatedAt: now.toISOString(),
    };
    await db.doc(`users/u1/notificationDeliveries/${delivery.deliveryId}`).set(delivery);

    const patch = { status: 'accepted' as const, attempts: 1, lastAttemptAt: now.toISOString(), acceptedAt: now.toISOString(), failureCode: null, nextAttemptAt: null, retentionExpiresAt: null, expireDevice: false };
    const wrongOwner = await worker.commitDeliveryResult({ deliveryId: delivery.deliveryId, worker: 'w2', patch, now });
    expect(wrongOwner).toBe('lost-lease');
    const rightOwner = await worker.commitDeliveryResult({ deliveryId: delivery.deliveryId, worker: 'w1', patch, now });
    expect(rightOwner).toBe('committed');

    const snap = await db.doc(`users/u1/notificationDeliveries/${delivery.deliveryId}`).get();
    expect(snap.data()?.status).toBe('accepted');
    expect(snap.data()?.leaseOwner).toBeNull();
  });
});
