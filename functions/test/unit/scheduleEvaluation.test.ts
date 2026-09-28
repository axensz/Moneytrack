import { describe, it, expect } from 'vitest';
import {
  computeSourceVersion,
  isWithinQuietHours,
  computeNotBefore,
  canClaimLease,
  stillOwnsLease,
  buildLease,
  classifyPushStatus,
  nextRetryAt,
  withinRollingHourCeiling,
} from '../../src/notifications/scheduleEvaluation.js';

describe('computeSourceVersion', () => {
  it('is order-independent for object keys', () => {
    const a = computeSourceVersion({ x: 1, y: [1, 2], z: { b: 2, a: 1 } });
    const b = computeSourceVersion({ z: { a: 1, b: 2 }, y: [1, 2], x: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when a value changes', () => {
    expect(computeSourceVersion({ dueDay: 10 })).not.toBe(computeSourceVersion({ dueDay: 11 }));
  });

  it('preserves array order (order is significant)', () => {
    expect(computeSourceVersion({ items: [1, 2] })).not.toBe(computeSourceVersion({ items: [2, 1] }));
  });
});

describe('isWithinQuietHours', () => {
  const q = (startHour: number, endHour: number, enabled = true) => ({ enabled, startHour, endHour });

  it('is false when disabled or empty window', () => {
    expect(isWithinQuietHours(23, q(22, 7, false))).toBe(false);
    expect(isWithinQuietHours(5, q(3, 3))).toBe(false);
  });

  it('handles same-day windows', () => {
    expect(isWithinQuietHours(10, q(9, 17))).toBe(true);
    expect(isWithinQuietHours(8, q(9, 17))).toBe(false);
    expect(isWithinQuietHours(17, q(9, 17))).toBe(false);
  });

  it('handles windows spanning midnight', () => {
    expect(isWithinQuietHours(23, q(22, 7))).toBe(true);
    expect(isWithinQuietHours(3, q(22, 7))).toBe(true);
    expect(isWithinQuietHours(7, q(22, 7))).toBe(false);
    expect(isWithinQuietHours(12, q(22, 7))).toBe(false);
  });
});

describe('computeNotBefore', () => {
  it('returns the scheduled instant when not quiet', () => {
    const at = new Date('2026-08-30T15:00:00.000Z'); // 10:00 in Bogota (UTC-5)
    const out = computeNotBefore({ scheduledAt: at, timeZone: 'America/Bogota', quiet: { enabled: true, startHour: 22, endHour: 7 } });
    expect(out.getTime()).toBe(at.getTime());
  });

  it('defers into the quiet window to the end of quiet hours', () => {
    // 04:00 Bogota is inside 22-7. End is 07:00 Bogota = 12:00 UTC.
    const at = new Date('2026-08-30T09:00:00.000Z'); // 04:00 Bogota
    const out = computeNotBefore({ scheduledAt: at, timeZone: 'America/Bogota', quiet: { enabled: true, startHour: 22, endHour: 7 } });
    expect(out.toISOString()).toBe('2026-08-30T12:00:00.000Z'); // 07:00 Bogota
  });

  it('is a no-op for an empty window', () => {
    const at = new Date('2026-08-30T09:00:00.000Z');
    const out = computeNotBefore({ scheduledAt: at, timeZone: 'America/Bogota', quiet: { enabled: true, startHour: 5, endHour: 5 } });
    expect(out.getTime()).toBe(at.getTime());
  });
});

describe('leases', () => {
  const now = new Date('2026-08-30T09:00:00.000Z');

  it('claims a free or expired lease only', () => {
    expect(canClaimLease({ leaseOwner: null, leaseExpiresAt: null }, now)).toBe(true);
    expect(canClaimLease({ leaseOwner: 'w1', leaseExpiresAt: '2026-08-30T08:59:00.000Z' }, now)).toBe(true);
    expect(canClaimLease({ leaseOwner: 'w1', leaseExpiresAt: '2026-08-30T09:05:00.000Z' }, now)).toBe(false);
  });

  it('confirms ownership only for a valid, matching lease', () => {
    const lease = buildLease('w1', now, 120_000);
    expect(stillOwnsLease(lease, 'w1', now)).toBe(true);
    expect(stillOwnsLease(lease, 'w2', now)).toBe(false);
    expect(stillOwnsLease(lease, 'w1', new Date('2026-08-30T09:03:00.000Z'))).toBe(false);
  });
});

describe('classifyPushStatus', () => {
  it('maps statuses to retry dispositions', () => {
    expect(classifyPushStatus(410)).toBe('expired');
    expect(classifyPushStatus(404)).toBe('expired');
    expect(classifyPushStatus(429)).toBe('retryable');
    expect(classifyPushStatus(503)).toBe('retryable');
    expect(classifyPushStatus(400)).toBe('permanent');
    expect(classifyPushStatus(403)).toBe('permanent');
  });
});

describe('nextRetryAt', () => {
  const first = new Date('2026-08-30T09:00:00.000Z');

  it('backs off exponentially within the window', () => {
    const now = new Date('2026-08-30T09:01:00.000Z');
    expect(nextRetryAt({ attempts: 1, firstAttemptAt: first, now })?.toISOString()).toBe('2026-08-30T09:02:00.000Z');
    expect(nextRetryAt({ attempts: 2, firstAttemptAt: first, now })?.toISOString()).toBe('2026-08-30T09:03:00.000Z');
  });

  it('returns null after the attempt limit', () => {
    expect(nextRetryAt({ attempts: 5, firstAttemptAt: first, now: new Date('2026-08-30T09:10:00.000Z') })).toBeNull();
  });

  it('returns null after the 24-hour window', () => {
    expect(nextRetryAt({ attempts: 2, firstAttemptAt: first, now: new Date('2026-08-31T09:00:00.000Z') })).toBeNull();
  });
});

describe('withinRollingHourCeiling', () => {
  const now = new Date('2026-08-30T09:00:00.000Z');

  it('permits under 60 recent accepted pushes', () => {
    const recent = Array.from({ length: 59 }, (_, i) => new Date(now.getTime() - i * 1000).toISOString());
    expect(withinRollingHourCeiling(recent, now)).toBe(true);
  });

  it('defers at 60 recent accepted pushes', () => {
    const recent = Array.from({ length: 60 }, (_, i) => new Date(now.getTime() - i * 1000).toISOString());
    expect(withinRollingHourCeiling(recent, now)).toBe(false);
  });

  it('ignores pushes older than one hour', () => {
    const old = Array.from({ length: 60 }, () => new Date(now.getTime() - 3_700_000).toISOString());
    expect(withinRollingHourCeiling(old, now)).toBe(true);
  });
});
