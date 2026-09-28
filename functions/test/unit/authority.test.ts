import { describe, it, expect } from 'vitest';
import {
  foregroundGuestPrefix,
  foregroundCompatPrefix,
  foregroundGenerationPrefix,
  outgoingDrainPrefixes,
  resolveWriter,
  classifyTransition,
  nextConfigVersion,
  canActivate,
  type RuntimeDocument,
  type TransitionJournal,
} from '../../src/notifications/authority.js';

const runtime = (o: Partial<RuntimeDocument> = {}): RuntimeDocument => ({
  authority: 'foreground',
  configVersion: 1,
  activatedAt: '2026-08-30T09:00:00.000Z',
  updatedAt: '2026-08-30T09:00:00.000Z',
  ...o,
});

describe('event namespaces', () => {
  it('separates guest, compat, and versioned foreground prefixes', () => {
    expect(foregroundGuestPrefix()).toBe('foreground:guest:');
    expect(foregroundCompatPrefix()).toBe('foreground:compat:');
    expect(foregroundGenerationPrefix(3)).toBe('foreground:v3:');
  });
});

describe('outgoingDrainPrefixes', () => {
  it('drains only compat on a runtime-absent first promotion', () => {
    expect(outgoingDrainPrefixes({ fromAuthority: 'foreground', fromConfigVersion: 1, runtimeAbsent: true }))
      .toEqual(['foreground:compat:']);
  });
  it('drains the three bare kind prefixes for a durable source', () => {
    expect(outgoingDrainPrefixes({ fromAuthority: 'durable', fromConfigVersion: 2, runtimeAbsent: false }))
      .toEqual(['daily-expense:', 'recurring:', 'debt:']);
  });
  it('drains the three versioned foreground prefixes for an active foreground source', () => {
    expect(outgoingDrainPrefixes({ fromAuthority: 'foreground', fromConfigVersion: 4, runtimeAbsent: false }))
      .toEqual(['foreground:v4:daily-expense:', 'foreground:v4:recurring:', 'foreground:v4:debt:']);
  });
});

describe('resolveWriter', () => {
  it('guests always write the guest namespace', () => {
    expect(resolveWriter({ kind: 'guest' })).toEqual({
      mayWriteForeground: true, prefix: 'foreground:guest:', durableOwnsTimeEvents: false,
    });
  });

  it('uses compatibility only before a generation is known', () => {
    expect(resolveWriter({ kind: 'authenticated', runtime: null, lastConfirmedAuthority: null })).toEqual({
      mayWriteForeground: true, prefix: 'foreground:compat:', durableOwnsTimeEvents: false,
    });
  });

  it('does not write when the last confirmed authority was durable and runtime is unknown', () => {
    const d = resolveWriter({ kind: 'authenticated', runtime: null, lastConfirmedAuthority: 'durable' });
    expect(d.mayWriteForeground).toBe(false);
    expect(d.durableOwnsTimeEvents).toBe(true);
  });

  it('writes under the versioned foreground prefix when active foreground', () => {
    const d = resolveWriter({ kind: 'authenticated', runtime: runtime({ authority: 'foreground', configVersion: 2 }), lastConfirmedAuthority: 'foreground' });
    expect(d).toEqual({ mayWriteForeground: true, prefix: 'foreground:v2:', durableOwnsTimeEvents: false });
  });

  it('does not write when durable is active (backend owns events)', () => {
    const d = resolveWriter({ kind: 'authenticated', runtime: runtime({ authority: 'durable' }), lastConfirmedAuthority: 'durable' });
    expect(d.mayWriteForeground).toBe(false);
    expect(d.durableOwnsTimeEvents).toBe(true);
  });

  it('fences the foreground writer during an unactivated transition', () => {
    const d = resolveWriter({ kind: 'authenticated', runtime: runtime({ authority: 'durable', activatedAt: null }), lastConfirmedAuthority: 'foreground' });
    expect(d.mayWriteForeground).toBe(false);
  });
});

describe('classifyTransition', () => {
  const target = { authority: 'durable' as const, configVersion: 2 };

  it('is source when there is no journal and runtime is not the target', () => {
    expect(classifyTransition({ runtime: runtime(), journal: null, target })).toEqual({ state: 'source' });
  });

  it('is pending when a journal exists', () => {
    const journal: TransitionJournal = {
      expectedDisabledControlVersion: 0, fromAuthority: 'foreground', fromConfigVersion: 1,
      toAuthority: 'durable', toConfigVersion: 2, phase: 'prepared', updatedAt: 'now',
    };
    expect(classifyTransition({ runtime: runtime(), journal, target })).toEqual({ state: 'pending', journal });
  });

  it('is completed when runtime is exactly the active target and no journal', () => {
    expect(classifyTransition({ runtime: runtime({ authority: 'durable', configVersion: 2 }), journal: null, target }))
      .toEqual({ state: 'completed' });
  });

  it('is source (not completed) when the target generation is not yet activated', () => {
    expect(classifyTransition({ runtime: runtime({ authority: 'durable', configVersion: 2, activatedAt: null }), journal: null, target }))
      .toEqual({ state: 'source' });
  });
});

describe('nextConfigVersion', () => {
  it('is 1 for a runtime-absent first promotion', () => {
    expect(nextConfigVersion(null)).toBe(1);
  });
  it('increments the current version otherwise', () => {
    expect(nextConfigVersion(runtime({ configVersion: 4 }))).toBe(5);
  });
});

describe('canActivate', () => {
  it('requires control match and drain regardless of target', () => {
    expect(canActivate({ target: 'durable', controlMatches: false, outgoingDrained: true, targetSchedulesReady: true, durableSchedulesQuiescent: true })).toBe(false);
    expect(canActivate({ target: 'durable', controlMatches: true, outgoingDrained: false, targetSchedulesReady: true, durableSchedulesQuiescent: true })).toBe(false);
  });

  it('durable target requires ready target schedules', () => {
    expect(canActivate({ target: 'durable', controlMatches: true, outgoingDrained: true, targetSchedulesReady: true, durableSchedulesQuiescent: false })).toBe(true);
    expect(canActivate({ target: 'durable', controlMatches: true, outgoingDrained: true, targetSchedulesReady: false, durableSchedulesQuiescent: true })).toBe(false);
  });

  it('foreground target requires quiescent durable schedules', () => {
    expect(canActivate({ target: 'foreground', controlMatches: true, outgoingDrained: true, targetSchedulesReady: false, durableSchedulesQuiescent: true })).toBe(true);
    expect(canActivate({ target: 'foreground', controlMatches: true, outgoingDrained: true, targetSchedulesReady: true, durableSchedulesQuiescent: false })).toBe(false);
  });
});
