/**
 * Cloud Functions entrypoint — thin v2 adapters only.
 *
 * Every business decision lives in the pure/injectable modules under
 * `src/notifications/`. This file wires the Admin SDK, secrets, and the
 * delivery kill switch to those cores and translates `CallableError` to
 * `HttpsError`. No algorithm here beyond dependency assembly.
 */

import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, onRequest, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
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
import { FieldValue } from 'firebase-admin/firestore';
import {
  parseIngestRequest,
  ingestBatchCore,
  IngestError,
  generateApiKey as generateRawApiKey,
  hashApiKey,
} from './ingest/ingestCore.js';
import {
  createAccountLookup,
  createCandidateStore,
  resolveApiKey,
} from './ingest/ingestAdapters.js';
import { runMonthlyInterestPass } from './debts/monthlyInterestWorker.js';

setGlobalOptions({ region: FUNCTIONS_REGION });

// ── Secrets / params ─────────────────────────────────────────────────────────
const VAPID_PRIVATE_KEY = defineSecret('WEB_PUSH_VAPID_PRIVATE_KEY');
const VAPID_PUBLIC_KEY = defineString('WEB_PUSH_VAPID_PUBLIC_KEY');
const VAPID_SUBJECT = defineString('WEB_PUSH_VAPID_SUBJECT', { default: 'mailto:ops@moneytrack.app' });
const DELIVERY_ENABLED = defineBoolean('DELIVERY_ENABLED', { default: false });
// Clave secreta del servidor (pepper) para el HMAC de las API keys de ingesta.
// Solo se usa cuando estas Functions estan DESPLEGADAS (requiere plan Blaze:
// Secret Manager no esta disponible en Spark). El flujo actual de ingesta es
// por scripts locales que escriben a Firestore directo y NO pasan por este
// endpoint, asi que el pepper no interviene hoy. Al desplegar en Blaze,
// definirlo una vez con `firebase functions:secrets:set INGEST_API_KEY_PEPPER`.
// Para el emulador local hay un valor dummy en functions/.env.demo-moneytrack.
const INGEST_API_KEY_PEPPER = defineSecret('INGEST_API_KEY_PEPPER');

const db = () => getFirestore(getAdminApp());
const systemClock: Clock = { now: () => new Date() };

const authOf = (request: CallableRequest): AuthContext => ({ uid: request.auth?.uid ?? null });

const mapError = (error: unknown): never => {
  if (error instanceof CallableError) {
    throw new HttpsError(error.code, error.message);
  }
  throw new HttpsError('internal', 'Unexpected error');
};

export const monthlyDebtInterestWorker = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'America/Bogota',
    maxInstances: 1,
    concurrency: 1,
    timeoutSeconds: 240,
    retryCount: 3,
  },
  async () => { await runMonthlyInterestPass(db(), systemClock.now()); },
);

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

// ── Transaction ingestion HTTP endpoint ──────────────────────────────────────
/**
 * POST /ingestTransactions. Auth via the `X-MoneyTrack-Api-Key` header; the uid
 * is resolved from the key (never the payload). Writes shortcut candidates with
 * the Admin SDK and returns the contract JSON. The contract only defines
 * 400/401/413 errors, so an invalid method or content-type maps to 400.
 */
export const ingestTransactions = onRequest({ secrets: [INGEST_API_KEY_PEPPER] }, async (req, res) => {
  const sendError = (status: number, code: string, message: string): void => {
    res.status(status).json({ error: { code, message } });
  };

  try {
    if (req.method !== 'POST') {
      sendError(400, 'bad-request', 'Only POST is supported');
      return;
    }
    const contentType = req.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      sendError(400, 'bad-request', 'Content-Type must be application/json');
      return;
    }

    const rawKey = req.get('x-moneytrack-api-key');
    if (typeof rawKey !== 'string' || rawKey.length === 0) {
      sendError(401, 'unauthorized', 'Missing X-MoneyTrack-Api-Key header');
      return;
    }

    const uid = await resolveApiKey(db(), rawKey, INGEST_API_KEY_PEPPER.value());
    if (uid === null) {
      sendError(401, 'unauthorized', 'Invalid or revoked API key');
      return;
    }

    const parsed = parseIngestRequest(req.body);
    const result = await ingestBatchCore(
      parsed,
      {
        accounts: createAccountLookup(db(), uid),
        store: createCandidateStore(db(), uid),
        clock: systemClock,
      },
      uid,
    );
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof IngestError) {
      sendError(error.status, error.code, error.message);
      return;
    }
    sendError(400, 'bad-request', 'Unexpected error');
  }
});

// ── API key generation (authenticated callable) ──────────────────────────────
/**
 * Generates an API key for the caller. The clear key is returned EXACTLY once
 * and never persisted or logged: only its sha256 hash is stored as the doc-id
 * in the global `apiKeys/` collection (plus a per-user mirror for listing). The
 * hash is a keyed HMAC-SHA256 with the server pepper, not a bare digest.
 */
export const generateApiKey = onCall({ secrets: [INGEST_API_KEY_PEPPER] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const label = typeof request.data?.label === 'string' ? request.data.label : undefined;
  const rawKey = generateRawApiKey();
  const hash = hashApiKey(rawKey, INGEST_API_KEY_PEPPER.value());

  const database = db();
  const batch = database.batch();
  batch.set(database.doc(`apiKeys/${hash}`), {
    uid,
    createdAt: FieldValue.serverTimestamp(),
    revoked: false,
    ...(label !== undefined ? { label } : {}),
  });
  batch.set(database.doc(`users/${uid}/apiKeys/${hash}`), {
    hash,
    createdAt: FieldValue.serverTimestamp(),
    revoked: false,
    ...(label !== undefined ? { label } : {}),
  });
  await batch.commit();

  // The clear key is surfaced only here, once.
  return { apiKey: rawKey };
});
