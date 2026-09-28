import { describe, it, expect } from 'vitest';
import {
  canaryDigest,
  evaluateControl,
  classifyEnableRerun,
  buildEnabledControl,
  type ControlDocument,
} from '../../src/notifications/deliveryControl.js';

const control = (o: Partial<ControlDocument> = {}): ControlDocument => {
  const uids = o.uids ?? ['u1', 'u2'];
  return {
    enabled: true,
    version: 1,
    uids,
    digest: o.digest ?? canaryDigest(uids),
    ...o,
  };
};

describe('canaryDigest', () => {
  it('is order-independent and lowercase hex', () => {
    expect(canaryDigest(['b', 'a'])).toBe(canaryDigest(['a', 'b']));
    expect(canaryDigest(['a'])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('evaluateControl (fail-closed)', () => {
  it('delivers only to listed UIDs when enabled and well-formed', () => {
    const evalr = evaluateControl(control({ uids: ['u1'] }));
    expect(evalr.deliverTo('u1')).toBe(true);
    expect(evalr.deliverTo('u2')).toBe(false);
  });

  it('delivers to nobody when disabled', () => {
    expect(evaluateControl(control({ enabled: false })).deliverTo('u1')).toBe(false);
  });

  it('treats a missing control as disabled', () => {
    const evalr = evaluateControl(null);
    expect(evalr.wellFormed).toBe(false);
    expect(evalr.deliverTo('u1')).toBe(false);
  });

  it('treats a mismatched digest as disabled', () => {
    expect(evaluateControl(control({ digest: 'wrong' })).deliverTo('u1')).toBe(false);
  });

  it('treats duplicate UIDs as malformed', () => {
    const dup = control({ uids: ['u1', 'u1'] });
    expect(evaluateControl({ ...dup, digest: canaryDigest(['u1', 'u1']) }).wellFormed).toBe(false);
  });

  it('treats an oversized allowlist as malformed', () => {
    const many = Array.from({ length: 1001 }, (_, i) => `u${i}`);
    expect(evaluateControl(control({ uids: many, digest: canaryDigest(many) })).wellFormed).toBe(false);
  });
});

describe('classifyEnableRerun', () => {
  const approved = ['u1', 'u2'];

  it('permits a first enable while still disabled at the original version', () => {
    const c = control({ enabled: false, version: 5, uids: approved });
    expect(classifyEnableRerun({ control: c, originalDisabledVersion: 5, approvedUids: approved, allManifestUsersActiveAtTarget: true }))
      .toEqual({ outcome: 'may-enable' });
  });

  it('classifies a lost-but-succeeded enable as a completed no-op', () => {
    const c = buildEnabledControl({ disabledVersion: 5, approvedUids: approved });
    expect(classifyEnableRerun({ control: c, originalDisabledVersion: 5, approvedUids: approved, allManifestUsersActiveAtTarget: true }))
      .toEqual({ outcome: 'complete-noop' });
  });

  it('aborts when enabled but users are not all active at target', () => {
    const c = buildEnabledControl({ disabledVersion: 5, approvedUids: approved });
    expect(classifyEnableRerun({ control: c, originalDisabledVersion: 5, approvedUids: approved, allManifestUsersActiveAtTarget: false }))
      .toMatchObject({ outcome: 'abort' });
  });

  it('aborts when the enabled digest does not match the approved file', () => {
    const c = buildEnabledControl({ disabledVersion: 5, approvedUids: ['u1', 'u2', 'u3'] });
    expect(classifyEnableRerun({ control: c, originalDisabledVersion: 5, approvedUids: approved, allManifestUsersActiveAtTarget: true }))
      .toMatchObject({ outcome: 'abort' });
  });

  it('aborts on a malformed control', () => {
    expect(classifyEnableRerun({ control: null, originalDisabledVersion: 5, approvedUids: approved, allManifestUsersActiveAtTarget: true }))
      .toMatchObject({ outcome: 'abort' });
  });

  it('aborts on an unexpected version', () => {
    const c = control({ enabled: true, version: 99, uids: approved });
    expect(classifyEnableRerun({ control: c, originalDisabledVersion: 5, approvedUids: approved, allManifestUsersActiveAtTarget: true }))
      .toMatchObject({ outcome: 'abort' });
  });
});

describe('buildEnabledControl', () => {
  it('increments version by one and stores a sorted digest', () => {
    const c = buildEnabledControl({ disabledVersion: 3, approvedUids: ['b', 'a'] });
    expect(c.version).toBe(4);
    expect(c.enabled).toBe(true);
    expect(c.uids).toEqual(['a', 'b']);
    expect(c.digest).toBe(canaryDigest(['a', 'b']));
  });
});
