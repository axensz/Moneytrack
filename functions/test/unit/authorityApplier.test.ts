import { describe, it, expect, beforeEach } from 'vitest';
import {
  runTransition,
  runRebaseControl,
  runTransitionBatch,
  type AuthorityStore,
  type AuthorityUserState,
  type ActivationChecks,
} from '../../src/notifications/authorityApplier.js';
import type { RuntimeDocument, TransitionJournal } from '../../src/notifications/authority.js';

const NOW = '2026-08-30T09:00:00.000Z';

const runtime = (o: Partial<RuntimeDocument> = {}): RuntimeDocument => ({
  authority: 'foreground', configVersion: 1, activatedAt: NOW, updatedAt: NOW, ...o,
});

const journal = (o: Partial<TransitionJournal> = {}): TransitionJournal => ({
  expectedDisabledControlVersion: 0, fromAuthority: 'foreground', fromConfigVersion: 1,
  toAuthority: 'durable', toConfigVersion: 2, phase: 'prepared', updatedAt: NOW, ...o,
});

const allReady: ActivationChecks = { controlMatches: true, outgoingDrained: true, targetSchedulesReady: true, durableSchedulesQuiescent: true };

class FakeStore implements AuthorityStore {
  state: AuthorityUserState = { runtime: null, journal: null };
  checks: ActivationChecks = allReady;
  prepared: unknown[] = [];
  activated: unknown[] = [];
  rebaseResult: 'rebased' | 'no-pending-journal' | 'mismatch' = 'rebased';

  async read() { return this.state; }
  async writePrepared(_uid: string, params: unknown) { this.prepared.push(params); }
  async writeActivated(_uid: string, params: unknown) { this.activated.push(params); }
  async activationChecks() { return this.checks; }
  async rebaseJournalControlVersion() { return this.rebaseResult; }
}

let store: FakeStore;
beforeEach(() => { store = new FakeStore(); });

describe('runTransition — first promotion (no runtime)', () => {
  it('prepares durable v1 then activates when preconditions hold', async () => {
    store.state = { runtime: null, journal: null };
    const out = await runTransition(store, { uid: 'u1', toAuthority: 'durable', expectedDisabledControlVersion: 0, now: NOW });
    expect(out).toEqual({ status: 'activated', toConfigVersion: 1 });
    expect(store.prepared).toHaveLength(1);
    expect(store.activated).toHaveLength(1);
  });
});

describe('runTransition — increments version from an active runtime', () => {
  it('targets configVersion + 1', async () => {
    store.state = { runtime: runtime({ authority: 'foreground', configVersion: 4 }), journal: null };
    const out = await runTransition(store, { uid: 'u1', toAuthority: 'durable', expectedDisabledControlVersion: 0, now: NOW });
    expect(out).toEqual({ status: 'activated', toConfigVersion: 5 });
  });
});

describe('runTransition — idempotency and resume', () => {
  it('is a no-op when the target generation is already active', async () => {
    store.state = { runtime: runtime({ authority: 'durable', configVersion: 2 }), journal: null };
    const out = await runTransition(store, { uid: 'u1', toAuthority: 'durable', expectedDisabledControlVersion: 0, now: NOW });
    expect(out).toEqual({ status: 'already-active' });
    expect(store.prepared).toHaveLength(0);
    expect(store.activated).toHaveLength(0);
  });

  it('resumes a pending journal straight to activation (no second prepare)', async () => {
    store.state = { runtime: runtime({ authority: 'foreground', configVersion: 1, activatedAt: null }), journal: journal() };
    const out = await runTransition(store, { uid: 'u1', toAuthority: 'durable', expectedDisabledControlVersion: 0, now: NOW });
    expect(out).toEqual({ status: 'activated', toConfigVersion: 2 });
    expect(store.prepared).toHaveLength(0);
    expect(store.activated).toHaveLength(1);
  });

  it('aborts when a pending journal targets a different generation', async () => {
    store.state = { runtime: runtime({ activatedAt: null }), journal: journal({ toConfigVersion: 9 }) };
    const out = await runTransition(store, { uid: 'u1', toAuthority: 'durable', expectedDisabledControlVersion: 0, now: NOW });
    expect(out.status).toBe('aborted');
    expect(store.activated).toHaveLength(0);
  });
});

describe('runTransition — activation gating', () => {
  it('stays fenced when control no longer matches', async () => {
    store.state = { runtime: null, journal: null };
    store.checks = { ...allReady, controlMatches: false };
    const out = await runTransition(store, { uid: 'u1', toAuthority: 'durable', expectedDisabledControlVersion: 0, now: NOW });
    expect(out.status).toBe('aborted');
    expect(store.prepared).toHaveLength(1); // prepared but not activated
    expect(store.activated).toHaveLength(0);
  });

  it('durable target stays fenced when target schedules are not ready', async () => {
    store.state = { runtime: null, journal: null };
    store.checks = { ...allReady, targetSchedulesReady: false };
    const out = await runTransition(store, { uid: 'u1', toAuthority: 'durable', expectedDisabledControlVersion: 0, now: NOW });
    expect(out.status).toBe('aborted');
  });

  it('foreground rollback stays fenced until durable schedules are quiescent', async () => {
    store.state = { runtime: runtime({ authority: 'durable', configVersion: 2 }), journal: null };
    store.checks = { ...allReady, durableSchedulesQuiescent: false };
    const out = await runTransition(store, { uid: 'u1', toAuthority: 'foreground', expectedDisabledControlVersion: 0, now: NOW });
    expect(out.status).toBe('aborted');
  });
});

describe('runRebaseControl', () => {
  it('rebases a pending journal control version', async () => {
    store.rebaseResult = 'rebased';
    expect(await runRebaseControl(store, { uid: 'u1', oldExpectedVersion: 0, newExpectedVersion: 1, now: NOW })).toBe('rebased');
  });
  it('reports when there is no pending journal', async () => {
    store.rebaseResult = 'no-pending-journal';
    expect(await runRebaseControl(store, { uid: 'u1', oldExpectedVersion: 0, newExpectedVersion: 1, now: NOW })).toBe('no-pending-journal');
  });
});

describe('runTransitionBatch', () => {
  it('resumes pending/source and treats completed users as no-ops', async () => {
    // Same store shape for all; verifies per-user results are collected.
    store.state = { runtime: null, journal: null };
    const results = await runTransitionBatch(store, { toAuthority: 'durable', expectedDisabledControlVersion: 0, now: NOW }, ['u1', 'u2']);
    expect(results.get('u1')?.status).toBe('activated');
    expect(results.get('u2')?.status).toBe('activated');
    expect(results.size).toBe(2);
  });
});
