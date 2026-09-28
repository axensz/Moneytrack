/**
 * Pure schedule-synchronization logic for Firestore triggers.
 *
 * A trigger fires on a preference/recurring/debt write, computes the source
 * descriptor + next evaluation instant, and decides whether to write a
 * schedule document. Writing only when the `sourceVersion` digest changes makes
 * triggers idempotent and avoids write storms. No Admin SDK, no I/O.
 */

import { computeSourceVersion } from './scheduleEvaluation.js';
import type { ScheduleDocument } from './types.js';
import type { PayloadKind } from './contracts.js';

export type ScheduleKind = Exclude<PayloadKind, 'test'>;

export interface DesiredSchedule {
  scheduleId: string;
  kind: ScheduleKind;
  accountScope: string;
  authorityConfigVersion: number;
  nextAt: string;
  /** Descriptor object used to compute the deterministic sourceVersion. */
  sourceDescriptor: Record<string, unknown>;
}

export type SyncDecision =
  | { action: 'noop' }
  | { action: 'upsert'; schedule: Omit<ScheduleDocument, 'leaseOwner' | 'leaseExpiresAt'> }
  | { action: 'delete'; scheduleId: string };

/**
 * Decide the write for one desired schedule against the existing document.
 *
 * - No desired schedule (source removed/inactive) + existing -> delete.
 * - Desired + no existing -> upsert.
 * - Desired + existing with a different sourceVersion or generation -> upsert.
 * - Otherwise -> noop (idempotent).
 */
export const decideScheduleSync = (params: {
  desired: DesiredSchedule | null;
  existing: ScheduleDocument | null;
  now: string;
}): SyncDecision => {
  const { desired, existing, now } = params;

  if (!desired) {
    return existing ? { action: 'delete', scheduleId: existing.scheduleId } : { action: 'noop' };
  }

  const sourceVersion = computeSourceVersion(desired.sourceDescriptor);

  if (
    existing &&
    existing.sourceVersion === sourceVersion &&
    existing.authorityConfigVersion === desired.authorityConfigVersion &&
    existing.nextAt === desired.nextAt
  ) {
    return { action: 'noop' };
  }

  return {
    action: 'upsert',
    schedule: {
      scheduleId: desired.scheduleId,
      kind: desired.kind,
      accountScope: desired.accountScope,
      authorityConfigVersion: desired.authorityConfigVersion,
      nextAt: desired.nextAt,
      sourceVersion,
      updatedAt: now,
    },
  };
};

/**
 * Advance a schedule's nextAt after the worker processes it. When there is no
 * further occurrence the schedule is deleted (returns null).
 */
export const advanceSchedule = (params: {
  schedule: ScheduleDocument;
  nextOccurrence: string | null;
  now: string;
}): Omit<ScheduleDocument, 'leaseOwner' | 'leaseExpiresAt'> | null => {
  const { schedule, nextOccurrence, now } = params;
  if (!nextOccurrence) return null;
  return {
    scheduleId: schedule.scheduleId,
    kind: schedule.kind,
    accountScope: schedule.accountScope,
    authorityConfigVersion: schedule.authorityConfigVersion,
    nextAt: nextOccurrence,
    sourceVersion: schedule.sourceVersion,
    updatedAt: now,
  };
};
