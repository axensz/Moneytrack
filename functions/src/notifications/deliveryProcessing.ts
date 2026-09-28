/**
 * Pure delivery-processing decisions for the scheduled worker.
 *
 * No Admin SDK, no network. Given a leased delivery and a push-service result
 * (or a crash), decide the next persisted state: accepted, ambiguous, retrying
 * (with the next instant), failed, or expired. The worker applies the returned
 * patch transactionally after re-checking lease ownership.
 */

import { classifyPushStatus, nextRetryAt } from './scheduleEvaluation.js';
import type { DeliveryDocument } from './types.js';
import { DELIVERY_ATTEMPT_LIMIT, DELIVERY_WINDOW_HOURS } from './contracts.js';

/** Terminal diagnostic retention: keep a terminal delivery for 30 days. */
export const RETENTION_DAYS = 30;

export interface PushResult {
  /** HTTP status from the push service, or null when the result was lost (crash). */
  statusCode: number | null;
}

export interface DeliveryPatch {
  status: DeliveryDocument['status'];
  attempts: number;
  lastAttemptAt: string;
  acceptedAt: string | null;
  failureCode: string | null;
  /** When retrying, the next-eligible instant; the worker copies this to the schedule/delivery. */
  nextAttemptAt: string | null;
  retentionExpiresAt: string | null;
  /** True when the device endpoint should be scrubbed/expired (404/410). */
  expireDevice: boolean;
}

const retentionFrom = (now: Date): string =>
  new Date(now.getTime() + RETENTION_DAYS * 86_400_000).toISOString();

/**
 * Compute the next persisted delivery state after a dispatch attempt.
 *
 * - lost result (statusCode null): `ambiguous` — the push MAY have been
 *   accepted; a same-ID retry is allowed but never asserts double-acceptance.
 * - 2xx: `accepted` (terminal).
 * - 404/410: `expired` (terminal) and the device must be scrubbed.
 * - 429/5xx: `retrying` if within limits, else `failed` (terminal).
 * - other 4xx: `failed` (terminal).
 */
export const computeDeliveryResult = (params: {
  delivery: DeliveryDocument;
  result: PushResult;
  now: Date;
  firstAttemptAt: Date;
}): DeliveryPatch => {
  const { delivery, result, now, firstAttemptAt } = params;
  const attempts = delivery.attempts + 1;
  const base = {
    attempts,
    lastAttemptAt: now.toISOString(),
    acceptedAt: null as string | null,
    failureCode: null as string | null,
    nextAttemptAt: null as string | null,
    retentionExpiresAt: null as string | null,
    expireDevice: false,
  };

  // Lost result after dispatch: ambiguous, retry with the same logical ID.
  if (result.statusCode === null) {
    const retryAt = nextRetryAt({ attempts, firstAttemptAt, now });
    return {
      ...base,
      status: retryAt ? 'ambiguous' : 'failed',
      failureCode: retryAt ? 'ambiguous' : 'ambiguous-exhausted',
      nextAttemptAt: retryAt ? retryAt.toISOString() : null,
      retentionExpiresAt: retryAt ? null : retentionFrom(now),
    };
  }

  const status = result.statusCode;

  if (status >= 200 && status <= 299) {
    return { ...base, status: 'accepted', acceptedAt: now.toISOString(), retentionExpiresAt: retentionFrom(now) };
  }

  const disposition = classifyPushStatus(status);

  if (disposition === 'expired') {
    return {
      ...base,
      status: 'expired',
      failureCode: String(status),
      retentionExpiresAt: retentionFrom(now),
      expireDevice: true,
    };
  }

  if (disposition === 'retryable') {
    const retryAt = nextRetryAt({ attempts, firstAttemptAt, now });
    return retryAt
      ? { ...base, status: 'retrying', failureCode: String(status), nextAttemptAt: retryAt.toISOString() }
      : { ...base, status: 'failed', failureCode: String(status), retentionExpiresAt: retentionFrom(now) };
  }

  // permanent (other 4xx)
  return { ...base, status: 'failed', failureCode: String(status), retentionExpiresAt: retentionFrom(now) };
};

/**
 * Should a claimed delivery be attempted right now? It must be pending/retrying,
 * eligible by notBefore, and not already terminal or exhausted.
 */
export const isDeliveryDue = (delivery: DeliveryDocument, now: Date): boolean => {
  if (delivery.status !== 'pending' && delivery.status !== 'retrying' && delivery.status !== 'ambiguous') {
    return false;
  }
  if (Date.parse(delivery.notBefore) > now.getTime()) return false;
  if (delivery.attempts >= DELIVERY_ATTEMPT_LIMIT) return false;
  return true;
};

/**
 * A delivery whose 24-hour window elapsed while pending/retrying is failed
 * without a further attempt (used by a sweep, distinct from a dispatch result).
 */
export const isDeliveryWindowExhausted = (delivery: DeliveryDocument, firstAttemptAt: Date, now: Date): boolean => {
  if (delivery.attempts === 0) return false;
  return now.getTime() - firstAttemptAt.getTime() >= DELIVERY_WINDOW_HOURS * 3_600_000;
};
