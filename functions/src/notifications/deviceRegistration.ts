/**
 * Pure device-registration logic for the durable notification backend.
 *
 * No Admin SDK, no network. This module validates a client-supplied push
 * subscription, decides whether a registration may bind/rebind an endpoint,
 * and produces the exact device-document fields to persist. The callable
 * wrapper (added later) performs auth, DNS resolution, rate-limiting, and the
 * Firestore transaction using the decisions returned here.
 */

import { createHash } from 'node:crypto';
import {
  MAX_ACTIVE_DEVICES,
  assertAccountScope,
  isValidDeviceId,
} from './contracts.js';
import type { DevicePlatform, DeviceDocument, SanitizedDevice } from './types.js';

// ── Subscription field limits (defend against oversized writes) ─────────────
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 256;
const P256DH_BYTES = 65; // uncompressed EC point
const AUTH_MIN_BYTES = 16;

const DEVICE_PLATFORMS: readonly DevicePlatform[] = ['android', 'ios', 'desktop', 'other'];

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface RegisterDeviceInput {
  deviceId: string;
  accountScope: string;
  platform: string;
  serviceWorkerScope: string;
  subscription: PushSubscriptionInput;
}

export interface ValidatedRegistration {
  deviceId: string;
  accountScope: string;
  platform: DevicePlatform;
  serviceWorkerScope: string;
  endpoint: string;
  endpointUrl: URL;
  p256dh: string;
  auth: string;
  endpointHash: string;
  capabilityFingerprint: string;
}

const base64urlByteLength = (value: string): number => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Key must be base64url without padding');
  }
  return Buffer.from(value, 'base64url').length;
};

const sha256Hex = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

/**
 * A push endpoint must be an absolute HTTPS URL to a public host. This is the
 * SYNTACTIC gate only; the callable additionally resolves DNS and rejects
 * private/loopback/link-local addresses and redirects before dispatch.
 */
export const isPublicHttpsEndpoint = (endpoint: string): boolean => {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!host) return false;
  // Reject obvious non-public hosts syntactically; DNS check is done later.
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  // Reject literal IPs here; only DNS hostnames are accepted for push services.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  if (host.includes(':')) return false; // bracketed IPv6 literal
  return true;
};

const normalizePlatform = (value: string): DevicePlatform =>
  (DEVICE_PLATFORMS as readonly string[]).includes(value)
    ? (value as DevicePlatform)
    : 'other';

/**
 * Validate a registration request and derive the deterministic hash/fingerprint.
 * Throws on any malformed or oversized field. Does NOT touch Firestore.
 */
export const validateRegistration = (input: RegisterDeviceInput): ValidatedRegistration => {
  if (!isValidDeviceId(input.deviceId)) {
    throw new Error('Invalid deviceId');
  }
  const accountScope = assertAccountScope(input.accountScope);

  if (typeof input.serviceWorkerScope !== 'string' || input.serviceWorkerScope.length > MAX_ENDPOINT_LENGTH) {
    throw new Error('Invalid serviceWorkerScope');
  }

  const sub = input.subscription;
  if (!sub || typeof sub !== 'object' || !sub.keys || typeof sub.keys !== 'object') {
    throw new Error('Invalid subscription');
  }
  const { endpoint } = sub;
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH) {
    throw new Error('Invalid endpoint length');
  }
  if (!isPublicHttpsEndpoint(endpoint)) {
    throw new Error('Endpoint must be a public HTTPS URL');
  }
  const { p256dh, auth } = sub.keys;
  if (typeof p256dh !== 'string' || p256dh.length > MAX_KEY_LENGTH) {
    throw new Error('Invalid p256dh');
  }
  if (typeof auth !== 'string' || auth.length > MAX_KEY_LENGTH) {
    throw new Error('Invalid auth');
  }
  if (base64urlByteLength(p256dh) !== P256DH_BYTES) {
    throw new Error('p256dh must decode to 65 bytes');
  }
  if (base64urlByteLength(auth) < AUTH_MIN_BYTES) {
    throw new Error('auth must decode to at least 16 bytes');
  }

  return {
    deviceId: input.deviceId,
    accountScope,
    platform: normalizePlatform(input.platform),
    serviceWorkerScope: input.serviceWorkerScope,
    endpoint,
    endpointUrl: new URL(endpoint),
    p256dh,
    auth,
    endpointHash: sha256Hex(endpoint),
    capabilityFingerprint: sha256Hex(`${p256dh}\0${auth}`),
  };
};

export type RebindDecision =
  | { action: 'create' }
  | { action: 'update-same-device' }
  | { action: 'rebind'; previousDeviceId: string; previousUid: string }
  | { action: 'reject'; reason: string };

export interface RebindContext {
  validated: ValidatedRegistration;
  callerUid: string;
  /** Existing device doc for this (uid, deviceId), if any. */
  existingDevice: DeviceDocument | null;
  /**
   * Existing binding for this endpoint hash anywhere (any account), if any.
   * `null` when the endpoint is unbound.
   */
  existingEndpointBinding: {
    uid: string;
    deviceId: string;
    capabilityFingerprint: string;
    enabled: boolean;
  } | null;
}

/**
 * Decide how a registration resolves against existing bindings.
 *
 * - No endpoint binding, no device doc -> create.
 * - Same (uid, deviceId) already bound to this endpoint -> update in place.
 * - Endpoint bound elsewhere with a MATCHING capability fingerprint -> rebind
 *   (the same physical subscription moved accounts/devices); scrub the old one.
 * - Endpoint bound elsewhere with a DIFFERENT fingerprint -> reject as replay.
 */
export const decideRebind = (ctx: RebindContext): RebindDecision => {
  const { validated, callerUid, existingDevice, existingEndpointBinding } = ctx;

  if (!existingEndpointBinding) {
    return existingDevice ? { action: 'update-same-device' } : { action: 'create' };
  }

  const binding = existingEndpointBinding;

  if (binding.uid === callerUid && binding.deviceId === validated.deviceId) {
    return { action: 'update-same-device' };
  }

  if (binding.capabilityFingerprint !== validated.capabilityFingerprint) {
    return { action: 'reject', reason: 'Endpoint bound with a different capability key' };
  }

  return { action: 'rebind', previousDeviceId: binding.deviceId, previousUid: binding.uid };
};

export interface BuildDeviceDocInput {
  validated: ValidatedRegistration;
  now: string;
  existingDevice: DeviceDocument | null;
}

/** Build the full device document to persist for a create/update/rebind. */
export const buildDeviceDocument = (input: BuildDeviceDocInput): DeviceDocument => {
  const { validated, now, existingDevice } = input;
  return {
    deviceId: validated.deviceId,
    accountScope: validated.accountScope,
    enabled: true,
    platform: validated.platform,
    serviceWorkerScope: validated.serviceWorkerScope,
    endpoint: validated.endpoint,
    endpointHash: validated.endpointHash,
    p256dh: validated.p256dh,
    auth: validated.auth,
    capabilityFingerprint: validated.capabilityFingerprint,
    createdAt: existingDevice?.createdAt ?? now,
    updatedAt: now,
    lastAcceptedAt: existingDevice?.lastAcceptedAt ?? null,
    lastFailureCode: null,
    disabledAt: null,
  };
};

/** The five-device cap counts only currently enabled devices, excluding the one being (re)registered. */
export const wouldExceedDeviceCap = (
  enabledDeviceIds: readonly string[],
  registeringDeviceId: string,
): boolean => {
  const distinct = new Set(enabledDeviceIds.filter((id) => id !== registeringDeviceId));
  return distinct.size >= MAX_ACTIVE_DEVICES;
};

/** Project a device document to the sanitized shape returned to clients. */
export const sanitizeDevice = (device: DeviceDocument): SanitizedDevice => ({
  deviceId: device.deviceId,
  enabled: device.enabled,
  platform: device.platform,
  createdAt: device.createdAt,
  updatedAt: device.updatedAt,
  lastAcceptedAt: device.lastAcceptedAt,
  lastFailureCode: device.lastFailureCode,
  disabledAt: device.disabledAt,
});
