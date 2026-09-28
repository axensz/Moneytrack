# Durable Notifications and Recurring Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Track progress with the checkbox (`- [ ]`) steps and keep every commit green.

**Goal:** Make authenticated daily-expense, recurring-payment, and debt reminders durable enough to reach a supported installed PWA while MoneyTrack is closed, without changing financial calculations, weakening the static PWA, or duplicating the existing foreground inbox lifecycle.

**Architecture:** Keep the Next.js frontend as a static export. Add an isolated Node.js 22 Firebase Functions v2 package that derives schedules from authoritative Firestore data, persists one canonical inbox event, fans it out to deterministic per-device deliveries, and sends standards-based Web Push. A native browser boundary manages only the current device and a hardened service worker validates, deduplicates, displays, and routes private constant-copy payloads. A server-owned per-user authority generation and a two-phase compare-and-set handoff ensure that the foreground fallback and durable backend are never active writers at the same time.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript 5.9, Firebase Web SDK, Firestore, Firebase Functions v2 on Node.js 22 in `us-central1`, Firebase Admin 14.3.0, `firebase-functions` 7.3.2, `web-push` 3.6.7, Vitest 4.1.8, Testing Library, Firebase Emulator Suite, ESLint 9.39.4.

**Spec:** `openspec/changes/harden-notification-delivery-and-recurring-reminders/` — proposal, design, tasks, `specs/notification-delivery/spec.md`, and `specs/recurring-reminder-reliability/spec.md`.

## Global Constraints

- Read `PRODUCT.md` and `DESIGN.md` before changing notification UI. Preserve “The Confident Ledger,” the existing violet brand, solid-on-muted status pairs, and 44–48 CSS-pixel targets. Add no generic dashboard, glass surface, nested-card pattern, or gradient outside `.btn-primary` and `.card-balance`.
- Use code-review-graph before scanning implementation files and again for final impact, affected-flow, and test-coverage review.
- Follow RED → observe the expected failure → minimal GREEN for every production behavior. Do not create deliberately red commits.
- Preserve the static Next.js export. Keep all backend runtime dependencies inside `functions/`; exclude `functions/**` from root TypeScript and ESLint traversal.
- Do not change balances, payment completion, debt settlement, transaction atomicity, recurring financial semantics, or any canonical ledger calculation.
- Guests retain local inbox and foreground system behavior. Authenticated budget, low-balance, unusual-spending, and other transaction-triggered alerts remain foreground-only and never acquire `deliverySource: 'backend'`.
- Durable scope is limited to daily-expense, recurring-payment, and debt time reminders.
- A financial mutation succeeds or fails on its own authority. Notification recomputation after payment/link/unlink is best-effort and must never roll back the financial write.
- Never log raw notification payloads, subscription endpoints, `p256dh`, `auth`, VAPID private material, account/debt/payment names, amounts, merchant text, or unsanitized push-service errors. Never persist raw payload bodies or identifying financial copy outside the canonical authenticated inbox. Endpoint/`p256dh`/`auth` capabilities may exist only in denied server-side device documents while active and are scrubbed immediately on revoke/rebind/expiry; the production VAPID private key exists only in Secret Manager (plus the short-lived validated upload file), never in Firestore or the repository.
- `accountScope` is a server-generated random 128-bit base64url value (22 characters), persisted once per user in the server-only runtime-private document; no payload, tag, delivery ID, or log exposes the Firebase UID.
- Client code never reads or writes device capability documents directly. It uses authenticated callables and receives sanitized status only.
- Treat missing or invalid `notificationControl/config` as `DELIVERY_ENABLED = false`. External push/test adapter I/O also requires the UID in the bounded canonical server allowlist with a valid recomputed digest; this gate does not block active-durable schedule evaluation, canonical inbox state, or deterministic pending fan-out.
- Every time-based event, schedule, lease, and delivery is admitted by one active `authorityConfigVersion`. A fenced runtime (`activatedAt: null`) admits neither writer.
- Runtime absent preserves pre-rollout compatibility. Before this browser has ever confirmed a sanitized device-status response for the current UID, that compatibility state may keep the existing local foreground OS gate while the backend callables are not yet deployed or reachable; it never creates/registers a PushSubscription and never promises closed-page delivery. Persist a bounded account-scoped `backendConfirmed` bit after the first successful status/register response and never return that account to the legacy gate. Once a runtime document exists, Firestore rules reject legacy time-event writes without the exact active foreground generation.
- Durable → foreground rollback remains fenced until every dispatch-started outgoing delivery has passed its persisted `possibleAcceptanceExpiresAt`, regardless of accepted, ambiguous, sending, or stale final state; an externally accepted push cannot be revoked.
- Use the live-verified Firestore location `nam5` and its documented nearby Functions region `us-central1`, but re-read project/location and obtain explicit billing/deployment approval immediately before any production mutation.
- No production deploy, API enablement, billing change, secret creation, TTL activation, canary activation, commit push, or release is authorized by this plan.
- Preserve unrelated tracked and untracked user files. Never use destructive Git cleanup.

## File Map

### Existing specification and root configuration

- Modify: `openspec/changes/harden-notification-delivery-and-recurring-reminders/{proposal.md,design.md,tasks.md}`
- Modify: `openspec/changes/harden-notification-delivery-and-recurring-reminders/specs/notification-delivery/spec.md`
- Modify: `openspec/changes/harden-notification-delivery-and-recurring-reminders/specs/recurring-reminder-reliability/spec.md`
- Modify: `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`
- Modify: `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.env.example`
- Modify: `.github/workflows/nextjs.yml`
- Create: `docs/runbooks/durable-notifications.md`
- Create: `scripts/verify-notification-vapid-artifact.mjs`, `scripts/verify-firestore-notification-infrastructure.mjs`
- Create: `scripts/__tests__/verify-notification-vapid-artifact.test.mjs`, `scripts/__tests__/verify-firestore-notification-infrastructure.test.mjs`

### Frontend domain, monitors, and persistence

- Modify: `src/types/finance.ts`
- Modify: `src/utils/notificationEventLifecycle.ts`, `src/utils/recurringDates.ts`
- Create: `src/utils/recurringReminderCursor.ts`, `src/utils/notificationAuthority.ts`
- Create: `src/lib/recurringReminderCursorStore.ts`
- Modify: `src/hooks/useNotificationStore.ts`, `src/hooks/useNotificationMonitoring.ts`, `src/hooks/useDailyExpenseReminder.ts`, `src/hooks/useNotifications.ts`
- Modify: `src/hooks/firestore/useFirestoreSubscriptions.ts`, `src/hooks/useFinanceSelectors.ts`
- Create: `src/hooks/useNotificationAuthority.ts`
- Modify: `src/services/PaymentMonitor.ts`, `src/services/DebtMonitor.ts`, `src/services/BudgetMonitor.ts`, `src/services/NotificationManager.ts`
- Modify: `src/contexts/FinanceContext.tsx`, `src/components/layout/FinanceNotificationBridge.tsx`

### Current-device Web Push and notification UX

- Create: `src/lib/webPush.ts`, `src/lib/notificationDeviceApi.ts`
- Create: `src/hooks/useCurrentDeviceNotifications.ts`
- Modify: `src/contexts/NotificationContext.tsx`, `src/AuthenticatedApp.tsx`
- Modify: `src/components/notifications/NotificationCenter.tsx`
- Modify: `src/components/notifications/NotificationPreferences.tsx`
- Modify: `src/components/modals/NotificationPreferencesModal.tsx`
- Modify: `public/sw.js`

### Isolated backend

- Create: `functions/package.json`, `functions/package-lock.json`
- Create: `functions/tsconfig.json`, `functions/vitest.config.ts`, `functions/eslint.config.mjs`
- Create: `functions/.gitignore`
- Create: `functions/src/index.ts`, `functions/src/adminApp.ts`
- Create: `functions/src/admin/cliRuntime.ts`
- Create: `functions/src/notifications/contracts.ts`, `control.ts`, `authority.ts`, `eventLifecycle.ts`
- Create: `functions/src/notifications/devices.ts`, `endpointSecurity.ts`, `schedules.ts`, `fanout.ts`, `delivery.ts`, `webPush.ts`, `vapidMaterial.ts`
- Create: `functions/src/admin/backfillNotificationSchedules.ts`, `setNotificationAuthority.ts`
- Create: `functions/scripts/backfill-notification-schedules.ts`, `functions/scripts/set-notification-authority.ts`, `functions/scripts/set-notification-control.ts`
- Create: `functions/scripts/prepare-emulator-notification-config.ts`, `functions/scripts/generate-vapid-material.ts`

### Focused tests

- Modify/Create under `src/__tests__/`: lifecycle/store/monitor/date/hydration/authority/current-device/preferences/inbox/service-worker/browser-notification suites and `firestore/notifications.rules.test.ts`
- Create under `functions/test/unit/`: `contracts.test.ts`, `authority.test.ts`, `schedules.test.ts`, `delivery.test.ts`, `webPush.test.ts`, `vapidMaterial.test.ts`
- Create under `functions/test/integration/`: `devices.emulator.test.ts`, `runtime.emulator.test.ts`, `schedules.emulator.test.ts`, `fanout.emulator.test.ts`, `delivery.emulator.test.ts`
- Create: `functions/test/helpers/firestoreEmulator.ts`

---

### Task 0: Freeze the approved contract and baseline

**Files:**

- Modify the five OpenSpec files listed above.
- Create this implementation plan.

**Interfaces:**

- Produces the authority-generation invariant used by every later task.
- Records that separate writer namespaces do not replace generation checks.

- [x] **Step 1: Record the two-phase authority handoff**

The canonical runtime document is:

```ts
interface NotificationRuntimeState {
  authority: 'foreground' | 'durable';
  configVersion: number;
  activatedAt: Timestamp | null;
  updatedAt: Timestamp;
}

interface NotificationRuntimePrivate {
  accountScope: string;
  scheduleProvisioning?: {
    targetConfigVersion: number;
    authorizedAt: Timestamp;
  };
  pendingAuthorityTransition?: PendingAuthorityTransition;
  quotas?: {
    registrationMutationAt?: Timestamp[];
    testRequestAt?: Timestamp[];
    dispatchAttemptAt?: Timestamp[];
  };
  updatedAt: Timestamp;
}
```

Every writer updates only its owned nested field paths inside a transaction (or uses `set(..., { merge: true })`); no task replaces this shared private document. Tests must prove account scope, provisioning, transition journal, and unrelated quota arrays survive each other's writes.
Only explicit Admin backfill creates `scheduleProvisioning` for one target generation. Pending-transition synchronization may consume that exact marker; the successful final authority CAS deletes only `scheduleProvisioning` and `pendingAuthorityTransition`, leaving account scope and quotas intact.

Time-based documents carry `authorityConfigVersion`. `activatedAt: null` fences both writers. Promotion and rollback use:

1. Compare-and-set a new target authority/version with `activatedAt: null`.
2. Resolve and mark outgoing time lifecycles as authority-superseded.
3. Pause outgoing schedules, clear their leases, and suppress/drain outgoing nonterminal deliveries and leases.
4. On durable → foreground, wait until every dispatch-started outgoing payload reaches its possible-acceptance expiry across accepted, ambiguous, still-sending, and stale-result work.
5. For a durable target, promote the verified target schedules from `staged` to `active` while both writers remain fenced; for a foreground target, promote no schedule and require every durable schedule paused and lease-free.
6. Compare-and-set `activatedAt` only if authority/version still match and the target-specific schedule invariant holds.

- [x] **Step 2: Record stale-client and stale-worker rejection**

Rules require exact active foreground generation for authenticated client time events. Workers re-read exact active durable generation before schedule/event commits, lease acquisition, external dispatch, and result commits.

- [x] **Step 3: Validate the amended change**

Run:

```powershell
npx.cmd --yes @fission-ai/openspec@1.6.0 validate harden-notification-delivery-and-recurring-reminders --strict
git diff --check
```

Expected: `Change 'harden-notification-delivery-and-recurring-reminders' is valid` and no whitespace errors.

- [x] **Step 4: Commit the approved specification after execution mode is chosen**

```powershell
git add openspec/changes/harden-notification-delivery-and-recurring-reminders/proposal.md openspec/changes/harden-notification-delivery-and-recurring-reminders/design.md openspec/changes/harden-notification-delivery-and-recurring-reminders/tasks.md openspec/changes/harden-notification-delivery-and-recurring-reminders/specs/notification-delivery/spec.md openspec/changes/harden-notification-delivery-and-recurring-reminders/specs/recurring-reminder-reliability/spec.md docs/superpowers/plans/2026-08-30-durable-notifications-and-reminders.md
git commit -m "docs(notifications): approve durable delivery plan"
```

Do not stage any other working-tree path.

### Task 1: Make event identity and revision allocation monotonic

**Files:**

- Modify: `src/types/finance.ts`
- Modify: `src/utils/notificationEventLifecycle.ts`
- Modify: `src/hooks/useNotificationStore.ts`
- Modify: `src/services/NotificationManager.ts`
- Modify: `src/services/BudgetMonitor.ts`
- Modify: `src/__tests__/utils/notificationEventLifecycle.test.ts`
- Modify: `src/__tests__/hooks/useNotificationStore.test.ts`
- Modify: `src/__tests__/services/NotificationManager.test.ts`
- Modify: `src/__tests__/services/BudgetMonitor.test.ts`

**Interfaces:**

```ts
export function getEventStageRank(
  input: Pick<Notification, 'type' | 'stage' | 'stageWindow'>
): number | null;

export function advanceVersionedNotification(
  current: Notification | undefined,
  candidate: Omit<Notification, 'revision'> & { revision?: number }
): Notification;

export function resolveVersionedNotification(
  current: Notification,
  resolvedAt: Date
): Notification;

export function eventDocumentId(eventKey: string): string;
```

Keep the existing URL-encoded client document ID for backward compatibility. Backend Task 9 introduces SHA-256 IDs only for new backend-owned events and deliveries; no client-document migration is needed.

The root `Notification` shape adds these exact optional fields, not metadata aliases:

```ts
deliverySource?: 'backend';
authorityConfigVersion?: number;
authoritySupersededAt?: Date;
authoritySupersededByVersion?: number;
updatedAt?: Date;
```

Existing root fields remain `isRead`, `readRevision`, and `dismissedRevision`.

- [ ] **Step 1: Write revision-allocation and visibility tests**

Add cases equivalent to:

```ts
const current = notification({ revision: 7, stage: 'warning', lifecycleStatus: 'active' });
expect(advanceVersionedNotification(current, candidate({ stage: 'critical' })))
  .toMatchObject({ revision: 8, stage: 'critical', lifecycleStatus: 'active' });

const resolved = notification({ revision: 8, stage: 'critical', lifecycleStatus: 'resolved' });
expect(advanceVersionedNotification(resolved, candidate({ stage: 'critical' })))
  .toMatchObject({ revision: 9, lifecycleStatus: 'active' });

expect(advanceVersionedNotification(current, candidate({ stage: 'warning', revision: 99 })))
  .toEqual(current);
expect(resolveVersionedNotification(current, fixedNow)).toMatchObject({
  revision: 7,
  lifecycleStatus: 'resolved',
  isRead: true,
  readRevision: 7,
});
```

Also prove that `authoritySupersededAt` events remain available to source-lifecycle queries but are excluded from the visible notification center, and reactivation clears supersession only in the currently admitted namespace.
Every advance/resolve/reactivate assertion preserves original `createdAt`, refreshes `updatedAt`, and leaves logical `scheduledAt` unchanged unless a new stage window explicitly supplies its own schedule time.

- [ ] **Step 2: Verify RED**

```powershell
npm.cmd run test:run -- src/__tests__/utils/notificationEventLifecycle.test.ts src/__tests__/hooks/useNotificationStore.test.ts src/__tests__/services/NotificationManager.test.ts src/__tests__/services/BudgetMonitor.test.ts --no-file-parallelism
```

Expected: failures show fixed stage-derived revisions, trusted candidate revision, and resolved/superseded rows still visible.

- [ ] **Step 3: Implement the minimal lifecycle contract**

- Extend the root notification type with the four exact optional authority/delivery fields above plus optional lifecycle `updatedAt`; keep recurring source identity/date fields in `metadata` and retain backward-compatible v1/v2 reads.
- Replace `getCanonicalEventRevision` with stage rank used only to validate progression.
- Inside the existing Firestore transaction, allocate initial revision `1`; a valid new stage or `resolved → active` transition receives `current.revision + 1`; same/lower stage is a no-op; resolve keeps revision.
- Preserve `createdAt`, set `updatedAt` on every lifecycle mutation, and treat `scheduledAt` as the logical occurrence rather than a mutation timestamp.
- Ignore any candidate-supplied revision.
- Preserve the existing URL-encoded client document ID and all legacy reads.
- Keep hidden source-state notifications separate from visible inbox filtering.
- For guest state, update the local authoritative ref synchronously before React state.
- Remove v2 revision debounce from `NotificationManager`; publish page/system feedback only after the store mutation succeeds.
- Keep one budget event per month. `BudgetMonitor` supplies stage rank only, never a revision or backend marker.

- [ ] **Step 4: Verify GREEN**

Run the focused command from Step 2, then:

```powershell
npm.cmd run typecheck
```

Expected: all focused tests and typecheck pass.

- [ ] **Step 5: Commit**

```powershell
git add src/types/finance.ts src/utils/notificationEventLifecycle.ts src/hooks/useNotificationStore.ts src/services/NotificationManager.ts src/services/BudgetMonitor.ts src/__tests__/utils/notificationEventLifecycle.test.ts src/__tests__/hooks/useNotificationStore.test.ts src/__tests__/services/NotificationManager.test.ts src/__tests__/services/BudgetMonitor.test.ts
git commit -m "fix(notifications): allocate monotonic event revisions"
```

### Task 2: Define recurring, debt, and daily reminder cursors in local calendar time

**Files:**

- Modify: `src/utils/recurringDates.ts`
- Create: `src/utils/recurringReminderCursor.ts`
- Create: `src/lib/recurringReminderCursorStore.ts`
- Modify: `src/services/PaymentMonitor.ts`
- Modify: `src/services/DebtMonitor.ts`
- Modify: `src/hooks/useDailyExpenseReminder.ts`
- Modify: `src/hooks/useNotificationMonitoring.ts`
- Modify: `src/hooks/useNotifications.ts`
- Modify/Create focused tests for each module.

**Interfaces:**

```ts
export interface RecurringReminderCursor {
  cycleKey: string;
  dueLocalDate: string;
  stageWindow: 'd3' | 'd1' | 'due' | `overdue:${number}` | null;
}

export function evaluateRecurringReminderCursor(input: {
  payment: RecurringPayment;
  now: Date;
  timeZone: string;
  cursor?: RecurringReminderCursor;
  isPaid: (cycleKey: string) => boolean;
}): {
  nextCursor: RecurringReminderCursor;
  resolvedCycleKey?: string;
  activeStageWindow: RecurringReminderCursor['stageWindow'];
};

export interface RecurringReminderCursorStore {
  read(paymentId: string): RecurringReminderCursor | undefined;
  persistGuest?(paymentId: string, cursor: RecurringReminderCursor): void;
  removeGuest?(paymentId: string): void;
}

export type DebtStageWindow =
  | 'borrowed:30'
  | 'borrowed:60'
  | `borrowed:weekly:${number}`
  | 'lent:90'
  | `lent:weekly:${number}`;

export function getDebtReminderStage(input: {
  debt: Debt;
  now: Date;
  timeZone: string;
}): {
  stageWindow: DebtStageWindow;
  rank: number;
  scheduledLocalDate: string;
  stageValidUntilLocalDate: string;
} | null;
```

The authenticated foreground adapter reads the cursor from loaded hidden/source lifecycle notifications in Firestore and persists updates only through the canonical event mutation. A versioned account/writer-scoped local adapter exists only for guests. Neither adapter stores payment copy or amounts.

The cycle becomes authoritative only when its first valid stage is persisted. An authenticated evaluation with `activeStageWindow: null` creates no hidden lifecycle or cursor; if no stage was ever persisted and the app later reopens in another month, it intentionally selects the latest applicable cycle rather than replaying an uncommitted old month. Once D-3 or a later catch-up stage is persisted, that Firestore lifecycle is the cross-device cursor until payment resolution.

Recurring and debt stages use one product constant `REMINDER_STAGE_LOCAL_TIME = '09:00'`; configurable `dailyExpenseReminder.hour/minute` applies only to the daily-expense reminder. Debt windows are exact: borrowed D30 09:00–D60 09:00, D60 09:00–D67 09:00, then weekly windows beginning D67+7n; lent D90 09:00–D97 09:00, then weekly windows beginning D97+7n. Before the first boundary no stage exists; between boundaries a missed run catches up only the current window.

- [ ] **Step 1: Write pure calendar and cursor tests**

Cover all of these fixed-time cases:

- At 08:59/09:00 local for D-3, D-1, due day, D+1, D+8, D+15, D+22, and an arbitrary later weekly occurrence.
- A D-2 catch-up yields `d3`; a D+2 catch-up remains `overdue:0`; D+8 advances exactly once.
- An unpaid June cursor remains `2026-5-15` / `2026-06-15` during July and August.
- The same authenticated cursor survives reload and another device because it is recovered from Firestore source-lifecycle metadata; guest storage remains local.
- An authenticated check before D-3 writes no lifecycle/cursor; reopening months later without any persisted stage chooses the latest applicable cycle. The first valid D-3 or catch-up stage gets revision 1 and then becomes the cross-device authoritative cursor.
- Once its matching transaction is paid, advancement jumps to the latest applicable current cycle without replaying skipped months.
- Link/unlink/delete recomputes the current applicable cycle.
- Monthly day clamping, leap-year February, annual anchor month, local DST gap/repetition, and the existing zero-based-month `cycleKey` format remain stable.
- Debt local-date stages are exact at 08:59/09:00: `borrowed:30` begins D30 and remains current until D60, `borrowed:60` begins D60 and remains current until D67, then `borrowed:weekly:n` begins D67+7n; `lent:90` begins D90 and remains current until D97, then `lent:weekly:n` begins D97+7n. Tests cover D30/D31, D60/D65/D67, D90/D97, catch-up within the current window, no replay of expired milestones, and arbitrary later n.
- Daily reminder catch-up produces at most one local-date event after the configured time.

Representative assertion:

```ts
expect(evaluateRecurringReminderCursor({
  payment: monthlyPayment({ dueDay: 15 }),
  now: zoned('2026-08-02T09:00:00', 'America/Bogota'),
  timeZone: 'America/Bogota',
  cursor: { cycleKey: '2026-5-15', dueLocalDate: '2026-06-15', stageWindow: 'overdue:2' },
  isPaid: () => false,
}).nextCursor.cycleKey).toBe('2026-5-15');
```

- [ ] **Step 2: Verify RED**

```powershell
npm.cmd run test:run -- src/__tests__/utils/recurringDates.test.ts src/__tests__/utils/recurringReminderCursor.test.ts src/__tests__/services/PaymentMonitor.test.ts src/__tests__/services/DebtMonitor.test.ts src/__tests__/hooks/useDailyExpenseReminder.test.ts --no-file-parallelism
```

Expected: the month-boundary cursor, overdue windows, deterministic debt cadence, and local-date catch-up contracts fail.

- [ ] **Step 3: Implement pure cursor functions and foreground integration**

- Normalize comparisons to calendar dates in the configured IANA zone; never derive stages from elapsed 24-hour durations.
- Replace DebtMonitor's elapsed-millisecond/in-memory cadence with the exact persistent stage windows above; a missed milestone outside its validity window is recorded skipped, not sent stale.
- Parse `overdue:n` only when `n` is an integer greater than or equal to zero; compute every D+1+7n window without a fixed upper bound.
- Use the persisted unpaid cursor before calculating a new calendar cycle.
- Emit these authenticated foreground keys:
  - `foreground:v${configVersion}:recurring:${paymentId}:${cycleKey}`
  - `foreground:v${configVersion}:daily-expense:${localDate}`
  - `foreground:v${configVersion}:debt:${debtId}`
- Use `foreground:compat:*` while authenticated runtime is absent and `foreground:guest:*` for guests.
- Candidates carry no revision and no `deliverySource`.
- Reevaluate foreground time windows every five minutes while the page is alive. The guard includes stage window, so an 08:00 evaluation cannot block a 09:00 transition.
- For authenticated foreground, derive cursor state from the store's hidden/source notification set and persist it in event metadata; use local cursor storage only for guests.
- Persist an authenticated cursor only with the first valid stage; a null-stage evaluation is read-only. Thereafter derive it from the hidden/source notification set and exclude resolved/superseded source rows from visible/presentation selectors.
- Resolve/recompute a reminder only after observing the persisted transaction result. Catch notification errors without reversing payment/link/unlink/delete.

- [ ] **Step 4: Verify GREEN**

Run Step 2 plus:

```powershell
npm.cmd run test:run -- src/__tests__/hooks/useNotificationMonitoring.test.ts src/__tests__/hooks/useNotificationStore.test.ts --no-file-parallelism
npm.cmd run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/utils/recurringDates.ts src/utils/recurringReminderCursor.ts src/lib/recurringReminderCursorStore.ts src/services/PaymentMonitor.ts src/services/DebtMonitor.ts src/hooks/useDailyExpenseReminder.ts src/hooks/useNotificationMonitoring.ts src/hooks/useNotifications.ts src/__tests__/utils/recurringDates.test.ts src/__tests__/utils/recurringReminderCursor.test.ts src/__tests__/services/PaymentMonitor.test.ts src/__tests__/services/DebtMonitor.test.ts src/__tests__/hooks/useDailyExpenseReminder.test.ts src/__tests__/hooks/useNotificationMonitoring.test.ts src/__tests__/hooks/useNotificationStore.test.ts
git commit -m "fix(reminders): preserve authoritative local-date cursors"
```

### Task 3: Wait for complete source hydration and fence foreground work by authority

**Files:**

- Modify: `src/hooks/firestore/useFirestoreSubscriptions.ts`
- Modify: `src/contexts/FinanceContext.tsx`
- Modify: `src/hooks/useFinanceSelectors.ts`
- Modify: `src/components/layout/FinanceNotificationBridge.tsx`
- Create: `src/utils/notificationAuthority.ts`
- Create: `src/hooks/useNotificationAuthority.ts`
- Modify: `src/hooks/useNotificationMonitoring.ts`
- Modify: `src/hooks/useDailyExpenseReminder.ts`
- Create/Modify hydration, bridge, and authority tests.

**Interfaces:**

```ts
export type NotificationAuthorityState =
  | { kind: 'guest'; effective: 'foreground'; writer: { namespace: 'guest' } }
  | { kind: 'compat'; effective: 'foreground'; writer: { namespace: 'compat' } }
  | {
      kind: 'foreground';
      effective: 'foreground';
      configVersion: number;
      writer: { namespace: `v${number}`; authorityConfigVersion: number };
    }
  | { kind: 'durable'; effective: 'durable'; configVersion: number; writer: null }
  | {
      kind: 'transient';
      effective: 'foreground';
      reason: 'checking' | 'error';
      writer:
        | { namespace: 'compat' }
        | { namespace: `v${number}`; authorityConfigVersion: number };
    }
  | { kind: 'transient'; effective: 'durable'; reason: 'checking' | 'error'; writer: null }
  | {
      kind: 'transient';
      effective: 'foreground' | 'durable';
      reason: 'cutover';
      writer: null;
    };

export function useNotificationAuthority(userId: string | null): NotificationAuthorityState;
```

`notificationSourcesHydrated` is account-scoped and becomes true only after the first snapshot of transactions, recurring payments, and debts plus `balancesReady`.

- [ ] **Step 1: Write hydration tests**

Prove:

- Empty placeholder arrays before snapshots do not set the daily guard.
- Empty arrays after all source snapshots are valid hydrated data.
- Transactions/balances ready while recurring or debt is still pending remains false.
- Hydration transitions false → true evaluate exactly once for the current stage window.
- Changing user/account immediately resets false.

- [ ] **Step 2: Write authority matrix and stale-callback tests**

Prove:

- Guest and runtime-absent compatibility run.
- Active foreground runs with the exact generation.
- Durable and `activatedAt: null` do not evaluate, write, or present daily/recurring/debt.
- A transient error reuses only the last confirmed account-scoped state; user B never inherits user A.
- The discriminated union cannot represent a durable effective state with a foreground writer, and every `cutover` variant has `writer: null`; exhaustive matrix tests fail compilation for forbidden combinations.
- Initial unknown may attempt compatibility, but system presentation occurs only after a successful store write; durable rules therefore stop stale clients.
- A timer callback captured before cutover rechecks a mutable writer ref immediately before its mutation.
- A deferred foreground store promise that resolves after cutover rechecks writer/account again after persistence success and immediately before toast or OS feedback; fenced/stale generation presents nothing.
- Budget/spending/balance monitors continue in durable mode.

- [ ] **Step 3: Verify RED**

```powershell
npm.cmd run test:run -- src/__tests__/hooks/useFirestoreSubscriptionsNotificationHydration.test.ts src/__tests__/components/FinanceNotificationBridge.test.tsx src/__tests__/utils/notificationAuthority.test.ts src/__tests__/hooks/useNotificationAuthority.test.tsx src/__tests__/hooks/useNotificationMonitoring.test.ts --no-file-parallelism
```

Expected: partial hydration is treated as ready and no runtime authority boundary exists.

- [ ] **Step 4: Implement the minimal readiness and authority boundaries**

- Track first-snapshot readiness in state, not only refs, so an empty collection rerenders.
- Tag readiness and cached authority by user ID; clear on account switch.
- Read only `users/{uid}/notificationRuntime/state`.
- Cache the last confirmed sanitized authority in account-scoped `sessionStorage`; never cache capabilities.
- Treat `activatedAt: null` as `cutover` with `writer: null`.
- Pass the writer token into each time monitor. Recheck it at asynchronous mutation time.
- Recheck the same current writer generation and account after a successful event-store mutation and before any page/system presentation; the pre-write and post-write checks close different cutover races.
- Do not gate transaction-triggered budget/spending/balance monitoring.

- [ ] **Step 5: Verify GREEN and commit**

```powershell
npm.cmd run test:run -- src/__tests__/hooks/useFirestoreSubscriptionsNotificationHydration.test.ts src/__tests__/components/FinanceNotificationBridge.test.tsx src/__tests__/utils/notificationAuthority.test.ts src/__tests__/hooks/useNotificationAuthority.test.tsx src/__tests__/hooks/useNotificationMonitoring.test.ts --no-file-parallelism
npm.cmd run typecheck
git add src/hooks/firestore/useFirestoreSubscriptions.ts src/hooks/useFinanceSelectors.ts src/hooks/useNotificationAuthority.ts src/hooks/useNotificationMonitoring.ts src/hooks/useDailyExpenseReminder.ts src/contexts/FinanceContext.tsx src/components/layout/FinanceNotificationBridge.tsx src/utils/notificationAuthority.ts src/__tests__/hooks/useFirestoreSubscriptionsNotificationHydration.test.ts src/__tests__/components/FinanceNotificationBridge.test.tsx src/__tests__/utils/notificationAuthority.test.ts src/__tests__/hooks/useNotificationAuthority.test.tsx src/__tests__/hooks/useNotificationMonitoring.test.ts
git commit -m "feat(notifications): fence foreground writers by authority"
```

### Task 4: Make notification-center failures recoverable and keyboard-safe

**Files:**

- Modify: `src/components/notifications/NotificationCenter.tsx`
- Modify: `src/__tests__/components/NotificationCenterNavigation.test.tsx`
- Modify only if a missing assertion requires it: `src/hooks/useNotificationStore.ts`

**Interfaces:**

- Uses the store's existing optimistic rollback; UI adds awaited actions, feedback, and focus restoration only.
- Read failure never blocks the user's one requested deep-link navigation.

- [ ] **Step 1: Write failure and focus tests**

Required cases:

```ts
await user.click(screen.getByRole('button', { name: /abrir recordatorio/i }));
expect(mockNavigate).toHaveBeenCalledTimes(1);
expect(showToast.error).toHaveBeenCalledWith(expect.stringMatching(/no se pudo marcar/i));
```

- Rejected read: error toast, panel close, exactly one navigation.
- Successful remove: focus next notification action, else previous, else `Cerrar notificaciones`.
- Rejected remove: store rollback restores row and focus returns to its restored action.
- Bulk clear: versioned events use current-revision dismissal; legacy events use physical delete; one actionable failure summary.

- [ ] **Step 2: Verify RED**

```powershell
npm.cmd run test:run -- src/__tests__/components/NotificationCenterNavigation.test.tsx src/__tests__/hooks/useNotificationStore.test.ts --no-file-parallelism
```

- [ ] **Step 3: Implement the minimal UI behavior**

Await each store promise, catch only at the UI boundary, use the existing `showToast.error`, and maintain a small ID→button ref map. Do not duplicate rollback state or create a second notification queue.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
npm.cmd run test:run -- src/__tests__/components/NotificationCenterNavigation.test.tsx src/__tests__/hooks/useNotificationStore.test.ts --no-file-parallelism
git add src/components/notifications/NotificationCenter.tsx src/__tests__/components/NotificationCenterNavigation.test.tsx
git commit -m "fix(notifications): recover inbox actions and focus"
```

### Task 5: Harden the real service worker for private, deduplicated Web Push

**Files:**

- Modify: `public/sw.js`
- Create: `src/__tests__/pwa/serviceWorkerNotifications.test.ts`
- Modify: `src/__tests__/lib/browserNotifications.test.ts`

**Wire contract:**

```ts
interface PushPayloadV1 {
  schemaVersion: 1;
  accountScope: string;
  deliveryId: string;
  eventId: string;
  eventRevision: number;
  expiresAt: string;
  kind: 'daily' | 'recurring' | 'debt' | 'test';
  title: string;
  body: string;
  notificationTag: string;
  actionUrl: '/' | '/?view=recurring' | '/?view=debts';
}
```

Approved copy table:

```ts
const COPY = {
  daily: {
    title: 'Registro diario pendiente',
    body: 'Abre MoneyTrack para revisar tu registro diario.',
    actionUrl: '/',
  },
  recurring: {
    title: 'Recordatorio de pago',
    body: 'Abre MoneyTrack para revisar un pago recurrente.',
    actionUrl: '/?view=recurring',
  },
  debt: {
    title: 'Recordatorio de deuda',
    body: 'Abre MoneyTrack para revisar una deuda.',
    actionUrl: '/?view=debts',
  },
  test: {
    title: 'Prueba de notificaciones',
    body: 'MoneyTrack puede enviar notificaciones a este dispositivo.',
    actionUrl: '/',
  },
} as const;
```

- [ ] **Step 1: Build a zero-dependency worker harness**

Load the real `public/sw.js` with `node:vm`; provide narrow fakes for `self`, `registration`, `clients`, `caches`, `Notification`, and event `waitUntil`. Capture registered listeners. Do not add `fake-indexeddb`.

- [ ] **Step 2: Write failing push, dedupe, click, and cleanup tests**

Cover:

- Valid payload displays exact constant copy and existing icons.
- Text over 4 KiB, invalid JSON, unknown schema, expired data, mismatched copy, invalid account scope, invalid revision, and external/non-allowlisted URL display nothing.
- Two simultaneous identical delivery IDs show once.
- Lower revision after higher revision for the same account/event shows nothing.
- Same event ID in accounts A and B remains isolated.
- The stable tag replaces an earlier visible revision.
- A `test` payload accepts only the exact private test copy and same-origin root action.
- Click validates the URL again, focuses/navigates an existing MoneyTrack client, or opens one same-origin window.
- `{ type: 'NOTIFICATIONS_CLEAR_ACCOUNT', accountScope }` closes only that account's visible notifications and removes only its dedupe state.
- `CLEAR_ACCOUNT` persists a blocked-account tombstone and clears the active account; a queued account-A push arriving after logout or after `SET_ACCOUNT` switched to B is discarded.
- `{ type: 'NOTIFICATIONS_SET_ACCOUNT', accountScope }` makes exactly that account active and removes only its own prior tombstone; pushes for every other scope remain rejected.
- `pushsubscriptionchange` emits only `{ type: 'WEB_PUSH_RECOVERY_REQUIRED' }` to open clients.

- [ ] **Step 3: Verify RED**

```powershell
npm.cmd run test:run -- src/__tests__/pwa/serviceWorkerNotifications.test.ts src/__tests__/lib/browserNotifications.test.ts --no-file-parallelism
```

Expected: `push` is unregistered and no persistent dedupe/click cleanup exists.

- [ ] **Step 4: Implement the worker state machine**

- Validate `new TextEncoder().encode(rawText).byteLength <= 4096` before JSON parsing.
- Enforce the exact copy/action table and same-origin base-path canonicalization.
- Recompute `Topic = base64url(SHA-256(accountScope + ':' + eventId)).slice(0, 32)` with Web Crypto and require `notificationTag === 'moneytrack-' + Topic`.
- Serialize all push handlers through one module-level promise.
- Persist a separate versioned cache such as `moneytrack-push-state-v1`; use synthetic same-origin cache keys, never raw endpoint/capability data.
- Keep at most 256 unexpired handled delivery IDs and 256 highest event revisions, partitioned by account scope; prune expired then oldest.
- Persist one active account scope plus at most 16 blocked-account tombstones in the worker cache. A push is eligible only when its scope equals the active scope and is not blocked.
- Call `showNotification` only after state is atomically checked/updated inside the serialized chain.
- Preserve existing install/activate/fetch/cache behavior.

- [ ] **Step 5: Verify GREEN and commit**

```powershell
npm.cmd run test:run -- src/__tests__/pwa/serviceWorkerNotifications.test.ts src/__tests__/lib/browserNotifications.test.ts --no-file-parallelism
git add public/sw.js src/__tests__/pwa/serviceWorkerNotifications.test.ts src/__tests__/lib/browserNotifications.test.ts
git commit -m "feat(pwa): validate and deduplicate web push"
```

### Task 6: Add current-device native Push API and callable boundaries

**Files:**

- Create: `src/lib/webPush.ts`
- Create: `src/lib/notificationDeviceApi.ts`
- Create: `src/__tests__/lib/webPush.test.ts`
- Create: `src/__tests__/lib/notificationDeviceApi.test.ts`
- Modify: `.env.example`

**Interfaces:**

```ts
export type NativePushInspection =
  | { kind: 'unsupported' | 'insecure-context' | 'ios-not-installed' }
  | { kind: 'permission-required' | 'permission-blocked' }
  | { kind: 'subscription-missing'; registration: ServiceWorkerRegistration }
  | { kind: 'vapid-key-mismatch'; registration: ServiceWorkerRegistration; subscription: PushSubscription }
  | { kind: 'subscribed'; registration: ServiceWorkerRegistration; subscription: PushSubscription };

export function getOrCreateDeviceId(): string;
export function inspectNativePush(vapidPublicKey: string): Promise<NativePushInspection>;
export function subscribeCurrentDevice(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string
): Promise<PushSubscription>;
export function unsubscribeCurrentDevice(
  registration: ServiceWorkerRegistration
): Promise<boolean>;

export const notificationDeviceApi: {
  register(input: RegisterNotificationDeviceInput): Promise<SanitizedDeviceStatus>;
  status(input: { deviceId: string }): Promise<SanitizedDeviceStatus>;
  revoke(input: { deviceId: string }): Promise<void>;
  sendTest(input: { deviceId: string; testRequestId: string }): Promise<TestDeliveryResult>;
};
```

Exact callable DTOs and limits:

```ts
interface RegisterNotificationDeviceInput {
  deviceId: string; // canonical UUID, 36 ASCII chars
  subscription: {
    endpoint: string; // HTTPS, at most 2048 UTF-8 bytes
    expirationTime: number | null;
    keys: {
      p256dh: string; // base64url decodes to 65-byte uncompressed P-256 point
      auth: string;   // base64url decodes to exactly 16 bytes
    };
  };
  timeZone: string; // at most 64 UTF-8 bytes and valid through Intl
  platform: 'ios' | 'android' | 'desktop' | 'unknown';
  displayMode: 'browser' | 'standalone';
}

interface SanitizedDeviceStatus {
  deviceId: string;
  state: 'active' | 'disabled' | 'expired' | 'missing';
  accountScope: string | null;
  endpointFingerprint: string | null; // first 12 lowercase hash characters
  platform: RegisterNotificationDeviceInput['platform'] | null;
  displayMode: RegisterNotificationDeviceInput['displayMode'] | null;
  timeZone: string;
}

type TestDeliveryResult =
  | { status: 'accepted'; deliveryId: string }
  | { status: 'rate-limited'; retryAt: string }
  | { status: 'failed'; code: 'device-inactive' | 'configuration' | 'temporary' };

type ActionReason =
  | 'permission-required'
  | 'permission-blocked'
  | 'ios-install-required'
  | 'subscription-missing'
  | 'registration-missing'
  | 'endpoint-expired'
  | 'account-mismatch'
  | 'vapid-key-mismatch';

type StableDeviceState =
  | { kind: 'active'; accountScope: string; timeZone: string }
  | { kind: 'action-required'; reason: ActionReason }
  | { kind: 'unavailable'; reason: 'unsupported' | 'insecure-context' };

type DeviceActionResult =
  | { kind: 'success'; message: string }
  | { kind: 'rate-limited'; retryAt: string }
  | { kind: 'error'; message: string };
```

Every callable rejects unknown keys. Control parsing allows at most 100 unique canary UIDs, each at most 128 UTF-8 bytes.

- [ ] **Step 1: Write native capability and API tests**

Prove stable device UUID storage, one fresh test-request UUID per explicit test click, secure-context/API checks, iOS Home Screen distinction, existing-subscription reuse only when `subscription.options.applicationServerKey` equals the configured public VAPID key, mismatch revocation/unsubscribe with `vapid-key-mismatch`, VAPID base64url conversion, and that permission/subscription creation occurs only from the explicit `subscribeCurrentDevice` path. Prove callables use the explicit `us-central1` Functions instance, return sanitized DTOs, and map Firebase errors to bounded product errors without preserving raw backend details.

- [ ] **Step 2: Verify RED**

```powershell
npm.cmd run test:run -- src/__tests__/lib/webPush.test.ts src/__tests__/lib/notificationDeviceApi.test.ts --no-file-parallelism
```

- [ ] **Step 3: Implement without a messaging dependency**

- Use `Notification`, `navigator.serviceWorker`, `PushManager`, `PushSubscription`, and `crypto.randomUUID`.
- Store only `moneytrack.notificationDeviceId`; never persist endpoint or keys outside the browser-managed subscription.
- Validate `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` before subscribe.
- Compare an existing subscription's `applicationServerKey` byte-for-byte with that key. On mismatch, never reuse or register it: revoke the old server binding, unsubscribe locally, and require one explicit reactivation.
- Serialize a subscription only at the callable boundary and discard it after the call resolves.
- Do not add Firebase Messaging or any root runtime package.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
npm.cmd run test:run -- src/__tests__/lib/webPush.test.ts src/__tests__/lib/notificationDeviceApi.test.ts --no-file-parallelism
npm.cmd run typecheck
git add src/lib/webPush.ts src/lib/notificationDeviceApi.ts src/__tests__/lib/webPush.test.ts src/__tests__/lib/notificationDeviceApi.test.ts .env.example
git commit -m "feat(notifications): add native current-device push"
```

### Task 7: Reconcile one current device across session, focus, account switch, and logout

**Files:**

- Create: `src/hooks/useCurrentDeviceNotifications.ts`
- Modify: `src/hooks/useNotificationPreferences.ts`
- Modify: `src/contexts/NotificationContext.tsx`
- Modify: `src/AuthenticatedApp.tsx`
- Modify: `src/services/NotificationManager.ts`
- Modify: `src/__tests__/services/NotificationManager.test.ts`
- Create: `src/__tests__/hooks/useCurrentDeviceNotifications.test.tsx`
- Modify/Create context and logout integration tests.

**Interfaces:**

```ts
type CurrentDeviceState =
  | { kind: 'guest' }
  | { kind: 'checking' }
  | { kind: 'active'; accountScope: string; timeZone: string }
  | { kind: 'action-required'; reason: ActionReason }
  | { kind: 'unavailable'; reason: 'unsupported' | 'insecure-context' }
  | { kind: 'check-failed'; previous?: StableDeviceState };

interface CurrentDeviceNotifications {
  state: CurrentDeviceState;
  pendingAction: 'check' | 'activate' | 'disable' | 'test' | 'time-zone' | null;
  result: DeviceActionResult | null;
  reconcile(): Promise<void>;
  activate(): Promise<void>;
  disable(): Promise<void>;
  sendTest(): Promise<void>;
  updateTimeZone(): Promise<void>;
  prepareForSignOut(): Promise<void>;
}
```

- [ ] **Step 1: Write the reconciliation matrix tests**

Required cases:

- Guest performs no backend or permission work.
- An authenticated runtime-absent account with no successful device-backend response yet retains the existing `browserNotifications.enabled` plus granted-permission gate for foreground OS presentation while status is checking/unreachable; it creates no subscription, performs no registration, shows no `Activo`/test claim, and never promises closed-page delivery.
- The first successful sanitized status/register response, including `state: 'missing'`, persists a bounded UID-scoped backend-confirmed marker. A later timeout, reload, or focus check reuses the last confirmed device state or reports `check-failed` and MUST NOT re-enable the legacy gate. Runtime-present foreground/durable/fenced accounts never use this bootstrap exception.
- Mount, `userId` change, visible `visibilitychange`, and `window.focus` coalesce checks while one is in flight.
- Existing local subscription + absent server registration registers automatically without asking permission.
- Active server registration + absent local subscription revokes stale server state and reports `action-required`.
- Expired subscription unsubscribes/revokes and requires user activation.
- A subscription with a mismatched `applicationServerKey` is never registered or reused: `reconcile()` gets the stable device ID, attempts backend revoke and local unsubscribe with bounded `allSettled`, reports `vapid-key-mismatch`, and never requests permission.
- Authenticated preferences missing `timeZone` initialize once from a valid current browser IANA zone; an invalid/empty browser result falls back to `America/Bogota`; an existing stored zone is never overwritten by reconciliation.
- Permission is never requested by `reconcile()`.
- Transient network/backend failure keeps the last stable state and reports `check-failed`.
- Account A → B cleans A before registering B; B never inherits A's account scope.
- Worker recovery hint triggers reconciliation only while a client exists.
- After backend confirmation or whenever a runtime document exists, authenticated foreground operating-system presentation is allowed only when the current-device state is active and `Notification.permission === 'granted'`; changing the legacy Firestore `browserNotifications.enabled` value on another device has no effect. The only exception is the bounded runtime-absent/no-backend-confirmation compatibility gate above.
- For guests, the existing local `browserNotifications.enabled` preference and local permission remain the system-presentation gate.
- A guest/foreground event created in quiet hours appears in the inbox immediately and owns one in-memory timer keyed by account/event/revision for the local quiet-end. While the page remains alive, the timer rechecks current preference, permission/device gate, exact foreground authority generation, lifecycle/revision, and event expiry before one OS presentation; it reschedules on a later quiet end and cancels on logout/account switch/unmount/authority change/resolve/newer revision. It never promises closed-page delivery.
- `prepareForSignOut()` starts unsubscribe, revoke, and account-scoped worker cleanup together, resolves after `Promise.allSettled` or 1.5 seconds, never rejects, and logout then runs once.
- `updateTimeZone()` is an explicit user action: it validates the current browser IANA zone and writes through the existing notification-preference store, not a device callable.

- [ ] **Step 2: Verify RED**

```powershell
npm.cmd run test:run -- src/__tests__/hooks/useCurrentDeviceNotifications.test.tsx src/__tests__/contexts/NotificationContext.test.tsx src/__tests__/components/AuthenticatedAppNotifications.test.tsx src/__tests__/services/NotificationManager.test.ts --no-file-parallelism
```

Expected: no current-device state machine exists and logout calls Firebase directly.

- [ ] **Step 3: Implement one provider-owned hook**

- Mount exactly one instance in `NotificationProvider`; consumers receive it through the existing notification context.
- Persist only `moneytrack.notificationDeviceId`, `moneytrack.notificationDeviceOwner.v1 = { userId, accountScope }`, and a bounded `moneytrack.notificationBackendConfirmed.v1` UID set; never endpoint/keys. Mark a UID confirmed only after a successful sanitized status/register response, prune the set deterministically, and never clear a confirmed UID merely because a later network check fails.
- `activate()` is the only path that may call permission request and `pushManager.subscribe()`.
- Use the local/server reconciliation matrix above.
- Own VAPID-mismatch orchestration here: call `inspectNativePush(configuredPublicKey)`, then on mismatch attempt `notificationDeviceApi.revoke({ deviceId })` and `unsubscribeCurrentDevice(registration)` without registration or permission work, and expose `action-required: vapid-key-mismatch`.
- Send `{ type: 'NOTIFICATIONS_CLEAR_ACCOUNT', accountScope }` before account switch/sign-out; the worker keeps a tombstone so a queued old-account push cannot become displayable after dedupe cleanup.
- After successful authenticated reconciliation, send `{ type: 'NOTIFICATIONS_SET_ACCOUNT', accountScope }` and initialize a missing preference timezone exactly once. Do not overwrite an existing zone.
- Replace `NotificationManagerDeps`' direct global preference check with an injected `canShowBrowserNotification()` local-device gate. Its authenticated result is active-device-plus-permission except for runtime-absent accounts whose UID has never confirmed the backend, where it temporarily delegates to the existing local preference/permission gate. Replace the current quiet-hour drop with the one bounded in-memory deferred-presentation timer above, using injected clock/timer/current-event/current-authority access for deterministic tests. This changes only foreground OS presentation, never inbox persistence, toasts, or backend delivery markers.
- In `AuthenticatedApp`, `await prepareForSignOut()` immediately before `logoutFirebase()`. Cleanup timeout cannot strand logout.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
npm.cmd run test:run -- src/__tests__/hooks/useCurrentDeviceNotifications.test.tsx src/__tests__/contexts/NotificationContext.test.tsx src/__tests__/components/AuthenticatedAppNotifications.test.tsx src/__tests__/services/NotificationManager.test.ts --no-file-parallelism
npm.cmd run typecheck
git add src/hooks/useCurrentDeviceNotifications.ts src/hooks/useNotificationPreferences.ts src/contexts/NotificationContext.tsx src/AuthenticatedApp.tsx src/services/NotificationManager.ts src/__tests__/hooks/useCurrentDeviceNotifications.test.tsx src/__tests__/contexts/NotificationContext.test.tsx src/__tests__/components/AuthenticatedAppNotifications.test.tsx src/__tests__/services/NotificationManager.test.ts
git commit -m "feat(notifications): reconcile current-device lifecycle"
```

### Task 8: Make notification preferences truthful, scoped, and accessible

**Files:**

- Modify: `src/components/notifications/NotificationPreferences.tsx`
- Modify: `src/components/modals/NotificationPreferencesModal.tsx`
- Modify: `src/types/finance.ts`
- Create: `src/__tests__/components/NotificationPreferences.test.tsx`
- Modify: `src/__tests__/hooks/notificationPreferencesMerge.test.ts`

**Behavior contract:**

- Authenticated stable states after the device backend has responded: `Activo`, `Requiere acción`, `No disponible`.
- Transient states: `Comprobando...`, `No se pudo comprobar`.
- Runtime-absent/no-backend-confirmation compatibility remains a transient diagnostic, not `Activo`: it states that existing local alerts may appear only while MoneyTrack is open and offers `Reintentar`; it exposes no test-push action.
- Guest: `Solo con MoneyTrack abierto` plus sign-in action.
- Test success: `Aceptada por el servicio push`; never claim OS display.
- iOS/iPadOS not installed: `Requiere acción` with Add to Home Screen guidance.
- `browserNotifications.enabled` remains legacy-read-compatible but is no longer a global multi-device switch after device-backend confirmation; guests and the bounded pre-backend compatibility state alone may consult it locally.
- Authenticated current-device status/capability controls foreground OS presentation after confirmation; runtime-present accounts cannot fall back to the legacy switch.

- [ ] **Step 1: Write real-component state and action tests**

Render every state and assert one appropriate primary action. Cover activation, disable, retry, test double-click suppression, explicit timezone update, exact accepted/rate-limit/failure copy, and absence of `Diferida`.
Also prove that saving a different legacy browser flag from device B cannot enable or disable authenticated foreground OS presentation on device A.

- [ ] **Step 2: Write draft, validation, and accessibility tests**

Prove:

- Save requires `warning < critical <= exceeded` and `exceeded >= 100`.
- Errors preserve the draft and focus the first invalid input.
- Every switch/input/select has a stable accessible name and description/error.
- Async region uses `aria-live`; pending action uses `aria-busy`.
- Modal close/reopen behavior preserves only the intended persisted values.
- Primary actions expose a minimum 44 CSS-pixel target via existing classes.
- A rejected Firestore preference save preserves the complete draft, announces exactly what was not saved, keeps focus stable, and exposes a retry that submits the same draft once.

- [ ] **Step 3: Verify RED**

```powershell
npm.cmd run test:run -- src/__tests__/components/NotificationPreferences.test.tsx src/__tests__/hooks/notificationPreferencesMerge.test.ts --no-file-parallelism
```

- [ ] **Step 4: Implement with existing design tokens**

- Consume `CurrentDeviceNotifications` from context.
- Remove the global-looking browser notification switch for authenticated device activation.
- Keep daily/reminder preference fields and the stored IANA timezone.
- Add explicit `Actualizar a <zona actual>` action; another device does not silently overwrite it.
- Use existing `.card`, `.input-base`, `.btn-primary`, `.btn-cancel`, `.control-target-44`, and solid-on-muted status tokens. Do not add nested cards or gradients.
- Add `onRequestSignIn` to the modal for guests.

- [ ] **Step 5: Verify GREEN, visual contract, and commit**

```powershell
npm.cmd run test:run -- src/__tests__/components/NotificationPreferences.test.tsx src/__tests__/hooks/notificationPreferencesMerge.test.ts --no-file-parallelism
npm.cmd run typecheck
git add src/components/notifications/NotificationPreferences.tsx src/components/modals/NotificationPreferencesModal.tsx src/types/finance.ts src/__tests__/components/NotificationPreferences.test.tsx src/__tests__/hooks/notificationPreferencesMerge.test.ts
git commit -m "feat(notifications): clarify device status and actions"
```

At execution-time visual QA, inspect 320×568, 390×844, 1214×768, and 1440×900 in light/dark and 200% zoom; leave physical Android/iOS closed-PWA checks for the authorized rollout gate.

### Task 9: Scaffold the isolated Node.js 22 Functions package

**Files:**

- Create: `functions/package.json`, `functions/package-lock.json`
- Create: `functions/tsconfig.json`, `functions/vitest.config.ts`, `functions/eslint.config.mjs`
- Create: `functions/src/index.ts`, `functions/src/adminApp.ts`
- Create: `functions/src/notifications/contracts.ts`
- Create: `functions/test/unit/contracts.test.ts`
- Create: `functions/.gitignore`
- Modify: `package.json`, `package-lock.json`, `firebase.json`
- Modify: `tsconfig.json`, `eslint.config.mjs`

**Package contract:**

Production dependencies are exact:

```json
{
  "firebase-admin": "14.3.0",
  "firebase-functions": "7.3.2",
  "web-push": "3.6.7"
}
```

Development versions are `typescript` 5.9.3, `vitest` 4.1.8, `eslint` 9.39.4, `@eslint/js` 9.39.4, `typescript-eslint` 8.68.0, `@types/node` 22.20.1, and `@types/web-push` 3.6.4. `engines.node` is `22`.

Functions scripts are exact:

```json
{
  "build": "tsc -p tsconfig.json",
  "lint": "eslint src test",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "test": "npm run test:unit",
  "test:unit": "vitest run test/unit --no-file-parallelism --passWithNoTests",
  "test:integration": "vitest run test/integration --no-file-parallelism --passWithNoTests"
}
```

**Pure contracts:**

```ts
export const FUNCTIONS_REGION = 'us-central1';
export const MAX_ACTIVE_DEVICES = 5;
export const MAX_PAYLOAD_BYTES = 4096;
export const DELIVERY_ATTEMPT_LIMIT = 5;
export const DELIVERY_WINDOW_HOURS = 24;
export const USER_ATTEMPTS_PER_ROLLING_HOUR = 60;

export const eventIdFor = (eventKey: string): string =>
  sha256(`v1\0${eventKey}`);

export const deliveryIdFor = (input: {
  accountScope: string;
  eventId: string;
  eventRevision: number;
  deviceId: string;
}): string => sha256(
  `v1\0${input.accountScope}\0${input.eventId}\0${input.eventRevision}\0${input.deviceId}`
);

export const endpointHashFor = (canonicalEndpoint: string): string =>
  sha256(canonicalEndpoint);

export const accountScopeForNewRuntime = (): string =>
  randomBytes(16).toString('base64url');
```

- [ ] **Step 1: Create package/config scaffolding and write pure contract/config tests**

Create `functions/package.json`, TypeScript/Vitest/ESLint configs, and the failing test files only. Set `main` to `lib/src/index.js`; `tsconfig.json` uses `rootDir: "."`, `outDir: "lib"`, and includes all TypeScript files under `src` and `scripts` so later Admin CLIs compile without a second toolchain. Assert deterministic lowercase SHA-256 vectors, 22-character random account-scope validation, UUID/device/payload field limits, closed payload kind/action/copy table, monotonic positive revisions/generations, date-string parsing, delivery state unions, and rejection of unknown keys. Add one shared Admin CLI runtime that resolves every path flag from a validated `process.env.INIT_CWD` repository root (not the npm script's `functions` cwd), requiring root `.firebaserc`/`package.json` plus `functions/package.json`; tests invoke it from the repository root with `npm --prefix functions` and reject missing, non-root, traversal, and symlink-escape inputs. Also assert that the emulator-config preparer accepts only project `demo-moneytrack`, creates a valid ephemeral VAPID pair, writes public-only `.env.local` plus private-only `.secret.local`, never prints the private key, and can append only the public key to an explicitly supplied GitHub Actions environment file.

- [ ] **Step 2: Verify RED**

Install exactly the declared package and create its lockfile, then run:

```powershell
npm.cmd --prefix functions install
npm.cmd --prefix functions run test:unit -- test/unit/contracts.test.ts test/unit/vapidMaterial.test.ts
```

Expected: missing contracts/exports fail.

- [ ] **Step 3: Implement the smallest package**

- `src/index.ts` exports functions only; no business algorithm lives there.
- `adminApp.ts` initializes Admin once.
- `src/admin/cliRuntime.ts` validates the invocation root and exposes `resolveInvocationPath`; every later Admin/VAPID script uses it for repository `--manifest`, `--uid-file`, cursor/output, and dotenv paths. The literal runbook paths therefore remain repository-root-relative even though npm executes package scripts with cwd `functions`. External paths are separate closed cases: a private output must resolve beneath `os.tmpdir()`, while `--github-env` is accepted only under `GITHUB_ACTIONS=true` when its resolved path exactly equals `process.env.GITHUB_ENV`; neither may pass through a generic repository-path escape.
- `vapidMaterial.ts` contains the smallest injectable `web-push` key-generation/pair-validation and atomic file-write helpers. `prepare-emulator-notification-config.ts` refuses every project except literal `demo-moneytrack`, writes ignored `functions/.env.local` with only `WEB_PUSH_VAPID_PUBLIC_KEY`/`WEB_PUSH_VAPID_SUBJECT`, writes ignored `functions/.secret.local` with only `WEB_PUSH_VAPID_PRIVATE_KEY`, and emits no private value, JSON, or file content. With optional `--github-env <path>`, it requires `GITHUB_ACTIONS=true` and exact resolved equality with `process.env.GITHUB_ENV`, then appends only `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=<public key>` for subsequent CI steps.
- Compile source and scripts to `lib/src` and `lib/scripts`, use strict TypeScript and NodeNext-compatible settings.
- Before the first build, ignore `lib/`, `coverage/`, `.local/`, emulator exports/logs, `.env.*`, and secret-local files in `functions/.gitignore`, with only a future nonsensitive `.env.example` exception if one is deliberately added. This includes `functions/.env.moneytrack-889fe`.
- Root `tsconfig.json` excludes `functions`; root ESLint ignores `functions/**`; Functions has its own lint/typecheck.
- Add no root runtime dependency.
- Add the isolated `functions` source/codebase and Auth/Firestore/Functions emulator entries to `firebase.json` without changing hosting. Its exact entry includes `"predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]`, so deploys from a clean clone cannot upload stale/missing ignored `lib/` output.
- Change `test:rules:run` to execute the whole `src/__tests__/firestore` directory with the existing root Vitest config, so later rule suites are discovered without editing the command again.
- Add these exact root scripts now; Task 16 verifies rather than invents them:

```json
{
  "test:rules:run": "vitest run src/__tests__/firestore --no-file-parallelism --config vitest.config.mjs --configLoader runner",
  "test:notifications:unit": "npm --prefix functions test",
  "test:notifications:emulator": "npm --prefix functions run build && npm --prefix functions run notifications:prepare-emulator -- --project demo-moneytrack && npx --yes firebase-tools@15.24.0 emulators:exec --only auth,firestore,functions --project demo-moneytrack \"npm run test:rules:run && npm --prefix functions run test:integration && npm run test:run -- src/__tests__/functions --no-file-parallelism --passWithNoTests\"",
  "test:notifications": "npm run test:notifications:unit && npm run test:notifications:emulator"
}
```

Add `"notifications:prepare-emulator": "node lib/scripts/prepare-emulator-notification-config.js"` to the Functions package. The root emulator command builds Functions, creates fresh local-only VAPID values, starts Auth/Firestore/Functions once, and runs every integration/callable suite that exists at each later task. Because Firebase gives `.env.local` precedence and uses `.secret.local` to override emulator secrets, this path never needs ADC or Secret Manager and is hard-locked to the demo project.

- [ ] **Step 4: Verify GREEN, security baseline, and commit**

```powershell
npm.cmd --prefix functions run test:unit -- test/unit/contracts.test.ts test/unit/vapidMaterial.test.ts
npm.cmd --prefix functions run typecheck
npm.cmd --prefix functions run lint
npm.cmd --prefix functions audit --audit-level=low
npm.cmd audit --audit-level=low
git add functions/.gitignore functions/package.json functions/package-lock.json functions/tsconfig.json functions/vitest.config.ts functions/eslint.config.mjs functions/src/index.ts functions/src/adminApp.ts functions/src/admin/cliRuntime.ts functions/src/notifications/contracts.ts functions/src/notifications/vapidMaterial.ts functions/scripts/prepare-emulator-notification-config.ts functions/test/unit/contracts.test.ts functions/test/unit/vapidMaterial.test.ts package.json package-lock.json firebase.json tsconfig.json eslint.config.mjs
git commit -m "chore(functions): scaffold notification backend"
```

Expected: all commands pass and both audits report zero vulnerabilities.

### Task 10: Lock Firestore notification boundaries and fail-closed control

**Files:**

- Modify: `firestore.rules`
- Modify: `firestore.indexes.json`
- Create: `src/__tests__/firestore/notifications.rules.test.ts`
- Create: `functions/src/notifications/control.ts`
- Create: `functions/src/notifications/authority.ts`
- Create: `functions/test/unit/authority.test.ts`
- Create: `functions/test/integration/runtime.emulator.test.ts`

**Collection contract:**

| Path | Client access | Purpose |
|---|---|---|
| `users/{uid}/notificationRuntime/state` | owner read; backend write | sanitized authority/version/activation |
| `users/{uid}/notificationRuntime/private` | deny | random account scope, dispatch reservations, transition journal |
| `users/{uid}/notificationDevices/{deviceId}` | deny | raw capability and status |
| `users/{uid}/notificationSchedules/{scheduleId}` | deny | server schedule/cursor |
| `users/{uid}/notificationDeliveries/{deliveryId}` | deny | server lease/result |
| `notificationEndpointBindings/{endpointHash}` | deny | global endpoint uniqueness |
| `notificationControl/config` | deny | kill switch, allowlist, canonical UID digest, control version |
| `users/{uid}/notifications/{eventId}` | owner limited | inbox read/dismiss; admitted foreground create/update |

Server control shape:

```ts
interface NotificationControl {
  DELIVERY_ENABLED: boolean;
  canaryUids: string[];
  canaryUidDigest: string; // lowercase SHA-256 hex of UTF-8 JSON.stringify(code-unit-sorted unique UIDs)
  controlVersion: number;
  updatedAt: Timestamp;
}
```

Missing document, wrong types, overlong/duplicate allowlist, invalid or recomputation-mismatched digest, nonpositive version, or read failure means disabled.

- [ ] **Step 1: Write rules tests with the real emulator**

Cover owner, non-owner, and anonymous access. Prove:

- Device/runtime-private/schedule/delivery/binding/control reads and all client writes are denied.
- Runtime state owner get is allowed; list and writes are denied.
- Runtime absent retains existing legacy/client inbox behavior.
- Runtime active foreground permits only the three prefixes `foreground:v${configVersion}:daily-expense:*`, `foreground:v${configVersion}:recurring:*`, and `foreground:v${configVersion}:debt:*`, with matching `authorityConfigVersion`, no backend marker, allowed fields, and valid revision transaction.
- Runtime durable or fenced blocks new and legacy daily/recurring/debt time shapes.
- Budget/low-balance/unusual-spending events remain permitted without a backend marker.
- Backend-marked events cannot be forged or have event identity/stage/generation changed by clients; only current-revision read/dismiss fields may change.
- Cross-user, future-revision, stale-generation, unknown-field, and supersession forgery are denied.
- Legacy preference documents remain owner-readable for migration, but every create/update resultant document requires exact root keys `schemaVersion,timeZone,enabled,thresholds,quietHours,browserNotifications,dailyExpenseReminder`, `schemaVersion == 2`, and nonempty `timeZone` of at most 64 UTF-8 bytes. Nested keys are exact: `enabled` has `budget,recurring,unusualSpending,lowBalance,debt`; `thresholds` has `budgetWarning,budgetCritical,budgetExceeded,unusualSpending,lowBalance`; `quietHours` has `enabled,startHour,endHour`; `browserNotifications` has `enabled`; `dailyExpenseReminder` has `enabled,hour,minute`. Flags are booleans; hours are integers 0–23 and minute 0–59; numeric thresholds satisfy 0≤warning<critical≤100, critical≤exceeded≤200 with exceeded≥100, unusual spending 100–1000, and low balance≥0. Cross-user writes and unknown/missing fields are denied.

- [ ] **Step 2: Write fail-closed control and authority tests**

```ts
expect(parseNotificationControl(undefined).DELIVERY_ENABLED).toBe(false);
expect(canDispatch(control({ DELIVERY_ENABLED: true, canaryUids: ['u1'] }), 'u2')).toBe(false);
expect(admitDurableWriter({
  runtime: { authority: 'durable', configVersion: 4, activatedAt: now },
  authorityConfigVersion: 3,
})).toBe(false);
```

Also prove an Admin control mutation with stale `expectedControlVersion` cannot overwrite a concurrent `DELIVERY_ENABLED: false`; `null` is accepted only when the document is absent, a successful transaction increments exactly once, and exact read-back matches the requested allowlist/state/count/canonical digest. Backend reads reject a forged or stale digest even when the array itself is otherwise valid.

- [ ] **Step 3: Verify RED**

```powershell
npm.cmd run test:rules
npm.cmd --prefix functions run test:unit -- test/unit/authority.test.ts
npm.cmd run test:notifications:emulator
```

Expected: server-only collections are not defined and stale generation is not rejected.

- [ ] **Step 4: Implement rules and pure gates**

- Add narrow helper functions for time-event classification, runtime existence, exact active generation, immutable backend marker, and allowed read/dismiss updates.
- Add strict root and nested `keys().hasOnly(...)`/`hasAll(...)`, v2 result, boolean/number/integer, exact range/order, and timezone-length rules matching Step 1. Legacy docs remain readable but their next write must produce the complete valid v2 shape. Firestore Rules cannot prove IANA membership, so the backend planner validates with `Intl.DateTimeFormat`; an invalid stored zone pauses the schedule with sanitized `failureCode: 'invalid-time-zone'` and emits nothing.
- Detect legacy time events by both known type/metadata fields (`recurring`, `debt`, daily `reminderKey`) and known event-key shapes; a stale client cannot evade the gate by omitting the new prefix.
- Parse control and runtime data in pure Functions modules. Each worker path receives an explicit admitted generation; no ambient boolean.
- Add only index exemptions known now: raw `endpoint`, `p256dh`, and `auth` fields are unindexed. Composite worker indexes arrive with Task 16 after queries are final.

- [ ] **Step 5: Verify GREEN and commit**

```powershell
npm.cmd run test:rules
npm.cmd --prefix functions run test:unit -- test/unit/authority.test.ts
npm.cmd run test:notifications:emulator
git add firestore.rules firestore.indexes.json src/__tests__/firestore/notifications.rules.test.ts functions/src/notifications/control.ts functions/src/notifications/authority.ts functions/test/unit/authority.test.ts functions/test/integration/runtime.emulator.test.ts
git commit -m "feat(firestore): lock notification authority boundaries"
```

### Task 11: Register, inspect, rebind, revoke, and test devices securely

**Files:**

- Create: `functions/src/notifications/endpointSecurity.ts`
- Create: `functions/src/notifications/devices.ts`
- Modify: `functions/src/index.ts`
- Create: `functions/test/unit/endpointSecurity.test.ts`
- Create: `functions/test/integration/devices.emulator.test.ts`
- Create: `src/__tests__/functions/notificationCallables.emulator.test.ts`

**Callable contract:**

```ts
registerNotificationDevice
getNotificationDeviceStatus
revokeNotificationDevice
sendTestNotification
```

UID is always `request.auth.uid`. A response contains only `deviceId`, active/expired state, opaque `accountScope`, endpoint fingerprint, platform capability labels, timezone, and sanitized retry/error codes.

At the Task 11 checkpoint, `src/index.ts` exports only register/status/revoke. Task 11 also implements and emulator-tests a `sendTestNotification` handler factory with an injected `TestDeliveryPort`. Task 15 supplies the real Web Push port and then adds the fourth production export, so no temporary or fake production sender is committed.

- [ ] **Step 1: Write validation, authentication, and SSRF tests**

Reject:

- Missing Auth; body UID/account scope; non-UUID device ID; unknown fields; oversized endpoint/key/timezone values; malformed base64url keys.
- Non-HTTPS URL; credentials; fragment; explicit port other than 443; localhost; IP literal; DNS resolving to private, loopback, link-local, multicast, documentation, or cloud metadata ranges. Registration performs parse + DNS validation only and never probes the endpoint with HTTP.
- DNS answer set containing any disallowed address.

Use injected DNS/clock/network adapters in unit tests; no real outbound requests.

- [ ] **Step 2: Write binding, limit, rate, and revocation emulator tests**

Prove in one Firestore transaction:

- New endpoint creates one device and one global hash binding.
- Exact same user/device/subscription is an idempotent reconciliation and consumes no mutation quota.
- Same endpoint on a new device for the same user disables the old device and moves the binding without inflating the active count.
- Same endpoint registered by another user disables the old account's device before moving the binding; raw capability never appears in the binding.
- Same endpoint with a different `p256dh` or `auth` capability fingerprint is rejected and cannot disable or rebind the existing device.
- A sixth active distinct device fails without touching the five active devices.
- Registration permits at most 10 real mutations per user and 5 per device per rolling hour; rotating device IDs cannot evade the user limit.
- Test delivery permits one request per user and device per minute and returns an exact retry time.
- Test delivery rereads fail-closed `notificationControl/config` and requires the authenticated UID in the allowlist immediately before its adapter call; missing/false/non-canary produces sanitized `configuration` and zero external I/O, without requiring durable runtime authority.
- Revoke is idempotent and deletes the binding only if it still points to that user/device.
- 404/410 expiration later affects only the matching current binding.
- Revoke, rebind-out, and 404/410 scrub raw `endpoint`, `p256dh`, and `auth` in the same transaction; the 30-day tombstone retains only fingerprint/status/platform/failure/timestamps. Reactivation writes fresh capability and removes `retentionExpiresAt`.

- [ ] **Step 3: Verify RED**

```powershell
npm.cmd --prefix functions run test:unit -- test/unit/endpointSecurity.test.ts
npm.cmd run test:notifications:emulator
```

- [ ] **Step 4: Implement the secure boundary**

- Canonicalize endpoint URL and SHA-256 only the canonical value for global binding identity.
- Resolve with `dns.promises.lookup({ all: true, verbatim: true })`; reject if any answer is disallowed.
- Compare a server-computed capability fingerprint before any same-endpoint rebind; exact capability ownership may move across an authenticated account switch, mismatched keys never can.
- Store raw endpoint and keys only in the server-only device document.
- Create the user's random account scope exactly once in the runtime-private document and return it only in sanitized authenticated status; reuse it across that user's devices and authority generations.
- Store `notificationEndpointBindings/{endpointHash}` as `{ uid, deviceId, endpointHash, updatedAt }`.
- Use transactional rolling timestamp arrays for registration/test quotas; prune before count. Store user-level registration timestamps in runtime-private and device-level timestamps in the device document or its tombstone; an idempotent no-change reconciliation consumes neither quota.
- Implement test-request validation, idempotency, user/device one-per-minute reservation, and the immediate pre-I/O control/allowlist recheck behind an injected `TestDeliveryPort`; use a fake port in Task 11 tests and assert disabled/missing/non-canary control never invokes it.
- Require a client-generated UUID `testRequestId`; derive `eventId = eventIdFor('test:' + accountScope + ':' + deviceId + ':' + testRequestId)`, revision `1`, `deliveryId = deliveryIdFor({ accountScope, eventId, eventRevision: 1, deviceId })`, and the normal hashed Topic/tag, with `kind: 'test'`. Store only `lastTestRequest: { id, outcome, createdAt }` on the device; repeating that most recent request within the one-minute window returns its sanitized outcome and never creates a canonical financial inbox event or a new collection.
- Do not log request bodies, URLs, capability data, DNS answers, or raw thrown errors.
- On any disable/expiry/rebind-out path, delete capability fields immediately and set terminal `retentionExpiresAt`; TTL is not used as delayed secret cleanup.

- [ ] **Step 5: Verify GREEN and commit**

```powershell
npm.cmd --prefix functions run test:unit -- test/unit/endpointSecurity.test.ts
npm.cmd run test:notifications:emulator
npm.cmd --prefix functions run typecheck
git add functions/src/notifications/endpointSecurity.ts functions/src/notifications/devices.ts functions/src/index.ts functions/test/unit/endpointSecurity.test.ts functions/test/integration/devices.emulator.test.ts src/__tests__/functions/notificationCallables.emulator.test.ts
git commit -m "feat(notifications): bind push devices securely"
```

### Task 12: Derive durable schedules and backfill only the current unpaid lifecycle

**Files:**

- Create: `functions/src/notifications/schedules.ts`
- Create: `functions/src/admin/backfillNotificationSchedules.ts`
- Create: `functions/scripts/backfill-notification-schedules.ts`
- Modify: `functions/src/index.ts`
- Modify: `functions/package.json`, `functions/package-lock.json`
- Create: `functions/test/unit/schedules.test.ts`
- Create: `functions/test/integration/schedules.emulator.test.ts`

**Schedule paths and fields:**

```text
users/{uid}/notificationSchedules/daily
users/{uid}/notificationSchedules/recurring:{paymentId}
users/{uid}/notificationSchedules/debt:{debtId}
```

```ts
interface NotificationScheduleBase {
  sourceId: string;
  status: 'staged' | 'active' | 'paused' | 'complete';
  authorityConfigVersion: number;
  sourceVersion: string;
  timeZone: string;
  nextAt: Timestamp | null;
  expiresAt?: Timestamp;
  lastEvaluatedLocalDate: string | null;
  lastOutcome: 'emitted' | 'skipped' | null;
  lastScheduledAt: Timestamp | null;
  failureCode?: 'invalid-time-zone';
  leaseOwner?: string;
  leaseExpiresAt?: Timestamp;
  updatedAt: Timestamp;
}

type NotificationSchedule =
  | (NotificationScheduleBase & {
      kind: 'daily';
      sourceId: 'daily';
    })
  | (NotificationScheduleBase & {
      kind: 'recurring';
      cycleKey: string;
      dueLocalDate: string;
      stageWindow: 'd3' | 'd1' | 'due' | `overdue:${number}` | null;
    })
  | (NotificationScheduleBase & {
      kind: 'debt';
      dueLocalDate: string;
      stageWindow: DebtStageWindow | null;
    });
```

`sourceVersion` is lowercase SHA-256 of a canonical, path-sorted array of the bounded authoritative documents and query descriptors used by the plan:

```ts
type PaidProofQueryDescriptor =
  | {
      kind: 'exact-cycle-paid';
      recurringPaymentId: string;
      recurringCycle: string;
      paid: true;
      orderBy: '__name__';
      limit: 1;
    }
  | {
      kind: 'legacy-window-paid';
      recurringPaymentId: string;
      paid: true;
      dateGte: string;
      dateLt: string;
      orderBy: readonly ['date', '__name__'];
      limit: 1;
    };

type SourceVersionAtom =
  | { kind: 'doc'; path: string; updateTime: string }
  | {
      kind: 'query';
      descriptor: PaidProofQueryDescriptor;
      result: { path: string; updateTime: string } | null;
    };

type SourceVersionInput = readonly SourceVersionAtom[];
sourceVersion = sha256(stableJson([...sourceVersionInput].sort(compareCanonicalAtom)));
```

`compareCanonicalAtom` orders lexicographically by `kind`, then document path or the stable JSON descriptor; query `result: null` is the exact no-proof sentinel. Unit fixtures pin the serialized vector and lowercase SHA-256 so two implementations cannot hash equivalent reads differently.

Inputs are kind-specific: daily hashes preferences; recurring hashes preferences, its recurring source, and one bounded payment-proof descriptor/result; debt hashes preferences plus the debt source and only a bounded persisted resolution proof if that debt model actually requires one. Recurring proof first queries exact stamped proof with `recurringPaymentId == paymentId`, `recurringCycle == cycleKey`, `paid == true`, ordered by document ID, `limit(1)`. If absent, it queries legacy proof with `recurringPaymentId == paymentId`, `paid == true`, `date >= cycleStart`, `date < cycleEnd`, ordered by `date` then document ID, `limit(1)`. Digest the query descriptor plus the returned document path/update time, or `result: null`. Each trigger invocation rereads current authoritative state; a repeated or older trigger therefore recomputes the current digest and cannot replay its stale event image or scan unbounded history.

Event validity is pure and exact:

```ts
export function eventExpiresAt(input: {
  kind: 'daily' | 'recurring' | 'debt';
  scheduledAt: Date;
  evaluatedAt: Date;
  stageValidUntil: Date;
  endOfLocalDate: Date;
}): Date;
```

- Preserve original `scheduledAt` for diagnostics, but compute validity from the actual evaluation.
- Daily expires at `endOfLocalDate` and never crosses into the next local date.
- Recurring/debt expires at the earlier of `evaluatedAt + 24 hours` and `stageValidUntil`; D-2 catch-up may therefore emit D-3 until D-1 begins.
- If `evaluatedAt >= stageValidUntil`, record the stage skipped and advance without sending.

For a staged promotion, `targetConfigVersion` is deterministically the active runtime version plus one, or `1` when runtime is absent. Backfill and foreground-era triggers use that same target generation; Task 13 may prepare only that verified generation.

- [ ] **Step 1: Write pure schedule-planning tests**

Cover:

- Daily local time, missed daily catch-up, DST gap moves to first valid instant, DST repeated time selects first occurrence, and one local-date key.
- A worker first running on date N+1 never creates date-N's event: it records N in `lastEvaluatedLocalDate` with `lastOutcome: 'skipped'`/original `lastScheduledAt`, then evaluates at most the current N+1 event.
- Recurring existing-format `cycleKey`, ISO `dueLocalDate`, D-3/D-1/D0/D+1/D+8/D+15, unpaid month retention, paid jump to latest current cycle, month-end, leap year, annual anchor, inactive/deleted source.
- Debt borrowed/lent cadences and resolution from authoritative persisted debt/transaction state.
- Quiet-hour calculation moves `notBefore` to the end of the local quiet interval, including a cross-midnight window; `start == end` means an empty interval and never defers.
- Repeated triggers whose authoritative read-set digest is unchanged are no-ops; an out-of-order invocation still rereads current state and cannot restore an old digest/state.
- Canonical source-version fixtures pin doc/query atom ordering, stable descriptor serialization, exact-result and `result: null` vectors, and their lowercase SHA-256 outputs.
- Daily expiry never crosses local midnight; recurring/debt expiry is at most 24 hours after evaluation and never reaches the next stage window.
- Two workers racing a due schedule produce one transactional claim; an unexpired lease is not stolen and an expired lease is recovered.
- Schedule completion verifies `leaseOwner`, rereads authority/generation/source state, advances `stageWindow`/`nextAt` transactionally, and clears the lease.

- [ ] **Step 2: Write trigger and backfill emulator tests**

Use these v2 document triggers:

```text
users/{uid}/notificationPreferences/settings
users/{uid}/recurringPayments/{paymentId}
users/{uid}/debts/{debtId}
users/{uid}/transactions/{transactionId}
```

Prove:

- The transaction trigger recomputes the union of `recurringPaymentId`/`debtId` from before and after, covering link, unlink, payment, reversal, and delete.
- Every recomputation rereads authoritative documents; event payload input is not financial authority.
- The authoritative paid-proof query first uses `recurringPaymentId == paymentId`, `recurringCycle == cycleKey`, `paid == true`, ordered by document ID, `limit(1)`; only if absent does the bounded legacy fallback use `recurringPaymentId == paymentId`, `paid == true`, `date >= cycleStart`, `date < cycleEnd`, ordered by `date` then document ID, `limit(1)`.
- An emulator case with a paid legacy transaction lacking `recurringCycle` still resolves the correct date-window cycle and does not schedule or emit it.
- While runtime is absent/foreground, backfill writes only `staged` schedules for the deterministic next target generation and never events/deliveries.
- While a transition is fenced, synchronization may update or create only deterministic `staged` target schedules with the exact pending `toConfigVersion`; it cannot allocate another generation or create events/deliveries. This closes a source-created-between-prepare-and-activate gap.
- A source write for a legacy user with no runtime and no preprovisioned schedule is a trigger no-op: zero account-scope, runtime, schedule, event, and delivery documents. Only the explicit Admin backfill provisions allowlisted users; later triggers may update already-provisioned schedules.
- Durable active generation produces only matching active schedules.
- Backfill at one fixed cutoff chooses only the latest applicable unpaid cycle.
- Before choosing a new recurring cycle, backfill reads persisted hidden foreground/backend source lifecycle metadata for that payment. Selection is semantic and deterministic: prefer candidates whose `authoritySupersededByVersion` equals the target generation; otherwise use the greatest `authorityConfigVersion` (`null` compatibility lowest). Within that set, prefer `scheduled|active` over resolved; if anomalously multiple unpaid rows exist, preserve the oldest `dueLocalDate`; if all are resolved, use the newest `dueLocalDate`. Only then use latest `updatedAt` and lexical document ID as final tie-breaks. A June unpaid foreground cursor backfilled in August remains June through durable handoff instead of silently becoming August; foreground v1 → durable v2 → foreground v3 uses the lifecycle explicitly superseded into v3, not older history.
- Missing preference `timeZone` uses `America/Bogota` for staging; an explicitly invalid zone fails closed. The first authenticated app may later persist a detected valid zone and the preference trigger replans it.
- A successful replan with a valid zone clears any prior `failureCode: 'invalid-time-zone'`.
- Running backfill twice with the same cutoff reports `created=0, changed=0` on the second pass.
- A recurring/debt source created, disabled, paid, or resolved during a fence changes the deterministic expected active schedule map; synchronization stages the missing target or pauses the removed target, and activation cannot pass on the old set.

- [ ] **Step 3: Verify RED**

```powershell
npm.cmd --prefix functions run test:unit -- test/unit/schedules.test.ts
npm.cmd run test:notifications:emulator
```

- [ ] **Step 4: Implement the pure planner and idempotent synchronization**

- Use `Intl.DateTimeFormat(...).formatToParts()` in one tested zoned-calendar helper; add no timezone dependency.
- Trigger handlers ignore their stale event image beyond identifying affected source IDs, reread all authoritative documents, compute the sorted read-set digest, and delegate to one idempotent sync function.
- Before any provisioning write, classify authority explicitly. Runtime-absent or active-foreground users require an exact existing deterministic schedule or Admin provisioning marker, so ordinary source triggers never onboard a non-canary. A fenced transition may create only deterministic `staged` schedules for its journal/marker target generation. Once runtime is active durable, ordinary source/preference triggers are authorized to create or update deterministic `active` schedules only for that exact active generation, so a newly created recurring/debt source is not lost after the one-time marker is deleted.
- Ensure the server-only random account scope exists before staging that user's first schedule; never derive it from UID.
- Treat authenticated foreground notification lifecycle metadata as cursor authority during migration, ahead of calculating a fresh current cycle; guest local cursor data is never a server migration source.
- Use that semantic handoff/generation/lifecycle/due-date comparator for every authenticated cursor read, including rollback to foreground. Fixtures include same-generation/same-update-time resolved and scheduled rows plus multiple anomalous unpaid rows; hashed document ID is never treated as chronological meaning.
- Backfill is an Admin CLI, never a callable. Its literal grammar is `notifications:backfill -- --project <id> --uid-file <path> --cutoff <ISO instant> [--dry-run|--apply]`; mutation defaults to dry-run and only explicit `--apply` writes. Parser/forwarding tests start with ignored `lib` absent, then reject unknown/missing flags, simultaneous modes, invalid/duplicate UIDs, non-ISO cutoff, and project mismatch. It derives and prints the one target generation, refuses a conflicting pending transition, and outputs counts/IDs only, no financial data.
- Backfill resolves `--uid-file` and every output/cursor path through Task 9 `resolveInvocationPath`, so the documented `functions/.local/...` arguments are rooted at `INIT_CWD` rather than doubled under the package cwd.
- Backfill sets the exact target-generation `scheduleProvisioning` marker transactionally before creating its staged schedules; a source trigger cannot invent that authorization.
- Backfill never changes runtime authority, creates an event, creates a delivery, or sends push.
- The scheduled repository claims due schedules with a two-minute `leaseOwner`/`leaseExpiresAt`; completion or recovery is transactional. Reprocessing the same stage after a crash is harmless because Task 14 fan-out is idempotent for the same stage window.
- Change the Functions lint script to `eslint src test scripts` and add `"notifications:backfill": "npm run build && node lib/scripts/backfill-notification-schedules.js"`.

- [ ] **Step 5: Verify GREEN and commit**

```powershell
npm.cmd --prefix functions run test:unit -- test/unit/schedules.test.ts
npm.cmd run test:notifications:emulator
npm.cmd --prefix functions run typecheck
git add functions/src/notifications/schedules.ts functions/src/admin/backfillNotificationSchedules.ts functions/scripts/backfill-notification-schedules.ts functions/src/index.ts functions/package.json functions/package-lock.json functions/test/unit/schedules.test.ts functions/test/integration/schedules.emulator.test.ts
git commit -m "feat(notifications): synchronize durable reminder schedules"
```

### Task 13: Implement a resumable two-phase authority handoff

**Files:**

- Modify: `functions/src/notifications/authority.ts`
- Create: `functions/src/admin/setNotificationAuthority.ts`
- Create: `functions/scripts/set-notification-authority.ts`
- Create: `functions/scripts/set-notification-control.ts`
- Modify: `functions/package.json`, `functions/package-lock.json`
- Modify: `functions/test/unit/authority.test.ts`
- Modify: `functions/test/integration/runtime.emulator.test.ts`
- Modify: `src/hooks/useNotificationStore.ts`
- Modify: `src/__tests__/hooks/useNotificationStore.test.ts`

**Private transition journal:**

```ts
interface PendingAuthorityTransition {
  fromAuthority: 'foreground' | 'durable';
  fromConfigVersion: number | null;
  toAuthority: 'foreground' | 'durable';
  toConfigVersion: number;
  expectedControlVersion: number | null;
  preparedAt: Timestamp;
  maxPossibleAcceptanceExpiresAt: Timestamp | null;
  phase: 'prepared' | 'draining' | 'ready';
}
```

It lives only in `users/{uid}/notificationRuntime/private`; the client-readable state exposes the target authority/version and `activatedAt: null`.

- [ ] **Step 1: Write prepare, drain, resume, and activate tests**

Prove:

- Prepare is a transaction comparing the expected active authority/version, increments exactly once, writes target + `activatedAt: null`, and journals the outgoing generation.
- Runtime-absent compatibility prepares the first durable generation as `fromAuthority: 'foreground'`, `fromConfigVersion: null`, `toConfigVersion: 1`; reruns resume that same bootstrap.
- A repeated command resumes the same pending transition; it does not allocate another generation.
- A crash after final activation but before status/control handling is resumable with the same manifest: exact target authority at `expectedConfigVersion + 1`, `activatedAt != null`, and no pending journal is a completed no-op for `prepare`, `drain`, `verify`, and `activate`. Mixed batches may contain completed and exact-pending users; completed users are never allocated another generation while the rest resume. Any other target/version/journal combination aborts.
- Concurrent or wrong expected version fails without partial state.
- Read-only `inspect --uid-file` needs no circular manifest, normalizes absent runtime to foreground/null, exposes only sanitized active/pending authority and control fields, and supplies enough exact data to create or reconstruct a manifest without financial/capability reads.
- Absent control matches manifest `expectedControlVersion: null`; an existing false control matches only its exact version. Prepare persists that exact value in the private journal. Every resume phase requires manifest = journal = live control; enabled, malformed, or concurrently version-changed control aborts without changing runtime/schedules.
- A control-version change leaves the runtime safely fenced but not permanently stranded: only a separately authorized `rebase-control` command may adopt a newer exact false control version. It compares the old journal version, new manifest version, live false control, every pending user/target/version, updates only matching journals resumably, and never activates authority or enables delivery. Recreating a manifest alone cannot rebase a journal.
- The canonical UID file is an exact nonempty JSON array of at most 100 unique bounded UID strings. `fingerprint --uid-file` sorts them by Unicode code unit, hashes UTF-8 `JSON.stringify(sortedUids)` with SHA-256, and emits lowercase hex plus count. Control writes persist that digest beside the array and all backend control reads recompute it fail-closed.
- A lost response after durable enable is not ambiguous on rerun: only `DELIVERY_ENABLED: true`, `controlVersion = expected + 1`, exact UID count/digest, and every manifest user active at the exact target generation with no journal classify as completed. The same manifest then performs no second control mutation; wrong digest/count/version/state aborts and requires emergency disable/investigation.
- Fenced client/worker attempts fail.
- Drain resolves and sets `authoritySupersededAt`/`authoritySupersededByVersion` on the current outgoing `active` or already-existing `scheduled` lifecycle for each time source (without relabeling all resolved history), suppresses the exact nonterminal set `pending|sending|retrying|ambiguous`, and records the maximum `possibleAcceptanceExpiresAt` from every dispatch that started before or during the fence, including accepted, ambiguous, sending, and stale-result work.
- Drain sets every outgoing-generation schedule to `status: 'paused'` and clears its lease so the collection-group worker cannot repeatedly reclaim rejected old work; schedule documents do not use an extra superseded status.
- For a durable target, fenced promotion resumably changes only verified target-generation schedules from `staged` to `active`; a crash or concurrent target sync resumes safely, and workers still cannot process them before the final runtime CAS. For a foreground target, promotion changes no schedule and instead verifies every durable schedule is paused and lease-free.
- The expected durable map is derived from the latest authoritative preferences plus active recurring sources and unresolved debt sources. Its exact active schedule IDs and `sourceVersion` digests must equal the target-generation active map; extra target documents may exist only as paused/complete and lease-free.
- A source creation/disable/payment/resolution between prepare and activate forces the final check to retry or fail until the deterministic target map is synchronized; no empty or stale set can pass vacuously.
- A source created after durable activation produces its exact active-generation schedule without recreating the one-time provisioning marker; runtime-absent and active-foreground source creation still cannot self-onboard.
- Superseded event documents remain queryable for source state but disappear from visible inbox selectors.
- Durable activation's final compare-and-set transaction rereads authoritative preferences, recurring/debt sources, target schedules, and their digests; it fails unless outgoing work is drained and the expected active ID/digest map exactly matches active target-generation schedules with no staged/mismatched entry. Foreground activation fails unless zero schedules are active/leased. Durable → foreground also waits for `maxPossibleAcceptanceExpiresAt` from every dispatch-started outgoing delivery.
- Activation uses a final compare-and-set that also rereads exact disabled control/version, then clears the pending journal.
- Foreground → durable → foreground gives generations 1 → 2 → 3; a generation-1 client and generation-2 worker remain rejected after generation 3.
- Transactional emulator tests interleave every pair of runtime-private writers—account-scope creation, schedule provisioning/consumption, transition-journal prepare/rebase/final cleanup, and registration/test/dispatch quota reservation—in both orders. After each write, `accountScope`, `scheduleProvisioning`, `pendingAuthorityTransition`, and every unrelated quota array remain byte-for-byte unchanged unless that writer owns the field.
- Both CLIs reject unknown flags, missing required values, invalid booleans/`number|null`, more than 100 or duplicate UIDs, and simultaneous `--dry-run`/`--apply`. Authority read-only `inspect`/`verify`/`status` and control `status`/`fingerprint` reject mutation-mode flags; every mutating command defaults to dry-run.

- [ ] **Step 2: Verify RED**

```powershell
npm.cmd --prefix functions run test:unit -- test/unit/authority.test.ts
npm.cmd run test:notifications:emulator
npm.cmd run test:run -- src/__tests__/hooks/useNotificationStore.test.ts --no-file-parallelism
```

- [ ] **Step 3: Implement the Admin-only protocol**

The CLI requires `--project` plus an ignored per-user manifest such as `functions/.local/notification-authority-manifest.json`:

```ts
interface AuthorityManifest {
  project: string;
  expectedControlVersion: number | null;
  users: Array<{
    uid: string;
    expectedAuthority: 'foreground' | 'durable';
    expectedConfigVersion: number | null;
    targetAuthority: 'foreground' | 'durable';
  }>;
}
```

It supports explicit commands:

```text
notifications:authority -- prepare --project <id> --manifest <path> [--dry-run|--apply]
notifications:authority -- drain --project <id> --manifest <path> [--dry-run|--apply]
notifications:authority -- verify --project <id> --manifest <path>
notifications:authority -- activate --project <id> --manifest <path> [--dry-run|--apply]
notifications:authority -- status --project <id> --manifest <path>
notifications:authority -- inspect --project <id> --uid-file <path>
notifications:authority -- rebase-control --project <id> --manifest <path> --from-control-version <number|null> [--dry-run|--apply]
notifications:control -- status --project <id>
notifications:control -- fingerprint --uid-file <path>
notifications:control -- set --project <id> --uid-file <path> --delivery-enabled <true|false> --expected-control-version <number|null> [--dry-run|--apply]
```

- Every mutation defaults to dry-run and requires `--apply`; one global expected user authority/config version is forbidden because each UID carries its own, while `expectedControlVersion` is intentionally one document-wide control CAS.
- Initialize Admin with the explicit project and abort unless the manifest project, CLI project, `GCLOUD_PROJECT` when present, and initialized Admin project agree.
- Resolve `--manifest`/`--uid-file` only through Task 9 `resolveInvocationPath`; reject invocation outside the validated repository root. Production Admin commands require working, explicitly approved Application Default Credentials and never fall back to a credential file inferred from the repository.
- Every phase requires `notificationControl/config` absent or `DELIVERY_ENABLED = false` at the exact version shared by manifest and private journal; the final activation transaction rereads that control document and aborts atomically on enabled/malformed/version-changed state. This applies to both promotion and rollback, so a concurrent enable cannot make newly durable schedules eligible before the controlled enable CAS.
- Before mutating, every phase classifies each manifest UID as exact source state, exact pending transition, or exact completed target (`targetAuthority`, `expectedConfigVersion + 1`, active, journal absent). Completed targets are immutable no-ops in every phase, including a mixed partially completed batch; a state outside those three classes aborts instead of allocating or advancing a new generation.
- `rebase-control` is the sole recovery when a control CAS changes during a fence. Its new manifest retains every UID/authority/config/target field and changes only `expectedControlVersion` to the newly approved live false version; `--from-control-version` must equal every journal's old value. Dry-run/apply are idempotent across batches, mixed old/new journal values resume, any third value or user/target mismatch aborts, and successful read-back proves every journal adopted the new version while all runtime documents remain `activatedAt: null`. It cannot run when control is absent after having existed, enabled, or malformed, and it never changes the control document.
- Batch drain with deterministic resume cursors; every batch verifies the same pending transition.
- Treat absent runtime as foreground compatibility version `null`; only a verified staged generation `1` can bootstrap it, and the first prepare transaction creates the fenced runtime/private journal together.
- Before durable activation, recompute the current expected ID/digest map from authoritative sources, resumably create/update missing exact-generation staged schedules, pause removed targets, promote the expected set to `active`, and then use one final transaction to reread and compare the exact maps with `toConfigVersion`. Before foreground activation, promote none and verify zero schedules are active/leased. Both paths verify every outgoing schedule has `status: 'paused'` with no lease.
- All runtime-private journal/provisioning/quota updates use field-path updates or merge writes and preserve `accountScope` plus every unrelated nested field.
- The successful final CAS deletes only the completed `pendingAuthorityTransition` and its matching `scheduleProvisioning`; failed/resumable operations retain both.
- No Admin operation is exported as a callable or HTTP endpoint.
- `set-notification-control.ts` validates the exact UID file and writes only `DELIVERY_ENABLED`, `canaryUids`, canonical `canaryUidDigest`, `controlVersion`, and timestamp. Read-only `fingerprint` needs no project/credentials and emits exactly `{ canaryUidCount, canaryUidDigest }`; it rejects project/mutation flags. `set` requires `--expected-control-version <number|null>`; dry-run prints current → next, `--apply` uses a compare-and-increment transaction and aborts if the version changed, then reads the exact document back. A stale enable command therefore cannot overwrite a concurrent emergency disable.
- Read-only `inspect` accepts the same strict ignored UID file without needing a manifest and emits exactly `{ project, control, users }`; each user contains only `uid`, `runtimeExists`, normalized `authority`, `configVersion`, `activated`, and a sanitized pending journal (`fromAuthority`, `fromConfigVersion`, `toAuthority`, `toConfigVersion`, `expectedControlVersion`, `phase`) or `null`. An absent runtime normalizes to foreground compatibility version `null`. This is the sole bootstrap/read-back source for creating an initial or rollback manifest and permits exact reconstruction if the ignored manifest is lost; it rejects mutation flags.
- Manifest `status` emits exactly `{ project, users }`, where each requested user has the same sanitized `uid`, `runtimeExists`, `authority`, `configVersion`, `activated`, and pending-journal-or-null shape as `inspect`; it never treats printing as proof of target completion. `inspect` plus all read-only status/fingerprint commands emit exactly one sanitized JSON object to stdout (IDs/versions/statuses/digests only, including each pending journal's `expectedControlVersion`, no financial data or capabilities), making their read-back usable by the runbook; diagnostics go to stderr. Control status is exactly `{ exists, deliveryEnabled, controlVersion, canaryUidCount, canaryUidDigest }`, with version/digest `null` when absent. It recomputes and rejects an inconsistent stored digest instead of blessing malformed control.
- Add exact package aliases:

```json
{
  "notifications:authority": "npm run build && node lib/scripts/set-notification-authority.js",
  "notifications:control": "npm run build && node lib/scripts/set-notification-control.js"
}
```

The corresponding PowerShell call shapes are literal and executable:

```powershell
npm.cmd --prefix functions run notifications:authority -- prepare --project moneytrack-889fe --manifest functions/.local/notification-authority-manifest.json --dry-run
npm.cmd --prefix functions run notifications:control -- set --project moneytrack-889fe --uid-file functions/.local/notification-canary-uids.json --delivery-enabled false --expected-control-version null --dry-run
```

- [ ] **Step 4: Verify GREEN and commit**

```powershell
npm.cmd --prefix functions run test:unit -- test/unit/authority.test.ts
npm.cmd run test:notifications:emulator
npm.cmd run test:run -- src/__tests__/hooks/useNotificationStore.test.ts --no-file-parallelism
git add functions/src/notifications/authority.ts functions/src/admin/setNotificationAuthority.ts functions/scripts/set-notification-authority.ts functions/scripts/set-notification-control.ts functions/package.json functions/package-lock.json functions/test/unit/authority.test.ts functions/test/integration/runtime.emulator.test.ts src/hooks/useNotificationStore.ts src/__tests__/hooks/useNotificationStore.test.ts
git commit -m "feat(notifications): add two-phase authority handoff"
```

### Task 14: Persist canonical backend event revisions and deterministic fan-out

**Files:**

- Create: `functions/src/notifications/eventLifecycle.ts`
- Create: `functions/src/notifications/fanout.ts`
- Create: `functions/test/unit/eventLifecycle.test.ts`
- Create: `functions/test/integration/fanout.emulator.test.ts`

**Interfaces:**

```ts
export interface ScheduleLeaseToken {
  schedulePath: string;
  leaseOwner: string;
  leaseExpiresAt: Timestamp;
}

export async function processDueSchedule(input: {
  lease: ScheduleLeaseToken;
  now: Timestamp;
}): Promise<{
  outcome: 'emitted' | 'skipped' | 'replanned' | 'idempotent';
  eventId?: string;
  eventRevision?: number;
  deliveryIds: string[];
}>;
```

The public boundary accepts no free UID, account scope, event key, stage, or source copy. Inside one Firestore transaction, `processDueSchedule` rereads the leased schedule, active runtime/private state, current preferences, source document, the Task 12 bounded exact-or-legacy payment proof, active devices, event, and lower-revision deliveries; it recomputes `sourceVersion` and constructs an internal authoritative source projection. This transaction deliberately does not consult notification control: `DELIVERY_ENABLED` and canary membership gate only external adapter I/O in Task 15, not durable schedule evaluation, canonical inbox state, or deterministic fan-out. `buildAuthenticatedInboxProjection(sourceProjection)` then produces all required `Notification` fields:

- Daily: `type: 'info'`, title `Registra tus gastos`, message `No se te olvide agregar tus gastos de hoy.`, info severity, `/?view=transactions`, and `metadata.reminderKey/localDate`.
- Recurring: preserve current PaymentMonitor copy for D-3, D-1, due, and `overdue:n` (`days = 1 + 7n`), with `type: 'recurring'`, the existing info/warning/error severity, `/?view=recurring`, and payment ID/amount/cycle/due-date metadata.
- Debt: preserve current borrowed/lent title/message/severity rules, `/?view=debts`, and debt ID/remaining amount metadata.
- Active/scheduled projection: `isRead: false` unless that current revision was already read, plus server timestamps `createdAt` and `updatedAt`, `schemaVersion: 2`, event identity/stage/lifecycle fields, immutable backend marker, and authority generation. Resolution preserves revision, sets `lifecycleStatus: 'resolved'`, `isRead: true`, and `readRevision` to that current revision while suppressing every nonterminal delivery. Preserve `createdAt` on later lifecycle mutations and refresh `updatedAt`; `scheduledAt` remains the logical occurrence time.

This identifying projection exists only in the authenticated inbox document. Per-device delivery and operating-system payloads use the Task 5 generic constant copy.

- [ ] **Step 1: Write event/fan-out race tests**

Prove:

- First event gets revision 1; valid higher stage and resolved → same-stage reactivation get current + 1; same/lower stage is idempotent.
- Paid resolution preserves the current revision, sets `isRead: true`/`readRevision` to it, creates no new fan-out, and suppresses `pending|sending|retrying|ambiguous` delivery work.
- Durable v2 → foreground v3 → durable v4 reuses the same backend event document: reactivation allocates prior revision + 1, stamps generation 4, clears `authoritySupersededAt`/`authoritySupersededByVersion`, becomes visible/unread, and never creates a second backend lifecycle.
- Two workers racing the same stage create one revision and one delivery per active device.
- Wrong/expired lease ownership cannot process; a source or preference change between claim and processing replans/advances the schedule without emitting stale copy.
- Event revision, lower-delivery suppression, new deliveries, schedule `nextAt`/stage/outcome, and lease release commit atomically; an aborted transaction leaves none of them partially changed.
- Two devices produce two deterministic delivery IDs for one event/revision.
- A higher revision transactionally suppresses every nonterminal lower-revision delivery.
- Runtime missing/foreground/fenced/wrong generation aborts before event write.
- Every created delivery stores the exact active `authorityConfigVersion`; its fan-out transaction and every delivery lease fixture reject a missing or mismatched delivery generation without mutation.
- Client-authored or missing `deliverySource: 'backend'` is never fanned out.
- Account A event cannot target account B device even if IDs collide.
- No active device still creates the canonical authenticated inbox event but zero delivery records.
- Missing/false/malformed/non-canary control still permits an active durable schedule to maintain its canonical inbox event and deterministic pending delivery records; it never suppresses Task 14 event/fan-out state.
- Daily/recurring/debt payload source contains no financial copy.
- Projection tests assert every required root inbox field and exact current Spanish copy, while delivery fixtures contain no source name, amount, person, or message.

- [ ] **Step 2: Verify RED**

```powershell
npm.cmd --prefix functions run test:unit -- test/unit/eventLifecycle.test.ts
npm.cmd run test:notifications:emulator
```

- [ ] **Step 3: Implement one transaction per logical revision**

- Re-read the schedule lease, active durable runtime/exact generation, private account scope, preferences, source, and relevant transactions inside the transaction; recompute the sorted source digest.
- If the digest changed, persist the new plan and clear the lease without emitting. If the current stage expired, record it skipped and advance atomically.
- Hash event key and delivery identities with Task 9 contracts.
- Read at most five active devices and prior nonterminal deliveries before writes.
- Write/update the canonical notification with immutable `deliverySource: 'backend'`, `authorityConfigVersion`, current lifecycle revision, and constant kind metadata.
- Suppress lower revision records and create current deterministic deliveries with the exact active `authorityConfigVersion` in the same transaction.
- Build the full authenticated inbox projection from the authoritative source union above, but store only event identity/kind in delivery; never duplicate financial metadata into delivery or push payload.
- Advance `nextAt`/stage/outcome and clear the exact schedule lease in the same event/fan-out transaction.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
npm.cmd --prefix functions run test:unit -- test/unit/eventLifecycle.test.ts
npm.cmd run test:notifications:emulator
npm.cmd --prefix functions run typecheck
git add functions/src/notifications/eventLifecycle.ts functions/src/notifications/fanout.ts functions/test/unit/eventLifecycle.test.ts functions/test/integration/fanout.emulator.test.ts
git commit -m "feat(notifications): fan out canonical event revisions"
```

### Task 15: Lease, rate-limit, and dispatch Web Push with bounded retries

**Files:**

- Create: `functions/src/notifications/delivery.ts`
- Create: `functions/src/notifications/webPush.ts`
- Modify: `functions/src/index.ts`
- Create: `functions/test/unit/delivery.test.ts`
- Create: `functions/test/unit/webPush.test.ts`
- Create: `functions/test/integration/delivery.emulator.test.ts`

**Delivery state:**

```ts
type DeliveryStatus =
  | 'pending'
  | 'sending'
  | 'retrying'
  | 'accepted'
  | 'ambiguous'
  | 'expired'
  | 'failed'
  | 'suppressed';
```

Configuration is declared exactly:

```ts
const webPushVapidPrivateKey = defineSecret('WEB_PUSH_VAPID_PRIVATE_KEY');
const webPushVapidPublicKey = defineString('WEB_PUSH_VAPID_PUBLIC_KEY');
const webPushVapidSubject = defineString('WEB_PUSH_VAPID_SUBJECT');
```

Only the scheduled worker and `sendTestNotification` include `secrets: [webPushVapidPrivateKey]`. Source triggers, register/status/revoke callables, and Admin CLIs cannot read the secret. Runtime validates only that the private key derives `WEB_PUSH_VAPID_PUBLIC_KEY`; equality with the separately built static client's `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` is a predeploy artifact check in Task 18.

One `onSchedule` function uses the exact Scheduler contract `schedule: '*/5 * * * *'` and `timeZone: 'Etc/UTC'` in `us-central1`, with `minInstances: 0`, `maxInstances: 1`, function `concurrency: 1`, `timeoutSeconds: 240`, one page of at most 100 schedules plus one page of at most 100 deliveries, delivery concurrency 5, an internal 210-second stop deadline, recoverable two-minute leases, a three-second DNS deadline, and a 15-second external request timeout. Work not started before a limit/deadline remains due for the next invocation. These deployed options bound global external-send concurrency for this function to five; leases still make manual/retried overlap safe.

- [ ] **Step 1: Write retry, lease, expiry, and quota tests**

Prove:

- A worker first queries `sending` deliveries whose `leaseExpiresAt <= now` and transactionally transitions matching stale claims to `ambiguous` while releasing the lease; it then claims only due `pending|retrying|ambiguous` work whose delivery `authorityConfigVersion` matches the exact active durable generation.
- Expired `sending` lease recovery preserves dispatch-started possible-acceptance evidence and records ambiguous prior ownership; an active lease is not stolen.
- After an expired lease is reclaimed by a newer same-generation owner, the old owner's late result fails the lease compare-and-set and leaves status, lease owner/expiry, attempts, dispatch evidence, and all successor work unchanged.
- Every lease/event/runtime/control check is repeated immediately before the external request.
- `DELIVERY_ENABLED` false, malformed control/digest, UID absent from the canonical allowlist, wrong generation, superseded event, lower revision, disabled device, `notBefore` future, or expired event stops before the network. Control failures are external-I/O gates only: release the lease, leave the delivery pending with a bounded retry time, and increment no dispatch attempt; they do not undo the canonical inbox event or deterministic fan-out.
- Immediately before I/O, reread authoritative notification preferences/timezone and recompute quiet hours. Enabling or making quiet hours more restrictive after fan-out moves `notBefore` to the new end and releases the lease with no attempt. Disabling or relaxing quiet hours does not eagerly scan/wake documents whose existing `notBefore` is still in the future: they remain pending until that prior boundary, then the current preflight permits sending. This bounded over-deferral avoids a paginated wake-up writer and never loses the delivery. Invalid IANA data fails closed with sanitized `invalid-time-zone`, no attempt, and a bounded retry wakeup until the preference trigger repairs it.
- Dispatch reservation transaction prunes an exact bounded timestamp array, permits at most 60 user attempts in a rolling hour, and defers excess before the external request.
- `attempts` increments only immediately before a request; retries use 1 minute, 5 minutes, 30 minutes, then 2 hours; maximum five attempts/24 hours and never after `expiresAt`.
- Before any network I/O, one transaction sets `status: 'sending'`, `dispatchStartedAt`, and `possibleAcceptanceExpiresAt = min(eventExpiresAt, dispatchStartedAt + 3600 seconds)`. That evidence is never cleared by a cutover or stale result.
- 201/202 → `accepted`; 404/410 → expire only current device/binding; 429/5xx/network-before-response → `retrying`; timeout/reset after possible write → `ambiguous`; 401/403 → configuration failure without expiring device; every other 4xx (including 400/413) → terminal `failed` with sanitized `http-4xx` while the device remains active.
- Result commit first rechecks the same lease owner/expiry; a mismatch aborts without mutation, even if the runtime generation also changed. With the lease still matching, it compares the delivery's exact `authorityConfigVersion` against an active durable runtime; a missing/mismatched generation cannot apply the adapter result and may suppress old-generation nonterminal work while retaining `dispatchStartedAt`/`possibleAcceptanceExpiresAt`.
- If a cutover lands after the final preflight check but before/during I/O, result handling sets the old delivery to `suppressed` and retains its possible-acceptance expiry so rollback remains fenced long enough; deliveries have no separate superseded status.
- Instrumented tests prove at most five external sends run concurrently, no invocation starts more than 100 schedules or 100 deliveries, the internal deadline stops new claims, and remaining documents stay pending/due. A pure/exported option fixture asserts `maxInstances: 1`, function `concurrency: 1`, `timeoutSeconds: 240`, and internal deadline 210 seconds.
- Race tests change quiet-hour enable/start/end/timezone between fan-out and send. They prove a newly restrictive current preference defers before I/O, while a relaxation leaves a future persisted `notBefore` untouched and sends only when that prior boundary becomes due.
- Cross-midnight quiet hours defer to the next local end; `start == end` is empty and does not defer.
- Terminal deliveries set `retentionExpiresAt = terminalAt + 30 days`; `pending`, `sending`, `retrying`, and `ambiguous` deliveries never carry diagnostic retention TTL.

- [ ] **Step 2: Write Web Push adapter and privacy tests**

Prove:

```ts
payloadExpiresAt = min(eventExpiresAt, dispatchStartedAt + 3600 seconds)
TTL = max(0, floor((payloadExpiresAt - dispatchStartedAt) / 1000))
Topic = base64url(sha256(`${accountScope}:${eventId}`)).slice(0, 32)
```

- Notification tag is exactly `moneytrack-${Topic}` and is stable across event revisions.
- Serialized payload is at most 4 KiB and exactly matches the Task 5 contract/copy table.
- Payload `expiresAt` is `payloadExpiresAt`; a test notification uses a five-minute validity window.
- VAPID public/private P-256 pair validation succeeds for one pair and rejects mismatch before sending.
- Test callable delivery also rereads the same fail-closed control/UID allowlist immediately before adapter I/O; absent/false/non-canary control returns sanitized `configuration` with zero Web Push calls, while authority mode is irrelevant to this explicit diagnostic.
- Endpoint DNS is revalidated at dispatch. A custom `https.Agent` pins only the validated public addresses through `lookup` while preserving hostname/SNI; redirects and newly private answers are rejected.
- Any 3xx push-service response is terminal `redirect-disallowed`; the adapter never follows `Location`.
- Web-push options include TTL, Topic, normal urgency, timeout/abort boundary, and the pinned agent.
- Sanitized result logs contain delivery ID prefix/status/HTTP class only.

- [ ] **Step 3: Verify RED**

```powershell
npm.cmd --prefix functions run test:unit -- test/unit/delivery.test.ts test/unit/webPush.test.ts
npm.cmd run test:notifications:emulator
```

- [ ] **Step 4: Implement the scheduled worker and adapter**

- Export the scheduled function exactly as `dispatchNotificationWork`; one invocation first pages due schedules through the Task 14 fan-out boundary, then pages stale `sending` recovery and due deliveries.
- Claim each schedule transactionally, then call Task 14 `processDueSchedule`, which revalidates source/runtime and commits event/fan-out plus schedule advancement/lease release atomically.
- Bind `WEB_PUSH_VAPID_PRIVATE_KEY` as a Functions secret only to the scheduled worker and `sendTestNotification`.
- Read `WEB_PUSH_VAPID_PUBLIC_KEY` and `WEB_PUSH_VAPID_SUBJECT` from the two declared nonsecret parameters; require a valid HTTPS or `mailto:` subject, derive the public point from the private key, compare it with the server public-key parameter, and fail before first send on mismatch.
- Use an injected adapter in tests; emulator tests never call an external push service.
- Wire the Task 11 `TestDeliveryPort` to the real adapter and export `sendTestNotification` from `src/index.ts`. Exercise its handler factory against emulator Firestore with a fake port; do not add a production switch that can select the fake adapter.
- On 404/410, expire the device, scrub its raw capability, and delete the global binding only if it still matches.
- On ambiguous acceptance, reuse the same `deliveryId`, Topic, and tag; the service worker supplies final presentation dedupe.

- [ ] **Step 5: Verify GREEN and commit**

```powershell
npm.cmd --prefix functions run test:unit -- test/unit/delivery.test.ts test/unit/webPush.test.ts
npm.cmd run test:notifications:emulator
npm.cmd --prefix functions run typecheck
npm.cmd --prefix functions run lint
git add functions/src/notifications/delivery.ts functions/src/notifications/webPush.ts functions/src/index.ts functions/test/unit/delivery.test.ts functions/test/unit/webPush.test.ts functions/test/integration/delivery.emulator.test.ts
git commit -m "feat(notifications): lease and dispatch web push"
```

### Task 16: Wire emulators, indexes, TTL, CI, and the operational runbook

**Files:**

- Modify: `functions/src/notifications/vapidMaterial.ts`, `functions/package.json`, `functions/package-lock.json`
- Create: `functions/scripts/generate-vapid-material.ts`
- Modify: `functions/test/unit/vapidMaterial.test.ts`
- Create: `scripts/verify-notification-vapid-artifact.mjs`, `scripts/verify-firestore-notification-infrastructure.mjs`
- Create: `scripts/__tests__/verify-notification-vapid-artifact.test.mjs`, `scripts/__tests__/verify-firestore-notification-infrastructure.test.mjs`
- Modify: `firebase.json`
- Modify: `firestore.indexes.json`
- Modify: `package.json`, `package-lock.json`
- Modify: `.github/workflows/nextjs.yml`
- Inspect/retain: `functions/.gitignore`
- Create: `docs/runbooks/durable-notifications.md`
- Create: `src/__tests__/functions/notificationEndToEnd.emulator.test.ts`
- Create: `functions/test/integration/endToEnd.emulator.test.ts`

**Required Firestore query/index contract:**

```text
COLLECTION_GROUP notificationSchedules: status ASC, nextAt ASC
COLLECTION_GROUP notificationDeliveries: status ASC, notBefore ASC
COLLECTION_GROUP notificationDeliveries: status ASC, leaseExpiresAt ASC
COLLECTION notificationDeliveries: eventId ASC, status ASC, eventRevision ASC
COLLECTION transactions: recurringPaymentId ASC, recurringCycle ASC, paid ASC
COLLECTION transactions: recurringPaymentId ASC, paid ASC, date ASC
```

Field overrides disable indexing for `endpoint`, `p256dh`, and `auth`. TTL is enabled on `retentionExpiresAt` for `notificationDevices` and `notificationDeliveries`; terminal retention is 30 days, while nonterminal deliveries omit the field. `expiresAt` remains delivery validity, not diagnostic TTL.

The two TTL entries are exact `fieldOverrides` with `collectionGroup` `notificationDevices`/`notificationDeliveries`, `fieldPath: 'retentionExpiresAt'`, `ttl: true`, and `indexes: []`. `scripts/verify-notification-vapid-artifact.mjs` accepts one expected public key from either `--expected-public-key-env <name>` or `--expected-public-dotenv <path>` (mutually exclusive), validates its uncompressed P-256 shape, and accepts optional `--peer-public-dotenv <path>` exactly once. The peer file must contain the server-side `WEB_PUSH_VAPID_PUBLIC_KEY`; the expected dotenv uses client-side `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`; both must parse exactly once and match byte-for-byte before artifact inspection. It supports two mutually exclusive targets: `--out <directory>` scans bounded built JavaScript bytes, while `--base-url <https-url>` fetches the deployed HTML and recursively follows only same-origin JavaScript references discovered in that HTML/JavaScript under strict file-count, depth, and total-byte bounds (covering Next.js dynamic chunks). It requires the exact key in the selected artifact and never accepts or reads private material. Release checks pass `--expected-release-sha <40-lowercase-hex>`: local mode reads `out/sw.js`, remote mode fetches base-path `sw.js`, and both accept only the exact injected `CACHE_VERSION` suffix equal to the first seven SHA characters; remote mode rejects a missing SHA so a later Pages deployment fails read-back even if it reused the same public key. Pure Node tests cover mutually exclusive/missing/duplicate flags, empty/malformed/mismatched expected and peer keys, malformed SHA, missing/mismatched artifact key or worker version, traversal, cyclic graphs, cross-origin script exclusion, depth/count/byte bounds, dynamic chunks, and the real `/Moneytrack/` base path.

`scripts/verify-firestore-notification-infrastructure.mjs --manifest firestore.indexes.json --stdin` reads one JSON envelope from stdin containing Firebase's deployed index/field-override result plus gcloud composite-index and TTL lists. It normalizes the official response shapes, compares every required notification composite/field override to the local manifest, requires each matching composite state `READY`, and requires one exact `notificationDevices.retentionExpiresAt` plus one exact `notificationDeliveries.retentionExpiresAt` policy with state `ACTIVE` while permitting unrelated project TTL policies; missing, creating, repair/error, duplicate-required, or mismatched definitions exit nonzero. Fixture tests cover all state/name/field-order/query-scope failures without contacting production.

- [ ] **Step 1: Write the full emulator smoke path**

One test must:

1. Create an Auth emulator user and authoritative Firestore sources.
2. Call the real Functions-emulator register endpoint once without Auth and once with an invalid schema that fails before DNS, proving export/Auth/error wiring without outbound traffic.
3. Invoke the same register handler factory with authenticated context plus injected public-DNS resolver against Firestore Emulator to create the successful device deterministically.
4. Backfill/synchronize a staged schedule.
5. Activate a test runtime generation through the Admin module.
6. Process the schedule and an injected accepted delivery.
7. Assert one canonical inbox event, one delivery, sanitized handler response, and no cross-user reads.

No emulator test contacts real DNS or a push service, and production has no fake-adapter environment switch.

- [ ] **Step 2: Verify RED**

```powershell
npm.cmd run test:notifications:emulator
```

Expected: Functions/emulator scripts, final indexes, and smoke integration are incomplete.

- [ ] **Step 3: Complete Firebase and package configuration**

- `firebase.json` points Functions to `functions`, retains static hosting behavior unchanged, and configures Auth/Firestore/Functions emulators.
- Root scripts:

```json
{
  "test:rules:run": "vitest run src/__tests__/firestore --no-file-parallelism --config vitest.config.mjs --configLoader runner",
  "test:notifications:unit": "npm --prefix functions test",
  "test:notification-ops": "node --test scripts/__tests__/verify-notification-*.test.mjs",
  "test:notifications:emulator": "npm --prefix functions run build && npm --prefix functions run notifications:prepare-emulator -- --project demo-moneytrack && npx --yes firebase-tools@15.24.0 emulators:exec --only auth,firestore,functions --project demo-moneytrack \"npm run test:rules:run && npm --prefix functions run test:integration && npm run test:run -- src/__tests__/functions --no-file-parallelism --passWithNoTests\"",
  "test:notifications": "npm run test:notifications:unit && npm run test:notification-ops && npm run test:notifications:emulator"
}
```

- `functions/.gitignore` excludes `.local/`, emulator exports, logs, `.env.*`, and `.secret.local`; `.env.local`, `.env.moneytrack-889fe`, and every generated private file remain untracked.
- Keep root `test:rules:run` directory-scoped to `src/__tests__/firestore`; do not start a nested Firestore emulator inside the combined emulator command.
- Keep a single lockfile per package and no root runtime dependency.

Add the literal package alias `"notifications:generate-vapid": "npm run build && node lib/scripts/generate-vapid-material.js"`; forwarding tests invoke it from a clean ignored-`lib` state and prove it builds before parsing the supplied flags. `generate-vapid-material.ts` uses locked `web-push` 3.6.7, verifies the generated pair locally, and accepts explicit `--project`, `--subject`, `--functions-env-output`, `--client-env-output`, and `--private-output`; the two dotenv flags use Task 9 `resolveInvocationPath`, while the explicit absolute private flag uses the closed OS-temp resolver. It requires the two public dotenv outputs to be the ignored exact production paths, writes only public/subject variables there, requires a nonexistent private path beneath the resolved operating-system temp directory and outside the repository, and creates it exclusively with mode `0600` where supported. The private file contains only the raw base64url key bytes with no BOM or trailing newline so `--data-file` cannot alter the secret. The helper prints only a public-key fingerprint and paths; it never emits the private key or a JSON object containing it. Parser tests reject unknown/missing flags, an invalid subject, missing/invalid `INIT_CWD`, existing files, repository/private path escape, a newline/BOM-bearing private fixture, and a mismatched pair.

- [ ] **Step 4: Add validation-only CI**

In the Ubuntu `validate` job, after root installation, CI installs/builds the isolated package and creates fresh demo-only emulator material before any root build. The preparer MUST be its own Actions step because GitHub exposes values appended to `$GITHUB_ENV` only to subsequent steps, never to the step that writes them:

```yaml
- name: Install and build notification backend
  run: |
    npm --prefix functions ci
    npm --prefix functions run build
- name: Prepare demo-only notification environment
  run: npm --prefix functions run notifications:prepare-emulator -- --project demo-moneytrack --github-env "$GITHUB_ENV"
- name: Validate notifications and static artifact
  run: |
    npm --prefix functions audit --audit-level=low
    npm --prefix functions run lint
    npm --prefix functions run typecheck
    npm run test:notifications
    npx --no-install next build
    node scripts/verify-notification-vapid-artifact.mjs --expected-public-key-env NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY --out out
```

The non-PR `build` job sets `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY: ${{ vars.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY }}` and runs the existing `inject-sw-version.mjs` with full `$GITHUB_SHA`. After `next build` and before `upload-pages-artifact`, it runs `node scripts/verify-notification-vapid-artifact.mjs --expected-public-key-env NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY --expected-release-sha "$GITHUB_SHA" --out out`; the verifier requires the public key and exact `v3-${GITHUB_SHA:0:7}` worker version. An unset, malformed, absent, or wrong-SHA artifact fails the release. It never substitutes the demo key in the deploy job. CI uses Node 22 and Java 21, caches package managers normally, and contains no `firebase deploy`, billing/API mutation, Secret Manager write, backfill, authority transition, or control enablement.

- [ ] **Step 5: Write the runbook**

Document:

- Collection/data-flow map and privacy boundary.
- `nam5` → `us-central1` region decision and mandatory live recheck.
- VAPID subject/key-pair validation, secret rotation, client public-key redeploy, and resubscription behavior.
- Predeploy verification that the local static artifact embeds the expected public key, the deploy job obtains that same value from GitHub Actions variable `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`, and the published Pages HTML/same-origin JavaScript plus base-path `sw.js` prove both the key and exact approved SHA; Functions runtime cannot inspect that client artifact.
- The nonsecret server source is ignored `functions/.env.moneytrack-889fe` with exact `WEB_PUSH_VAPID_PUBLIC_KEY` and `WEB_PUSH_VAPID_SUBJECT`; the local client source is ignored root `.env.production.local`, while the Pages release source is the public GitHub repository variable. The runbook requires equality/read-back of all three public sources plus the local and published artifact, and deployed environment-variable read-back afterward without printing any secret value.
- Exact TTL/index verification commands and the requirement that both TTL policies report `ACTIVE` before Functions deploy.
- Control document fail-closed behavior and canary allowlist.
- Two-phase authority commands, journal-persisted control version, separately authorized `rebase-control` recovery, resumability, generation invariants, accepted-payload expiry wait, and rollback order.
- Device/rate/retry/lease/TTL/cost bounds.
- Exact diagnostic queries using IDs/status only.
- Physical Android installed-PWA and iPhone/iPad Home Screen closed-app checklist.
- Explicit statement that push-service acceptance is not proof the OS displayed the notification.

- [ ] **Step 6: Verify GREEN and commit**

```powershell
npm.cmd run test:notifications:emulator
npm.cmd --prefix functions run lint
npm.cmd --prefix functions run typecheck
git diff --check
git add firebase.json firestore.indexes.json package.json package-lock.json .github/workflows/nextjs.yml functions/.gitignore functions/package.json functions/package-lock.json functions/src/notifications/vapidMaterial.ts functions/scripts/generate-vapid-material.ts functions/test/unit/vapidMaterial.test.ts docs/runbooks/durable-notifications.md scripts/verify-notification-vapid-artifact.mjs scripts/verify-firestore-notification-infrastructure.mjs scripts/__tests__/verify-notification-vapid-artifact.test.mjs scripts/__tests__/verify-firestore-notification-infrastructure.test.mjs src/__tests__/functions/notificationEndToEnd.emulator.test.ts functions/test/integration/endToEnd.emulator.test.ts
git commit -m "ci(notifications): validate durable delivery gates"
```

### Task 17: Run the complete local quality and regression gate

**Files:**

- Modify only files required to repair failures attributable to Tasks 1–16.
- Inspect: generated `public/sw.js` hash/update caused by the static build.
- Do not deploy or contact a real push endpoint.

- [ ] **Step 1: Run dependency and package gates**

```powershell
npm.cmd ci
npm.cmd --prefix functions ci
npm.cmd audit --audit-level=low
npm.cmd --prefix functions audit --audit-level=low
```

Expected: clean installs and zero vulnerabilities at `low` or higher in both packages.

- [ ] **Step 2: Run focused and full automated validation**

```powershell
if ($PSVersionTable.PSVersion -lt [version]'7.3') { throw 'Validation requires PowerShell 7.3+ native-command error propagation.' }
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
npm.cmd --prefix functions run lint
npm.cmd --prefix functions run typecheck
npm.cmd --prefix functions run test
npm.cmd run test:notifications:emulator
npm.cmd run test:run -- --no-file-parallelism --reporter=dot
npm.cmd run typecheck
npm.cmd run lint
$notificationValidationSwPath = [System.IO.Path]::GetFullPath('public/sw.js')
$notificationValidationSwBytes = [System.IO.File]::ReadAllBytes($notificationValidationSwPath)
try {
  npm.cmd run build
} finally {
  [System.IO.File]::WriteAllBytes($notificationValidationSwPath, $notificationValidationSwBytes)
}
git diff --exit-code -- public/sw.js
```

Expected: every command exits 0. The existing build script temporarily injects the current SHA into tracked `public/sw.js`; the `finally` restores its exact pre-build bytes and the final diff gate proves no generated version leaked into the working tree. Any semantic worker change must already have been implemented, tested, and committed by Task 5 rather than retained from a build.

- [ ] **Step 3: Validate specifications, whitespace, and accidental artifacts**

```powershell
npx.cmd --yes @fission-ai/openspec@1.6.0 validate harden-notification-delivery-and-recurring-reminders --strict
git diff --check
rg -n "TO[D]O|FIX[M]E|T[B]D|PLACE[H]OLDER" src functions public docs/runbooks openspec/changes/harden-notification-delivery-and-recurring-reminders
git status --short
```

Expected: OpenSpec valid, no whitespace errors, no placeholder hits in changed implementation, and only intentional files.

- [ ] **Step 4: Rebuild and review the knowledge graph**

```powershell
uvx code-review-graph build --repo "C:\Users\camilo.guzman_pragma\Desktop\Moneytrack"
```

Then use `detect_changes`, `get_affected_flows`, and `tests_for` queries. Confirm coverage for notification lifecycle, recurring payment completion/link/unlink/delete, finance hydration, sign-out, service worker, Firestore rules, Functions triggers, fan-out, leases, device rebinding, and authority transitions.

- [ ] **Step 5: Perform local visual and accessibility QA**

Use the production static build and inspect notification preferences/center at:

- 320×568 and 390×844 mobile.
- 1214×768 and 1440×900 desktop.
- Light/dark, keyboard-only, 200% zoom, reduced motion.

Verify no horizontal overflow, stable focus, named controls, one clear device action, readable async status, valid error focus, existing header/shell order, and no console errors. Physical closed-PWA delivery remains unchecked because local emulation cannot prove it.

- [ ] **Step 6: Record verification evidence and commit repairs**

Record exact test counts, audit results, build result, OpenSpec result, graph impact summary, and remaining physical/deployment gates in the runbook. If verification exposes a defect, return to its owning task, stage only that task's exact reviewed paths, rerun its RED/GREEN gate, and commit there. Never use a broad staging command.

If and only if the runbook gained verification evidence:

```powershell
git diff -- docs/runbooks/durable-notifications.md
git add docs/runbooks/durable-notifications.md
git commit -m "docs(notifications): record local verification evidence"
```

Do not create an empty commit.

### Task 18: Controlled production rollout — blocked until separately authorized

This task is intentionally unchecked. It changes billing-backed infrastructure, secrets, a public GitHub Actions variable/Pages deployment, Firestore configuration, production code, and user-visible delivery. Execute only after the user authorizes the exact project, reviewed SHA/workflow dispatch, deployment set, canary accounts, and secret/control mutations.

Every block deliberately repeats a PowerShell 7.3+ fail-fast preamble. Do not remove it: native Firebase/gcloud/gh/npm/git failures must become terminating errors before any later read or mutation runs.

- [ ] **Step 1: Reconfirm live project, database, billing, APIs, and region**

The planning host currently has no `gcloud` executable on `PATH`, so this production task is blocked even if later authorized until the pinned/approved Google Cloud CLI is installed or its exact trusted path is supplied. Once available, run these read-only checks without auto-enabling anything:

```powershell
if ($PSVersionTable.PSVersion -lt [version]'7.3') { throw 'Task 18 requires PowerShell 7.3+ native-command error propagation.' }
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$notificationProjectId = 'moneytrack-889fe'
gcloud version
gcloud auth list --filter=status:ACTIVE --format="value(account)"
gcloud auth application-default print-access-token | Out-Null
gcloud config get project
gcloud projects describe $notificationProjectId --format=json
gcloud billing projects describe $notificationProjectId --format=json
$notificationEnabledApis = @(gcloud services list --enabled --project=$notificationProjectId --format="value(config.name)")
$notificationRequiredApis = @(
  'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com',
  'cloudfunctions.googleapis.com', 'cloudscheduler.googleapis.com',
  'eventarc.googleapis.com', 'firestore.googleapis.com',
  'iam.googleapis.com', 'pubsub.googleapis.com', 'run.googleapis.com',
  'secretmanager.googleapis.com', 'serviceusage.googleapis.com'
)
$notificationMissingApis = @($notificationRequiredApis | Where-Object { $_ -notin $notificationEnabledApis })
if ($notificationMissingApis.Count -gt 0) { throw "Missing required APIs: $($notificationMissingApis -join ', ')" }
gcloud iam service-accounts list --project=$notificationProjectId --format=json
gcloud projects get-iam-policy $notificationProjectId --format=json
npx.cmd --yes firebase-tools@15.24.0 --non-interactive login:list
npx.cmd --yes firebase-tools@15.24.0 --non-interactive projects:list --json
npx.cmd --yes firebase-tools@15.24.0 --non-interactive --project $notificationProjectId firestore:databases:list
gh auth status --hostname github.com
gh repo view axensz/Moneytrack --json nameWithOwner,defaultBranchRef
git remote get-url origin
```

Confirm `.firebaserc` still maps to `moneytrack-889fe`, the active gcloud identity/project, Firebase login, already-provisioned ADC credential source, GitHub identity/repository, and Git origin are each explicitly approved for this operation; they can be different and none implies the others. The ADC token is discarded to `Out-Null` and proves availability only, never identity/effective authorization; do not print it, run an automatic ADC login, or create a credential file. Firestore must still be `nam5`, and `us-central1` must remain the selected compatible Functions region. Billing output must report `billingEnabled: true` with a nonempty billing account; API comparison must be empty. Review the deployer and Functions/Cloud Build service identities against the approved IAM runbook. Project IAM output alone does not prove inherited/effective permissions, so record that limitation and require the named operator's approval rather than claiming a complete permission proof. Do not use `firebase deploy --dry-run` as a read-only probe because the CLI may enable APIs. Stop on any missing tool/ADC, identity, repository, origin, or project mismatch, missing API, disabled/unapproved billing, or unresolved IAM approval; do not auto-install, login, enable, or grant anything.

- [ ] **Step 2: Prepare explicit canary/VAPID inputs and install the authorized secret without printing it**

- Create ignored `functions/.local/notification-canary-uids.json` containing only explicitly authorized test UIDs.
- Confirm the two ignored public dotenv targets and the private temp target do not already exist; rotation uses a new separately approved pair rather than silently overwriting material.
- Generate exactly one pair through the tested helper, stream the private file directly into Firebase CLI's `--data-file`, inspect secret metadata only, and delete only the validated temp file in `finally`:

```powershell
if ($PSVersionTable.PSVersion -lt [version]'7.3') { throw 'Task 18 requires PowerShell 7.3+ native-command error propagation.' }
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$notificationProjectId = 'moneytrack-889fe'
if ([string]::IsNullOrWhiteSpace($env:MONEYTRACK_VAPID_SUBJECT)) { throw 'Set MONEYTRACK_VAPID_SUBJECT to the exact approved HTTPS or mailto contact.' }
$notificationVapidSubject = $env:MONEYTRACK_VAPID_SUBJECT
$notificationTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$notificationVapidPrivateFile = Join-Path $notificationTempRoot ("moneytrack-vapid-" + [guid]::NewGuid().ToString('N') + '.secret')
try {
  npm.cmd --prefix functions run notifications:generate-vapid -- --project $notificationProjectId --subject $notificationVapidSubject --functions-env-output functions/.env.moneytrack-889fe --client-env-output .env.production.local --private-output $notificationVapidPrivateFile
  npx.cmd --yes firebase-tools@15.24.0 --non-interactive --project $notificationProjectId functions:secrets:set WEB_PUSH_VAPID_PRIVATE_KEY --data-file $notificationVapidPrivateFile
  npx.cmd --yes firebase-tools@15.24.0 --non-interactive --project $notificationProjectId functions:secrets:get WEB_PUSH_VAPID_PRIVATE_KEY --json
} finally {
  $notificationResolvedPrivateFile = [System.IO.Path]::GetFullPath($notificationVapidPrivateFile)
  if (-not $notificationResolvedPrivateFile.StartsWith($notificationTempRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to remove a private-key path outside the OS temp directory.' }
  if (Test-Path -LiteralPath $notificationResolvedPrivateFile) { Remove-Item -LiteralPath $notificationResolvedPrivateFile -Force }
}
git diff --quiet -- public/sw.js
$notificationLocalReleaseSha = git rev-parse HEAD
if ($notificationLocalReleaseSha -notmatch '^[0-9a-f]{40}$') { throw 'Expected an exact 40-character local release SHA.' }
$notificationSwPath = [System.IO.Path]::GetFullPath('public/sw.js')
$notificationSwBytes = [System.IO.File]::ReadAllBytes($notificationSwPath)
$notificationSwHash = (Get-FileHash -LiteralPath $notificationSwPath -Algorithm SHA256).Hash
try {
  npm.cmd run build
  node scripts/verify-notification-vapid-artifact.mjs --expected-public-dotenv .env.production.local --peer-public-dotenv functions/.env.moneytrack-889fe --expected-release-sha $notificationLocalReleaseSha --out out
} finally {
  [System.IO.File]::WriteAllBytes($notificationSwPath, $notificationSwBytes)
}
if ((Get-FileHash -LiteralPath $notificationSwPath -Algorithm SHA256).Hash -ne $notificationSwHash) { throw 'Tracked service worker was not restored byte-for-byte.' }
git diff --exit-code -- public/sw.js
```

The helper writes `WEB_PUSH_VAPID_PUBLIC_KEY` plus the approved `WEB_PUSH_VAPID_SUBJECT` to ignored `functions/.env.moneytrack-889fe`, and the same public key as `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` to ignored root `.env.production.local`. The secret command receives no key through an argument, shell variable, stdout, or repository file. The local build must prove both key and exact SHA in `out`, then restore tracked `public/sw.js` byte-for-byte in `finally` so the clean reviewed checkout gate remains satisfiable. The runtime later derives the public point from the bound secret and compares it with the server public parameter before a send.

- [ ] **Step 3: Publish the compatible static client first**

This is a separate external mutation within Task 18: require exact authorization for repository variable `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` and for a deployment of the reviewed compatibility SHA already integrated into `main`. On the clean reviewed `main` checkout, dispatch the existing Pages workflow after setting the variable; do not rely on a no-op push to rerun a SHA that may already be on `main`:

```powershell
if ($PSVersionTable.PSVersion -lt [version]'7.3') { throw 'Task 18 requires PowerShell 7.3+ native-command error propagation.' }
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$notificationVapidLine = @(Get-Content -LiteralPath .env.production.local | Where-Object { $_ -like 'NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=*' })
if ($notificationVapidLine.Count -ne 1) { throw 'Expected exactly one client public VAPID key.' }
$notificationVapidPublicKey = ($notificationVapidLine[0] -split '=', 2)[1]
if ((git branch --show-current) -ne 'main') { throw 'Publish only the reviewed main checkout.' }
if (git status --porcelain --untracked-files=no) { throw 'Tracked checkout must be clean before publishing.' }
git fetch origin main
$notificationReleaseSha = git rev-parse HEAD
if ((git rev-parse origin/main) -ne $notificationReleaseSha) { throw 'Local reviewed SHA must already equal origin/main.' }
$notificationPriorRuns = @(gh run list --repo axensz/Moneytrack --workflow nextjs.yml --branch main --event workflow_dispatch --commit $notificationReleaseSha --limit 20 --json databaseId | ConvertFrom-Json)
$notificationPriorRunIds = @($notificationPriorRuns | ForEach-Object { $_.databaseId })
gh variable set NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY --repo axensz/Moneytrack --body $notificationVapidPublicKey
$notificationPublishedVariable = gh variable get NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY --repo axensz/Moneytrack --json value --jq .value
if ($notificationPublishedVariable -ne $notificationVapidPublicKey) { throw 'GitHub Actions public VAPID variable read-back mismatch.' }
gh workflow run nextjs.yml --repo axensz/Moneytrack --ref main
$notificationRun = $null
for ($notificationLookupAttempt = 0; $notificationLookupAttempt -lt 12 -and $null -eq $notificationRun; $notificationLookupAttempt++) {
  $notificationCandidates = @(gh run list --repo axensz/Moneytrack --workflow nextjs.yml --branch main --event workflow_dispatch --commit $notificationReleaseSha --limit 20 --json databaseId,headSha,status,conclusion,url | ConvertFrom-Json | Where-Object { $_.databaseId -notin $notificationPriorRunIds })
  if ($notificationCandidates.Count -gt 0) { $notificationRun = $notificationCandidates[0]; break }
  Start-Sleep -Seconds 5
}
if ($null -eq $notificationRun -or $notificationRun.headSha -ne $notificationReleaseSha) { throw 'No exact-SHA Pages run found.' }
$notificationRunId = $notificationRun.databaseId
gh run watch $notificationRunId --repo axensz/Moneytrack --exit-status --compact
node scripts/verify-notification-vapid-artifact.mjs --expected-public-dotenv .env.production.local --peer-public-dotenv functions/.env.moneytrack-889fe --expected-release-sha $notificationReleaseSha --base-url https://axensz.github.io/Moneytrack/
```

Verify the exact successful run and published client:

- Understands runtime authority/generation and fenced state.
- Reconciles current-device subscriptions.
- Has the hardened service worker and account cleanup.
- Still runs complete guest/runtime-absent foreground behavior, including the bounded authenticated legacy OS gate until that UID first confirms a backend device response; it creates no subscription and claims no closed-app delivery while callables are absent.
- Embeds the same production public VAPID key and exact reviewed seven-character `CACHE_VERSION` suffix in the real Pages artifact; a local `out` scan or successful run record alone is insufficient.

Do not enable durable authority yet.

- [ ] **Step 4: With exact approval, deploy disabled backend boundaries**

The approved mutation set is limited to:

```powershell
if ($PSVersionTable.PSVersion -lt [version]'7.3') { throw 'Task 18 requires PowerShell 7.3+ native-command error propagation.' }
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$notificationProjectId = 'moneytrack-889fe'
function Assert-NotificationDeliveryDisabled {
  param([string]$ProjectId)
  $notificationControlState = npm.cmd --prefix functions run --silent notifications:control -- status --project $ProjectId | ConvertFrom-Json
  if ($notificationControlState.exists -and $notificationControlState.deliveryEnabled -ne $false) { throw 'DELIVERY_ENABLED must be absent or false.' }
  return $notificationControlState
}
$null = Assert-NotificationDeliveryDisabled -ProjectId $notificationProjectId
npx.cmd --yes firebase-tools@15.24.0 --non-interactive --project $notificationProjectId functions:secrets:get WEB_PUSH_VAPID_PRIVATE_KEY --json
npx.cmd --yes firebase-tools@15.24.0 --non-interactive --project $notificationProjectId deploy --only firestore:rules,firestore:indexes
$null = Assert-NotificationDeliveryDisabled -ProjectId $notificationProjectId
$notificationFirebaseIndexes = npx.cmd --yes firebase-tools@15.24.0 --non-interactive --project $notificationProjectId firestore:indexes --json | ConvertFrom-Json
$notificationCompositeIndexes = gcloud firestore indexes composite list --project=$notificationProjectId --database="(default)" --format=json | ConvertFrom-Json
$notificationTtls = gcloud firestore fields ttls list --project=$notificationProjectId --database="(default)" --format=json | ConvertFrom-Json
[pscustomobject]@{
  firebaseIndexes = $notificationFirebaseIndexes
  compositeIndexes = $notificationCompositeIndexes
  ttls = $notificationTtls
} | ConvertTo-Json -Depth 100 -Compress | node scripts/verify-firestore-notification-infrastructure.mjs --manifest firestore.indexes.json --stdin
$null = Assert-NotificationDeliveryDisabled -ProjectId $notificationProjectId
npx.cmd --yes firebase-tools@15.24.0 --non-interactive --project $notificationProjectId deploy --only functions
$null = Assert-NotificationDeliveryDisabled -ProjectId $notificationProjectId
$notificationDispatchFunction = gcloud functions describe dispatchNotificationWork --gen2 --region=us-central1 --project=$notificationProjectId --format=json | ConvertFrom-Json
$notificationTestFunction = gcloud functions describe sendTestNotification --gen2 --region=us-central1 --project=$notificationProjectId --format=json | ConvertFrom-Json
$notificationExpectedServerConfig = @{}
Get-Content -LiteralPath functions/.env.moneytrack-889fe | ForEach-Object {
  if ($_ -match '^(WEB_PUSH_VAPID_PUBLIC_KEY|WEB_PUSH_VAPID_SUBJECT)=(.*)$') { $notificationExpectedServerConfig[$matches[1]] = $matches[2] }
}
if ($notificationExpectedServerConfig.Count -ne 2) { throw 'Expected exactly two public server parameters.' }
foreach ($notificationFunction in @($notificationDispatchFunction, $notificationTestFunction)) {
  if ($notificationFunction.serviceConfig.environmentVariables.WEB_PUSH_VAPID_PUBLIC_KEY -ne $notificationExpectedServerConfig.WEB_PUSH_VAPID_PUBLIC_KEY) { throw 'Deployed VAPID public key mismatch.' }
  if ($notificationFunction.serviceConfig.environmentVariables.WEB_PUSH_VAPID_SUBJECT -ne $notificationExpectedServerConfig.WEB_PUSH_VAPID_SUBJECT) { throw 'Deployed VAPID subject mismatch.' }
  $notificationSecretKeys = @($notificationFunction.serviceConfig.secretEnvironmentVariables | ForEach-Object { [string]$_.key })
  if ($notificationSecretKeys.Count -ne 1 -or $notificationSecretKeys[0] -ne 'WEB_PUSH_VAPID_PRIVATE_KEY') { throw 'Deployed VAPID secret binding mismatch.' }
}
$notificationMinInstances = $notificationDispatchFunction.serviceConfig.minInstanceCount
if ($null -ne $notificationMinInstances -and [int]$notificationMinInstances -ne 0) { throw 'Deployed minimum instance bound mismatch.' }
if ([int]$notificationDispatchFunction.serviceConfig.maxInstanceCount -ne 1 -or [int]$notificationDispatchFunction.serviceConfig.maxInstanceRequestConcurrency -ne 1) { throw 'Deployed instance/concurrency bound mismatch.' }
if ([string]$notificationDispatchFunction.serviceConfig.timeoutSeconds -notin @('240', '240s')) { throw 'Deployed timeout mismatch.' }
$notificationSchedulerJobs = @(gcloud scheduler jobs list --location=us-central1 --project=$notificationProjectId --format=json | ConvertFrom-Json)
$notificationDispatchJobs = @($notificationSchedulerJobs | Where-Object {
  ([string]$_.name -match 'dispatchNotificationWork') -or ([string]$_.httpTarget.uri -match 'dispatchNotificationWork')
})
if ($notificationDispatchJobs.Count -ne 1) { throw 'Expected exactly one dispatchNotificationWork Scheduler job.' }
$notificationDispatchJob = $notificationDispatchJobs[0]
if ([string]$notificationDispatchJob.schedule -ne '*/5 * * * *' -or [string]$notificationDispatchJob.timeZone -ne 'Etc/UTC' -or [string]$notificationDispatchJob.state -ne 'ENABLED') { throw 'Scheduler cadence/time zone/state mismatch.' }
if ([string]$notificationDispatchJob.httpTarget.uri -notmatch '^https://') { throw 'Scheduler target must be HTTPS.' }
$null = Assert-NotificationDeliveryDisabled -ProjectId $notificationProjectId
```

Before and after each deploy, parsed control status must prove `notificationControl/config` absent or `DELIVERY_ENABLED: false`; any other result throws. Deploy rules/indexes first; the executable infrastructure verifier must match every required deployed definition and prove all required composites `READY` plus both `retentionExpiresAt` TTL policies `ACTIVE` before the separate Functions deploy. If a definition is still creating, stop and rerun only the read-only gate later. The exact `firebase.json` predeploy hook rebuilds Functions from source. After deploy, parsed read-back must match both functions' public parameters and secret-key metadata without reading a secret value, the dispatch min/max/concurrency/timeout bounds, and exactly one enabled HTTPS Scheduler job at `*/5 * * * *` in `Etc/UTC`; any mismatch stops before backfill/canary. This prevents Functions from persisting capability data under older rules or running stale ignored build output.

- [ ] **Step 5: Backfill twice while authority remains foreground**

```powershell
if ($PSVersionTable.PSVersion -lt [version]'7.3') { throw 'Task 18 requires PowerShell 7.3+ native-command error propagation.' }
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$notificationCutoff = (Get-Date).ToUniversalTime().ToString("o")
npm.cmd --prefix functions run notifications:backfill -- --project moneytrack-889fe --uid-file functions/.local/notification-canary-uids.json --cutoff $notificationCutoff --dry-run
npm.cmd --prefix functions run notifications:backfill -- --project moneytrack-889fe --uid-file functions/.local/notification-canary-uids.json --cutoff $notificationCutoff --apply
npm.cmd --prefix functions run notifications:backfill -- --project moneytrack-889fe --uid-file functions/.local/notification-canary-uids.json --cutoff $notificationCutoff --apply
```

Expected: the second apply reports `created=0, changed=0`; no event, delivery, authority, or financial document changes.

- [ ] **Step 6: Promote only canaries through the two-phase protocol**

Use the manifest-free read-only `inspect --uid-file` response to create the ignored authority manifest from the exact absent-or-disabled control plus every approved UID's current authority/version; this removes the status/manifest bootstrap circle. On rerun, reuse the existing manifest. Every authority phase is contractually a no-op for an exact already-completed target and safely resumes mixed completed/pending batches, so a crash after activation cannot allocate another generation. `MONEYTRACK_NOTIFICATION_AUTHORITY_MANIFEST` may select an explicitly reviewed rebased manifest; never replace the manifest's control version from an ordinary later read-back:

```powershell
if ($PSVersionTable.PSVersion -lt [version]'7.3') { throw 'Task 18 requires PowerShell 7.3+ native-command error propagation.' }
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$notificationProjectId = 'moneytrack-889fe'
$notificationUidFile = 'functions/.local/notification-canary-uids.json'
$notificationManifest = if ([string]::IsNullOrWhiteSpace($env:MONEYTRACK_NOTIFICATION_AUTHORITY_MANIFEST)) { 'functions/.local/notification-authority-manifest.json' } else { $env:MONEYTRACK_NOTIFICATION_AUTHORITY_MANIFEST }
if ($notificationManifest -notmatch '^functions[\\/]\.local[\\/][A-Za-z0-9._-]+\.json$') { throw 'Authority manifest must be an ignored functions/.local JSON file.' }
function Get-NotificationControlState {
  param([string]$ProjectId)
  return npm.cmd --prefix functions run --silent notifications:control -- status --project $ProjectId | ConvertFrom-Json
}
if (-not (Test-Path -LiteralPath $notificationManifest)) {
  $notificationInspection = npm.cmd --prefix functions run --silent notifications:authority -- inspect --project $notificationProjectId --uid-file $notificationUidFile | ConvertFrom-Json
  if ($notificationInspection.project -ne $notificationProjectId) { throw 'Authority inspection project mismatch.' }
  if ($notificationInspection.control.exists -and $notificationInspection.control.deliveryEnabled -ne $false) { throw 'Initial manifest requires absent or false control.' }
  $notificationInspectedUsers = @($notificationInspection.users)
  if ($notificationInspectedUsers.Count -eq 0) { throw 'Authority inspection returned no canary users.' }
  $notificationManifestUsers = @($notificationInspectedUsers | ForEach-Object {
    if ($null -ne $_.pending) { throw 'A pending transition requires exact manifest reconstruction from inspect; do not bootstrap a new manifest.' }
    if ($_.runtimeExists -and ($_.activated -ne $true -or $_.authority -ne 'foreground')) { throw 'Initial canary authority must be absent compatibility or active foreground.' }
    [pscustomobject]@{
      uid = $_.uid
      expectedAuthority = 'foreground'
      expectedConfigVersion = if ($_.runtimeExists) { [int]$_.configVersion } else { $null }
      targetAuthority = 'durable'
    }
  })
  $notificationNewManifest = [pscustomobject]@{
    project = $notificationProjectId
    expectedControlVersion = if ($notificationInspection.control.exists) { [int]$notificationInspection.control.controlVersion } else { $null }
    users = $notificationManifestUsers
  }
  $notificationManifestJson = $notificationNewManifest | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($notificationManifest, $notificationManifestJson, [System.Text.UTF8Encoding]::new($false))
}
$notificationManifestData = Get-Content -LiteralPath $notificationManifest -Raw | ConvertFrom-Json
$notificationManifestUsers = @($notificationManifestData.users)
$notificationTargetAuthorities = @($notificationManifestUsers | ForEach-Object { [string]$_.targetAuthority } | Sort-Object -Unique)
if ($notificationTargetAuthorities.Count -ne 1 -or $notificationTargetAuthorities[0] -notin @('durable', 'foreground')) { throw 'Manifest must have one exact target authority.' }
$notificationTargetAuthority = $notificationTargetAuthorities[0]
$notificationExpectedControlVersion = if ($null -eq $notificationManifestData.expectedControlVersion) { 'null' } else { [string]$notificationManifestData.expectedControlVersion }
$notificationExpectedEnabledVersion = if ($notificationExpectedControlVersion -eq 'null') { 1 } else { [int]$notificationExpectedControlVersion + 1 }
$notificationUidFileUsers = @(Get-Content -LiteralPath $notificationUidFile -Raw | ConvertFrom-Json)
$notificationManifestUids = @($notificationManifestUsers | ForEach-Object { [string]$_.uid })
$notificationUidDifference = @(Compare-Object -ReferenceObject @($notificationUidFileUsers | Sort-Object) -DifferenceObject @($notificationManifestUids | Sort-Object) -CaseSensitive)
if ($notificationUidFileUsers.Count -ne $notificationManifestUids.Count -or $notificationUidDifference.Count -ne 0) { throw 'Manifest UIDs must exactly equal the approved UID file.' }
$notificationCanaryFingerprint = npm.cmd --prefix functions run --silent notifications:control -- fingerprint --uid-file $notificationUidFile | ConvertFrom-Json
if ([int]$notificationCanaryFingerprint.canaryUidCount -ne $notificationManifestUids.Count -or [string]$notificationCanaryFingerprint.canaryUidDigest -notmatch '^[0-9a-f]{64}$') { throw 'Canary UID fingerprint mismatch.' }
function Assert-NotificationControlMatchesManifest {
  $notificationCurrentControl = Get-NotificationControlState -ProjectId $notificationProjectId
  if ($notificationCurrentControl.exists) {
    if ($notificationCurrentControl.deliveryEnabled -ne $false -or [string]$notificationCurrentControl.controlVersion -ne $notificationExpectedControlVersion) { throw 'Control is enabled or no longer matches the manifest.' }
  } elseif ($notificationExpectedControlVersion -ne 'null') {
    throw 'Manifest expects a control document that is absent.'
  }
  return $notificationCurrentControl
}
function Get-NotificationControlPhase {
  $notificationCurrentControl = Get-NotificationControlState -ProjectId $notificationProjectId
  if (-not $notificationCurrentControl.exists) {
    if ($notificationExpectedControlVersion -eq 'null') { return 'disabled-ready' }
    throw 'Expected an existing disabled control version.'
  }
  if ($notificationCurrentControl.deliveryEnabled -eq $false -and [string]$notificationCurrentControl.controlVersion -eq $notificationExpectedControlVersion) { return 'disabled-ready' }
  if ($notificationTargetAuthority -eq 'durable' -and $notificationCurrentControl.deliveryEnabled -eq $true -and [int]$notificationCurrentControl.controlVersion -eq $notificationExpectedEnabledVersion -and [int]$notificationCurrentControl.canaryUidCount -eq [int]$notificationCanaryFingerprint.canaryUidCount -and [string]$notificationCurrentControl.canaryUidDigest -eq [string]$notificationCanaryFingerprint.canaryUidDigest) { return 'enabled-complete' }
  throw 'Control is neither the exact disabled manifest state nor the exact completed enable state.'
}
$notificationControlPhase = Get-NotificationControlPhase
if ($notificationControlPhase -eq 'disabled-ready') {
  npm.cmd --prefix functions run notifications:authority -- status --project $notificationProjectId --manifest $notificationManifest
  npm.cmd --prefix functions run notifications:authority -- prepare --project $notificationProjectId --manifest $notificationManifest --dry-run
  npm.cmd --prefix functions run notifications:authority -- prepare --project $notificationProjectId --manifest $notificationManifest --apply
  npm.cmd --prefix functions run notifications:authority -- drain --project $notificationProjectId --manifest $notificationManifest --dry-run
  npm.cmd --prefix functions run notifications:authority -- drain --project $notificationProjectId --manifest $notificationManifest --apply
  npm.cmd --prefix functions run notifications:authority -- verify --project $notificationProjectId --manifest $notificationManifest
  $null = Assert-NotificationControlMatchesManifest
  npm.cmd --prefix functions run notifications:authority -- activate --project $notificationProjectId --manifest $notificationManifest --dry-run
  npm.cmd --prefix functions run notifications:authority -- activate --project $notificationProjectId --manifest $notificationManifest --apply
}
$notificationPostActivateStatus = npm.cmd --prefix functions run --silent notifications:authority -- status --project $notificationProjectId --manifest $notificationManifest | ConvertFrom-Json
if ($notificationPostActivateStatus.project -ne $notificationProjectId) { throw 'Post-activate status project mismatch.' }
$notificationPostActivateUsers = @($notificationPostActivateStatus.users)
if ($notificationPostActivateUsers.Count -ne $notificationManifestUsers.Count) { throw 'Post-activate status user-count mismatch.' }
foreach ($notificationManifestUser in $notificationManifestUsers) {
  $notificationStatusMatch = @($notificationPostActivateUsers | Where-Object { $_.uid -eq $notificationManifestUser.uid })
  $notificationExpectedTargetVersion = if ($null -eq $notificationManifestUser.expectedConfigVersion) { 1 } else { [int]$notificationManifestUser.expectedConfigVersion + 1 }
  if ($notificationStatusMatch.Count -ne 1) { throw 'Post-activate status UID mismatch.' }
  if ($notificationStatusMatch[0].runtimeExists -ne $true -or $notificationStatusMatch[0].authority -ne $notificationManifestUser.targetAuthority -or [int]$notificationStatusMatch[0].configVersion -ne $notificationExpectedTargetVersion -or $notificationStatusMatch[0].activated -ne $true -or $null -ne $notificationStatusMatch[0].pending) { throw 'Post-activate authority/generation/journal mismatch.' }
}
$notificationControlPhase = Get-NotificationControlPhase
if ($notificationTargetAuthority -eq 'durable') {
  if ($notificationControlPhase -eq 'disabled-ready') {
    npm.cmd --prefix functions run notifications:control -- set --project $notificationProjectId --uid-file $notificationUidFile --delivery-enabled true --expected-control-version $notificationExpectedControlVersion --dry-run
    npm.cmd --prefix functions run notifications:control -- set --project $notificationProjectId --uid-file $notificationUidFile --delivery-enabled true --expected-control-version $notificationExpectedControlVersion --apply
  }
  $notificationEnabledControl = Get-NotificationControlState -ProjectId $notificationProjectId
  if (-not $notificationEnabledControl.exists -or $notificationEnabledControl.deliveryEnabled -ne $true -or [int]$notificationEnabledControl.controlVersion -ne $notificationExpectedEnabledVersion -or [int]$notificationEnabledControl.canaryUidCount -ne [int]$notificationCanaryFingerprint.canaryUidCount -or [string]$notificationEnabledControl.canaryUidDigest -ne [string]$notificationCanaryFingerprint.canaryUidDigest) { throw 'Enabled control version/allowlist read-back mismatch.' }
} else {
  $notificationForegroundControl = Get-NotificationControlState -ProjectId $notificationProjectId
  if (-not $notificationForegroundControl.exists -or $notificationForegroundControl.deliveryEnabled -ne $false -or [string]$notificationForegroundControl.controlVersion -ne $notificationExpectedControlVersion) { throw 'Foreground activation must leave control false at the manifest version.' }
}
```

Abort after any nonzero exit or read-back mismatch. The authority activation transaction itself must enforce the manifest's original disabled control version. The post-activate branch enables only when every manifest user targets and reports active `durable`; a `foreground` target instead proves control remains false at the same version and never executes an enable command. If the enable response is lost, rerun recognizes only true at the next version with the exact canonical UID-file count/digest as already completed, skips a second mutation, and repeats the per-user plus control read-back. Any other true control is unsafe and blocks for emergency disable/investigation. The durable enable CAS uses the original disabled version, so an emergency disable after activation cannot be recaptured and silently reversed.

If the control version changes while any manifest user is fenced, stop; do not recreate the manifest and rerun. The original version remains in each private journal and can never match by accident. Only after separate exact recovery authorization, confirm the new live control is still false, copy the ignored manifest without changing any user/authority/version/target field, change only its top-level `expectedControlVersion` to that new live version, and run the explicit journal rebase below with the old version. It updates no authority/control/schedule/delivery state and keeps every user fenced; after its exact status read-back, restart this target-aware Step 6 with the rebased manifest. A durable promotion may reach the enable branch; a foreground rollback can only reach the keep-false branch:

```powershell
if ($PSVersionTable.PSVersion -lt [version]'7.3') { throw 'Task 18 requires PowerShell 7.3+ native-command error propagation.' }
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$notificationProjectId = 'moneytrack-889fe'
$notificationRebasedManifest = 'functions/.local/notification-authority-rebased-manifest.json'
$notificationOldControlVersion = $env:MONEYTRACK_EXPECTED_STALE_NOTIFICATION_CONTROL_VERSION
if ([string]::IsNullOrWhiteSpace($notificationOldControlVersion)) { throw 'Set the separately approved stale journal control version.' }
$notificationRebasedManifestData = Get-Content -LiteralPath $notificationRebasedManifest -Raw | ConvertFrom-Json
$notificationRebaseControl = npm.cmd --prefix functions run --silent notifications:control -- status --project $notificationProjectId | ConvertFrom-Json
if (-not $notificationRebaseControl.exists -or $notificationRebaseControl.deliveryEnabled -ne $false -or [string]$notificationRebaseControl.controlVersion -ne [string]$notificationRebasedManifestData.expectedControlVersion) { throw 'Rebase requires the exact live false control version.' }
npm.cmd --prefix functions run notifications:authority -- rebase-control --project $notificationProjectId --manifest $notificationRebasedManifest --from-control-version $notificationOldControlVersion --dry-run
npm.cmd --prefix functions run notifications:authority -- rebase-control --project $notificationProjectId --manifest $notificationRebasedManifest --from-control-version $notificationOldControlVersion --apply
npm.cmd --prefix functions run notifications:authority -- status --project $notificationProjectId --manifest $notificationRebasedManifest
$env:MONEYTRACK_NOTIFICATION_AUTHORITY_MANIFEST = $notificationRebasedManifest
```

- [ ] **Step 7: Verify end to end with disposable test data**

For one authorized test account and two authorized devices, verify:

- Foreground tab, background browser, and fully closed installed PWA.
- Daily, recurring, and debt reminders.
- One canonical inbox event and two independent device deliveries.
- Quiet-hour deferral, retry, expiration, 404/410 device expiry, and rate-limit copy.
- Sign-out, account switch, subscription recovery, and no cross-account presentation.
- Private lock-screen copy with no amount/name/description.
- Physical Android installed PWA and iPhone/iPad Home Screen PWA after complete closure.

Record push-service acceptance separately from observed OS presentation. If either physical platform is unavailable, leave the robustness claim and this step unchecked.

- [ ] **Step 8: Expand gradually or perform exact rollback**

Expand the allowlist only after clean evidence for duplicates, stale revisions, cross-account isolation, privacy, missed stages, costs, and error rates.

Rollback order:

1. Read the current control version and compare-and-set `DELIVERY_ENABLED: false` before any authority change:

   ```powershell
   if ($PSVersionTable.PSVersion -lt [version]'7.3') { throw 'Task 18 requires PowerShell 7.3+ native-command error propagation.' }
   $ErrorActionPreference = 'Stop'
   $PSNativeCommandUseErrorActionPreference = $true
   $notificationProjectId = 'moneytrack-889fe'
   $notificationUidFile = 'functions/.local/notification-canary-uids.json'
   $notificationControl = npm.cmd --prefix functions run --silent notifications:control -- status --project $notificationProjectId | ConvertFrom-Json
   $notificationExpectedControlVersion = if ($notificationControl.exists) { [string]$notificationControl.controlVersion } else { 'null' }
   npm.cmd --prefix functions run notifications:control -- set --project $notificationProjectId --uid-file $notificationUidFile --delivery-enabled false --expected-control-version $notificationExpectedControlVersion --dry-run
   npm.cmd --prefix functions run notifications:control -- set --project $notificationProjectId --uid-file $notificationUidFile --delivery-enabled false --expected-control-version $notificationExpectedControlVersion --apply
   $notificationDisabledControl = npm.cmd --prefix functions run --silent notifications:control -- status --project $notificationProjectId | ConvertFrom-Json
   $notificationExpectedDisabledVersion = if ($notificationExpectedControlVersion -eq 'null') { 1 } else { [int]$notificationExpectedControlVersion + 1 }
   if (-not $notificationDisabledControl.exists -or $notificationDisabledControl.deliveryEnabled -ne $false -or [int]$notificationDisabledControl.controlVersion -ne $notificationExpectedDisabledVersion) { throw 'Disabled control read-back mismatch.' }
   $notificationDisabledControl | ConvertTo-Json -Compress
   ```

2. The self-contained block below uses manifest-free `inspect --uid-file` to create ignored `functions/.local/notification-authority-rollback-manifest.json` when absent, with each approved UID's exact active durable version, target `foreground`, and `expectedControlVersion` equal to the current false control read-back. It never copies the pre-disable version and reuses the same file after a wait:

   ```powershell
   if ($PSVersionTable.PSVersion -lt [version]'7.3') { throw 'Task 18 requires PowerShell 7.3+ native-command error propagation.' }
   $ErrorActionPreference = 'Stop'
   $PSNativeCommandUseErrorActionPreference = $true
   $notificationProjectId = 'moneytrack-889fe'
   $notificationUidFile = 'functions/.local/notification-canary-uids.json'
   $notificationRollbackManifest = 'functions/.local/notification-authority-rollback-manifest.json'
   if (-not (Test-Path -LiteralPath $notificationRollbackManifest)) {
     $notificationRollbackInspection = npm.cmd --prefix functions run --silent notifications:authority -- inspect --project $notificationProjectId --uid-file $notificationUidFile | ConvertFrom-Json
     if ($notificationRollbackInspection.project -ne $notificationProjectId -or -not $notificationRollbackInspection.control.exists -or $notificationRollbackInspection.control.deliveryEnabled -ne $false) { throw 'Rollback inspection requires the exact project and an existing false control.' }
     $notificationRollbackUsers = @($notificationRollbackInspection.users | ForEach-Object {
       if ($null -ne $_.pending -or -not $_.runtimeExists -or $_.activated -ne $true -or $_.authority -ne 'durable') { throw 'Rollback bootstrap requires every inspected user active durable with no pending transition.' }
       [pscustomobject]@{
         uid = $_.uid
         expectedAuthority = 'durable'
         expectedConfigVersion = [int]$_.configVersion
         targetAuthority = 'foreground'
       }
     })
     if ($notificationRollbackUsers.Count -eq 0) { throw 'Rollback inspection returned no users.' }
     $notificationNewRollbackManifest = [pscustomobject]@{
       project = $notificationProjectId
       expectedControlVersion = [int]$notificationRollbackInspection.control.controlVersion
       users = $notificationRollbackUsers
     }
     $notificationRollbackJson = $notificationNewRollbackManifest | ConvertTo-Json -Depth 10
     [System.IO.File]::WriteAllText($notificationRollbackManifest, $notificationRollbackJson, [System.Text.UTF8Encoding]::new($false))
   }
   $notificationRollbackManifestData = Get-Content -LiteralPath $notificationRollbackManifest -Raw | ConvertFrom-Json
   $notificationRollbackControl = npm.cmd --prefix functions run --silent notifications:control -- status --project $notificationProjectId | ConvertFrom-Json
   if (-not $notificationRollbackControl.exists -or $notificationRollbackControl.deliveryEnabled -ne $false -or [string]$notificationRollbackControl.controlVersion -ne [string]$notificationRollbackManifestData.expectedControlVersion) { throw 'Rollback manifest/control version mismatch.' }
   npm.cmd --prefix functions run notifications:authority -- status --project $notificationProjectId --manifest $notificationRollbackManifest
   npm.cmd --prefix functions run notifications:authority -- prepare --project $notificationProjectId --manifest $notificationRollbackManifest --dry-run
   npm.cmd --prefix functions run notifications:authority -- prepare --project $notificationProjectId --manifest $notificationRollbackManifest --apply
   npm.cmd --prefix functions run notifications:authority -- drain --project $notificationProjectId --manifest $notificationRollbackManifest --dry-run
   npm.cmd --prefix functions run notifications:authority -- drain --project $notificationProjectId --manifest $notificationRollbackManifest --apply
   npm.cmd --prefix functions run notifications:authority -- verify --project $notificationProjectId --manifest $notificationRollbackManifest
   npm.cmd --prefix functions run notifications:authority -- activate --project $notificationProjectId --manifest $notificationRollbackManifest --dry-run
   npm.cmd --prefix functions run notifications:authority -- activate --project $notificationProjectId --manifest $notificationRollbackManifest --apply
   $notificationRollbackStatus = npm.cmd --prefix functions run --silent notifications:authority -- status --project $notificationProjectId --manifest $notificationRollbackManifest | ConvertFrom-Json
   $notificationRollbackManifestUsers = @($notificationRollbackManifestData.users)
   $notificationRollbackStatusUsers = @($notificationRollbackStatus.users)
   if ($notificationRollbackStatus.project -ne $notificationProjectId -or $notificationRollbackStatusUsers.Count -ne $notificationRollbackManifestUsers.Count) { throw 'Rollback post-activate project/user-count mismatch.' }
   foreach ($notificationRollbackManifestUser in $notificationRollbackManifestUsers) {
     $notificationRollbackMatch = @($notificationRollbackStatusUsers | Where-Object { $_.uid -eq $notificationRollbackManifestUser.uid })
     $notificationRollbackTargetVersion = if ($null -eq $notificationRollbackManifestUser.expectedConfigVersion) { 1 } else { [int]$notificationRollbackManifestUser.expectedConfigVersion + 1 }
     if ($notificationRollbackMatch.Count -ne 1 -or $notificationRollbackMatch[0].runtimeExists -ne $true -or $notificationRollbackMatch[0].authority -ne 'foreground' -or [int]$notificationRollbackMatch[0].configVersion -ne $notificationRollbackTargetVersion -or $notificationRollbackMatch[0].activated -ne $true -or $null -ne $notificationRollbackMatch[0].pending) { throw 'Rollback post-activate authority/generation/journal mismatch.' }
   }
   $notificationRollbackControlAfter = npm.cmd --prefix functions run --silent notifications:control -- status --project $notificationProjectId | ConvertFrom-Json
   if ($notificationRollbackControlAfter.deliveryEnabled -ne $false -or [string]$notificationRollbackControlAfter.controlVersion -ne [string]$notificationRollbackManifestData.expectedControlVersion) { throw 'Control changed during rollback.' }
   ```

3. `prepare` stores that false control version in the private journal and fences both writers; `drain` pauses schedules/releases leases and suppresses nonterminal deliveries. If `verify` reports a future maximum `possibleAcceptanceExpiresAt`, stop and rerun the entire self-contained second block after that timestamp rather than bypassing it. Activation must remain impossible until every dispatch-started accepted/ambiguous/sending/stale-result window has passed and zero schedule is active/leased.
4. Keep backend event history and diagnostics; do not delete financial or canonical lifecycle data. Re-enabling delivery requires a new exact control-version read and separate authorization.

## Spec Coverage Check

| Requirement family | Implemented/tested in |
|---|---|
| Monotonic event lifecycle and budget escalation | Tasks 1, 14 |
| Recurring/daily/debt local-date correctness | Tasks 2, 12 |
| Complete hydration and foreground compatibility | Task 3 |
| Single writer, generations, fenced handoff, rollback | Tasks 3, 10, 13 |
| Inbox failure rollback and focus | Task 4 |
| Private payload, dedupe, click, account cleanup | Task 5 |
| Native per-device activation/reconciliation/logout | Tasks 6–8 |
| Backend isolation and fail-closed control | Tasks 9–10 |
| Auth, SSRF, endpoint rebinding, limits | Task 11 |
| Durable source synchronization/backfill | Task 12 |
| Canonical fan-out and two devices | Task 14 |
| Lease, quiet hours, rate, retry, ambiguity, TTL | Task 15 |
| Rules, indexes, emulators, CI, operations | Task 16 |
| Full regression and visual/a11y evidence | Task 17 |
| Billing/secrets/deploy/physical proof | Task 18, separately authorized |

## Plan Self-Review

Before execution:

- Confirm every production behavior has a preceding failing test and a precise GREEN command.
- Confirm client/backend payload fields, event hash, delivery hash, generation names, paths, statuses, and retry classes agree exactly.
- Confirm runtime-absent compatibility and runtime-present legacy rejection are both tested.
- Confirm no code path logs capabilities, payload bodies, financial copy, or raw external errors.
- Confirm no task adds a root runtime dependency, changes static export, or mutates financial calculations.
- Confirm no task deploys, writes secrets, enables billing/APIs, activates TTL, or changes production authority without Task 18 authorization.

## Execution Handoff

Recommended: execute with `superpowers:subagent-driven-development`, one task and one review at a time in this task. Alternative: execute inline/sequentially with `superpowers:executing-plans`. In either mode, stop before Task 18 and request the exact production authorization.
