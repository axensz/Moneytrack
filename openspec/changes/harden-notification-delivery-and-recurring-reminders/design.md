## Context

The current flow is entirely client-driven:

`monitor or page timer -> NotificationManager -> Firestore/localStorage -> in-app center + page/system notification`

`useDailyExpenseReminder` schedules `window.setTimeout` and
`useNotificationMonitoring` runs daily monitors when React mounts or the page
becomes visible. `NotificationManager` calls `showBrowserNotification` only
after the inbox write succeeds. The service worker has a `notificationclick`
handler but no `push` or `pushsubscriptionchange` handler. Consequently, no
code can create or display a notification after the application has been
closed.

The frontend is intentionally a static Next.js export hosted on GitHub Pages.
Firebase Auth and Firestore already provide the authenticated identity and data
boundary, but `firebase.json` currently declares only Firestore. The added
runtime must therefore be isolated from the frontend package.

The Push API is the browser-standard mechanism that can start a service worker
when the app is not loaded. A `PushSubscription` contains a capability endpoint
and encryption material that must be sent to an application server and kept
private. Firebase Functions v2 provides Firestore/callable triggers and a Cloud
Scheduler-backed `onSchedule` handler. Web Push on iOS/iPadOS is available to
installed Home Screen web apps after an explicit user gesture.

References:

- https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- https://firebase.google.com/docs/functions/schedule-functions
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

## Goals / Non-Goals

**Goals:**

- Deliver authenticated daily, recurring-payment, and debt reminders to each
  subscribed device while the PWA is foregrounded, backgrounded, suspended, or
  closed.
- Keep one global event in the existing inbox while tracking delivery and
  failure independently per device and event revision.
- Make recurring and daily schedules calendar-correct, time-zone-aware,
  idempotent, recoverable after missed runs, and quiet-hour-safe.
- Make the current device state truthful and diagnosable without claiming that
  push-service acceptance guarantees operating-system presentation.
- Preserve the static frontend, current financial calculations, existing deep
  links, global content preferences, and guest in-app behavior.
- Preserve WCAG 2.1 AA, semantic status colors, 44–48 CSS-pixel controls, light
  and dark themes, and reduced-motion behavior.

**Non-Goals:**

- No SMS, email, native application, marketing notification, or notification
  analytics platform.
- No Next.js API route, Server Action, custom server, or migration away from
  GitHub Pages.
- No background push for guests; without authenticated server state they retain
  local inbox and foreground-only browser notifications.
- No backend reimplementation of budget, low-balance, unusual-spending, or
  other transaction-triggered financial calculations; those alerts retain
  their existing foreground/inbox behavior.
- No redesign of `Header`, `NotificationBell`, or the dialog/focus contract
  already specified by `harden-desktop-shell-and-interactions`.
- No automatic billing-plan upgrade, secret creation, production deployment, or
  destructive Firestore migration.
- No App Check rollout in this change. Authenticated callables, schema limits,
  same-user scoping, and rate limits are required; App Check remains a follow-up
  only if abuse evidence justifies its operational cost.

## Decisions

### 1. Use standards-based Web Push behind an isolated Firebase backend

The selected architecture is direct Push API/VAPID delivery from Firebase
Functions v2 using a server-only Web Push library. The existing `public/sw.js`
will receive `push`, validate the payload, call
`ServiceWorkerRegistration.showNotification`, and reuse the current
same-origin click routing.

Two alternatives are rejected:

- Another frontend timer cannot wake a closed or suspended PWA and would keep
  the present failure mode.
- Firebase Cloud Messaging is viable, but it adds messaging-specific client and
  service-worker plumbing without replacing the scheduler that this feature
  already requires. Direct Web Push reuses the existing worker, avoids a new
  frontend runtime dependency, and remains portable across push services.

The backend lives in `functions/` with its own `package.json`, lockfile,
TypeScript configuration, tests, audit, and Node.js 22 engine. The root package
keeps its static-export dependency boundary. `firebase.json` declares the
functions source without changing Pages deployment.

The completed `repair-debt-lifecycle-and-account-links` change established the
root dependency-security boundary: this change adds no root runtime package and
does not broaden that dependency diff. Backend-only packages belong to the
isolated `functions/` manifest and lockfile. Implementation MUST revalidate that
boundary rather than treating the separate manifest as permission to weaken the
root security baseline.

### 2. Separate global event identity from per-device delivery

`users/{uid}/notifications/{eventId}` remains the canonical user-visible inbox
event. Durable backend events add backward-compatible fields while reusing the
names already present in the client model:

- `schemaVersion: 2`
- `deliverySource: 'backend'`
- `eventKey: string`
- `revision: number`
- `stage: string`
- `stageWindow: string`
- `lifecycleStatus: 'scheduled' | 'active' | 'resolved'`
- `scheduledAt`, `updatedAt`, and optional `resolvedAt`

A new backend-owned document ID is a deterministic digest of `eventKey`; existing
and client/foreground documents retain their backward-compatible URL-encoded
IDs and require no migration. Raw source identifiers remain in authenticated
Firestore data and do not enter the system payload. A stage advance updates the
same event and increments `revision`. Examples:

- `recurring:{paymentId}:{cycleKey}`
- `daily-expense:{YYYY-MM-DD}` in the configured time zone
- `debt:{debtId}`

This retains one inbox record per lifecycle while allowing a more severe or
later stage to produce a new delivery. Legacy events without versioned fields
retain their current owner mutation/deletion behavior during migration.

Only events carrying the immutable `deliverySource: 'backend'` marker written
by Admin SDK code are eligible for background fan-out. `schemaVersion: 2` alone
does not grant delivery authority: current client-authored versioned budget
events and legacy events stay on the foreground/inbox path. Firestore rules let
the owner read backend events and change only read/dismissal fields tied to the
current revision; physical deletion, the delivery marker, and every server
lifecycle field remain backend-only. `NotificationCenter` therefore maps its
remove action to `dismissedRevision: revision` for backend events. A later
revision is visible/unread again and cannot be hidden by an older dismissal.

`users/{uid}/notificationDeliveries/{deliveryId}` is server-owned. Its ID is a
deterministic digest of opaque `accountScope`, `eventId`, `revision`, and
`deviceId`. The opaque account scope also namespaces service-worker state so
two accounts using one browser cannot suppress or replace each other's alerts.
Each delivery stores:

- `eventId`, `eventRevision`, and `deviceId`
- `status: 'pending' | 'sending' | 'accepted' | 'ambiguous' | 'retrying' | 'failed' | 'expired' | 'suppressed'`
- `notBefore`, `expiresAt`, `attempts`, `lastAttemptAt`, and optional `acceptedAt`
- `dispatchStartedAt` and `possibleAcceptanceExpiresAt` once external I/O may begin
- `leaseOwner` and `leaseExpiresAt` while a worker owns the attempt
- normalized `failureCode` and `updatedAt`

The scheduler claims a due delivery transactionally with a bounded lease, so
overlapping invocations serialize work against one logical delivery. A later
worker rescues an expired `sending` lease before retrying; `attempts` increments
only when an external dispatch begins. Firestore cannot atomically commit the
result of the external push-service call: if the function loses the result after
dispatch, it records an ambiguous outcome and a retry may submit the same
logical delivery again. Every retry reuses the same `deliveryId`, a short
push-service TTL, a hashed Web Push `Topic` stable for the account/event, and a
notification `tag` stable across revisions. The service worker rejects expired
payloads and keeps a bounded local record of handled delivery IDs and highest
event revision per account/event to suppress duplicate or out-of-order
presentation. The contract does not promise exactly-once push-service
acceptance. A different device always has its own logical delivery.
Immediately before external I/O, one transaction persists `sending`,
`dispatchStartedAt`, and `possibleAcceptanceExpiresAt` as the earlier of event
expiry and one hour after dispatch start. That evidence is never cleared by a
stale result or authority cutover. Only terminal deliveries set
`retentionExpiresAt` to 30 days after their terminal timestamp; pending,
sending, retrying, and ambiguous work omit diagnostic TTL.

When an event advances, the same backend transaction suppresses all nonterminal
deliveries from lower revisions before creating the new revision's records. An
already in-flight lower revision may still arrive, so the service worker ignores
it after observing a higher revision for the same event.

### 3. Keep persisted PushSubscription capability data behind the backend

The browser creates a stable random `deviceId` and a `PushSubscription` only
after a direct user action. Authenticated callable functions register, refresh,
disable, and inspect that device. A user may have at most five active devices;
endpoint hashes are globally unique in a server-only binding collection. A
registration transaction rebinds the endpoint to the current account/device
and disables any stale prior-account binding, so failed sign-out revocation
cannot route account A's alerts after account B takes ownership. Test/register
limits apply to both the device and user so rotating IDs cannot bypass them.
Persisted endpoint,
`p256dh`, and `auth` values live only in
`users/{uid}/notificationDevices/{deviceId}`, which client Firestore rules deny
for both reads and writes.

Registration performs only URL parsing and DNS validation: it accepts public
HTTPS endpoints with no credentials, fragment, IP literal, or disallowed port,
and rejects any answer in loopback, private, link-local, or cloud-metadata
space. Dispatch re-resolves and pins public addresses; any 3xx is terminal and
the adapter never follows `Location`. Field/key sizes and encodings are bounded.

Each active device document stores the subscription, enabled state, detected
platform/display mode, created/updated timestamps, last accepted delivery,
sanitized last failure, and disabled timestamp. Revoke, rebind-out, and 404/410
delete `endpoint`, `p256dh`, and `auth` immediately in the same transaction;
the 30-day tombstone keeps only non-capability diagnostic fields. The UI
receives only a sanitized callable result.

Signing out or switching accounts makes a bounded local unsubscribe attempt,
requests server revocation, closes displayed notifications for that account,
and clears its worker dedupe/display state without blocking sign-out
indefinitely. The worker retains a blocked-account tombstone until a later
explicit account SET, so a queued old-account payload cannot become displayable
only because cleanup removed its dedupe history.
A failed remote revocation cannot keep the local endpoint subscribed silently;
subsequent 404/410 responses disable and expire the server device.
`pushsubscriptionchange` may record a recovery need, but correctness does not
depend on that event: every authenticated session and visibility recovery
reconciles `getSubscription()` with sanitized backend status.
Reconciliation compares an existing subscription's `applicationServerKey`
with the configured public VAPID key. A mismatch is never reused or registered:
the old binding is revoked/unsubscribed with bounded effort and the surface
requires explicit reactivation.

### 4. Use one durable schedule model and one scheduled worker

Server-owned `users/{uid}/notificationSchedules/{scheduleId}` documents hold
the next evaluation instant for daily, recurring, and debt reminders. Firestore
triggers synchronize them when notification preferences, recurring payments,
debts, or linked payment transactions change. Trigger handlers record the
authoritative source digest and ignore duplicate or older out-of-order
invocations. The digest contains bounded, path-sorted preference/source reads
plus one payment-proof query descriptor and `result: { path, updateTime }` or
the exact `result: null` no-proof sentinel. Payment proof first queries the exact
`recurringCycle`, ordered by document ID with `limit(1)`; only when absent does
one payment-ID/date-range legacy query ordered by date then document ID and
limited to one result run. Daily digests contain preferences only; recurring
digests add their source and proof; debt digests add their debt source and only
the bounded resolution proof actually authoritative for that model. A one-time
idempotent Admin backfill creates schedules only for explicit users; ordinary
triggers do not provision a runtime-absent or active-foreground non-canary.
After an account has an active durable runtime, ordinary source/preference
triggers may create or update only deterministic schedules stamped with that
exact active generation; this keeps new sources working after the one-time
provisioning marker is removed. During an exact pending transition,
synchronization may create a missing
deterministic target-generation schedule only as `staged`, never an event or
delivery. This lets a source created between prepare and activate join the
already authorized generation without opening general trigger provisioning.

Recurring schedules additionally persist `cycleKey`, `dueLocalDate`,
`stageWindow`, and `sourceVersion`. `cycleKey` uses the existing historical
`cycleKey()` serialization (`year-zeroBasedMonth-effectiveDueDay`, for example
`2026-5-15` for 15 June 2026); `dueLocalDate` uses `YYYY-MM-DD`. Initialization
and backfill choose only the latest applicable unpaid cycle at the cutoff and
never enumerate older missed cycles. That cursor remains authoritative across
month boundaries until a matching paid transaction resolves it; advancement
then jumps to the latest applicable current cycle without replaying skipped
months.

One `onSchedule` worker uses exact cron `*/5 * * * *` in `Etc/UTC`. It uses indexed
`collectionGroup` queries for due schedules and deliveries by
`nextAt`/`notBefore`, processes them in bounded pages, and advances each
schedule under a recoverable transactional lease. After claiming, one
transaction re-reads the schedule, runtime/private state, preferences, source,
bounded payment proof, devices, event, and earlier deliveries; it commits the
inbox event, per-device fan-out, schedule advancement/skip, and lease release
atomically. The cadence targets a normal delay under ten minutes;
longer platform or network delays are recovered by the same missed-run logic.
The deployed function uses one instance, function concurrency one, a four-minute
timeout, and a shorter internal stop deadline, while its delivery pool is five;
this bounds global sends for that function to five. Recoverable leases and
deterministic IDs still make manual, retried, or test overlap safe.

A server-owned, client-readable runtime document exposes only
`authority: 'foreground' | 'durable'`, a monotonic `configVersion`, an
`activatedAt` timestamp that is `null` while a transition is fenced, and
sanitized timestamps. The authority matrix is explicit:

Its denied sibling `notificationRuntime/private` holds one random
`accountScope`, schedule-provisioning marker, pending transition journal, and
separate nested registration/test/dispatch timestamp arrays. Every backend
writer updates only its owned nested field paths transactionally or with merge;
no operation replaces this shared document or erases another subsystem's state.
Only explicit Admin backfill creates the one-generation provisioning marker;
successful final activation removes that marker and the completed journal by
field path while preserving account scope and quotas.

- guests and authenticated users explicitly in `foreground` run the complete
  page timer, `PaymentMonitor`, and `DebtMonitor` fallback, including inbox and
  page/system feedback;
- authenticated users in `durable` do not run or write equivalent time-based
  daily, recurring, or debt events from those client monitors;
- a transient diagnostic failure uses the last confirmed authority; before any
  confirmation, the compatibility client defaults to `foreground`.

Publishing that compatibility client before Functions must not remove existing
foreground OS alerts. While an authenticated runtime is absent and the current
UID has never received any successful sanitized device-status/register response,
the current browser may continue consulting its existing local
`browserNotifications.enabled` plus granted permission for foreground
presentation only. It creates/registers no PushSubscription, exposes no active
or test-push claim, and cannot deliver after the page closes. The first successful
backend response, including a sanitized `missing` status, persists a bounded
UID-scoped confirmation marker. That account never returns to the legacy gate
after reload or transient failure, and runtime-present accounts never use it.

Foreground and durable time-based writers use separate deterministic event
namespaces. An authenticated active-foreground generation uses
`foreground:v{configVersion}:daily-expense:*`,
`foreground:v{configVersion}:recurring:*`, and
`foreground:v{configVersion}:debt:*`; runtime-absent compatibility uses only
`foreground:compat:*`, and guests use only `foreground:guest:*`. Backend-marked
events use `daily-expense:*`, `recurring:*`, and `debt:*`. This preserves the
immutable backend marker without allowing a client to take over its document.
Every versioned time-based event and every delivery also carries the exact
`authorityConfigVersion` that admitted its writer. Only one namespace and one
generation may be active at a time.

Authority changes are Admin-only compare-and-set transitions with two explicit
phases. First, the Admin command increments `configVersion`, writes the target
authority with `activatedAt: null`, and thereby fences both writers. Second, it
resolves and marks as authority-superseded the outgoing namespace, pauses its
schedules and clears their leases, suppresses nonterminal deliveries, and
verifies no outgoing work remains. While still fenced, it resumably promotes
only verified target-generation schedules from `staged` to `active` when the
target is durable. A foreground target promotes no schedule and instead
requires every durable schedule paused and lease-free. Finally, a second
compare-and-set activates the target generation only when that target-specific
schedule invariant and the outgoing-work drain hold. A
durable-to-foreground rollback remains fenced until the maximum
`possibleAcceptanceExpiresAt` of every outgoing dispatch that started has
passed across accepted, ambiguous, still-sending, and stale-result work because
an external push queue cannot be revoked. The inbox keeps superseded documents as
lifecycle evidence but does not show them as duplicate visible rows. A first
promotion with no runtime treats compatibility as foreground version `null`
and atomically prepares fenced durable version 1 plus its private journal;
reruns resume that same transition. A foreground-to-durable transition drains
only the exact outgoing version's `daily-expense`, `recurring`, and `debt`
prefixes listed above; the runtime-absent first promotion drains only
`foreground:compat:*`. A rollback activates the corresponding three prefixes
under fresh `foreground:v{toConfigVersion}:...` rather than reusing
compatibility or any older foreground prefix.
For durable activation, the final transaction re-reads current preferences,
active recurring sources, unresolved debt sources, and target schedules. The
exact expected active ID/source-digest map must equal the active target map;
extra target documents may only be paused/complete and lease-free. A source
write between prepare and activation therefore forces synchronization/retry
instead of passing with a missing or stale schedule. Foreground activation
promotes none and requires zero active or leased schedules.
The transition manifest and private pending journal both record the exact
absent-or-disabled control version. Every phase requires manifest, journal, and
live control to agree; the final activation transaction re-reads that document.
Before a manifest exists, one read-only `inspect --uid-file` command returns only
the sanitized control/current/pending authority fields needed to build or
reconstruct it, avoiding a circular status call that itself requires a manifest.
Enabled, malformed, or version-changed control aborts activation. Recreating a
local manifest cannot alter the journal. A version change intentionally leaves
the runtime fenced until a separately authorized, compare-and-set
`rebase-control` operation verifies the old journal value, a newly approved live
false value, and every unchanged pending user/target, then updates only the
journal version resumably. It neither activates authority nor changes control.
Only a durable target may perform the later canary enable, as a
compare-and-increment from the same adopted disabled version; a foreground
target must read back the unchanged false control and has no enable branch. A
concurrent emergency disable therefore cannot be silently re-enabled.
The canary UID file is canonicalized as one nonempty array of at most 100 unique
bounded strings, sorted by Unicode code unit and hashed as UTF-8
`JSON.stringify(sortedUids)` with SHA-256. Control stores both the array and the
lowercase digest; every backend read recomputes the digest and treats a missing,
malformed, duplicate, oversized, or mismatched control as disabled. If an enable
write succeeds but its response is lost, a rerun classifies it as complete only
when control is true at the original disabled version plus one, its UID count
and digest exactly match the same approved file, and every manifest user is
active at the exact durable target generation with no pending journal. That
classification performs no second mutation; every other enabled state aborts.
This control is an external-delivery kill switch, not an inbox-authority gate.
An already active durable generation may continue evaluating schedules and
transactionally maintaining its canonical inbox event and deterministic pending
delivery records while control is absent, false, malformed, or excludes the UID.
The delivery worker and explicit test path re-read the fail-closed control
immediately before adapter I/O; a blocked delivery releases its lease, remains
pending with a bounded retry time, consumes no dispatch attempt, and makes no
network request.
After activation, the runbook parses sanitized status for every manifest UID and
requires exact target authority, incremented generation, active state, and no
pending journal before either the durable enable or foreground rollback can
complete; merely printing status is not evidence.
If execution stops after activation but before that read-back/control step, all
authority phases recognize the exact target at source version plus one, active,
with no journal as a completed no-op. A mixed batch resumes only pending/source
users and never allocates a second generation for completed users; any other
combination aborts.

Firestore rules permit client-authored time-event writes only for an active
`foreground` runtime whose version exactly matches the event, and reject legacy
time-event shapes without that generation once a runtime document exists. The
backend rereads the active `durable` authority and matching generation before
every schedule/event transaction, delivery lease commit, and external dispatch.
This closes stale-client and stale-worker races, including a later rollback to
`foreground`. A transition back therefore leaves backend history intact and
lets the complete fallback create or reactivate only its separate foreground
lifecycle; a later transition to `durable` supersedes that fallback lifecycle
before backend work resumes.

The backend changes a user to `durable` only after that user's schedules are
backfilled and verified. This authority is separate from current-device push
status: a user may have durable inbox scheduling without an active push device.

The schedule uses a user-level IANA `timeZone`. Existing users initialize it
once from the first authenticated browser that can detect a zone, falling back
to `America/Bogota` during Admin backfill when the field is missing; an explicit
invalid value fails closed rather than silently taking the fallback. Later
devices do not silently overwrite it. Preferences
display the zone and offer a direct action to update it to the current device
zone. For daylight-saving transitions, a nonexistent local time moves to the
first valid instant after the gap and a repeated local time uses its first
occurrence; deterministic local-date keys still allow only one event.

### 5. Define recurring stages using calendar dates, not elapsed hours

Recurring dates are normalized to local calendar days before comparison.
Month-end clamping, leap years, annual anchor month, and `recurringCycle`
semantics remain intact.

For every unpaid active cycle, the stage progression is represented by a
deterministic `stageWindow`:

- `d3` at 09:00 local three calendar days before due date
- `d1` at 09:00 local one calendar day before due date
- `due` at 09:00 local on the due date
- `overdue:0` at 09:00 local one day after due date
- `overdue:n` at each subsequent seven-calendar-day window while the same cycle
  remains unpaid (`overdue:1` is D+8, `overdue:2` is D+15, and so on)

The public stage remains `overdue`, but `overdueOccurrence` and `stageWindow`
make each eligible weekly reminder deterministic. Stage/window rank determines
whether an advance is valid; the persisted revision itself is always allocated
transactionally as `current.revision + 1`. If a resolved payment is later
unlinked, any reactivated current window therefore receives a revision greater
than the resolved one even when the stage window is unchanged.

If the scheduler missed an earlier stage, it sends only the highest stage valid
now; it does not replay stale D-3/D-1 messages. When a matching paid transaction
exists, the event becomes `resolved`, `isRead` becomes true, pending deliveries
are suppressed, and the schedule advances to the next cycle. Deleting or
unlinking that payment makes the next evaluation recompute the current cycle
instead of trusting an in-memory flag, without reusing an already delivered
revision.

Authenticated time-based evaluation is backend-authoritative. The client
`PaymentMonitor` and daily timer remain only as guest/foreground fallback and
must not mark a check complete until recurring, debt, and transaction sources
are hydrated. Guest copy states plainly that reminders require MoneyTrack to
remain open.

Debt schedules use an equally explicit 09:00-local calendar cadence. Borrowed
windows are D+30–<D+60, D+60–<D+67, then weekly windows beginning D+67+7n.
Lent windows are D+90–<D+97, then weekly windows beginning D+97+7n. In both
cases `n >= 0`, a new boundary starts only at 09:00, downtime emits only the
current valid window, and authoritative resolution suppresses pending
deliveries before any later reactivation receives a greater revision.

### 6. Recover missed daily reminders without stale spam

The daily expense schedule uses the selected hour and minute in the configured
time zone. If the worker is late but the configured local date is still current,
it creates that day's event once. If the entire local date was missed, it records
the skipped schedule outcome and advances to the next day instead of delivering
yesterday's reminder.

Daily reminder events use `daily-expense:{localDate}` and never collide with
other `info` notifications. Changing the time updates the next schedule without
creating an immediate duplicate.

### 7. Defer quiet-hour delivery; never discard the inbox event

The canonical inbox event is created at its real scheduled time. Each device
delivery computes `notBefore` from the user's quiet hours and time zone. If the
event falls inside the quiet window, delivery remains pending until the window
ends. The user can therefore see it in the in-app center immediately while the
system alert is deferred. A start later than end crosses midnight; equal start
and end is an empty interval. The worker re-reads current preferences
immediately before I/O so a later quiet-hour change can defer without consuming
an attempt. Relaxing or disabling quiet hours does not scan and accelerate
already-deferred delivery documents: they remain pending until their previously
computed `notBefore`, then the current preflight permits delivery. This accepts
bounded over-deferral in exchange for avoiding an unbounded wake-up writer; it
does not drop the canonical event or delivery.

Guest/foreground presentation uses the same semantics while the page remains
alive: one bounded in-memory timer per account/event/revision waits for the
current quiet end, then rechecks preference, local device/permission, exact
authority generation, lifecycle/revision, and expiry before presenting once.
Logout, account/authority change, resolution, a newer revision, or unmount
cancels it. This preserves honest foreground-only guest limitations.

Temporary push failures (network, 429, or 5xx) retry with bounded exponential
backoff for at most five attempts and 24 hours, but never after `expiresAt`. A
404 or 410 marks the device expired without retry. A per-user delivery ceiling
of 60 transactionally reserved dispatch attempts per rolling hour defers excess
delivery before the external call instead of deleting events. The explicit test
action has a combined one-request-per-user
and per-device-per-minute limit and bypasses quiet hours with visible
disclosure. A client UUID deterministically derives a revision-one test
delivery, Topic, and tag for that account/device; the device stores only the
last request ID/sanitized outcome for idempotency, and no financial inbox event
is created. Terminal deliveries and disabled/expired devices use Firestore TTL
on `retentionExpiresAt` after 30 days; `expiresAt` remains only the event's
delivery-validity boundary. Active devices and canonical inbox events are not
subject to the diagnostic-retention TTL.

### 8. Make current-device status and test results truthful

For authenticated users, after the device backend has responded, the first
preference section exposes one of three named stable states, using icon plus
text and semantic colors. While checking, it shows `Comprobando...`; a
network/backend diagnostic failure shows `No se pudo comprobar` with
`Reintentar` and does not silently classify the device as inactive. During the
bounded runtime-absent/no-confirmation compatibility window, that transient copy
also states that existing local alerts may appear only while MoneyTrack is open;
it never says `Activo` or exposes the push test.

- `Activo`: Notification permission is granted, the service worker is ready,
  a current PushSubscription exists, and the server recognizes this `deviceId`.
- `Requiere acción`: permission, Home Screen installation on iOS/iPadOS,
  subscription, registration, or recovery is incomplete or the endpoint
  expired.
- `No disponible`: required browser APIs are absent, the context is insecure,
  or the platform cannot support standards-based Web Push.

Guests do not use this triad: they see `Solo con MoneyTrack abierto` and a
sign-in action while retaining local behavior. The authenticated primary action
matches the stable state. `Enviar notificación de prueba` is available only
after activation and reports `Aceptada por el servicio push`, a rate-limit
message with the retry time, or a specific actionable failure. It bypasses
quiet hours and never claims that acceptance proves the OS displayed the
notification.

Every checkbox, switch, number input, time input, and select has a programmatic
name and associated description/error. Async device checks, saves, tests, and
failures use an inline `aria-live` status or alert, pending actions expose
`aria-busy`, and focus remains stable. Saving validates
`budgetWarning < budgetCritical <= budgetExceeded` and
`budgetExceeded >= 100`. Errors preserve input and focus the first invalid
field. The interface reuses existing cards, inputs, buttons, semantic tokens,
and 44–48 CSS-pixel targets; it adds no gradient, glass surface, or decorative
motion.

### 9. Keep foreground budget events monotonic and non-deliverable

A budget month has one client-authored `eventKey`. When utilization crosses a
higher configured stage, the foreground/inbox event updates only if the incoming
stage rank is greater and increments `revision`. Repeated evaluation of the same
or lower stage is idempotent. It never carries `deliverySource: 'backend'` and
therefore never creates per-device delivery work. The previous stage is not
allowed to block critical or exceeded foreground feedback.

Individual mark-read and remove failures in `NotificationCenter` retain or roll
back optimistic state and show the existing actionable toast pattern. Bulk
clear uses physical delete for legacy events and current-revision dismissal for
versioned events with the same rollback/feedback contract.

### 10. Keep operating-system payloads private and same-origin

System payloads contain `schemaVersion`, opaque `accountScope`, event
ID/revision, delivery ID, expiry, constant type-aware title/body without
monetary amounts, account/merchant/debt names, descriptions, or other free text,
and an allowlisted relative application action URL. Backend serialization
rejects an unsupported payload before dispatch and marks that delivery failed.
The worker discards unknown versions, malformed/oversized values, expired
payloads, and external origins locally, without display/navigation and without
attempting a server acknowledgement or delivery-status write, then applies the
existing base-path canonicalization to valid work. Full financial
metadata remains in the authenticated inbox only. Logs never serialize raw
subscription capabilities, payload bodies, or unsanitized push-service errors.

VAPID private material is stored as a Functions secret; only the public key is
exposed through `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`. Callables require
Firebase Auth, validate payload length and allowed fields, and return sanitized
errors. Firestore rules deny client access to devices, schedules, and deliveries
while preserving legacy/client-authored inbox behavior and limiting
backend-marked inbox mutation to owner read-state/dismissal fields. Deployment
configuration includes a VAPID contact subject and verifies at runtime that the
server public/private keys are one pair. Production generation writes the
private value only to a validated OS-temp file, loads it through Firebase CLI
`--data-file`, and removes that exact file without printing the key. Emulator
values are fresh, ignored `.env.local`/`.secret.local` files hard-locked to the
demo project, so CI never falls back to production secrets through ADC. A
separate artifact check verifies both local `out` and the published Pages
HTML/same-origin JavaScript embed the public key supplied to the release job by
repository variable `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`, equal to the server
public parameter. Its explicit `--peer-public-dotenv` input parses the separate
client/server public variable names exactly once and fails on mismatch before
artifact inspection. Release checks also read the built/published base-path `sw.js`
and require its injected cache version to match the first seven characters of
the exact approved 40-character SHA, so a later deployment cannot pass on the
key alone. Functions cannot inspect that artifact at runtime.
Rotation is an explicit variable/client redeploy plus device re-subscription
migration.

## Risks / Trade-offs

- **Cloud Scheduler and Functions introduce billed infrastructure** -> keep one
  five-minute scheduled job, bounded queries/concurrency, an explicit kill
  switch, emulator coverage, and a deployment approval gate. Firebase documents
  scheduled functions as billed Cloud Scheduler jobs.
- **Push-service acceptance is not proof of visible OS presentation** -> use
  precise diagnostic copy and require physical closed-app evidence before the
  feature is described as robust.
- **External acceptance cannot be committed atomically with Firestore** ->
  expose ambiguous outcomes, retry with one stable delivery identity, and
  deduplicate duplicate/out-of-order presentation in the service worker.
- **An accepted push cannot be revoked from an external queue** -> apply a short
  event-validity TTL and payload `expiresAt`, reject expired work in the worker,
  and close account-scoped displayed notifications on session recovery. Do not
  promise that a payment resolution can retract an already accepted push.
- **iOS requires an installed Home Screen app and user gesture** -> detect the
  state and show an installation action instead of a broken permission switch.
- **A forged client event or unlimited device registration could create cost**
  -> require the immutable backend delivery marker, cap active devices at five,
  make server fields immutable to clients, rate-limit per user and device, and
  ignore legacy/client-authored/unknown delivery sources.
- **Schedules can become stale after interrupted writes or old clients** ->
  synchronize from Firestore triggers, run an idempotent backfill, and let each
  scheduled evaluation re-read authoritative payment/debt/preferences data.
- **Quiet-hour deferral may make a reminder late** -> preserve original
  `scheduledAt`, expose deferred status, and deliver at the first allowed time.
  A later relaxation does not eagerly wake existing documents, so they may wait
  until their prior `notBefore`; this is a deliberate bounded-over-deferral
  trade-off rather than an acceleration guarantee.
- **A generic push is less detailed** -> protect lock-screen privacy and use the
  deep link to reveal authenticated detail in the existing center/view.
- **Functions region may not match Firestore** -> discover the existing project
  location before implementation and set an explicit compatible region; never
  deploy using an implicit default.

## Migration Plan

1. Revalidate that the isolated backend manifest does not modify the root
   dependency-security baseline, then add failing client contracts for calendar
   dates, hydration, event revisions, account isolation, preference validation,
   diagnostics, accessibility, and service-worker push.
2. Add the isolated Functions package, pure backend tests, demo-only ephemeral
   emulator configuration, strict backward-compatible rules, collection-group
   indexes, VAPID plumbing, a positive global `DELIVERY_ENABLED=false` default,
   and a separate server-side test-account allowlist.
3. After exact approval, set/read back the public GitHub Actions variable and
   publish the reviewed compatibility SHA through the existing automatic Pages
   workflow. Wait for that exact run and inspect the real published artifact,
   not only local `out`; require both its public key and service-worker SHA
   marker. It keeps current foreground alerts through the bounded
   no-device-backend-confirmation gate, treats client-authored v2 events as
   non-deliverable, and degrades safely while the backend is absent or killed.
   Local preflight builds preserve tracked `public/sw.js`, verify the injected
   SHA only in `out`, and restore the source worker byte-for-byte in `finally`
   before the reviewed-checkout cleanliness gate.
4. Only after read-only project/billing/API/identity/IAM/region checks and
   explicit approval of secrets, cost, deploy set, and rollback, deploy
   rules/indexes first, verify every required composite is ready and both TTL
   policies active, then deploy Functions manually with
   `DELIVERY_ENABLED=false`. Read back zero minimum/one maximum instance,
   concurrency one, timeout, both secret bindings, and exactly one enabled
   five-minute UTC Scheduler job before backfill. Missing tools
   or incomplete IAM evidence blocks rollout; nothing auto-enables APIs or
   billing. Never enable Functions deployment from pull requests or the Pages
   workflow.
5. Backfill allowlisted test accounts twice while their runtime authority remains
   `foreground`, inspect the deterministic result, then use the Admin authority
   transition transaction to resolve outgoing foreground time events and set
   those accounts to `durable`; only then enable dispatch with
   `DELIVERY_ENABLED=true` plus the canonical allowlist, count, and digest. Read
   back the exact incremented control version and, on rerun after a lost enable
   response, accept only that exact control identity plus every exact active
   target user as an already-completed no-op.
   Verify foreground, background, closed-PWA, quiet hours, retry, account
   switching, two-device, Android, and iOS Home Screen paths.
6. Expand the allowlist only after evidence passes. After every supported
   authenticated account has a runtime document and the rollback path is
   verified, remove only the runtime-absent/no-backend-confirmation legacy OS
   gate and legacy global device-toggle writes. Retain both the authenticated
   versioned `foreground` fallback required by rollback and the guest fallback.

Rollback first sets `DELIVERY_ENABLED=false`, then uses the Admin authority
transition transaction to resolve active backend time events, suppress their
nonterminal deliveries, and return affected runtime documents to `foreground`.
The immutable backend documents remain as resolved history and the separate
foreground namespace resumes without taking them over or duplicating an active
lifecycle. Financial data remains untouched.
Functions and schedules may then be reverted without reverting the static
frontend immediately; device and delivery records are auxiliary and expire by
policy or can be removed by a later explicit cleanup.

## Open Questions

None. The attached audit approved the need for durable per-device delivery,
scheduler recovery, visible diagnosis, and recurring-payment reliability. The
provider and privacy decisions above choose the smallest architecture compatible
with the existing Firebase and static-PWA boundaries.
