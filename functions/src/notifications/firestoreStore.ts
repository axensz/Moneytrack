/**
 * Firestore-backed implementations of the DeviceStore and WorkerStore
 * interfaces. All multi-document mutations run inside transactions so
 * overlapping workers/callables serialize against one logical record.
 *
 * Collection layout (all server-owned; client rules default-deny):
 *   users/{uid}/notificationDevices/{deviceId}
 *   users/{uid}/notificationDeliveries/{deliveryId}
 *   endpointBindings/{endpointHash}          (global, maps endpoint -> owner)
 *   users/{uid}/notificationTests/{requestId}
 */

import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type {
  DeviceStore,
  EndpointBinding,
} from './deviceCallables.js';
import type {
  WorkerStore,
  DispatchableDelivery,
} from './worker.js';
import type { DeliveryDocument, DeviceDocument } from './types.js';
import type { DeliveryPatch } from './deliveryProcessing.js';
import { stillOwnsLease } from './scheduleEvaluation.js';

const devicesCol = (db: Firestore, uid: string) => db.collection(`users/${uid}/notificationDevices`);
const bindingDoc = (db: Firestore, endpointHash: string) => db.doc(`endpointBindings/${endpointHash}`);

export const createDeviceStore = (db: Firestore): DeviceStore => ({
  async getDevice(uid, deviceId) {
    const snap = await devicesCol(db, uid).doc(deviceId).get();
    return snap.exists ? (snap.data() as DeviceDocument) : null;
  },

  async getEndpointBinding(endpointHash) {
    const snap = await bindingDoc(db, endpointHash).get();
    return snap.exists ? (snap.data() as EndpointBinding) : null;
  },

  async listEnabledDeviceIds(uid) {
    const snap = await devicesCol(db, uid).where('enabled', '==', true).get();
    return snap.docs.map((d) => d.id);
  },

  async commitRegistration({ uid, device, endpointHash, scrubPrevious }) {
    await db.runTransaction(async (tx: Transaction) => {
      if (scrubPrevious) {
        const prevRef = devicesCol(db, scrubPrevious.uid).doc(scrubPrevious.deviceId);
        tx.set(
          prevRef,
          { enabled: false, endpoint: '', p256dh: '', auth: '', disabledAt: device.updatedAt, updatedAt: device.updatedAt },
          { merge: true },
        );
      }
      tx.set(devicesCol(db, uid).doc(device.deviceId), device);
      tx.set(bindingDoc(db, endpointHash), {
        uid,
        deviceId: device.deviceId,
        capabilityFingerprint: device.capabilityFingerprint,
        enabled: true,
      });
    });
  },

  async revokeDevice(uid, deviceId, now) {
    return db.runTransaction(async (tx) => {
      const ref = devicesCol(db, uid).doc(deviceId);
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const existing = snap.data() as DeviceDocument;
      const disabled: DeviceDocument = {
        ...existing,
        enabled: false,
        endpoint: '',
        p256dh: '',
        auth: '',
        disabledAt: now,
        updatedAt: now,
      };
      tx.set(ref, disabled);
      if (existing.endpointHash) {
        tx.set(bindingDoc(db, existing.endpointHash), { enabled: false }, { merge: true });
      }
      return disabled;
    });
  },

  async recordTestResult({ uid, deviceId, requestId, now }) {
    const ref = db.doc(`users/${uid}/notificationTests/${requestId}`);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return 'duplicate' as const;
      tx.set(ref, { deviceId, createdAt: now });
      return 'sent' as const;
    });
  },
});

export const createWorkerStore = (db: Firestore): WorkerStore => ({
  async listDueDeliveries(now, limit) {
    const nowIso = now.toISOString();
    // Collection-group query across all users' deliveries that are due.
    const snap = await db
      .collectionGroup('notificationDeliveries')
      .where('notBefore', '<=', nowIso)
      .where('status', 'in', ['pending', 'retrying', 'ambiguous'])
      .limit(limit)
      .get();

    const items: DispatchableDelivery[] = [];
    for (const doc of snap.docs) {
      const delivery = doc.data() as DeliveryDocument;
      // deliveries live under users/{uid}/notificationDeliveries/{id}
      const uid = doc.ref.parent.parent?.id;
      if (!uid) continue;
      const deviceSnap = await devicesCol(db, uid).doc(delivery.deviceId).get();
      if (!deviceSnap.exists) continue;
      const device = deviceSnap.data() as DeviceDocument;
      if (!device.enabled) continue;
      items.push({
        delivery,
        device,
        uid,
        firstAttemptAt: delivery.lastAttemptAt ?? nowIso,
      });
    }
    return items;
  },

  async listRecentAccepted(accountScope, now) {
    const cutoff = new Date(now.getTime() - 3_600_000).toISOString();
    const snap = await db
      .collectionGroup('notificationDeliveries')
      .where('accountScope', '==', accountScope)
      .where('status', '==', 'accepted')
      .where('acceptedAt', '>', cutoff)
      .get();
    return snap.docs.map((d) => (d.data() as DeliveryDocument).acceptedAt).filter((v): v is string => Boolean(v));
  },

  async claimDelivery(deliveryId, worker, leaseExpiresAt, now) {
    const snap = await db
      .collectionGroup('notificationDeliveries')
      .where('deliveryId', '==', deliveryId)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const ref = snap.docs[0].ref;
    return db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (!current.exists) return null;
      const delivery = current.data() as DeliveryDocument;
      const leaseHeld = delivery.leaseOwner && delivery.leaseExpiresAt
        && Date.parse(delivery.leaseExpiresAt) > now.getTime();
      if (leaseHeld) return null;
      const leased: DeliveryDocument = {
        ...delivery,
        status: 'sending',
        leaseOwner: worker,
        leaseExpiresAt,
        updatedAt: now.toISOString(),
      };
      tx.set(ref, leased);
      return leased;
    });
  },

  async commitDeliveryResult({ deliveryId, worker, patch, now }) {
    const snap = await db
      .collectionGroup('notificationDeliveries')
      .where('deliveryId', '==', deliveryId)
      .limit(1)
      .get();
    if (snap.empty) return 'lost-lease';
    const ref = snap.docs[0].ref;
    return db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (!current.exists) return 'lost-lease' as const;
      const delivery = current.data() as DeliveryDocument;
      if (!stillOwnsLease({ leaseOwner: delivery.leaseOwner, leaseExpiresAt: delivery.leaseExpiresAt }, worker, now)) {
        return 'lost-lease' as const;
      }
      applyPatch(tx, ref, delivery, patch, now);
      // Scrub the device on expiry (404/410).
      if (patch.expireDevice) {
        const uid = ref.parent.parent?.id;
        if (uid) {
          tx.set(
            devicesCol(db, uid).doc(delivery.deviceId),
            { enabled: false, endpoint: '', p256dh: '', auth: '', disabledAt: now.toISOString(), lastFailureCode: patch.failureCode, updatedAt: now.toISOString() },
            { merge: true },
          );
        }
      }
      return 'committed' as const;
    });
  },

  async deferDelivery(deliveryId, notBefore, now) {
    const snap = await db
      .collectionGroup('notificationDeliveries')
      .where('deliveryId', '==', deliveryId)
      .limit(1)
      .get();
    if (snap.empty) return;
    const ref = snap.docs[0].ref;
    await ref.set(
      { status: 'pending', notBefore, leaseOwner: null, leaseExpiresAt: null, updatedAt: now.toISOString() },
      { merge: true },
    );
  },
});

const applyPatch = (
  tx: Transaction,
  ref: FirebaseFirestore.DocumentReference,
  delivery: DeliveryDocument,
  patch: DeliveryPatch,
  now: Date,
): void => {
  const updated: DeliveryDocument = {
    ...delivery,
    status: patch.status,
    attempts: patch.attempts,
    lastAttemptAt: patch.lastAttemptAt,
    acceptedAt: patch.acceptedAt,
    failureCode: patch.failureCode,
    notBefore: patch.nextAttemptAt ?? delivery.notBefore,
    retentionExpiresAt: patch.retentionExpiresAt,
    leaseOwner: null,
    leaseExpiresAt: null,
    updatedAt: now.toISOString(),
  };
  tx.set(ref, updated);
};
