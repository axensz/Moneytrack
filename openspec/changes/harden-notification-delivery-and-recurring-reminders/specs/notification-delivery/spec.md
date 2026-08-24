## ADDED Requirements

### Requirement: Authenticated notifications use a durable backend boundary
The system MUST preserve the static Next.js frontend while using an isolated
authenticated backend to schedule and deliver Web Push notifications when the
application is not running.

#### Scenario: Subscribed PWA is closed
- **WHEN** an authenticated user's due notification reaches its allowed delivery time and an enabled device has a valid PushSubscription
- **THEN** the backend MUST deliver through the browser push service without requiring an open tab, mounted React tree, or live page timer

#### Scenario: Guest enables a local reminder
- **WHEN** an unauthenticated guest configures a daily or recurring reminder
- **THEN** MoneyTrack MUST preserve the local inbox and foreground notification behavior and MUST state that closed-app delivery requires sign-in

#### Scenario: Frontend is built for production
- **WHEN** the notification backend is added
- **THEN** `next.config.ts` MUST remain a static export and backend packages MUST remain isolated from the root frontend runtime dependency tree

### Requirement: Device permission and subscription state are independent
The system MUST register, enable, diagnose, and revoke Web Push independently
for each authenticated browser or installed PWA.

#### Scenario: User activates the current device
- **WHEN** a supported secure-context device grants notification permission from a direct user action
- **THEN** the browser MUST create or reuse one PushSubscription and the authenticated backend MUST associate it with a stable current-device ID without changing another device

#### Scenario: Another device is disabled
- **WHEN** the user disables notifications on device B
- **THEN** device B MUST unsubscribe and become disabled while device A's permission, registration, and delivery state remain unchanged

#### Scenario: User signs out or switches accounts
- **WHEN** an authenticated session ends on a subscribed device
- **THEN** MoneyTrack MUST unsubscribe locally before completing sign-out, request server revocation for that account/device, and MUST NOT continue showing that account's financial notifications on the shared device

#### Scenario: Push subscription expires
- **WHEN** a push service returns 404 or 410 for a device endpoint
- **THEN** the backend MUST mark only that device expired, stop retrying it, and expose `Requiere acción` on the next authenticated diagnostic check

### Requirement: Push subscription capability data stays server-only
Raw push endpoints and encryption keys MUST be accepted only by authenticated
callable functions, stored server-side, bounded by schema and size validation,
and denied to direct client Firestore reads or writes.

#### Scenario: Client accesses notification infrastructure collections
- **WHEN** any client attempts to read or write another user's or its own raw device, schedule, or delivery document directly
- **THEN** Firestore rules MUST deny the operation while preserving the user's allowed inbox and preference operations

#### Scenario: Unauthenticated registration request is sent
- **WHEN** a device registration, revocation, status, or test callable lacks valid Firebase authentication
- **THEN** the backend MUST reject it without persisting subscription data or dispatching a push

### Requirement: Global events fan out with idempotent logical records
The system MUST keep one canonical inbox event lifecycle and one deterministic
logical delivery record per event revision and enabled device without claiming
exactly-once acceptance from the external push service.

#### Scenario: Two devices receive one event
- **WHEN** one active event revision targets a user with two enabled devices
- **THEN** the inbox MUST contain one event and the backend MUST create exactly one independent logical delivery record for each device

#### Scenario: Worker or trigger runs twice
- **WHEN** overlapping or retried backend invocations evaluate the same event revision and device
- **THEN** a transactional lease MUST serialize attempts and every attempt MUST reuse the deterministic delivery ID without asserting that an external acceptance was committed exactly once

#### Scenario: Event advances to a higher stage
- **WHEN** a canonical event changes from a lower to a higher valid stage
- **THEN** the backend MUST increment its revision, suppress every nonterminal lower-revision delivery, and create one logical delivery of the new revision for each enabled device in the same transaction

#### Scenario: Lower revision arrives after a higher revision
- **WHEN** an already in-flight or retried lower event revision reaches the service worker after that worker handled a higher revision for the same event
- **THEN** the service worker MUST ignore the lower revision and MUST NOT present it to the user

#### Scenario: Client forges a deliverable event or stage
- **WHEN** a client attempts to create or mutate backend-owned event identity, revision, stage, status, or scheduling fields
- **THEN** Firestore rules MUST reject the write, legacy client-created inbox events MUST remain non-deliverable by the backend, and no delivery work MUST be created

#### Scenario: User removes a versioned inbox event
- **WHEN** the owner activates the remove action for a backend-authored versioned event
- **THEN** the client MUST set only dismissal state matching the current revision, the server lifecycle MUST remain intact, and direct client deletion of the versioned event MUST be denied

#### Scenario: Dismissed event advances later
- **WHEN** a versioned event advances beyond the revision the owner dismissed or read
- **THEN** the new revision MUST become visible and unread again, and the client MUST NOT be allowed to pre-dismiss a future revision

### Requirement: Quiet hours defer system delivery
Quiet hours MUST affect the operating-system delivery time without deleting,
hiding, duplicating, or falsifying the canonical inbox event.

#### Scenario: Event occurs inside quiet hours
- **WHEN** an event is created during the configured quiet interval in the user's IANA time zone
- **THEN** it MUST appear in the in-app inbox with its original scheduled time and each system delivery MUST remain pending until the first allowed time

#### Scenario: Quiet interval crosses midnight
- **WHEN** quiet hours begin later than they end
- **THEN** scheduling MUST interpret the interval across midnight using calendar time in the configured zone

#### Scenario: Quiet start equals quiet end
- **WHEN** start and end are equal
- **THEN** the interval MUST remain empty rather than muting delivery for 24 hours

### Requirement: Delivery retries are bounded and observable
The backend MUST classify delivery outcomes, retry only transient failures, and
preserve enough sanitized state for diagnosis without exposing capability URLs.

#### Scenario: Push service temporarily fails
- **WHEN** delivery returns a network error, 429, or 5xx response
- **THEN** it MUST retry with bounded exponential backoff for no more than five attempts and 24 hours

#### Scenario: Push acceptance outcome is ambiguous
- **WHEN** the backend loses the response after a push request may have been accepted
- **THEN** it MUST record an ambiguous outcome, any retry MUST reuse the same delivery ID and notification tag, and the service worker MUST suppress repeated presentation of an already handled delivery ID

#### Scenario: User delivery rate is exceeded
- **WHEN** more than 60 pushes would be accepted for one user in a rolling hour
- **THEN** excess deliveries MUST be deferred and visible as pending rather than dropped or multiplied

#### Scenario: Permanent unsupported payload is rejected
- **WHEN** the backend or service worker encounters an unknown schema version, invalid same-origin URL, or oversized payload
- **THEN** it MUST mark the attempt failed with a sanitized reason and MUST NOT display or navigate to the payload

### Requirement: Current-device status and test delivery are truthful
The notification preference surface MUST expose a named current-device state,
the next corrective action, and a rate-limited end-to-end test.

#### Scenario: Device is fully registered
- **WHEN** permission, service worker, local subscription, and backend device registration agree
- **THEN** the surface MUST show `Activo` and enable `Enviar notificación de prueba`

#### Scenario: Device needs intervention
- **WHEN** permission is missing or blocked, installation is required, the subscription is absent, or the endpoint expired
- **THEN** the surface MUST show `Requiere acción`, explain the exact next step, and MUST NOT claim that system notifications are active

#### Scenario: Platform cannot support push
- **WHEN** required APIs or a secure context are unavailable, or iOS/iPadOS is not running the installed Home Screen PWA
- **THEN** the surface MUST show `No disponible` and provide platform-appropriate guidance instead of an operable-looking switch

#### Scenario: Test push is accepted
- **WHEN** an active device sends a test request outside the one-per-minute limit and its push service accepts it
- **THEN** the UI MUST report `Aceptada por el servicio push`, disclose that the test bypasses quiet hours, and MUST NOT claim that acceptance proves visible OS presentation

#### Scenario: Test push fails
- **WHEN** permission, service worker, authentication, subscription, backend, or push service prevents the test
- **THEN** the UI MUST retain the settings surface and show the specific actionable failure without a generic success toast

### Requirement: Notification controls and validation meet WCAG AA
Every notification setting MUST have a stable programmatic name, associated help
or error text, keyboard operation, visible focus, and a 44–48 CSS-pixel target.

#### Scenario: Assistive technology navigates settings
- **WHEN** focus reaches a reminder switch, type switch, threshold input, time input, quiet-hour selector, device action, or test action
- **THEN** its accessible name MUST identify the setting and its current state without relying on nearby visual position or color

#### Scenario: Thresholds are saved out of order
- **WHEN** `budgetWarning >= budgetCritical`, `budgetCritical > budgetExceeded`, or `budgetExceeded < 100`
- **THEN** saving MUST be rejected with Spanish inline guidance, input MUST be preserved, and focus MUST move to the first invalid field

#### Scenario: Preference save fails
- **WHEN** Firestore or the device callable rejects a save
- **THEN** the surface MUST keep the user's draft, identify what was not saved, and provide a retry path

### Requirement: Budget severity progression cannot be deduplicated away
One budget/month event MUST advance monotonically through configured stages and
MUST redeliver only when its stage becomes more severe.

#### Scenario: Budget crosses warning then critical
- **WHEN** a budget already emitted warning and later reaches critical in the same local month
- **THEN** the canonical event MUST advance, increment its revision, suppress pending warning deliveries, and create one critical logical delivery record per enabled device

#### Scenario: Lower or equal stage is reevaluated
- **WHEN** the same budget/month is evaluated again without a higher stage
- **THEN** the inbox and per-device deliveries MUST remain unchanged

#### Scenario: Budget becomes exceeded
- **WHEN** utilization reaches the valid exceeded threshold after a prior warning or critical stage
- **THEN** exceeded MUST replace the active stage and MUST NOT be blocked by the earlier event identity

### Requirement: System push payloads protect financial privacy
Operating-system payloads MUST omit monetary amounts, use type-aware generic
copy, and navigate only to a canonical same-origin application path.

#### Scenario: Financial event is dispatched
- **WHEN** a budget, payment, balance, spending, or debt event is sent to a device
- **THEN** the push title/body MUST NOT contain an amount and full financial detail MUST remain in the authenticated inbox

#### Scenario: User activates a push notification
- **WHEN** the service worker receives `notificationclick`
- **THEN** it MUST focus an existing MoneyTrack client or open the static app with the correct base path and canonical internal destination

#### Scenario: Repeated delivery payload is received
- **WHEN** the service worker receives a previously handled delivery ID again
- **THEN** it MUST discard the repeated payload without showing another operating-system notification

### Requirement: Individual inbox failures are recoverable
Individual mark-read and remove actions MUST match the existing bulk-action
feedback and optimistic-state safety.

#### Scenario: Mark-read fails
- **WHEN** Firestore rejects an individual mark-read operation
- **THEN** the unread state MUST be restored and an actionable error toast MUST be shown

#### Scenario: Remove or dismissal fails
- **WHEN** Firestore rejects a versioned-event soft dismissal or a legacy notification deletion
- **THEN** the notification MUST remain or be restored and an actionable error toast MUST be shown
