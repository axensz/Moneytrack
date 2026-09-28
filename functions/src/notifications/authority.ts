/**
 * Pure runtime-authority model and two-phase CAS transition logic.
 *
 * No Admin SDK, no I/O. Encodes:
 *  - the runtime document shape (authority + monotonic configVersion),
 *  - the deterministic event namespaces per authority/generation,
 *  - the phase classification for a resumable, crash-safe transition,
 *  - and the exact preconditions each phase must satisfy.
 *
 * The Firestore applier (added separately) runs these decisions inside
 * compare-and-set transactions. Keeping them pure makes every branch and race
 * classification unit-testable.
 */

export type RuntimeAuthorityKind = 'foreground' | 'durable';

/**
 * Server-owned, client-readable runtime document. `activatedAt` is null while a
 * transition is fenced. `configVersion` increases monotonically; only one
 * (authority, configVersion) generation is active at a time.
 */
export interface RuntimeDocument {
  authority: RuntimeAuthorityKind;
  configVersion: number;
  /** Null while a transition is fenced (prepare phase committed, not activated). */
  activatedAt: string | null;
  updatedAt: string;
}

/** Private per-user transition journal recording an in-flight two-phase CAS. */
export interface TransitionJournal {
  /** The control version expected to be disabled/false at prepare time. */
  expectedDisabledControlVersion: number;
  fromAuthority: RuntimeAuthorityKind;
  fromConfigVersion: number;
  toAuthority: RuntimeAuthorityKind;
  toConfigVersion: number;
  phase: 'prepared' | 'activated';
  updatedAt: string;
}

// ── Event namespaces ─────────────────────────────────────────────────────────
/**
 * Deterministic event-key prefix for a time-based writer. Foreground and durable
 * writers never share a namespace, and each foreground generation is versioned.
 */
export const foregroundGuestPrefix = (): string => 'foreground:guest:';

export const foregroundCompatPrefix = (): string => 'foreground:compat:';

export const foregroundGenerationPrefix = (configVersion: number): string =>
  `foreground:v${configVersion}:`;

/** Backend (durable) events use the bare canonical prefixes. */
export const DURABLE_KIND_PREFIXES = ['daily-expense:', 'recurring:', 'debt:'] as const;

/**
 * The exact set of event-key prefixes a transition must drain when leaving an
 * outgoing generation.
 *   - runtime-absent first promotion: only `foreground:compat:*`
 *   - active foreground vN: the three `foreground:vN:{kind}:*` prefixes
 *   - durable: the three bare `{kind}:*` prefixes
 */
export const outgoingDrainPrefixes = (params: {
  fromAuthority: RuntimeAuthorityKind;
  fromConfigVersion: number;
  runtimeAbsent: boolean;
}): string[] => {
  if (params.runtimeAbsent) return [foregroundCompatPrefix()];
  if (params.fromAuthority === 'durable') {
    return DURABLE_KIND_PREFIXES.map((kind) => kind);
  }
  const base = foregroundGenerationPrefix(params.fromConfigVersion);
  return ['daily-expense', 'recurring', 'debt'].map((kind) => `${base}${kind}:`);
};

// ── Authority matrix for time-based writers ─────────────────────────────────
export type WriterContext =
  | { kind: 'guest' }
  | { kind: 'authenticated'; runtime: RuntimeDocument | null; lastConfirmedAuthority: RuntimeAuthorityKind | null };

export interface WriterDecision {
  /** May the client foreground writer evaluate/write time-based events now? */
  mayWriteForeground: boolean;
  /** The exact event-key prefix the foreground writer must stamp, if allowed. */
  prefix: string | null;
  /** Whether the durable backend owns time-based events for this user. */
  durableOwnsTimeEvents: boolean;
}

/**
 * Resolve which time-based writer is authoritative.
 *
 *  - guest: always foreground with the guest namespace.
 *  - authenticated + no runtime known yet: compatibility foreground (only before
 *    a runtime generation is known); a transient status failure keeps the last
 *    confirmed authority.
 *  - authenticated + active foreground vN: foreground writes under vN.
 *  - authenticated + active durable: backend owns; foreground does NOT write.
 *  - authenticated + fenced transition (activatedAt null): foreground does NOT
 *    write (the writer is fenced during a transition).
 */
export const resolveWriter = (ctx: WriterContext): WriterDecision => {
  if (ctx.kind === 'guest') {
    return { mayWriteForeground: true, prefix: foregroundGuestPrefix(), durableOwnsTimeEvents: false };
  }

  const { runtime, lastConfirmedAuthority } = ctx;

  if (!runtime) {
    // Runtime unknown. Only use compatibility before any generation is known,
    // unless a prior confirmed authority says durable (then do not write).
    if (lastConfirmedAuthority === 'durable') {
      return { mayWriteForeground: false, prefix: null, durableOwnsTimeEvents: true };
    }
    return { mayWriteForeground: true, prefix: foregroundCompatPrefix(), durableOwnsTimeEvents: false };
  }

  // A fenced transition (activatedAt null) fences the foreground writer too.
  if (runtime.activatedAt === null) {
    return { mayWriteForeground: false, prefix: null, durableOwnsTimeEvents: runtime.authority === 'durable' };
  }

  if (runtime.authority === 'durable') {
    return { mayWriteForeground: false, prefix: null, durableOwnsTimeEvents: true };
  }

  return {
    mayWriteForeground: true,
    prefix: foregroundGenerationPrefix(runtime.configVersion),
    durableOwnsTimeEvents: false,
  };
};

// ── Two-phase transition classification (resumable / crash-safe) ─────────────
export interface TransitionRequest {
  toAuthority: RuntimeAuthorityKind;
  /** The control version expected disabled at prepare time. */
  expectedDisabledControlVersion: number;
}

export type TransitionPhaseState =
  | { state: 'source' } // no journal; a prepare may begin
  | { state: 'pending'; journal: TransitionJournal } // prepared, not activated
  | { state: 'completed' }; // target already active at target generation, no journal

/**
 * Classify a user's current transition state from its runtime + journal. This
 * lets a resumed run recognize a completed target (no-op) vs a pending target
 * (resume) vs a fresh source (begin), so a post-activation crash never allocates
 * a second generation.
 */
export const classifyTransition = (params: {
  runtime: RuntimeDocument | null;
  journal: TransitionJournal | null;
  target: { authority: RuntimeAuthorityKind; configVersion: number };
}): TransitionPhaseState => {
  const { runtime, journal, target } = params;

  if (journal) {
    return { state: 'pending', journal };
  }

  // No journal: completed iff runtime is exactly the target generation, active.
  if (
    runtime &&
    runtime.authority === target.authority &&
    runtime.configVersion === target.configVersion &&
    runtime.activatedAt !== null
  ) {
    return { state: 'completed' };
  }

  return { state: 'source' };
};

/**
 * The next configVersion for a transition. A first promotion with no runtime
 * treats compatibility as foreground version `null` and prepares durable v1;
 * otherwise the target increments the current version.
 */
export const nextConfigVersion = (runtime: RuntimeDocument | null): number =>
  runtime ? runtime.configVersion + 1 : 1;

/**
 * Preconditions for the FINAL activation transaction, per target authority.
 *  - durable target: every prepared target schedule must be present/verified and
 *    no outgoing nonterminal work may remain (drain complete).
 *  - foreground target: no durable schedule may be active or leased (all paused
 *    and lease-free), and it promotes no schedule.
 * `controlMatches` asserts the live control still equals the expected disabled
 * version recorded at prepare time.
 */
export const canActivate = (params: {
  target: RuntimeAuthorityKind;
  controlMatches: boolean;
  outgoingDrained: boolean;
  targetSchedulesReady: boolean;
  durableSchedulesQuiescent: boolean;
}): boolean => {
  if (!params.controlMatches || !params.outgoingDrained) return false;
  return params.target === 'durable'
    ? params.targetSchedulesReady
    : params.durableSchedulesQuiescent;
};
