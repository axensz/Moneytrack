// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
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

  describe('runtime authority', () => {
    const runtimeRef = (db = ownerDb(), id = 'state') => doc(db, 'users', OWNER_ID, 'notificationRuntime', id);
    const seedRuntime = async () => {
      await testEnv.withSecurityRulesDisabled(async context => {
        await setDoc(runtimeRef(context.firestore()), { authority: 'durable', configVersion: 3, activatedAt: new Date() });
      });
    };

    it('lets the owner read the authority state used by the app', async () => {
      await seedRuntime();
      const snapshot = await assertSucceeds(getDoc(runtimeRef()));
      expect(snapshot.data()).toMatchObject({ authority: 'durable', configVersion: 3 });
    });

    it('lets the owner confirm that no authority state exists yet', async () => {
      const snapshot = await assertSucceeds(getDoc(runtimeRef()));
      expect(snapshot.exists()).toBe(false);
    });

    it('denies authority state reads by another user or an unauthenticated client', async () => {
      await seedRuntime();
      await assertFails(getDoc(runtimeRef(intruderDb())));
      await assertFails(getDoc(runtimeRef(testEnv.unauthenticatedContext().firestore())));
    });

    it('never lets the owner change or delete the server-owned authority', async () => {
      await seedRuntime();
      await assertFails(updateDoc(runtimeRef(), { authority: 'foreground', configVersion: 4 }));
      await assertFails(setDoc(runtimeRef(), { authority: 'foreground', configVersion: 4 }));
      await assertFails(deleteDoc(runtimeRef()));
    });

    it('denies creating authority state and reading or listing other runtime documents', async () => {
      await assertFails(setDoc(runtimeRef(), { authority: 'foreground', configVersion: 1 }));
      await testEnv.withSecurityRulesDisabled(async context => {
        await setDoc(runtimeRef(context.firestore(), 'internal'), { lease: 'server-only' });
      });
      await assertFails(getDoc(runtimeRef(ownerDb(), 'internal')));
      await assertFails(getDocs(collection(ownerDb(), 'users', OWNER_ID, 'notificationRuntime')));
    });
  });

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

  describe('client foreground writer namespace', () => {
    const FG_KEY = 'foreground:compat:recurring:abc:2026-9-16';

    it('lets the owner create events in the reserved foreground namespaces', async () => {
      await assertSucceeds(setDoc(notifRef('fg-compat'), versionedEvent({ eventKey: FG_KEY, revision: 1 })));
      await assertSucceeds(setDoc(notifRef('fg-guest'), versionedEvent({ eventKey: 'foreground:guest:debt:d1', revision: 1 })));
      await assertSucceeds(setDoc(notifRef('fg-v3'), versionedEvent({ eventKey: 'foreground:v3:budget:b1:2026-11', revision: 1 })));
    });

    it('lets the foreground writer advance and resolve its own event', async () => {
      await seedVersioned('fg-1', { eventKey: FG_KEY, revision: 1 });
      await assertSucceeds(updateDoc(notifRef('fg-1'), {
        revision: 2,
        message: 'Venció hace 22 días',
        severity: 'error',
        stage: 'overdue',
        updatedAt: new Date('2026-11-09T17:00:00.000Z'),
      }));
      await assertSucceeds(updateDoc(notifRef('fg-1'), {
        isRead: true,
        readRevision: 2,
        resolvedRevision: 2,
        resolvedAt: new Date('2026-11-09T17:05:00.000Z'),
        lifecycleStatus: 'resolved',
      }));
    });

    it('keeps identity immutable and the revision monotonic on foreground events', async () => {
      await seedVersioned('fg-1', { eventKey: FG_KEY, revision: 3 });
      await assertFails(updateDoc(notifRef('fg-1'), { revision: 2 }));
      await assertFails(updateDoc(notifRef('fg-1'), { eventKey: 'foreground:compat:recurring:other:2026-9-16' }));
      await assertFails(updateDoc(notifRef('fg-1'), { eventKey: 'recurring:abc:2026-9-16' }));
      await assertFails(updateDoc(notifRef('fg-1'), { type: 'debt' }));
      await assertFails(updateDoc(notifRef('fg-1'), { schemaVersion: 1 }));
    });

    it('still validates the event shape on foreground writes', async () => {
      await assertFails(setDoc(notifRef('fg-bad'), versionedEvent({ eventKey: FG_KEY, revision: 1, title: '' })));
      await assertFails(setDoc(notifRef('fg-bad'), versionedEvent({ eventKey: FG_KEY, revision: 1, severity: 'critical' })));
      await assertFails(setDoc(notifRef('fg-bad'), versionedEvent({ eventKey: FG_KEY, revision: 1, type: 'admin' })));
    });

    it('rejects look-alike prefixes that are not a reserved foreground namespace', async () => {
      await assertFails(setDoc(notifRef('x1'), versionedEvent({ eventKey: 'foreground:other:thing', revision: 1 })));
      await assertFails(setDoc(notifRef('x2'), versionedEvent({ eventKey: 'xforeground:compat:thing', revision: 1 })));
      await assertFails(setDoc(notifRef('x3'), versionedEvent({ eventKey: 'foreground:compat:', revision: 1 })));
      await assertFails(setDoc(notifRef('x4'), versionedEvent({ eventKey: 'foreground:v:thing', revision: 1 })));
    });

    it('never lets the client touch or take over a backend-authored event', async () => {
      await seedVersioned('server-1', { eventKey: 'recurring:rent:2026-08', revision: 2 });
      // Advance it as a client.
      await assertFails(updateDoc(notifRef('server-1'), { revision: 3, message: 'tampered' }));
      // Rebrand it into the foreground namespace to unlock the broader update path.
      await assertFails(updateDoc(notifRef('server-1'), { eventKey: FG_KEY, revision: 3 }));
    });

    it('does not let the client physically delete a foreground event, nor write into another account', async () => {
      await seedVersioned('fg-1', { eventKey: FG_KEY, revision: 1 });
      await assertFails(deleteDoc(notifRef('fg-1')));
      await assertFails(setDoc(notifRef('fg-intruder', intruderDb()), versionedEvent({ eventKey: FG_KEY, revision: 1 })));
    });
  });
});
