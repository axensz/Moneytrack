/**
 * Pure notification contracts for the isolated Functions backend.
 *
 * No I/O, no Admin SDK. Deterministic identifiers, closed copy/kind table,
 * strict validators, and reject-unknown-keys parsers. Everything here is safe
 * to import from unit tests and from later function modules.
 */

import { createHash, randomBytes } from 'node:crypto';

// ── Fixed product constants ─────────────────────────────────────────────────
export const FUNCTIONS_REGION = 'us-central1';
export const MAX_ACTIVE_DEVICES = 5;
export const MAX_PAYLOAD_BYTES = 4096;
export const DELIVERY_ATTEMPT_LIMIT = 5;
export const DELIVERY_WINDOW_HOURS = 24;
export const USER_ATTEMPTS_PER_ROLLING_HOUR = 60;

// ── Deterministic identifiers (lowercase hex SHA-256) ───────────────────────
const sha256 = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

export const eventIdFor = (eventKey: string): string => sha256(`v1\0${eventKey}`);

export const deliveryIdFor = (input: {
  accountScope: string;
  eventId: string;
  eventRevision: number;
  deviceId: string;
}): string =>
  sha256(
    `v1\0${input.accountScope}\0${input.eventId}\0${input.eventRevision}\0${input.deviceId}`,
  );

export const endpointHashFor = (canonicalEndpoint: string): string =>
  sha256(canonicalEndpoint);

/** Server-generated random 128-bit base64url account scope (22 chars). */
export const accountScopeForNewRuntime = (): string =>
  randomBytes(16).toString('base64url');

// ── Account scope ───────────────────────────────────────────────────────────
const ACCOUNT_SCOPE_RE = /^[A-Za-z0-9_-]{22}$/;

export const isValidAccountScope = (value: unknown): value is string =>
  typeof value === 'string' && ACCOUNT_SCOPE_RE.test(value);

export const assertAccountScope = (value: unknown): string => {
  if (!isValidAccountScope(value)) {
    throw new Error('Invalid account scope: expected 22-char base64url');
  }
  return value;
};

// ── UUID / device id ────────────────────────────────────────────────────────
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const isValidUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value);

export const assertUuid = (value: unknown): string => {
  if (!isValidUuid(value)) {
    throw new Error('Invalid UUID: expected canonical 36-char form');
  }
  return value;
};

/** A device id is a canonical UUID. */
export const isValidDeviceId = (value: unknown): value is string => isValidUuid(value);

// ── Closed payload kind / action / copy table ───────────────────────────────
export type PayloadKind = 'daily' | 'recurring' | 'debt' | 'test';

export interface PayloadCopy {
  title: string;
  body: string;
  actionUrl: string;
}

export const NOTIFICATION_COPY: Readonly<Record<PayloadKind, PayloadCopy>> = {
  daily: {
    title: 'Registro diario pendiente',
    body: 'Abre MoneyTrack para revisar tu registro diario.',
    actionUrl: '/',
  },
  recurring: {
    title: 'Recordatorio de pago',
    body: 'Abre MoneyTrack para revisar un pago recurrente.',
    actionUrl: '/?view=recurring',
  },
  debt: {
    title: 'Recordatorio de deuda',
    body: 'Abre MoneyTrack para revisar una deuda.',
    actionUrl: '/?view=debts',
  },
  test: {
    title: 'Prueba de notificaciones',
    body: 'MoneyTrack puede enviar notificaciones a este dispositivo.',
    actionUrl: '/',
  },
};

const PAYLOAD_KINDS: readonly PayloadKind[] = ['daily', 'recurring', 'debt', 'test'];

export const isPayloadKind = (value: unknown): value is PayloadKind =>
  typeof value === 'string' && (PAYLOAD_KINDS as readonly string[]).includes(value);

export interface BuildPayloadInput {
  kind: PayloadKind;
  accountScope: string;
  eventId: string;
  eventRevision: number;
  expiresAt: string;
  notificationTag: string;
}

export interface WirePayload extends PayloadCopy {
  schemaVersion: 1;
  kind: PayloadKind;
  accountScope: string;
  eventId: string;
  eventRevision: number;
  expiresAt: string;
  notificationTag: string;
}

/** Builds a payload whose copy/action are the constant table values for the kind. */
export const buildPayload = (input: BuildPayloadInput): WirePayload => {
  if (!isPayloadKind(input.kind)) {
    throw new Error(`Unknown payload kind: ${String(input.kind)}`);
  }
  const copy = NOTIFICATION_COPY[input.kind];
  return {
    schemaVersion: 1,
    kind: input.kind,
    accountScope: assertAccountScope(input.accountScope),
    eventId: input.eventId,
    eventRevision: input.eventRevision,
    expiresAt: input.expiresAt,
    notificationTag: input.notificationTag,
    title: copy.title,
    body: copy.body,
    actionUrl: copy.actionUrl,
  };
};

// ── Monotonic revisions / positive generations ──────────────────────────────
export const assertMonotonicRevision = (previous: number, next: number): number => {
  if (!Number.isInteger(next) || next <= 0) {
    throw new Error('Revision must be a positive integer');
  }
  if (next <= previous) {
    throw new Error('Revision must strictly increase');
  }
  return next;
};

export const assertPositiveGeneration = (value: number): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('Generation must be a positive integer');
  }
  return value;
};

// ── ISO date-string parsing ─────────────────────────────────────────────────
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export const parseIsoDateString = (value: string): Date => {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    throw new Error(`Invalid ISO date string: ${String(value)}`);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(`Unparseable ISO date string: ${value}`);
  }
  return new Date(ms);
};

// ── Delivery-state union ─────────────────────────────────────────────────────
export const DELIVERY_STATES = [
  'pending',
  'leased',
  'sending',
  'accepted',
  'ambiguous',
  'failed',
  'expired',
] as const;

export type DeliveryState = (typeof DELIVERY_STATES)[number];

export const isDeliveryState = (value: unknown): value is DeliveryState =>
  typeof value === 'string' && (DELIVERY_STATES as readonly string[]).includes(value);

// ── Reject-unknown-keys parsers ─────────────────────────────────────────────
export interface RuntimePrivateDocument {
  accountScope: string;
  authorityConfigVersion: number;
  activatedAt: string | null;
}

const RUNTIME_PRIVATE_KEYS = new Set(['accountScope', 'authorityConfigVersion', 'activatedAt']);

export const parseRuntimePrivateDocument = (input: unknown): RuntimePrivateDocument => {
  if (!input || typeof input !== 'object') {
    throw new Error('Runtime-private document must be an object');
  }
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!RUNTIME_PRIVATE_KEYS.has(key)) {
      throw new Error(`Unexpected key in runtime-private document: ${key}`);
    }
  }
  const accountScope = assertAccountScope(record.accountScope);
  const authorityConfigVersion = record.authorityConfigVersion;
  if (typeof authorityConfigVersion !== 'number' || !Number.isInteger(authorityConfigVersion)) {
    throw new Error('authorityConfigVersion must be an integer');
  }
  const activatedAt = record.activatedAt;
  if (activatedAt !== null && typeof activatedAt !== 'string') {
    throw new Error('activatedAt must be an ISO string or null');
  }
  if (typeof activatedAt === 'string') {
    parseIsoDateString(activatedAt);
  }
  return { accountScope, authorityConfigVersion, activatedAt: activatedAt ?? null };
};
