/**
 * Pure event fan-out logic.
 *
 * Given a canonical backend event revision and the caller's enabled devices,
 * produce one logical delivery record per device, plus the set of older,
 * nonterminal deliveries that MUST be suppressed. No Admin SDK, no I/O — the
 * fan-out module applies these decisions inside a transaction.
 */

import { deliveryIdFor } from './contracts.js';
import type { DeliveryDocument } from './types.js';
import { isTerminalDeliveryState } from './types.js';

export interface FanOutEvent {
  accountScope: string;
  eventId: string;
  eventRevision: number;
  authorityConfigVersion: number;
}

export interface FanOutDevice {
  deviceId: string;
  /** notBefore already computed from quiet hours for this device. */
  notBefore: string;
}

/**
 * Build the pending delivery documents for one event revision across devices.
 * Delivery IDs are deterministic, so re-running fan-out for the same revision
 * yields the same IDs (idempotent create-or-ignore).
 */
export const buildDeliveries = (params: {
  event: FanOutEvent;
  devices: readonly FanOutDevice[];
  now: string;
}): DeliveryDocument[] => {
  const { event, devices, now } = params;
  return devices.map((device) => ({
    deliveryId: deliveryIdFor({
      accountScope: event.accountScope,
      eventId: event.eventId,
      eventRevision: event.eventRevision,
      deviceId: device.deviceId,
    }),
    accountScope: event.accountScope,
    eventId: event.eventId,
    eventRevision: event.eventRevision,
    deviceId: device.deviceId,
    authorityConfigVersion: event.authorityConfigVersion,
    status: 'pending',
    notBefore: device.notBefore,
    attempts: 0,
    lastAttemptAt: null,
    acceptedAt: null,
    failureCode: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    retentionExpiresAt: null,
    updatedAt: now,
  }));
};

/**
 * From the existing deliveries for an event, select those from LOWER revisions
 * that are still nonterminal and must be suppressed before the new revision's
 * deliveries are created.
 */
export const selectDeliveriesToSuppress = (
  existing: readonly DeliveryDocument[],
  newRevision: number,
): DeliveryDocument[] =>
  existing.filter(
    (delivery) => delivery.eventRevision < newRevision && !isTerminalDeliveryState(delivery.status),
  );

/**
 * Should the service worker present this incoming payload? It must ignore a
 * delivery for a revision it has already seen a HIGHER one of, or one already
 * handled. Mirrors the sw.js dedup contract for backend testing.
 */
export const shouldPresentPayload = (params: {
  incomingRevision: number;
  highestSeenRevision: number | null;
  handledDeliveryIds: readonly string[];
  incomingDeliveryId: string;
}): boolean => {
  const { incomingRevision, highestSeenRevision, handledDeliveryIds, incomingDeliveryId } = params;
  if (handledDeliveryIds.includes(incomingDeliveryId)) return false;
  if (highestSeenRevision !== null && incomingRevision < highestSeenRevision) return false;
  return true;
};
