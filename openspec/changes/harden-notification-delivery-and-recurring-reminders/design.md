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

- Deliver authenticated reminders to each subscribed device while the PWA is
  foregrounded, backgrounded, suspended, or closed.
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

The active `repair-debt-lifecycle-and-account-links` dependency constraint
continues to govern the root security-remediation manifest: this change adds no
root runtime package and does not broaden that dependency diff. Backend-only
packages belong to the isolated `functions/` manifest and lockfile. Before
implementation begins, the OPSX review MUST confirm that boundary against the
still-active change rather than silently weakening its security baseline.

### 2. Separate global event identity from per-device delivery

`users/{uid}/notifications/{eventId}` remains the canonical user-visible inbox
event. New events add backward-compatible fields:

- `schemaVersion: 2`
- `eventKey: string`
- `revision: number`
- `stage: string`
- `status: 'active' | 'resolved' | 'superseded'`
- `scheduledFor`, `updatedAt`, and optional `resolvedAt`

The document ID is derived from `eventKey`; a stage advance updates the same
event and increments `revision`. Examples:

- `recurring:{paymentId}:{cycleKey}`
- `daily-expense:{YYYY-MM-DD}` in the configured time zone
- `budget:{budgetId}:{YYYY-MM}`
- `debt:{debtId}:{stageWindow}`

This retains one inbox record per lifecycle while allowing a more severe or
later stage to produce a new delivery. Legacy events without versioned fields
retain their current owner mutation/deletion behavior during migration.

Only backend-authored `schemaVersion: 2` events are eligible for background
fan-out. Firestore rules let the owner read those events and change only
read/dismissal fields tied to the current revision; physical deletion and every
server lifecycle field remain backend-only. `NotificationCenter` therefore maps
its remove action to `dismissedRevision: revision` for versioned events. A later
revision is visible/unread again and cannot be hidden by an older dismissal.
Existing client-created events stay on the legacy foreground/inbox path and
never become backend delivery work merely because they were written to the
inbox collection.

`users/{uid}/notificationDeliveries/{deliveryId}` is server-owned. Its ID is a
deterministic digest of `eventId`, `revision`, and `deviceId`. It stores:

- `eventId`, `eventRevision`, and `deviceId`
- `status: 'pending' | 'sending' | 'accepted' | 'ambiguous' | 'retrying' | 'failed' | 'expired' | 'suppressed'`
- `notBefore`, `attempts`, `lastAttemptAt`, and optional `acceptedAt`
- normalized `failureCode` and `updatedAt`

The scheduler claims a due delivery transactionally with a bounded lease, so
overlapping invocations serialize work against one logical delivery. Firestore
cannot atomically commit the result of the external push-service call: if the
function loses the result after dispatch, it records an ambiguous outcome and a
retry may submit the same logical delivery again. Every retry reuses the same
`deliveryId` and notification `tag`; the service worker keeps a bounded local
record of handled delivery IDs and highest event revision to suppress duplicate
or out-of-order presentation. The contract does not promise exactly-once push
service acceptance. A different device always has its own logical delivery.

When an event advances, the same backend transaction suppresses all nonterminal
deliveries from lower revisions before creating the new revision's records. An
already in-flight lower revision may still arrive, so the service worker ignores
it after observing a higher revision for the same event.

### 3. Keep persisted PushSubscription capability data behind the backend

The browser creates a stable random `deviceId` and a `PushSubscription` only
after a direct user action. Authenticated callable functions register, refresh,
disable, and inspect that device. Persisted endpoint, `p256dh`, and `auth`
values live only in `users/{uid}/notificationDevices/{deviceId}`, which client
Firestore rules deny for both reads and writes.

Each device document stores the subscription, enabled state, detected platform,
service-worker scope, created/updated timestamps, last accepted delivery,
sanitized last failure, and disabled timestamp. The UI receives only a
sanitized callable result.

Signing out or switching accounts first unsubscribes the local PushSubscription
and requests server revocation. A failed remote revocation cannot keep the
local endpoint subscribed silently; subsequent 404/410 responses disable and
expire the server device. `pushsubscriptionchange` records a local recovery
need and the next authenticated foreground session re-registers it.

### 4. Use one durable schedule model and one scheduled worker

Server-owned `users/{uid}/notificationSchedules/{scheduleId}` documents hold
the next evaluation instant for daily, recurring, and debt reminders. Firestore
triggers synchronize them when notification preferences, recurring payments,
debts, or linked payment transactions change. A one-time idempotent backfill
creates schedules for existing authenticated users.

One `onSchedule` worker runs every five minutes. It queries due schedules and
deliveries by indexed `nextAt`/`notBefore`, processes them in bounded pages,
and advances each schedule transactionally. The cadence targets a normal delay
under ten minutes; longer platform or network delays are recovered by the same
missed-run logic. The worker may overlap; leases and deterministic IDs make
overlap safe.

The schedule uses a user-level IANA `timeZone`. Existing users default once to
the browser-detected zone, falling back to `America/Bogota`; later devices do
not silently overwrite it. Preferences display the zone and offer a direct
action to update it to the current device zone.

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
make each eligible weekly reminder deterministic. Revision increments exactly
once when the window advances. If a resolved payment is later unlinked, any
reactivated current window receives a revision greater than the resolved one.

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
system alert is deferred.

Temporary push failures (network, 429, or 5xx) retry with bounded exponential
backoff for at most five attempts and 24 hours. A 404 or 410 marks the device
expired without retry. A per-user delivery ceiling of 60 accepted pushes per
rolling hour defers excess delivery instead of deleting events. The explicit
test action has a separate one-request-per-device-per-minute limit and bypasses
quiet hours with visible disclosure.

### 8. Make current-device status and test results truthful

The first preference section exposes one of three named states, using icon plus
text and semantic colors:

- `Activo`: Notification permission is granted, the service worker is ready,
  a current PushSubscription exists, and the server recognizes this `deviceId`.
- `Requiere acción`: permission, installation, subscription, registration, or
  recovery is incomplete or the endpoint expired.
- `No disponible`: required browser APIs are absent, the context is insecure,
  or iOS/iPadOS is not running as an installed Home Screen app.

The primary action matches the state. `Enviar notificación de prueba` is
available only after activation and reports `Aceptada por el servicio push`,
`Diferida`, or a specific actionable failure. It never claims that acceptance
proves the OS displayed the notification.

Every checkbox, switch, number input, time input, and select has a programmatic
name and associated description/error. Saving validates
`budgetWarning < budgetCritical <= budgetExceeded` and
`budgetExceeded >= 100`. Errors preserve input and focus the first invalid
field. The interface reuses existing cards, inputs, buttons, semantic tokens,
and 44–48 CSS-pixel targets; it adds no gradient, glass surface, or decorative
motion.

### 9. Advance budget events instead of blocking severity

A budget month has one `eventKey`. When utilization crosses a higher configured
stage, the event updates only if the incoming stage rank is greater, increments
`revision`, and creates new per-device deliveries. Repeated evaluation of the
same or lower stage is idempotent. The previous stage is not allowed to block
critical or exceeded delivery.

Individual mark-read and remove failures in `NotificationCenter` retain or roll
back optimistic state and show the existing actionable toast pattern. Bulk
clear uses physical delete for legacy events and current-revision dismissal for
versioned events with the same rollback/feedback contract.

### 10. Keep operating-system payloads private and same-origin

System payloads contain `schemaVersion`, event ID/revision, a generic type-aware
title/body without monetary amounts, and a relative application action URL.
The worker rejects unknown versions and external origins, then applies the
existing base-path canonicalization before displaying or navigating. Full
amounts and financial metadata remain in the authenticated inbox only.

VAPID private material is stored as a Functions secret; only the public key is
exposed through `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`. Callables require
Firebase Auth, validate payload length and allowed fields, and return sanitized
errors. Firestore rules deny client access to devices, schedules, and deliveries
while preserving legacy inbox behavior and limiting versioned inbox mutation to
owner read-state/dismissal fields.

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
- **iOS requires an installed Home Screen app and user gesture** -> detect the
  state and show an installation action instead of a broken permission switch.
- **A forged client event could create delivery work and cost** -> fan out only
  backend-authored versioned events, make server event fields immutable to
  clients, retain per-user rate limits, and ignore legacy/unknown event versions.
- **Schedules can become stale after interrupted writes or old clients** ->
  synchronize from Firestore triggers, run an idempotent backfill, and let each
  scheduled evaluation re-read authoritative payment/debt/preferences data.
- **Quiet-hour deferral may make a reminder late** -> preserve original
  `scheduledFor`, expose deferred status, and deliver at the first allowed time.
- **A generic push is less detailed** -> protect lock-screen privacy and use the
  deep link to reveal authenticated detail in the existing center/view.
- **Functions region may not match Firestore** -> discover the existing project
  location before implementation and set an explicit compatible region; never
  deploy using an implicit default.

## Migration Plan

1. Confirm the isolated backend manifest does not modify the active root
   dependency-security baseline, then add failing client contracts for calendar
   dates, hydration, event revisions, preference validation, diagnostics,
   accessibility, and service-worker push.
2. Add the isolated Functions package, pure backend tests, emulator coverage,
   strict rules, indexes, disabled-by-default delivery flag, and VAPID plumbing.
3. Deploy backward-compatible Functions/rules/indexes first only after explicit
   approval of billing, region, secrets, and rollback. Keep push delivery killed.
4. Publish the static client with per-device subscription and status UI, then
   enable delivery for test accounts and run the idempotent schedule backfill.
5. Verify foreground, background, closed-PWA, quiet hours, retry, two-device,
   Android, and iOS Home Screen paths. Expand rollout only after evidence passes.
6. After the migration window, remove authenticated page-timer delivery and any
   legacy global device toggle writes; retain the guest foreground fallback.

Rollback first disables the server-side delivery flag, which leaves the inbox
and financial data untouched. Functions and schedules may then be reverted
without reverting the static frontend immediately; device and delivery records
are auxiliary and can remain for forensic diagnosis or be removed by a later
explicit cleanup.

## Open Questions

None. The attached audit approved the need for durable per-device delivery,
scheduler recovery, visible diagnosis, and recurring-payment reliability. The
provider and privacy decisions above choose the smallest architecture compatible
with the existing Firebase and static-PWA boundaries.
