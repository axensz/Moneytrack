/**
 * Cloud Functions entrypoint — thin v2 adapters only.
 *
 * Every business decision lives in the pure/injectable modules under
 * `src/notifications/`. This file wires the Admin SDK, secrets, and the
 * delivery kill switch to those cores and translates `CallableError` to
 * `HttpsError`. No algorithm here beyond dependency assembly.
 */

import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString, defineBoolean } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';

import { getAdminApp } from './adminApp.js';
import { FUNCTIONS_REGION } from './notifications/contracts.js';
import {
  registerDeviceCore,
  deviceStatusCore,
  revokeDeviceCore,
  testDeliveryCore,
  CallableError,
  type AuthContext,
  type Clock,
} from './notifications/deviceCallables.js';
import { createDeviceStore, createWorkerStore } from './notifications/firestoreStore.js';
import { createRateLimiter } from './notifications/rateLimiter.js';
import { createEndpointResolver } from './notifications/endpointResolver.js';
import { createPushSender } from './notifications/pushSender.js';
import { runDeliveryPass } from './notifications/worker.js';
import { buildBudgetEventTag } from './notifications/tags.js';
import { evaluateControl, type ControlDocument } from './notifications/deliveryControl.js';

setGlobalOptions({ region: FUNCTIONS_REGION });

// ── Secrets / params ─────────────────────────────────────────────────────────
const VAPID_PRIVATE_KEY = defineSecret('WEB_PUSH_VAPID_PRIVATE_KEY');
const VAPID_PUBLIC_KEY = defineString('WEB_PUSH_VAPID_PUBLIC_KEY');
const VAPID_SUBJECT = defineString('WEB_PUSH_VAPID_SUBJECT', { default: 'mailto:ops@moneytrack.app' });
const DELIVERY_ENABLED = defineBoolean('DELIVERY_ENABLED', { default: false });

const db = () => getFirestore(getAdminApp());
const systemClock: Clock = { now: () => new Date() };

const authOf = (request: CallableRequest): AuthContext => ({ uid: request.auth?.uid ?? null });

const mapError = (error: unknown): never => {
  if (error instanceof CallableError) {
    throw new HttpsError(error.code, error.message);
  }
  throw new HttpsError('internal', 'Unexpected error');
};

// ── Device callables ─────────────────────────────────────────────────────────
export const registerDevice = onCall(async (request) => {
  try {
    return await registerDeviceCore(authOf(request), request.data, {
      store: createDeviceStore(db()),
      resolver: createEndpointResolver(),
      rateLimiter: createRateLimiter(db()),
      clock: systemClock,
    });
  } catch (error) {
    return mapError(error);
  }
});

export const deviceStatus = onCall(async (request) => {
  try {
    return await deviceStatusCore(authOf(request), request.data, { store: createDeviceStore(db()) });
  } catch (error) {
    return mapError(error);
  }
});

export const revokeDevice = onCall(async (request) => {
  try {
    return await revokeDeviceCore(authOf(request), request.data, { store: createDeviceStore(db()), clock: systemClock });
  } catch (error) {
    return mapError(error);
  }
});

export const testDelivery = onCall({ secrets: [VAPID_PRIVATE_KEY] }, async (request) => {
  try {
    const sender = createPushSender({
      vapid: { publicKey: VAPID_PUBLIC_KEY.value(), privateKey: VAPID_PRIVATE_KEY.value() },
      subject: VAPID_SUBJECT.value(),
    });
    return await testDeliveryCore(authOf(request), request.data, {
      store: createDeviceStore(db()),
      rateLimiter: createRateLimiter(db()),
      clock: systemClock,
      sender: {
        async send(device) {
          const result = await sender.send({
            subscription: { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
            kind: 'test',
            accountScope: device.accountScope,
            eventId: 'test',
            eventRevision: 1,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            notificationTag: buildBudgetEventTag('test', device.deviceId),
            topic: randomUUID().replace(/-/g, '').slice(0, 24),
          });
          return { statusCode: result.statusCode ?? 0 };
        },
      },
    });
  } catch (error) {
    return mapError(error);
  }
});

// ── Scheduled delivery worker (every 5 minutes, UTC) ─────────────────────────
export const deliveryWorker = onSchedule(
  {
    schedule: '*/5 * * * *',
    timeZone: 'Etc/UTC',
    maxInstances: 1,
    concurrency: 1,
    timeoutSeconds: 240,
    secrets: [VAPID_PRIVATE_KEY],
  },
  async () => {
    const sender = createPushSender({
      vapid: { publicKey: VAPID_PUBLIC_KEY.value(), privateKey: VAPID_PRIVATE_KEY.value() },
      subject: VAPID_SUBJECT.value(),
    });
    await runDeliveryPass({
      store: createWorkerStore(db()),
      clock: systemClock,
      worker: `worker-${randomUUID()}`,
      isDeliveryEnabled: async ({ uid }) => {
        // Global kill switch first (fail-closed external-I/O gate).
        if (!DELIVERY_ENABLED.value()) return false;
        // Then the per-user canary allowlist, evaluated fail-closed.
        const snap = await db().doc('notificationControl/delivery').get();
        const control = snap.exists ? (snap.data() as ControlDocument) : null;
        return evaluateControl(control).deliverTo(uid);
      },
      sender: {
        async send(delivery, device) {
          return sender.send({
            subscription: { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
            kind: delivery.eventId.startsWith('recurring') ? 'recurring' : delivery.eventId.startsWith('debt') ? 'debt' : 'daily',
            accountScope: delivery.accountScope,
            eventId: delivery.eventId,
            eventRevision: delivery.eventRevision,
            expiresAt: new Date(Date.now() + 12 * 3_600_000).toISOString(),
            notificationTag: buildBudgetEventTag(delivery.eventId, delivery.deviceId),
            topic: delivery.eventId.slice(0, 24),
          });
        },
      },
    });
  },
);
