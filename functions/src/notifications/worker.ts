/**
 * Scheduled-worker orchestration core.
 *
 * Ties schedule evaluation → event/fan-out → delivery dispatch → result commit
 * together over injected store/sender interfaces so the whole flow is
 * unit-testable without the emulator. The v2 `onSchedule` export builds the
 * real Admin-SDK-backed dependencies and calls `runDeliveryPass`.
 *
 * Concurrency: the real worker sets maxInstances=1 / concurrency=1, but leases
 * make overlap safe. Each due delivery is claimed with a bounded lease,
 * dispatched, then its result committed only if the lease is still owned.
 */

import { isDeliveryDue, computeDeliveryResult, type DeliveryPatch } from './deliveryProcessing.js';
import { buildLease, stillOwnsLease, withinRollingHourCeiling, canClaimLease } from './scheduleEvaluation.js';
import type { DeliveryDocument, DeviceDocument } from './types.js';

export interface WorkerClock {
  now(): Date;
}

/** A delivery joined with the device capability needed to dispatch it. */
export interface DispatchableDelivery {
  delivery: DeliveryDocument;
  device: DeviceDocument;
  /** ISO instant of the delivery's first attempt (for the 24h window). */
  firstAttemptAt: string;
}

export interface WorkerStore {
  /** Deliveries due now, bounded page (≤100), for the active generation only. */
  listDueDeliveries(now: Date, limit: number): Promise<DispatchableDelivery[]>;
  /** Timestamps of the user's accepted pushes in the last rolling hour. */
  listRecentAccepted(accountScope: string, now: Date): Promise<string[]>;
  /**
   * Claim a delivery with a lease iff currently claimable. Returns the leased
   * delivery, or null if another worker owns a valid lease.
   */
  claimDelivery(deliveryId: string, worker: string, leaseExpiresAt: string, now: Date): Promise<DeliveryDocument | null>;
  /**
   * Commit a delivery result iff `worker` still owns the lease. Applies the
   * patch, clears the lease, and scrubs the device when `expireDevice`.
   */
  commitDeliveryResult(input: {
    deliveryId: string;
    worker: string;
    patch: DeliveryPatch;
    now: Date;
  }): Promise<'committed' | 'lost-lease'>;
  /** Defer a delivery (rolling-hour ceiling) without an attempt. */
  deferDelivery(deliveryId: string, notBefore: string, now: Date): Promise<void>;
}

export interface WorkerSender {
  send(delivery: DeliveryDocument, device: DeviceDocument): Promise<{ statusCode: number | null }>;
}

export interface RunDeliveryPassConfig {
  store: WorkerStore;
  sender: WorkerSender;
  clock: WorkerClock;
  worker: string;
  /** Lease duration; must exceed a single dispatch's worst case. */
  leaseMs?: number;
  /** Max deliveries processed this pass. */
  pageSize?: number;
  /** Delivery-enabled kill switch checked immediately before each dispatch. */
  isDeliveryEnabled(): Promise<boolean>;
}

export interface DeliveryPassSummary {
  claimed: number;
  dispatched: number;
  deferred: number;
  skipped: number;
  lostLease: number;
  blocked: number;
}

const DEFAULT_LEASE_MS = 120_000;
const DEFAULT_PAGE_SIZE = 100;
const ROLLING_CEILING_BACKOFF_MS = 5 * 60_000;

export const runDeliveryPass = async (config: RunDeliveryPassConfig): Promise<DeliveryPassSummary> => {
  const { store, sender, clock, worker } = config;
  const leaseMs = config.leaseMs ?? DEFAULT_LEASE_MS;
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
  const now = clock.now();

  const summary: DeliveryPassSummary = { claimed: 0, dispatched: 0, deferred: 0, skipped: 0, lostLease: 0, blocked: 0 };

  const due = await store.listDueDeliveries(now, pageSize);

  for (const item of due) {
    if (!isDeliveryDue(item.delivery, now)) {
      summary.skipped += 1;
      continue;
    }

    // Rolling-hour ceiling: defer, never drop.
    const recent = await store.listRecentAccepted(item.delivery.accountScope, now);
    if (!withinRollingHourCeiling(recent, now)) {
      await store.deferDelivery(item.delivery.deliveryId, new Date(now.getTime() + ROLLING_CEILING_BACKOFF_MS).toISOString(), now);
      summary.deferred += 1;
      continue;
    }

    // Claim under lease.
    const lease = buildLease(worker, now, leaseMs);
    const claimed = await store.claimDelivery(item.delivery.deliveryId, worker, lease.leaseExpiresAt!, now);
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }
    summary.claimed += 1;

    // Kill switch is an external-I/O gate: re-check immediately before dispatch.
    if (!(await config.isDeliveryEnabled())) {
      await store.deferDelivery(item.delivery.deliveryId, new Date(now.getTime() + ROLLING_CEILING_BACKOFF_MS).toISOString(), now);
      summary.blocked += 1;
      continue;
    }

    const result = await sender.send(claimed, item.device);
    const patch = computeDeliveryResult({
      delivery: claimed,
      result,
      now: clock.now(),
      firstAttemptAt: new Date(item.firstAttemptAt),
    });

    const outcome = await store.commitDeliveryResult({ deliveryId: claimed.deliveryId, worker, patch, now: clock.now() });
    if (outcome === 'lost-lease') {
      summary.lostLease += 1;
    } else {
      summary.dispatched += 1;
    }
  }

  return summary;
};

/** Re-export for the real store implementation to reuse the claim predicate. */
export { canClaimLease, stillOwnsLease };
