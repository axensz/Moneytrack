import { describe, it, expect } from 'vitest';
import {
  processLeasedSchedule,
  buildCanonicalEvent,
  type ProcessScheduleInput,
  type ScheduleDevice,
} from '../../src/notifications/scheduleProcessing.js';
import { eventIdFor, deliveryIdFor } from '../../src/notifications/contracts.js';
import type { ScheduleDocument } from '../../src/notifications/types.js';

const SCOPE = 'AAAAAAAAAAAAAAAAAAAAAA';

const schedule = (o: Partial<ScheduleDocument> = {}): ScheduleDocument => ({
  scheduleId: 'recurring:rent',
  kind: 'recurring',
  accountScope: SCOPE,
  authorityConfigVersion: 1,
  nextAt: '2026-08-30T14:00:00.000Z',
  sourceVersion: 'sv',
  leaseOwner: 'w1',
  leaseExpiresAt: '2026-08-30T14:02:00.000Z',
  updatedAt: '2026-08-30T14:00:00.000Z',
  ...o,
});

const event = buildCanonicalEvent({ eventKey: 'recurring:rent:2026-08', revision: 3, stage: 'due', stageWindow: 'due' });

const devices = (list: Array<[string, boolean]>): ScheduleDevice[] =>
  list.map(([deviceId, enabled]) => ({ deviceId, enabled }));

const input = (o: Partial<ProcessScheduleInput> = {}): ProcessScheduleInput => ({
  schedule: schedule(),
  currentEvent: event,
  windowMissed: false,
  nextOccurrence: '2026-09-30T14:00:00.000Z',
  devices: devices([['dev-a', true], ['dev-b', true]]),
  quiet: { enabled: false, startHour: 22, endHour: 7 },
  timeZone: 'America/Bogota',
  now: '2026-08-30T14:00:00.000Z',
  ...o,
});

describe('buildCanonicalEvent', () => {
  it('derives a deterministic eventId from the key', () => {
    expect(event.eventId).toBe(eventIdFor('recurring:rent:2026-08'));
    expect(event.revision).toBe(3);
  });
});

describe('processLeasedSchedule', () => {
  it('builds the event and one delivery per enabled device, then advances', () => {
    const result = processLeasedSchedule(input());
    expect(result.event?.revision).toBe(3);
    expect(result.deliveries).toHaveLength(2);
    expect(result.advance).toEqual({ action: 'advance', nextAt: '2026-09-30T14:00:00.000Z' });
    expect(result.deliveries[0].deliveryId).toBe(
      deliveryIdFor({ accountScope: SCOPE, eventId: event.eventId, eventRevision: 3, deviceId: 'dev-a' }),
    );
    expect(result.deliveries.every((d) => d.status === 'pending')).toBe(true);
  });

  it('excludes disabled devices from fan-out', () => {
    const result = processLeasedSchedule(input({ devices: devices([['dev-a', true], ['dev-b', false]]) }));
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0].deviceId).toBe('dev-a');
  });

  it('skips a missed window without creating an event or deliveries', () => {
    const result = processLeasedSchedule(input({ windowMissed: true }));
    expect(result.event).toBeNull();
    expect(result.deliveries).toHaveLength(0);
    expect(result.advance).toEqual({ action: 'skip', nextAt: '2026-09-30T14:00:00.000Z' });
  });

  it('creates nothing when no event is due right now', () => {
    const result = processLeasedSchedule(input({ currentEvent: null }));
    expect(result.event).toBeNull();
    expect(result.deliveries).toHaveLength(0);
    expect(result.advance.action).toBe('advance');
  });

  it('deletes the schedule when there is no next occurrence', () => {
    const result = processLeasedSchedule(input({ nextOccurrence: null }));
    expect(result.advance).toEqual({ action: 'delete' });
  });

  it('defers delivery notBefore into quiet hours', () => {
    // 04:00 Bogota (09:00Z) is inside 22-7; notBefore should move to 07:00 Bogota (12:00Z).
    const result = processLeasedSchedule(input({
      now: '2026-08-30T09:00:00.000Z',
      quiet: { enabled: true, startHour: 22, endHour: 7 },
    }));
    expect(result.deliveries[0].notBefore).toBe('2026-08-30T12:00:00.000Z');
  });

  it('does not defer when outside quiet hours', () => {
    const result = processLeasedSchedule(input({
      now: '2026-08-30T14:00:00.000Z',
      quiet: { enabled: true, startHour: 22, endHour: 7 },
    }));
    expect(result.deliveries[0].notBefore).toBe('2026-08-30T14:00:00.000Z');
  });
});
