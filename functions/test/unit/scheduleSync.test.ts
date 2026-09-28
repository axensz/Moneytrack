import { describe, it, expect } from 'vitest';
import {
  decideScheduleSync,
  advanceSchedule,
  type DesiredSchedule,
} from '../../src/notifications/scheduleSync.js';
import { computeSourceVersion } from '../../src/notifications/scheduleEvaluation.js';
import type { ScheduleDocument } from '../../src/notifications/types.js';

const SCOPE = 'AAAAAAAAAAAAAAAAAAAAAA';
const NOW = '2026-08-30T09:00:00.000Z';

const desired = (o: Partial<DesiredSchedule> = {}): DesiredSchedule => ({
  scheduleId: 'recurring:rent',
  kind: 'recurring',
  accountScope: SCOPE,
  authorityConfigVersion: 1,
  nextAt: '2026-09-07T14:00:00.000Z',
  sourceDescriptor: { dueDay: 10, frequency: 'monthly' },
  ...o,
});

const existing = (o: Partial<ScheduleDocument> = {}): ScheduleDocument => ({
  scheduleId: 'recurring:rent',
  kind: 'recurring',
  accountScope: SCOPE,
  authorityConfigVersion: 1,
  nextAt: '2026-09-07T14:00:00.000Z',
  sourceVersion: computeSourceVersion({ dueDay: 10, frequency: 'monthly' }),
  leaseOwner: null,
  leaseExpiresAt: null,
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...o,
});

describe('decideScheduleSync', () => {
  it('upserts when no existing schedule', () => {
    const d = decideScheduleSync({ desired: desired(), existing: null, now: NOW });
    expect(d.action).toBe('upsert');
    if (d.action === 'upsert') {
      expect(d.schedule.sourceVersion).toBe(computeSourceVersion({ dueDay: 10, frequency: 'monthly' }));
      expect(d.schedule.nextAt).toBe('2026-09-07T14:00:00.000Z');
      expect(d.schedule).not.toHaveProperty('leaseOwner');
    }
  });

  it('is a no-op when nothing changed (idempotent)', () => {
    expect(decideScheduleSync({ desired: desired(), existing: existing(), now: NOW })).toEqual({ action: 'noop' });
  });

  it('upserts when the source descriptor changed', () => {
    const d = decideScheduleSync({ desired: desired({ sourceDescriptor: { dueDay: 15, frequency: 'monthly' } }), existing: existing(), now: NOW });
    expect(d.action).toBe('upsert');
  });

  it('upserts when the authority generation changed', () => {
    const d = decideScheduleSync({ desired: desired({ authorityConfigVersion: 2 }), existing: existing(), now: NOW });
    expect(d.action).toBe('upsert');
  });

  it('upserts when nextAt changed', () => {
    const d = decideScheduleSync({ desired: desired({ nextAt: '2026-10-07T14:00:00.000Z' }), existing: existing(), now: NOW });
    expect(d.action).toBe('upsert');
  });

  it('deletes when the source went away but a schedule exists', () => {
    expect(decideScheduleSync({ desired: null, existing: existing(), now: NOW })).toEqual({ action: 'delete', scheduleId: 'recurring:rent' });
  });

  it('is a no-op when neither desired nor existing exist', () => {
    expect(decideScheduleSync({ desired: null, existing: null, now: NOW })).toEqual({ action: 'noop' });
  });
});

describe('advanceSchedule', () => {
  it('advances nextAt to the next occurrence', () => {
    const out = advanceSchedule({ schedule: existing(), nextOccurrence: '2026-10-07T14:00:00.000Z', now: NOW });
    expect(out?.nextAt).toBe('2026-10-07T14:00:00.000Z');
    expect(out?.updatedAt).toBe(NOW);
    expect(out?.sourceVersion).toBe(existing().sourceVersion);
  });

  it('returns null when there is no next occurrence', () => {
    expect(advanceSchedule({ schedule: existing(), nextOccurrence: null, now: NOW })).toBeNull();
  });
});
