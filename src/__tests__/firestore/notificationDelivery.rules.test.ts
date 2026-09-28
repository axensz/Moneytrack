// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const PROJECT_ID = 'demo-moneytrack';
const OWNER_ID = 'owner';
const INTRUDER_ID = 'intruder';

let testEnv: RulesTestEnvironment;

const ownerDb = () => testEnv.authenticatedContext(OWNER_ID).firestore();
const intruderDb = () => testEnv.authenticatedContext(INTRUDER_ID).firestore();

const deviceRef = (db = ownerDb()) => doc(db, 'users', OWNER_ID, 'notificationDevices', 'device-1');
const scheduleRef = (db = ownerDb()) => doc(db, 'users', OWNER_ID, 'notificationSchedules', 'schedule-1');
const deliveryRef = (db = ownerDb()) => doc(db, 'users', OWNER_ID, 'notificationDeliveries', 'delivery-1');
const bindingRef = (db = ownerDb()) => doc(db, 'endpointBindings', 'hash-1');
const rateRef = (db = ownerDb()) => doc(db, 'rateLimits', 'register%3Aowner');
const notifRef = (id: string, db = ownerDb()) => doc(db, 'users', OWNER_ID, 'notifications', id);

const versionedEvent = (overrides: Record<string, unknown> = {}) => ({
  type: 'recurring',
  title: 'Recordatorio de pago',
  message: 'Pendiente',
  severity: 'warning',
  isRead: false,
  createdAt: new Date('2026-08-30T09:00:00.000Z'),
  schemaVersion: 2,
  eventKey: 'recurring:rent:2026-08',
  revision: 2,
  ...overrides,
});

const legacyNotification = (overrides: Record<string, unknown> = {}) => ({
  type: 'info',
  title: 'Aviso',
  message: 'Mensaje',
  severity: 'info',
  isRead: false,
  createdAt: serverTimestamp(),
  ...overrides,
});

const seedVersioned = async (id = 'event-1', overrides: Record<string, unknown> = {}) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', OWNER_ID, 'notifications', id), versionedEvent(overrides));
  });
};

const describeWithFirestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

describeWithFirestoreEmulator('Durable notification rules contract', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8') },
    });
  });

  afterEach(async () => { await testEnv.clearFirestore(); });
  afterAll(async () => { await testEnv.cleanup(); });

  it('denies client read and write of server-owned device/schedule/delivery docs', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', OWNER_ID, 'notificationDevices', 'device-1'), { deviceId: 'device-1', endpoint: 'https://x', enabled: true });
      await setDoc(doc(context.firestore(), 'users', OWNER_ID, 'notificationSchedules', 'schedule-1'), { scheduleId: 'schedule-1', nextAt: '2026-09-01T00:00:00.000Z' });
      await setDoc(doc(context.firestore(), 'users', OWNER_ID, 'notificationDeliveries', 'delivery-1'), { deliveryId: 'delivery-1', status: 'pending' });
    });

    await assertFails(getDoc(deviceRef()));
    await assertFails(getDoc(scheduleRef()));
    await assertFails(getDoc(deliveryRef()));
    await assertFails(setDoc(deviceRef(), { deviceId: 'device-1', enabled: false }));
    await assertFails(setDoc(scheduleRef(), { scheduleId: 'schedule-1' }));
    await assertFails(setDoc(deliveryRef(), { deliveryId: 'delivery-1', status: 'accepted' }));
    await assertFails(deleteDoc(deviceRef()));
  });

  it('denies client access to global endpoint bindings, rate limits, and delivery control', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'endpointBindings', 'hash-1'), { uid: OWNER_ID, deviceId: 'device-1' });
      await setDoc(doc(context.firestore(), 'rateLimits', 'register%3Aowner'), { hits: [] });
      await setDoc(doc(context.firestore(), 'notificationControl', 'delivery'), { enabled: false, version: 0, uids: [], digest: 'x' });
    });
    await assertFails(getDoc(bindingRef()));
    await assertFails(setDoc(bindingRef(), { uid: OWNER_ID }));
    await assertFails(getDoc(rateRef()));
    await assertFails(setDoc(rateRef(), { hits: [1] }));
    await assertFails(getDoc(doc(ownerDb(), 'notificationControl', 'delivery')));
    await assertFails(setDoc(doc(ownerDb(), 'notificationControl', 'delivery'), { enabled: true }));
  });

  it('lets the owner read a versioned inbox event but never create one', async () => {
    await seedVersioned('event-1');
    await assertSucceeds(getDoc(notifRef('event-1')));
    await assertFails(setDoc(notifRef('event-forged'), versionedEvent()));
  });

  it('lets a client dismiss a versioned event only at the current revision', async () => {
    await seedVersioned('event-1', { revision: 2 });
    await assertSucceeds(updateDoc(notifRef('event-1'), { dismissedRevision: 2, dismissedAt: serverTimestamp() }));
  });

  it('rejects dismissing a versioned event at a stale revision', async () => {
    await seedVersioned('event-1', { revision: 2 });
    await assertFails(updateDoc(notifRef('event-1'), { dismissedRevision: 1 }));
  });

  it('rejects a client mutating a server-owned field on a versioned event', async () => {
    await seedVersioned('event-1', { revision: 2 });
    await assertFails(updateDoc(notifRef('event-1'), { revision: 3 }));
    await assertFails(updateDoc(notifRef('event-1'), { message: 'tampered' }));
    await assertFails(updateDoc(notifRef('event-1'), { eventKey: 'recurring:other:2026-08' }));
  });

  it('rejects deleting a versioned event but allows marking read at current revision', async () => {
    await seedVersioned('event-1', { revision: 2 });
    await assertFails(deleteDoc(notifRef('event-1')));
    await assertSucceeds(updateDoc(notifRef('event-1'), { isRead: true, readRevision: 2 }));
  });

  it('still allows legacy (non-versioned) create, update, and delete', async () => {
    await assertSucceeds(setDoc(notifRef('legacy-1'), legacyNotification()));
    await assertSucceeds(updateDoc(notifRef('legacy-1'), { isRead: true }));
    await assertSucceeds(deleteDoc(notifRef('legacy-1')));
  });

  it('rejects a client creating a forged versioned event even with owner auth', async () => {
    await assertFails(setDoc(notifRef('forged'), versionedEvent({ eventKey: 'budget:forged:2026-08' })));
    // A legacy shape that sneaks schemaVersion:2 is treated as versioned and denied.
    await assertFails(setDoc(notifRef('sneaky'), legacyNotification({ schemaVersion: 2, eventKey: 'x', revision: 1 })));
  });

  it('denies foreign access to another user\'s versioned event', async () => {
    await seedVersioned('event-1', { revision: 2 });
    await assertFails(getDoc(notifRef('event-1', intruderDb())));
    await assertFails(updateDoc(notifRef('event-1', intruderDb()), { isRead: true, readRevision: 2 }));
  });
});
