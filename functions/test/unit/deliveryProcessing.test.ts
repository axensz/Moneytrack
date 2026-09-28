import { describe, it, expect } from 'vitest';
import {
  computeDeliveryResult,
  isDeliveryDue,
  isDeliveryWindowExhausted,
  RETENTION_DAYS,
  type PushResult,
} from '../../src/notifications/deliveryProcessing.js';
import type { DeliveryDocument } from '../../src/notifications/types.js';

const delivery = (o: Partial<DeliveryDocument> = {}): DeliveryDocument => ({
  deliveryId: 'd1',
  accountScope: 'AAAAAAAAAAAAAAAAAAAAAA',
  eventId: 'e1',
  eventRevision: 1,
  deviceId: 'dev-a',
  authorityConfigVersion: 1,
  status: 'pending',
  notBefore: '2026-08-30T09:00:00.000Z',
  attempts: 0,
  lastAttemptAt: null,
  acceptedAt: null,
  failureCode: null,
  leaseOwner: 'w1',
  leaseExpiresAt: '2026-08-30T09:02:00.000Z',
  retentionExpiresAt: null,
  updatedAt: '2026-08-30T09:00:00.000Z',
  ...o,
});

const now = new Date('2026-08-30T09:00:00.000Z');
const firstAttemptAt = now;
const result = (statusCode: number | null): PushResult => ({ statusCode });

describe('computeDeliveryResult', () => {
  it('marks a 2xx push accepted (terminal) with retention', () => {
    const patch = computeDeliveryResult({ delivery: delivery(), result: result(201), now, firstAttemptAt });
    expect(patch.status).toBe('accepted');
    expect(patch.acceptedAt).toBe(now.toISOString());
    expect(patch.nextAttemptAt).toBeNull();
    expect(patch.retentionExpiresAt).toBe(new Date(now.getTime() + RETENTION_DAYS * 86_400_000).toISOString());
  });

  it('marks 410 expired and flags the device for scrub', () => {
    const patch = computeDeliveryResult({ delivery: delivery(), result: result(410), now, firstAttemptAt });
    expect(patch.status).toBe('expired');
    expect(patch.expireDevice).toBe(true);
    expect(patch.failureCode).toBe('410');
  });

  it('retries a 503 within the window', () => {
    const patch = computeDeliveryResult({ delivery: delivery({ attempts: 0 }), result: result(503), now, firstAttemptAt });
    expect(patch.status).toBe('retrying');
    expect(patch.nextAttemptAt).toBe('2026-08-30T09:01:00.000Z');
  });

  it('fails a 503 once attempts are exhausted', () => {
    const patch = computeDeliveryResult({ delivery: delivery({ attempts: 4 }), result: result(503), now, firstAttemptAt });
    expect(patch.status).toBe('failed');
    expect(patch.nextAttemptAt).toBeNull();
    expect(patch.retentionExpiresAt).not.toBeNull();
  });

  it('fails a permanent 400 (terminal)', () => {
    const patch = computeDeliveryResult({ delivery: delivery(), result: result(400), now, firstAttemptAt });
    expect(patch.status).toBe('failed');
    expect(patch.failureCode).toBe('400');
  });

  it('records a lost result as ambiguous and retries with the same logical id', () => {
    const patch = computeDeliveryResult({ delivery: delivery({ attempts: 0 }), result: result(null), now, firstAttemptAt });
    expect(patch.status).toBe('ambiguous');
    expect(patch.failureCode).toBe('ambiguous');
    expect(patch.nextAttemptAt).toBe('2026-08-30T09:01:00.000Z');
  });

  it('marks an exhausted ambiguous result failed but never claims acceptance', () => {
    const patch = computeDeliveryResult({ delivery: delivery({ attempts: 4 }), result: result(null), now, firstAttemptAt });
    expect(patch.status).toBe('failed');
    expect(patch.failureCode).toBe('ambiguous-exhausted');
    expect(patch.acceptedAt).toBeNull();
  });

  it('increments attempts each time', () => {
    const patch = computeDeliveryResult({ delivery: delivery({ attempts: 2 }), result: result(201), now, firstAttemptAt });
    expect(patch.attempts).toBe(3);
  });
});

describe('isDeliveryDue', () => {
  it('is due for a pending delivery past notBefore', () => {
    expect(isDeliveryDue(delivery({ notBefore: '2026-08-30T08:59:00.000Z' }), now)).toBe(true);
  });

  it('is not due before notBefore', () => {
    expect(isDeliveryDue(delivery({ notBefore: '2026-08-30T10:00:00.000Z' }), now)).toBe(false);
  });

  it('is not due for terminal states', () => {
    expect(isDeliveryDue(delivery({ status: 'accepted' }), now)).toBe(false);
    expect(isDeliveryDue(delivery({ status: 'expired' }), now)).toBe(false);
  });

  it('retries and ambiguous are due', () => {
    expect(isDeliveryDue(delivery({ status: 'retrying', notBefore: '2026-08-30T08:00:00.000Z' }), now)).toBe(true);
    expect(isDeliveryDue(delivery({ status: 'ambiguous', notBefore: '2026-08-30T08:00:00.000Z' }), now)).toBe(true);
  });

  it('is not due once attempts hit the limit', () => {
    expect(isDeliveryDue(delivery({ attempts: 5, notBefore: '2026-08-30T08:00:00.000Z' }), now)).toBe(false);
  });
});

describe('isDeliveryWindowExhausted', () => {
  it('is false before an attempt', () => {
    expect(isDeliveryWindowExhausted(delivery({ attempts: 0 }), new Date('2026-08-30T09:00:00.000Z'), now)).toBe(false);
  });

  it('is true past 24 hours from the first attempt', () => {
    const first = new Date('2026-08-29T08:00:00.000Z');
    expect(isDeliveryWindowExhausted(delivery({ attempts: 2 }), first, now)).toBe(true);
  });
});
