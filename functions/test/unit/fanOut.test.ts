import { describe, it, expect } from 'vitest';
import {
  buildDeliveries,
  selectDeliveriesToSuppress,
  shouldPresentPayload,
} from '../../src/notifications/fanOut.js';
import { deliveryIdFor, eventIdFor } from '../../src/notifications/contracts.js';
import type { DeliveryDocument } from '../../src/notifications/types.js';

const SCOPE = 'AAAAAAAAAAAAAAAAAAAAAA';
const eventId = eventIdFor('recurring:rent:2026-08');

const delivery = (o: Partial<DeliveryDocument>): DeliveryDocument => ({
  deliveryId: 'd',
  accountScope: SCOPE,
  eventId,
  eventRevision: 1,
  deviceId: 'dev-a',
  authorityConfigVersion: 1,
  status: 'pending',
  notBefore: '2026-08-30T09:00:00.000Z',
  attempts: 0,
  lastAttemptAt: null,
  acceptedAt: null,
  failureCode: null,
  leaseOwner: null,
  leaseExpiresAt: null,
  retentionExpiresAt: null,
  updatedAt: '2026-08-30T09:00:00.000Z',
  ...o,
});

describe('buildDeliveries', () => {
  it('produces one deterministic delivery per device', () => {
    const out = buildDeliveries({
      event: { accountScope: SCOPE, eventId, eventRevision: 2, authorityConfigVersion: 1 },
      devices: [
        { deviceId: 'dev-a', notBefore: '2026-08-30T09:00:00.000Z' },
        { deviceId: 'dev-b', notBefore: '2026-08-30T12:00:00.000Z' },
      ],
      now: '2026-08-30T08:59:00.000Z',
    });
    expect(out).toHaveLength(2);
    expect(out[0].deliveryId).toBe(deliveryIdFor({ accountScope: SCOPE, eventId, eventRevision: 2, deviceId: 'dev-a' }));
    expect(out[1].deliveryId).toBe(deliveryIdFor({ accountScope: SCOPE, eventId, eventRevision: 2, deviceId: 'dev-b' }));
    expect(out.every((d) => d.status === 'pending' && d.attempts === 0)).toBe(true);
    expect(out[1].notBefore).toBe('2026-08-30T12:00:00.000Z');
  });

  it('is idempotent — same inputs yield the same delivery IDs', () => {
    const args = {
      event: { accountScope: SCOPE, eventId, eventRevision: 1, authorityConfigVersion: 1 },
      devices: [{ deviceId: 'dev-a', notBefore: '2026-08-30T09:00:00.000Z' }],
      now: '2026-08-30T08:59:00.000Z',
    } as const;
    expect(buildDeliveries(args)[0].deliveryId).toBe(buildDeliveries(args)[0].deliveryId);
  });
});

describe('selectDeliveriesToSuppress', () => {
  it('selects only lower-revision nonterminal deliveries', () => {
    const existing = [
      delivery({ deliveryId: 'r1-pending', eventRevision: 1, status: 'pending' }),
      delivery({ deliveryId: 'r1-accepted', eventRevision: 1, status: 'accepted' }),
      delivery({ deliveryId: 'r1-sending', eventRevision: 1, status: 'sending' }),
      delivery({ deliveryId: 'r2-pending', eventRevision: 2, status: 'pending' }),
    ];
    const toSuppress = selectDeliveriesToSuppress(existing, 2).map((d) => d.deliveryId);
    expect(toSuppress).toEqual(['r1-pending', 'r1-sending']);
  });
});

describe('shouldPresentPayload', () => {
  it('ignores already-handled deliveries', () => {
    expect(shouldPresentPayload({
      incomingRevision: 2, highestSeenRevision: 1, handledDeliveryIds: ['x'], incomingDeliveryId: 'x',
    })).toBe(false);
  });

  it('ignores an out-of-order lower revision', () => {
    expect(shouldPresentPayload({
      incomingRevision: 1, highestSeenRevision: 3, handledDeliveryIds: [], incomingDeliveryId: 'y',
    })).toBe(false);
  });

  it('presents a new highest revision', () => {
    expect(shouldPresentPayload({
      incomingRevision: 4, highestSeenRevision: 3, handledDeliveryIds: [], incomingDeliveryId: 'z',
    })).toBe(true);
  });

  it('presents the first-ever payload', () => {
    expect(shouldPresentPayload({
      incomingRevision: 1, highestSeenRevision: null, handledDeliveryIds: [], incomingDeliveryId: 'a',
    })).toBe(true);
  });
});
