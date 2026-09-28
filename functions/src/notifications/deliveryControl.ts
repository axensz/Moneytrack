/**
 * Pure delivery-control (kill switch) logic.
 *
 * `DELIVERY_ENABLED` plus a canonical canary allowlist form an EXTERNAL-delivery
 * gate — never an inbox/fan-out gate. The control document stores a sorted UID
 * array and its lowercase SHA-256 digest; every backend read recomputes the
 * digest and treats a missing, malformed, duplicate, oversized, or mismatched
 * control as disabled (fail-closed). No Admin SDK, no I/O.
 */

import { createHash } from 'node:crypto';

const MAX_CANARY_UIDS = 1000;

/** Canonical digest of a UID allowlist: sort by code unit, hash UTF-8 JSON. */
export const canaryDigest = (uids: readonly string[]): string => {
  const sorted = [...uids].sort();
  return createHash('sha256').update(JSON.stringify(sorted), 'utf8').digest('hex');
};

export interface ControlDocument {
  enabled: boolean;
  /** Monotonic version; a compare-and-increment enable moves it by exactly one. */
  version: number;
  uids: string[];
  digest: string;
}

export interface ControlEvaluation {
  /** True only when control is well-formed, enabled, and includes the UID. */
  deliverTo: (uid: string) => boolean;
  /** True when the control document is well-formed (regardless of enabled). */
  wellFormed: boolean;
}

const isWellFormed = (control: ControlDocument | null): control is ControlDocument => {
  if (!control) return false;
  if (typeof control.enabled !== 'boolean') return false;
  if (!Number.isInteger(control.version) || control.version < 0) return false;
  if (!Array.isArray(control.uids)) return false;
  if (control.uids.length > MAX_CANARY_UIDS) return false;
  if (new Set(control.uids).size !== control.uids.length) return false; // duplicates
  if (typeof control.digest !== 'string') return false;
  return canaryDigest(control.uids) === control.digest;
};

/**
 * Evaluate a control document fail-closed. A malformed/missing control delivers
 * to nobody; a well-formed disabled control also delivers to nobody.
 */
export const evaluateControl = (control: ControlDocument | null): ControlEvaluation => {
  const wellFormed = isWellFormed(control);
  if (!wellFormed || !control!.enabled) {
    return { wellFormed, deliverTo: () => false };
  }
  const allow = new Set(control!.uids);
  return { wellFormed, deliverTo: (uid: string) => allow.has(uid) };
};

// ── Lost-response enable classification ──────────────────────────────────────
export type EnableRerunOutcome =
  | { outcome: 'complete-noop' } // the enable already succeeded; do nothing
  | { outcome: 'may-enable' } // still at the disabled version; a first enable may proceed
  | { outcome: 'abort'; reason: string }; // any other state

/**
 * Classify a possibly-lost enable rerun. It is a completed no-op ONLY when:
 *  - control is true at exactly the original disabled version + 1,
 *  - its UID count and digest match the same approved file, and
 *  - the caller has verified every manifest user active at the target generation.
 * Still-disabled at the original version -> may enable. Anything else aborts
 * without a second mutation.
 */
export const classifyEnableRerun = (params: {
  control: ControlDocument | null;
  originalDisabledVersion: number;
  approvedUids: readonly string[];
  allManifestUsersActiveAtTarget: boolean;
}): EnableRerunOutcome => {
  const { control, originalDisabledVersion, approvedUids, allManifestUsersActiveAtTarget } = params;

  if (!isWellFormed(control)) {
    return { outcome: 'abort', reason: 'Control is malformed' };
  }

  const approvedDigest = canaryDigest(approvedUids);

  // Still disabled at the exact original version: a first enable may proceed.
  if (!control.enabled && control.version === originalDisabledVersion) {
    return { outcome: 'may-enable' };
  }

  // Enabled at exactly original+1 with the matching file and verified users.
  if (
    control.enabled &&
    control.version === originalDisabledVersion + 1 &&
    control.uids.length === approvedUids.length &&
    control.digest === approvedDigest &&
    allManifestUsersActiveAtTarget
  ) {
    return { outcome: 'complete-noop' };
  }

  return { outcome: 'abort', reason: 'Control is in an unexpected state' };
};

/** Build the enabled control document (compare-and-increment from disabled). */
export const buildEnabledControl = (params: {
  disabledVersion: number;
  approvedUids: readonly string[];
}): ControlDocument => {
  const uids = [...params.approvedUids].sort();
  return {
    enabled: true,
    version: params.disabledVersion + 1,
    uids,
    digest: canaryDigest(uids),
  };
};
