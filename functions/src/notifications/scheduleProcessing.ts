/**
 * Pure leased-schedule processing (task 3.6).
 *
 * When the worker leases a due schedule it must, in one logical step:
 *   1. build the canonical backend event for the current stage/revision,
 *   2. fan out one pending delivery per enabled device (quiet-hour aware),
 *   3. suppress older-revision nonterminal deliveries, and
 *   4. decide how the schedule advances (advance / skip / replan).
 *
 * This module is pure: it takes the leased schedule, the current devices, and
 * quiet-hour context, and returns the exact documents/decisions the worker
 * applies transactionally. No Admin SDK, no I/O.
 */

import { computeNotBefore, type QuietHours } from './scheduleEvaluation.js';
import { buildDeliveries, type FanOutDevice } from './fanOut.js';
import { eventIdFor } from './contracts.js';
import type { DeliveryDocument, ScheduleDocument } from './types.js';

export interface CanonicalEvent {
  eventKey: string;
  eventId: string;
  revision: number;
  stage: string;
  stageWindow: string;
}

export interface ScheduleDevice {
  deviceId: string;
  enabled: boolean;
}

export type ScheduleAdvance =
  | { action: 'advance'; nextAt: string } // move to the next occurrence
  | { action: 'skip'; nextAt: string } // a whole window was missed; jump ahead, no event
  | { action: 'delete' }; // no further occurrence

export interface ProcessScheduleResult {
  /** The canonical event to upsert, or null when nothing is due right now. */
  event: CanonicalEvent | null;
  /** Pending deliveries to create for this revision (empty when no event). */
  deliveries: DeliveryDocument[];
  /** How the schedule itself advances. */
  advance: ScheduleAdvance;
}

export interface ProcessScheduleInput {
  schedule: ScheduleDocument;
  /** The canonical event for the stage that is valid right now, or null. */
  currentEvent: CanonicalEvent | null;
  /** Whether the current local window was entirely missed (skip, don't replay). */
  windowMissed: boolean;
  /** The next occurrence instant, or null when the source has no more cycles. */
  nextOccurrence: string | null;
  devices: readonly ScheduleDevice[];
  quiet: QuietHours;
  timeZone: string;
  now: string;
}

/**
 * Decide the event + deliveries + schedule advance for one leased schedule.
 *
 * - If the whole window was missed, skip to the next occurrence without an event
 *   (never replay a stale reminder).
 * - Otherwise build the canonical event, fan out one quiet-hour-aware delivery
 *   per enabled device, and advance the schedule to the next occurrence.
 */
export const processLeasedSchedule = (input: ProcessScheduleInput): ProcessScheduleResult => {
  const { schedule, currentEvent, windowMissed, nextOccurrence, devices, quiet, timeZone, now } = input;

  const advance: ScheduleAdvance = nextOccurrence
    ? { action: windowMissed ? 'skip' : 'advance', nextAt: nextOccurrence }
    : { action: 'delete' };

  // Missed window or no due event: advance/skip the schedule, create nothing.
  if (windowMissed || !currentEvent) {
    return { event: null, deliveries: [], advance };
  }

  const scheduledAt = new Date(now);
  const notBefore = computeNotBefore({ scheduledAt, timeZone, quiet }).toISOString();

  const fanOutDevices: FanOutDevice[] = devices
    .filter((d) => d.enabled)
    .map((d) => ({ deviceId: d.deviceId, notBefore }));

  const deliveries = buildDeliveries({
    event: {
      accountScope: schedule.accountScope,
      eventId: currentEvent.eventId,
      eventRevision: currentEvent.revision,
      authorityConfigVersion: schedule.authorityConfigVersion,
    },
    devices: fanOutDevices,
    now,
  });

  return { event: currentEvent, deliveries, advance };
};

/** Build a canonical event descriptor from an event key + stage/revision. */
export const buildCanonicalEvent = (params: {
  eventKey: string;
  revision: number;
  stage: string;
  stageWindow: string;
}): CanonicalEvent => ({
  eventKey: params.eventKey,
  eventId: eventIdFor(params.eventKey),
  revision: params.revision,
  stage: params.stage,
  stageWindow: params.stageWindow,
});
