/**
 * Shared backend document types for the durable notification runtime.
 *
 * Pure type declarations plus small runtime-free helpers. No Admin SDK, no I/O.
 * These describe the server-owned Firestore documents that the device,
 * schedule, delivery, and fan-out modules read and write. Client Firestore
 * rules deny direct access to every collection declared here except the
 * canonical inbox event, which is modelled in the frontend `finance.ts`.
 */

import type { DeliveryState, PayloadKind } from './contracts.js';

/** Runtime authority: how time-based events are produced for a user. */
export type RuntimeAuthority = 'foreground-compat' | 'foreground' | 'durable';

/** Platform detected by the client at registration time. */
export type DevicePlatform = 'android' | 'ios' | 'desktop' | 'other';

/**
 * `users/{uid}/notificationDevices/{deviceId}` — server-owned.
 * Raw push capability material (endpoint, p256dh, auth) lives ONLY here and is
 * never returned to the client; callables return a sanitized projection.
 */
export interface DeviceDocument {
  deviceId: string;
  /** Random per-runtime scope; isolates one account's deliveries from another. */
  accountScope: string;
  enabled: boolean;
  platform: DevicePlatform;
  serviceWorkerScope: string;
  /** Raw capability — SERVER ONLY. */
  endpoint: string;
  /** SHA-256 of the canonical endpoint; globally unique binding key. */
  endpointHash: string;
  /** Base64url P-256 subscription public key — SERVER ONLY. */
  p256dh: string;
  /** Base64url auth secret — SERVER ONLY. */
  auth: string;
  /** Fingerprint of (p256dh, auth); a rebind across accounts requires a match. */
  capabilityFingerprint: string;
  createdAt: string;
  updatedAt: string;
  lastAcceptedAt: string | null;
  lastFailureCode: string | null;
  disabledAt: string | null;
}

/** Sanitized device projection returned to the authenticated client. */
export interface SanitizedDevice {
  deviceId: string;
  enabled: boolean;
  platform: DevicePlatform;
  createdAt: string;
  updatedAt: string;
  lastAcceptedAt: string | null;
  lastFailureCode: string | null;
  disabledAt: string | null;
}

/** Result of a status/register callable — never leaks capability material. */
export interface DeviceStatusResult {
  /** Whether the server currently recognizes this deviceId as enabled. */
  recognized: boolean;
  device: SanitizedDevice | null;
  /** Count of the caller's currently enabled devices. */
  activeDeviceCount: number;
}

/**
 * `users/{uid}/notificationSchedules/{scheduleId}` — server-owned.
 * One durable "next evaluation instant" per daily/recurring/debt source.
 */
export interface ScheduleDocument {
  scheduleId: string;
  kind: Exclude<PayloadKind, 'test'>;
  accountScope: string;
  /** Authority generation this schedule belongs to. */
  authorityConfigVersion: number;
  /** Instant (ISO) at which the worker should next evaluate this source. */
  nextAt: string;
  /** Digest of the authoritative source descriptors; detects real changes. */
  sourceVersion: string;
  /** Transactional lease holder token, or null when unclaimed. */
  leaseOwner: string | null;
  /** Lease expiry (ISO), or null when unclaimed. */
  leaseExpiresAt: string | null;
  updatedAt: string;
}

/**
 * `users/{uid}/notificationDeliveries/{deliveryId}` — server-owned.
 * One logical delivery per (accountScope, eventId, revision, deviceId).
 */
export interface DeliveryDocument {
  deliveryId: string;
  accountScope: string;
  eventId: string;
  eventRevision: number;
  deviceId: string;
  authorityConfigVersion: number;
  status: DeliveryState;
  /** Earliest instant (ISO) this may be sent (quiet-hour deferral). */
  notBefore: string;
  attempts: number;
  lastAttemptAt: string | null;
  acceptedAt: string | null;
  failureCode: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  /** Terminal-only diagnostic retention expiry (Firestore TTL field). */
  retentionExpiresAt: string | null;
  updatedAt: string;
}

/** A delivery status is terminal when no further attempt will be made. */
export const TERMINAL_DELIVERY_STATES = ['accepted', 'failed', 'expired'] as const;

export const isTerminalDeliveryState = (status: DeliveryState): boolean =>
  (TERMINAL_DELIVERY_STATES as readonly string[]).includes(status);
