/**
 * Authenticated device callable cores (register / status / revoke / test).
 *
 * These functions contain the authorization, rate-limit, and orchestration
 * logic but take every side effect as an injected dependency (`DeviceStore`,
 * `EndpointResolver`, `RateLimiter`, `Clock`, `TestSender`). The v2 `onCall`
 * exports in `index.ts` are thin adapters that build the real dependencies and
 * translate thrown `CallableError`s to `HttpsError`s. This keeps every branch
 * unit-testable without the emulator.
 *
 * `uid` is ALWAYS taken from the authenticated context, never from the request
 * payload. Raw capability material never leaves this layer.
 */

import {
  validateRegistration,
  decideRebind,
  buildDeviceDocument,
  wouldExceedDeviceCap,
  sanitizeDevice,
  type RegisterDeviceInput,
} from './deviceRegistration.js';
import type { DeviceDocument, DeviceStatusResult } from './types.js';
import { isValidDeviceId } from './contracts.js';

// ── Error type mapped to HttpsError by the adapter ──────────────────────────
export type CallableErrorCode =
  | 'unauthenticated'
  | 'invalid-argument'
  | 'permission-denied'
  | 'resource-exhausted'
  | 'failed-precondition'
  | 'internal';

export class CallableError extends Error {
  constructor(public readonly code: CallableErrorCode, message: string) {
    super(message);
    this.name = 'CallableError';
  }
}

// ── Injected dependencies ────────────────────────────────────────────────────
export interface Clock {
  now(): Date;
}

/** Endpoint public-reachability gate: DNS resolution + redirect/private-IP rejection. */
export interface EndpointResolver {
  /** Throws (or resolves false) when the endpoint host is private/unreachable. */
  assertPubliclyRoutable(endpointUrl: URL): Promise<void>;
}

export interface RateLimiter {
  /** Throws a CallableError('resource-exhausted') when the action is over budget. */
  consume(key: string, now: Date): Promise<void>;
}

export interface EndpointBinding {
  uid: string;
  deviceId: string;
  capabilityFingerprint: string;
  enabled: boolean;
}

/**
 * Transactional device persistence. Implementations use a Firestore
 * transaction; the callable core just declares intent.
 */
export interface DeviceStore {
  getDevice(uid: string, deviceId: string): Promise<DeviceDocument | null>;
  getEndpointBinding(endpointHash: string): Promise<EndpointBinding | null>;
  listEnabledDeviceIds(uid: string): Promise<string[]>;
  /** Persist a create/update/rebind atomically, scrubbing a superseded binding. */
  commitRegistration(input: {
    uid: string;
    device: DeviceDocument;
    endpointHash: string;
    scrubPrevious: { uid: string; deviceId: string } | null;
  }): Promise<void>;
  /** Disable a device and scrub its raw capability material. */
  revokeDevice(uid: string, deviceId: string, now: string): Promise<DeviceDocument | null>;
  recordTestResult(input: { uid: string; deviceId: string; requestId: string; now: string }): Promise<'sent' | 'duplicate'>;
}

export interface TestSender {
  /** Send the fixed test payload to a device's stored subscription. */
  send(device: DeviceDocument): Promise<{ statusCode: number }>;
}

export interface AuthContext {
  uid: string | null;
}

const requireUid = (auth: AuthContext): string => {
  if (!auth.uid) {
    throw new CallableError('unauthenticated', 'Authentication required');
  }
  return auth.uid;
};

// ── register ─────────────────────────────────────────────────────────────────
export interface RegisterDeps {
  store: DeviceStore;
  resolver: EndpointResolver;
  rateLimiter: RateLimiter;
  clock: Clock;
}

export const registerDeviceCore = async (
  auth: AuthContext,
  payload: RegisterDeviceInput,
  deps: RegisterDeps,
): Promise<DeviceStatusResult> => {
  const uid = requireUid(auth);
  const now = deps.clock.now();

  let validated;
  try {
    validated = validateRegistration(payload);
  } catch (error) {
    throw new CallableError('invalid-argument', (error as Error).message);
  }

  await deps.rateLimiter.consume(`register:${uid}`, now);
  await deps.rateLimiter.consume(`register-device:${validated.deviceId}`, now);

  // Public-reachability gate (DNS + redirect/private-IP rejection).
  try {
    await deps.resolver.assertPubliclyRoutable(validated.endpointUrl);
  } catch (error) {
    throw new CallableError('invalid-argument', `Endpoint not publicly routable: ${(error as Error).message}`);
  }

  const [existingDevice, existingBinding, enabledIds] = await Promise.all([
    deps.store.getDevice(uid, validated.deviceId),
    deps.store.getEndpointBinding(validated.endpointHash),
    deps.store.listEnabledDeviceIds(uid),
  ]);

  const decision = decideRebind({
    validated,
    callerUid: uid,
    existingDevice,
    existingEndpointBinding: existingBinding,
  });

  if (decision.action === 'reject') {
    throw new CallableError('permission-denied', decision.reason);
  }

  // Only a brand-new device counts against the cap.
  if (decision.action === 'create' && wouldExceedDeviceCap(enabledIds, validated.deviceId)) {
    throw new CallableError('resource-exhausted', 'Device limit reached (5 active devices)');
  }

  const device = buildDeviceDocument({ validated, now: now.toISOString(), existingDevice });
  const scrubPrevious =
    decision.action === 'rebind'
      ? { uid: decision.previousUid, deviceId: decision.previousDeviceId }
      : null;

  await deps.store.commitRegistration({
    uid,
    device,
    endpointHash: validated.endpointHash,
    scrubPrevious,
  });

  const activeDeviceCount = new Set([...enabledIds, validated.deviceId]).size;
  return { recognized: true, device: sanitizeDevice(device), activeDeviceCount };
};

// ── status ─────────────────────────────────────────────────────────────────
export const deviceStatusCore = async (
  auth: AuthContext,
  payload: { deviceId: string },
  deps: { store: DeviceStore },
): Promise<DeviceStatusResult> => {
  const uid = requireUid(auth);
  if (!isValidDeviceId(payload?.deviceId)) {
    throw new CallableError('invalid-argument', 'Invalid deviceId');
  }
  const [device, enabledIds] = await Promise.all([
    deps.store.getDevice(uid, payload.deviceId),
    deps.store.listEnabledDeviceIds(uid),
  ]);
  const recognized = Boolean(device && device.enabled);
  return {
    recognized,
    device: device ? sanitizeDevice(device) : null,
    activeDeviceCount: enabledIds.length,
  };
};

// ── revoke ─────────────────────────────────────────────────────────────────
export const revokeDeviceCore = async (
  auth: AuthContext,
  payload: { deviceId: string },
  deps: { store: DeviceStore; clock: Clock },
): Promise<{ revoked: boolean }> => {
  const uid = requireUid(auth);
  if (!isValidDeviceId(payload?.deviceId)) {
    throw new CallableError('invalid-argument', 'Invalid deviceId');
  }
  const device = await deps.store.revokeDevice(uid, payload.deviceId, deps.clock.now().toISOString());
  return { revoked: Boolean(device) };
};

// ── test delivery ─────────────────────────────────────────────────────────
export interface TestDeps {
  store: DeviceStore;
  sender: TestSender;
  rateLimiter: RateLimiter;
  clock: Clock;
}

export type TestOutcome =
  | { outcome: 'accepted' }
  | { outcome: 'duplicate' }
  | { outcome: 'failed'; failureCode: string };

export const testDeliveryCore = async (
  auth: AuthContext,
  payload: { deviceId: string; requestId: string },
  deps: TestDeps,
): Promise<TestOutcome> => {
  const uid = requireUid(auth);
  if (!isValidDeviceId(payload?.deviceId) || typeof payload?.requestId !== 'string' || payload.requestId.length === 0) {
    throw new CallableError('invalid-argument', 'Invalid deviceId or requestId');
  }
  const now = deps.clock.now();
  // One test per device per minute.
  await deps.rateLimiter.consume(`test:${payload.deviceId}`, now);

  const device = await deps.store.getDevice(uid, payload.deviceId);
  if (!device || !device.enabled) {
    throw new CallableError('failed-precondition', 'Device is not registered or is disabled');
  }

  // Deterministic idempotency: a duplicate request id returns without a second send.
  const dedup = await deps.store.recordTestResult({
    uid,
    deviceId: payload.deviceId,
    requestId: payload.requestId,
    now: now.toISOString(),
  });
  if (dedup === 'duplicate') {
    return { outcome: 'duplicate' };
  }

  const { statusCode } = await deps.sender.send(device);
  if (statusCode >= 200 && statusCode <= 299) {
    return { outcome: 'accepted' };
  }
  return { outcome: 'failed', failureCode: String(statusCode) };
};
