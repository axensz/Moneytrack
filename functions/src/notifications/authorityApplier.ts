/**
 * Authority-transition applier (task 3.4).
 *
 * Orchestrates the resumable, crash-safe two-phase compare-and-set transition
 * over an injected transactional `AuthorityStore`. The pure decisions live in
 * `authority.ts`; this module sequences prepare → activate and the separate
 * `rebase-control` operation, classifying each user so a lost response or crash
 * never allocates a second generation. No Admin SDK here — the CLI adapter
 * supplies a Firestore-backed store.
 */

import {
  classifyTransition,
  nextConfigVersion,
  canActivate,
  type RuntimeDocument,
  type TransitionJournal,
  type RuntimeAuthorityKind,
} from './authority.js';

export interface AuthorityUserState {
  runtime: RuntimeDocument | null;
  journal: TransitionJournal | null;
}

export interface ActivationChecks {
  controlMatches: boolean;
  outgoingDrained: boolean;
  targetSchedulesReady: boolean;
  durableSchedulesQuiescent: boolean;
}

/** Transactional persistence for one user's authority transition. */
export interface AuthorityStore {
  read(uid: string): Promise<AuthorityUserState>;
  /** Phase 1: fence the writer and record the journal (idempotent by target). */
  writePrepared(uid: string, params: {
    fromAuthority: RuntimeAuthorityKind;
    fromConfigVersion: number;
    toAuthority: RuntimeAuthorityKind;
    toConfigVersion: number;
    expectedDisabledControlVersion: number;
    now: string;
  }): Promise<void>;
  /** Phase 2: activate the target generation and clear the journal. */
  writeActivated(uid: string, params: {
    toAuthority: RuntimeAuthorityKind;
    toConfigVersion: number;
    now: string;
  }): Promise<void>;
  /** The live activation preconditions (drain, control match, schedules). */
  activationChecks(uid: string, target: RuntimeAuthorityKind, toConfigVersion: number): Promise<ActivationChecks>;
  /** Rebase only a pending journal's expected control version (no authority change). */
  rebaseJournalControlVersion(uid: string, params: {
    oldExpectedVersion: number;
    newExpectedVersion: number;
    now: string;
  }): Promise<'rebased' | 'no-pending-journal' | 'mismatch'>;
}

export interface TransitionOptions {
  uid: string;
  toAuthority: RuntimeAuthorityKind;
  expectedDisabledControlVersion: number;
  now: string;
}

export type TransitionOutcome =
  | { status: 'activated'; toConfigVersion: number }
  | { status: 'already-active' }
  | { status: 'aborted'; reason: string };

/**
 * Run (or resume) a two-phase transition for one user. Idempotent:
 *  - completed target → no-op (`already-active`),
 *  - pending journal → resume at activate,
 *  - source → prepare, then activate.
 * Activation only proceeds when `canActivate` holds against live checks.
 */
export const runTransition = async (
  store: AuthorityStore,
  opts: TransitionOptions,
): Promise<TransitionOutcome> => {
  const state = await store.read(opts.uid);

  // A pending journal pins the in-flight target. If the operator's requested
  // target does not match that journal, abort rather than resume the wrong one.
  if (state.journal) {
    const requestedVersion = deriveRequestedVersion(state, opts);
    if (
      state.journal.toAuthority !== opts.toAuthority ||
      state.journal.toConfigVersion !== requestedVersion
    ) {
      return { status: 'aborted', reason: 'Pending journal targets a different generation' };
    }
  }

  const toConfigVersion = deriveTargetVersion(state, opts);
  const phase = classifyTransition({
    runtime: state.runtime,
    journal: state.journal,
    target: { authority: opts.toAuthority, configVersion: toConfigVersion },
  });

  if (phase.state === 'completed') {
    return { status: 'already-active' };
  }

  if (phase.state === 'source') {
    await store.writePrepared(opts.uid, {
      fromAuthority: state.runtime?.authority ?? 'foreground',
      fromConfigVersion: state.runtime?.configVersion ?? 0,
      toAuthority: opts.toAuthority,
      toConfigVersion,
      expectedDisabledControlVersion: opts.expectedDisabledControlVersion,
      now: opts.now,
    });
  }

  // Phase 2: activate iff the live preconditions hold.
  const checks = await store.activationChecks(opts.uid, opts.toAuthority, toConfigVersion);
  if (!canActivate({ target: opts.toAuthority, ...checks })) {
    return { status: 'aborted', reason: 'Activation preconditions not met (still fenced)' };
  }

  await store.writeActivated(opts.uid, {
    toAuthority: opts.toAuthority,
    toConfigVersion,
    now: opts.now,
  });
  return { status: 'activated', toConfigVersion };
};

/**
 * The version the operator's request would target IGNORING any journal — used
 * to detect a pending journal that belongs to a different generation.
 */
const deriveRequestedVersion = (state: AuthorityUserState, opts: TransitionOptions): number => {
  if (
    state.runtime &&
    state.runtime.authority === opts.toAuthority &&
    state.runtime.activatedAt !== null
  ) {
    return state.runtime.configVersion;
  }
  return nextConfigVersion(state.runtime);
};

/** Resolve the target configVersion to act on: a pending journal pins it. */
const deriveTargetVersion = (state: AuthorityUserState, opts: TransitionOptions): number => {
  if (state.journal) return state.journal.toConfigVersion;
  return deriveRequestedVersion(state, opts);
};

/**
 * Rebase a stranded pending journal to a newly approved disabled control
 * version WITHOUT activating authority or mutating control/schedules. This
 * unblocks a control race that changed the live version while a journal was
 * fenced.
 */
export const runRebaseControl = async (
  store: AuthorityStore,
  params: { uid: string; oldExpectedVersion: number; newExpectedVersion: number; now: string },
): Promise<'rebased' | 'no-pending-journal' | 'mismatch'> =>
  store.rebaseJournalControlVersion(params.uid, {
    oldExpectedVersion: params.oldExpectedVersion,
    newExpectedVersion: params.newExpectedVersion,
    now: params.now,
  });

/**
 * Run a batch of users, resuming only pending/source users and treating
 * completed ones as no-ops. A single aborted user does not abort the batch;
 * the caller inspects per-user outcomes.
 */
export const runTransitionBatch = async (
  store: AuthorityStore,
  base: Omit<TransitionOptions, 'uid'>,
  uids: readonly string[],
): Promise<Map<string, TransitionOutcome>> => {
  const results = new Map<string, TransitionOutcome>();
  for (const uid of uids) {
    results.set(uid, await runTransition(store, { ...base, uid }));
  }
  return results;
};
