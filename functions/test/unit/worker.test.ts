import { describe, it, expect, beforeEach } from 'vitest';
import {
  runDeliveryPass,
  type WorkerStore,
  type WorkerSender,
  type DispatchableDelivery,
} from '../../src/notifications/worker.js';
import type { DeliveryDocument, DeviceDocument } from '../../src/notifications/types.js';
import type { DeliveryPatch } from '../../src/notifications/deliveryProcessing.js';

const NOW = new Date('2026-08-30T09:00:00.000Z');

const device = (): DeviceDocument => ({
  deviceId: 'dev-a', accountScope: 'AAAAAAAAAAAAAAAAAAAAAA', enabled: true, platform: 'android',
  serviceWorkerScope: '/', endpoint: 'https://push/x', endpointHash: 'h', p256dh: 'p', auth: 'a',
  capabilityFingerprint: 'f', createdAt: '', updatedAt: '', lastAcceptedAt: null, lastFailureCode: null, disabledAt: null,
});

const delivery = (o: Partial<DeliveryDocument> = {}): DeliveryDocument => ({
  deliveryId: 'd1', accountScope: 'AAAAAAAAAAAAAAAAAAAAAA', eventId: 'e1', eventRevision: 1, deviceId: 'dev-a',
  authorityConfigVersion: 1, status: 'pending', notBefore: '2026-08-30T08:00:00.000Z', attempts: 0,
  lastAttemptAt: null, acceptedAt: null, failureCode: null, leaseOwner: null, leaseExpiresAt: null,
  retentionExpiresAt: null, updatedAt: '', ...o,
});

class FakeStore implements WorkerStore {
  due: DispatchableDelivery[] = [];
  recentAccepted: string[] = [];
  claimable = true;
  commitResult: 'committed' | 'lost-lease' = 'committed';
  commits: Array<{ deliveryId: string; patch: DeliveryPatch }> = [];
  deferrals: string[] = [];

  async listDueDeliveries() { return this.due; }
  async listRecentAccepted() { return this.recentAccepted; }
  async claimDelivery(deliveryId: string, worker: string, leaseExpiresAt: string) {
    return this.claimable ? { ...delivery({ deliveryId }), leaseOwner: worker, leaseExpiresAt } : null;
  }
  async commitDeliveryResult(input: { deliveryId: string; patch: DeliveryPatch }) {
    this.commits.push({ deliveryId: input.deliveryId, patch: input.patch });
    return this.commitResult;
  }
  async deferDelivery(deliveryId: string) { this.deferrals.push(deliveryId); }
}

const sender = (statusCode: number | null): WorkerSender => ({ send: async () => ({ statusCode }) });
const clock = { now: () => NOW };
const enabled = async () => true;
const disabled = async () => false;
const dispatchable = (o: Partial<DeliveryDocument> = {}): DispatchableDelivery => ({
  delivery: delivery(o), device: device(), uid: 'u1', firstAttemptAt: NOW.toISOString(),
});

let store: FakeStore;
beforeEach(() => { store = new FakeStore(); });

describe('runDeliveryPass', () => {
  it('dispatches a due delivery and commits an accepted result', async () => {
    store.due = [dispatchable()];
    const summary = await runDeliveryPass({ store, sender: sender(201), clock, worker: 'w1', isDeliveryEnabled: enabled });
    expect(summary.dispatched).toBe(1);
    expect(store.commits[0].patch.status).toBe('accepted');
  });

  it('skips a delivery that is not actually due', async () => {
    store.due = [dispatchable({ notBefore: '2026-08-30T10:00:00.000Z' })];
    const summary = await runDeliveryPass({ store, sender: sender(201), clock, worker: 'w1', isDeliveryEnabled: enabled });
    expect(summary.skipped).toBe(1);
    expect(store.commits).toHaveLength(0);
  });

  it('defers when the rolling-hour ceiling is reached', async () => {
    store.due = [dispatchable()];
    store.recentAccepted = Array.from({ length: 60 }, () => NOW.toISOString());
    const summary = await runDeliveryPass({ store, sender: sender(201), clock, worker: 'w1', isDeliveryEnabled: enabled });
    expect(summary.deferred).toBe(1);
    expect(store.deferrals).toContain('d1');
    expect(store.commits).toHaveLength(0);
  });

  it('skips a delivery it cannot claim (another worker owns the lease)', async () => {
    store.due = [dispatchable()];
    store.claimable = false;
    const summary = await runDeliveryPass({ store, sender: sender(201), clock, worker: 'w1', isDeliveryEnabled: enabled });
    expect(summary.claimed).toBe(0);
    expect(summary.skipped).toBe(1);
  });

  it('blocks dispatch and defers when the kill switch is off, after claiming', async () => {
    store.due = [dispatchable()];
    const summary = await runDeliveryPass({ store, sender: sender(201), clock, worker: 'w1', isDeliveryEnabled: disabled });
    expect(summary.claimed).toBe(1);
    expect(summary.blocked).toBe(1);
    expect(store.deferrals).toContain('d1');
    expect(store.commits).toHaveLength(0);
  });

  it('records lost-lease when the result commit no longer owns the lease', async () => {
    store.due = [dispatchable()];
    store.commitResult = 'lost-lease';
    const summary = await runDeliveryPass({ store, sender: sender(201), clock, worker: 'w1', isDeliveryEnabled: enabled });
    expect(summary.lostLease).toBe(1);
    expect(summary.dispatched).toBe(0);
  });

  it('commits an ambiguous patch for a lost push result without claiming acceptance', async () => {
    store.due = [dispatchable()];
    await runDeliveryPass({ store, sender: sender(null), clock, worker: 'w1', isDeliveryEnabled: enabled });
    expect(store.commits[0].patch.status).toBe('ambiguous');
    expect(store.commits[0].patch.acceptedAt).toBeNull();
  });
});
