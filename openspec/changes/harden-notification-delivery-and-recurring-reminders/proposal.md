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
There is no end-to-end test action or visible delivery diagnosis. Budget alerts
can also suppress a later, more severe stage because their current daily
deduplication key does not encode progression.

These are trust failures for a PWA used in short mobile sessions. Fixing them
requires a small authenticated backend; another frontend timer cannot wake an
application that is closed.

## What Changes

- Keep the Next.js application as a static export and add an isolated Firebase
  Functions v2 package for scheduled evaluation and standards-based Web Push.
- Treat the existing Firestore notification as one global inbox event, then
  create independent, idempotent delivery records for every enabled device;
  only backend-authored versioned events are eligible for background fan-out,
  and user removal soft-dismisses them without destroying lifecycle authority.
- Register and revoke Push API subscriptions per authenticated device, keeping
  persisted endpoint and encryption-key copies outside client-readable
  Firestore while keeping permission local to the browser that granted it.
- Add a single scheduled worker with IANA time-zone semantics, recovery of
  missed runs, quiet-hour deferral, bounded retry, expired-subscription cleanup,
  and overlap-safe leases.
- Correct recurring dates as calendar-day values, wait for hydrated data in the
  guest fallback, cover D-3, D-1, D0 and overdue stages, and resolve the current
  reminder after the payment is registered.
- Preserve the configured daily expense reminder time, but make authenticated
  delivery independent of the page lifecycle and state clearly that guest mode
  remains foreground-only.
- Replace the misleading global device switch with an actual current-device
  state: `Activo`, `Requiere acción`, or `No disponible`; add an explicit
  `Enviar notificación de prueba` action and actionable diagnostics.
- Fix budget-stage progression, threshold ordering, individual inbox error
  feedback, and accessible names for every notification control.
- Add unit, emulator, service-worker, multi-device, closed-PWA, Android and iOS
  Home Screen validation before claiming mobile delivery is robust.

System push payloads will not contain monetary amounts. The canonical inbox
event may retain the current financial detail, while the operating-system alert
uses a concise private summary and a same-origin deep link.

This change does not add SMS, email, a native mobile app, marketing campaigns,
or a Next.js server. It does not redesign the header or Notification Center,
guarantee that an operating system will visibly present every push accepted by
its push service, guarantee exactly-once acceptance by an external push service,
or provide closed-app delivery to unauthenticated guests. It does not enable
billing, deploy Cloud Functions, create VAPID secrets, or alter external
Firebase configuration without a separate explicit authorization.

## Capabilities

### New Capabilities

- `notification-delivery`: defines the authenticated backend boundary, global
  event and per-device delivery model, Web Push lifecycle, time zone, quiet
  hours, retries, privacy, diagnostics, budget escalation, preferences, and
  accessible current-device controls.
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
