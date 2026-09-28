## Why

MoneyTrack currently creates notifications from React while the page is alive.
The daily expense reminder uses a page timer, recurring payments are evaluated
only on mount or visibility recovery, and `public/sw.js` handles clicks but not
`push` events. A closed or suspended PWA therefore cannot receive a reminder.

The foreground path is also unreliable: payment checks may run before
Firestore hydrates and then mark the day as checked, date-time comparison skips
most of the due day, overdue payments do not create reminders, quiet hours drop
the system alert instead of deferring it, and a global
`browserNotifications.enabled` value is presented as a per-device setting.
There is no end-to-end test action or visible delivery diagnosis. Foreground
budget alerts now have a versioned stage baseline, but they are still
client-authored and MUST remain in the local/inbox path rather than silently
becoming billable backend delivery work.

These are trust failures for a PWA used in short mobile sessions. Fixing them
requires a small authenticated backend; another frontend timer cannot wake an
application that is closed.

## What Changes

- Keep the Next.js application as a static export and add an isolated Firebase
  Functions v2 package for scheduled evaluation and standards-based Web Push.
- Treat each backend-authored daily, recurring, or debt reminder as one global
  inbox event, then create independent, idempotent delivery records for every
  enabled device. Eligibility requires an immutable backend delivery marker;
  schema version alone is insufficient. Existing client-authored budget,
  balance, spending, and payment alerts remain foreground/inbox-only.
- Register and revoke Push API subscriptions per authenticated device, keeping
  persisted endpoint and encryption-key copies outside client-readable
  Firestore while keeping permission local to the browser that granted it.
  Scope worker deduplication by an opaque account identifier, cap active
  devices at five per user, and reconcile subscription state on every session
  or visibility recovery rather than depending on `pushsubscriptionchange`;
  a VAPID-key mismatch requires explicit reactivation rather than silent reuse.
  During the client-first deployment window, an authenticated runtime-absent
  browser that has never confirmed the device backend retains only its existing
  open-page local OS gate; the first successful sanitized backend response
  permanently ends that bounded compatibility exception for the account.
- Add a single scheduled worker with IANA time-zone semantics, recovery of
  missed runs, quiet-hour deferral, bounded retry, expired-subscription cleanup,
  overlap-safe recoverable leases, short push-service TTLs, and bounded
  diagnostic retention.
- Persist one server-owned runtime authority per authenticated user so the page
  timer, payment monitor, and debt monitor either run as the complete foreground
  fallback or yield entirely to durable scheduling; transient diagnosis reuses
  the last confirmed authority instead of switching silently.
- Give foreground and durable time-based writers separate deterministic event
  namespaces, stamp every time event with its admitting generation, and switch
  authority through a two-phase Admin compare-and-set transition that fences
  both writers, pauses outgoing schedules/leases, supersedes the outgoing
  namespace, suppresses pending delivery, waits out every dispatch-started
  possible-acceptance window on rollback, and activates only after the
  target-specific schedule invariant is verified. This preserves the
  immutable backend marker and makes rollback executable without two active
  inbox lifecycles. The exact disabled control version is persisted in the
  private journal; a later control race stays fenced until a separately
  authorized CAS rebases only that journal to a newly approved false version.
  The canary control also persists a deterministic digest of the canonical UID
  file, so a rerun after a lost enable response can prove the exact completed
  transition without issuing a second enable mutation.
- Correct recurring dates as calendar-day values, wait for hydrated data in the
  guest fallback, cover D-3, D-1, D0 and unbounded weekly overdue stages, use
  explicit borrowed/lent debt cadences, and resolve the current reminder after
  the payment is registered.
- Preserve the configured daily expense reminder time, but make authenticated
  delivery independent of the page lifecycle and state clearly that guest mode
  remains foreground-only.
- Replace the misleading global device switch with an actual current-device
  state: `Activo`, `Requiere acción`, or `No disponible`; use `Requiere acción`
  for installable iOS/iPadOS cases, add transient checking/error states, give
  guests a separate `Solo con MoneyTrack abierto` state, and add an explicit
  `Enviar notificación de prueba` action with actionable diagnostics.
- Preserve foreground budget-stage progression, fix threshold ordering,
  individual inbox error feedback, and accessible names and live results for
  every notification control.
- Add unit, emulator, service-worker, multi-device, closed-PWA, Android and iOS
  Home Screen validation before claiming mobile delivery is robust, plus
  current Pages SHA/service-worker, ready-index/active-TTL, Functions bounds,
  secret-binding, and exact five-minute Scheduler read-backs before canary work.

System push payloads will not contain monetary amounts, merchant/account/debt
names, descriptions, or other free text. The canonical inbox event may retain
the current financial detail, while the operating-system alert uses constant
type-aware copy and an allowlisted same-origin deep link.

This change does not add SMS, email, a native mobile app, marketing campaigns,
or a Next.js server. It does not move budget, low-balance, unusual-spending, or
other transaction-triggered financial calculations into the backend. It does
not redesign the header or Notification Center, guarantee that an operating
system will visibly present every push accepted by its push service, guarantee
exactly-once acceptance by an external push service, or provide closed-app
delivery to unauthenticated guests. It does not enable billing, deploy Cloud
Functions, create VAPID secrets, or alter external Firebase configuration
without a separate explicit authorization.

## Capabilities

### New Capabilities

- `notification-delivery`: defines the authenticated backend boundary, global
  event and per-device delivery model for durable daily/recurring/debt
  reminders, Web Push lifecycle, time zone, quiet hours, retries, privacy,
  diagnostics, foreground budget escalation, preferences, and accessible
  current-device controls.
- `recurring-reminder-reliability`: defines hydration-safe and calendar-correct
  recurring and daily reminder scheduling, missed-run recovery, overdue policy,
  idempotency, and resolution after payment.

### Modified Capabilities

None. Existing shell, desktop-operability, help/state, debt, metric, and AI
contracts remain unchanged.

## Impact

- Frontend: `NotificationPreferences`, notification contexts/hooks, the current
  monitor fallback, `browserNotifications`, recurring date utilities, the
  service worker, and focused tests.
- Backend: a separate `functions/` Node.js 22 package using Firebase Functions
  v2, Admin SDK, Cloud Scheduler, and one server-only Web Push dependency. Its
  manifest/lockfile do not alter the active root dependency-security baseline.
- Firestore: owner-visible inbox events plus server-owned device, schedule, and
  delivery documents; strict rules prevent clients from forging deliverable
  event identity/stage fields, and emulator tests protect every boundary.
- Configuration: `firebase.json`, `.env.example`, VAPID public/private keys,
  Functions parameters, and CI validation for both root and backend packages.
- Deployment: GitHub Pages remains the static frontend host. Functions and
  Scheduler are deployed separately only after billing, region, secrets, and
  rollback controls are approved.
- Validation: deterministic unit tests, Firestore/Functions emulators, complete
  frontend and backend checks, and physical closed-app tests on supported mobile
  platforms.
