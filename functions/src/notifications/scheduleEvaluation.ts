/**
 * Pure schedule-evaluation logic for the durable notification worker.
 *
 * No Admin SDK, no clock of its own — every function takes the reference
 * instant explicitly so the worker and its tests are deterministic. Covers:
 *  - `sourceVersion` digests (detect real source changes idempotently),
 *  - quiet-hour `notBefore` computation across midnight and empty windows,
 *  - transactional lease claim / expiry decisions,
 *  - retry backoff / classification, and the per-user rolling-hour ceiling.
 */

import { createHash } from 'node:crypto';
import {
  DELIVERY_ATTEMPT_LIMIT,
  DELIVERY_WINDOW_HOURS,
  USER_ATTEMPTS_PER_ROLLING_HOUR,
} from './contracts.js';

// ── Source version digest ────────────────────────────────────────────────────
/**
 * Deterministic digest of the authoritative source descriptors. Sorting keys
 * makes it order-independent so an unchanged source re-serializes identically
 * and the trigger performs no spurious schedule write.
 */
export const computeSourceVersion = (descriptors: Record<string, unknown>): string => {
  const canonical = canonicalize(descriptors);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
};

const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(record[k])}`).join(',')}}`;
};

// ── Quiet-hour deferral ──────────────────────────────────────────────────────
export interface QuietHours {
  enabled: boolean;
  startHour: number;
  endHour: number;
}

/**
 * Is the local hour inside the quiet window? `start === end` is an EMPTY window
 * (never quiet), consistent with the client `NotificationManager`.
 */
export const isWithinQuietHours = (localHour: number, quiet: QuietHours): boolean => {
  if (!quiet.enabled) return false;
  const { startHour, endHour } = quiet;
  if (startHour === endHour) return false;
  if (startHour < endHour) return localHour >= startHour && localHour < endHour;
  // Spans midnight.
  return localHour >= startHour || localHour < endHour;
};

/**
 * Compute the earliest allowed delivery instant given quiet hours. If the
 * scheduled instant is inside the window, defer to the window's end (same or
 * next local day). Returns the original instant when not deferred.
 */
export const computeNotBefore = (params: {
  scheduledAt: Date;
  timeZone: string;
  quiet: QuietHours;
}): Date => {
  const { scheduledAt, timeZone, quiet } = params;
  if (!quiet.enabled || quiet.startHour === quiet.endHour) return scheduledAt;

  const localHour = getLocalHour(scheduledAt, timeZone);
  if (!isWithinQuietHours(localHour, quiet)) return scheduledAt;

  // Advance hour-by-hour to the first hour at/after endHour that is not quiet.
  // Bounded to 24 iterations.
  const result = new Date(scheduledAt.getTime());
  for (let i = 0; i < 24; i += 1) {
    result.setUTCHours(result.getUTCHours() + 1);
    if (!isWithinQuietHours(getLocalHour(result, timeZone), quiet)) {
      // Snap to the top of that local hour for determinism.
      result.setUTCMinutes(0, 0, 0);
      return result;
    }
  }
  return result;
};

const getLocalHour = (instant: Date, timeZone: string): number => {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
  return Number(hour);
};

// ── Lease decisions ──────────────────────────────────────────────────────────
export interface Lease {
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
}

/** May `worker` claim this lease at instant `now`? Free or expired only. */
export const canClaimLease = (lease: Lease, now: Date): boolean => {
  if (!lease.leaseOwner || !lease.leaseExpiresAt) return true;
  return Date.parse(lease.leaseExpiresAt) <= now.getTime();
};

/**
 * Does `worker` still own a valid lease at result-commit time? A result commit
 * MUST abort without mutation when the lease was reclaimed or expired.
 */
export const stillOwnsLease = (lease: Lease, worker: string, now: Date): boolean => {
  if (lease.leaseOwner !== worker || !lease.leaseExpiresAt) return false;
  return Date.parse(lease.leaseExpiresAt) > now.getTime();
};

export const buildLease = (worker: string, now: Date, leaseMs: number): Lease => ({
  leaseOwner: worker,
  leaseExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
});

// ── Retry / failure classification ──────────────────────────────────────────
export type FailureClass = 'retryable' | 'expired' | 'permanent';

/** Classify a push-service HTTP status into a retry disposition. */
export const classifyPushStatus = (status: number): FailureClass => {
  if (status === 404 || status === 410) return 'expired';
  if (status === 429 || (status >= 500 && status <= 599)) return 'retryable';
  if (status >= 200 && status <= 299) return 'retryable'; // caller treats 2xx as success upstream
  return 'permanent';
};

/**
 * Next attempt instant using bounded exponential backoff, or null when the
 * attempt limit or 24-hour window is exhausted.
 */
export const nextRetryAt = (params: {
  attempts: number;
  firstAttemptAt: Date;
  now: Date;
}): Date | null => {
  const { attempts, firstAttemptAt, now } = params;
  if (attempts >= DELIVERY_ATTEMPT_LIMIT) return null;
  const windowEnd = firstAttemptAt.getTime() + DELIVERY_WINDOW_HOURS * 3_600_000;
  if (now.getTime() >= windowEnd) return null;
  // 1m, 2m, 4m, 8m, 16m ... capped so it never crosses the 24h window.
  const backoffMs = Math.min(60_000 * 2 ** (attempts - 1), 3_600_000);
  const at = now.getTime() + backoffMs;
  return at >= windowEnd ? null : new Date(at);
};

// ── Per-user rolling-hour ceiling ────────────────────────────────────────────
/**
 * Given the ISO timestamps of accepted pushes in the last hour, may one more be
 * sent now? Excess is deferred, never dropped.
 */
export const withinRollingHourCeiling = (acceptedAtIsoList: readonly string[], now: Date): boolean => {
  const cutoff = now.getTime() - 3_600_000;
  const recent = acceptedAtIsoList.filter((iso) => Date.parse(iso) > cutoff);
  return recent.length < USER_ATTEMPTS_PER_ROLLING_HOUR;
};
