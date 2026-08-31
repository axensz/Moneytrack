## ADDED Requirements

### Requirement: Authenticated notifications use a durable backend boundary
The system MUST preserve the static Next.js frontend while using an isolated
authenticated backend to schedule and deliver daily, recurring-payment, and
debt Web Push reminders when the application is not running.

#### Scenario: Subscribed PWA is closed
- **WHEN** an authenticated user's due notification reaches its allowed delivery time and an enabled device has a valid PushSubscription
- **THEN** the backend MUST deliver through the browser push service without requiring an open tab, mounted React tree, or live page timer

#### Scenario: Guest enables a local reminder
- **WHEN** an unauthenticated guest configures a daily or recurring reminder
- **THEN** MoneyTrack MUST preserve the local inbox and foreground notification behavior and MUST state that closed-app delivery requires sign-in

#### Scenario: Frontend is built for production
- **WHEN** the notification backend is added
- **THEN** `next.config.ts` MUST remain a static export and backend packages MUST remain isolated from the root frontend runtime dependency tree

#### Scenario: Compatibility client is published before backend callables
- **WHEN** an authenticated account has no runtime document and this browser has never received a successful sanitized device status or registration response
- **THEN** the browser MAY retain its existing local preference-plus-permission gate for foreground OS presentation only, MUST NOT create/register a PushSubscription or claim closed-app delivery, MUST persist a bounded UID-scoped confirmation marker on the first successful backend response including `missing`, and MUST NOT use that legacy gate again for the confirmed account or whenever a runtime document exists

#### Scenario: A foreground financial alert is created
- **WHEN** budget, low-balance, unusual-spending, or other transaction-triggered client logic creates an inbox event
- **THEN** the event MUST remain foreground/inbox-only, MUST NOT carry the backend delivery marker, and MUST NOT create per-device delivery work

### Requirement: Device permission and subscription state are independent
The system MUST register, enable, diagnose, and revoke Web Push independently
for each authenticated browser or installed PWA.

#### Scenario: User activates the current device
- **WHEN** a supported secure-context device grants notification permission from a direct user action
- **THEN** the browser MUST create or reuse one PushSubscription whose `applicationServerKey` matches the configured public VAPID key and the authenticated backend MUST associate it with a stable current-device ID without changing another device

#### Scenario: Existing subscription uses an old VAPID key
- **WHEN** reconciliation finds a PushSubscription whose `applicationServerKey` differs from the configured public VAPID key
- **THEN** MoneyTrack MUST NOT reuse or register it, MUST make bounded revoke and unsubscribe attempts, and MUST show `Requiere acción` until the user explicitly activates a replacement

#### Scenario: Another device is disabled
- **WHEN** the user disables notifications on device B
- **THEN** device B MUST unsubscribe and become disabled while device A's permission, registration, and delivery state remain unchanged

#### Scenario: User signs out or switches accounts
- **WHEN** an authenticated session ends on a subscribed device
- **THEN** MoneyTrack MUST make a bounded local unsubscribe attempt, request server revocation, close displayed notifications and clear dedupe/display state for that account, persist a blocked-account tombstone until a later explicit account SET, and complete sign-out even if remote revocation is temporarily unavailable

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

#### Scenario: Device registration limit is reached
- **WHEN** an account already has five active devices and another device attempts registration
- **THEN** the backend MUST reject the registration with a sanitized actionable error without disabling an existing device

#### Scenario: A caller rotates device IDs or reuses an endpoint
- **WHEN** repeated registration or test requests use new device IDs for the same authenticated account or PushSubscription endpoint
- **THEN** global endpoint-hash uniqueness plus registration limits of ten real mutations per user and five per device per rolling hour MUST prevent duplicate bindings and rate-limit bypass, while idempotent no-change reconciliation MUST consume no quota

#### Scenario: A shared browser changes accounts after revocation failed
- **WHEN** account B registers the same endpoint and matching encryption-capability fingerprint that remains bound to account A
- **THEN** one server transaction MUST bind it to B and disable A's stale binding before B can receive delivery work

#### Scenario: Endpoint is replayed with different encryption keys
- **WHEN** a caller submits an endpoint already bound to another device but its `p256dh` or `auth` capability fingerprint differs
- **THEN** registration MUST reject the mismatch without disabling or rebinding the existing device

#### Scenario: A forged subscription targets internal infrastructure
- **WHEN** a registration endpoint is not HTTPS, contains credentials or a fragment, is an IP literal, uses a disallowed port, or resolves to loopback, private, link-local, or cloud-metadata address space
- **THEN** registration MUST reject it using parse-plus-DNS validation only; dispatch MUST revalidate and pin public hostname answers, treat any 3xx as terminal without following `Location`, and make no request to a disallowed address

### Requirement: Global events fan out with idempotent logical records
The system MUST keep one canonical inbox event lifecycle and one deterministic
logical delivery record per event revision and enabled device without claiming
exactly-once acceptance from the external push service. Delivery IDs and worker
deduplication MUST include an opaque account scope. Every delivery MUST store
the exact `authorityConfigVersion` that admitted it; every delivery lease
claim, recovery, release, pre-dispatch commit, and result commit MUST compare
that field with the exact active durable runtime generation.

#### Scenario: Two devices receive one event
- **WHEN** one active event revision targets a user with two enabled devices
- **THEN** the inbox MUST contain one event and the backend MUST create exactly one independent logical delivery record for each device

#### Scenario: Delivery control is disabled or excludes the durable user
- **WHEN** an active durable schedule becomes due while control is absent, false, malformed, or its canonical allowlist excludes that UID
- **THEN** that control state MUST NOT gate schedule evaluation, the canonical inbox lifecycle, or deterministic pending per-device fan-out; a valid due evaluation MUST advance normally, but the worker MUST recheck control immediately before adapter I/O, release and boundedly defer blocked pending delivery without incrementing attempts, and make no push-service request

#### Scenario: Worker or trigger runs twice
- **WHEN** overlapping or retried backend invocations evaluate the same event revision and device
- **THEN** a transactional lease MUST serialize attempts and every attempt MUST reuse the deterministic delivery ID without asserting that an external acceptance was committed exactly once

#### Scenario: Worker crashes after claiming a delivery
- **WHEN** a delivery remains `sending` after its bounded lease expires
- **THEN** a later worker MUST reclaim it transactionally, increment `attempts` only when a new external dispatch starts, and retain the same delivery identity

#### Scenario: A test request is repeated
- **WHEN** one device repeats its most recent client-generated `testRequestId` within the one-minute test window
- **THEN** the backend MUST derive the same account-and-device-scoped event, revision-one delivery, Topic, and tag, return the stored sanitized outcome, and MUST NOT create a canonical financial inbox event

#### Scenario: Event advances to a higher stage
- **WHEN** a canonical event changes from a lower to a higher valid stage
- **THEN** the backend MUST increment its revision, suppress every nonterminal lower-revision delivery, and create one logical delivery of the new revision for each enabled device in the same transaction

#### Scenario: Lower revision arrives after a higher revision
- **WHEN** an already in-flight or retried lower event revision reaches the service worker after that worker handled a higher revision for the same event
- **THEN** the service worker MUST ignore the lower revision and MUST NOT present it to the user

#### Scenario: Client forges a deliverable event or stage
- **WHEN** a client attempts to set `deliverySource: backend` or mutate identity, revision, stage, lifecycle, or scheduling fields on an existing backend-marked event
- **THEN** Firestore rules MUST reject the write, legacy or client-authored versioned inbox events without that immutable marker MUST remain non-deliverable, and no delivery work MUST be created

#### Scenario: Two accounts reuse one browser
- **WHEN** account B creates an event whose event ID/revision matches an event previously handled for account A
- **THEN** opaque account scoping in the delivery ID, notification tag, and worker state MUST keep both accounts isolated

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

#### Scenario: Quiet hours are relaxed after a delivery was deferred
- **WHEN** a pending delivery already has a future `notBefore` and the user later disables or relaxes quiet hours
- **THEN** the backend MAY leave that delivery pending until the existing `notBefore`, and at that boundary it MUST recheck current preferences and deliver if otherwise valid; the delivery MUST NOT be dropped or duplicated

#### Scenario: Foreground-only event occurs in quiet hours
- **WHEN** a guest or active-foreground client persists an event during quiet hours while its page remains alive
- **THEN** the inbox MUST update immediately and one account/event/revision timer MUST wait for quiet end, then recheck current preference, local device/permission, exact authority, lifecycle/revision, and expiry before presenting once; logout, account/authority change, resolution, newer revision, or unmount MUST cancel it

### Requirement: Delivery retries are bounded and observable
The backend MUST classify delivery outcomes, retry only transient failures, and
preserve enough sanitized state for diagnosis without exposing capability URLs.

#### Scenario: Push service temporarily fails
- **WHEN** delivery returns a network error, 429, or 5xx response
- **THEN** it MUST retry with bounded exponential backoff for no more than five attempts and 24 hours and MUST stop once the event-specific `expiresAt` has passed

#### Scenario: Push service returns another client error
- **WHEN** delivery returns a 4xx other than endpoint-expiring 404/410, rate-limiting 429, or configuration 401/403
- **THEN** the delivery MUST become terminal failed with a sanitized `http-4xx` reason, MUST NOT retry, and MUST leave the device active

#### Scenario: Push acceptance outcome is ambiguous
- **WHEN** the backend loses the response after a push request may have been accepted
- **THEN** it MUST record an ambiguous outcome, any retry MUST reuse the same delivery ID and notification tag, and the service worker MUST suppress repeated presentation of an already handled delivery ID

#### Scenario: User delivery rate is exceeded
- **WHEN** more than 60 dispatch attempts would be transactionally reserved for one user in a rolling hour
- **THEN** excess deliveries MUST be deferred before the external call and remain visible as pending rather than dropped or multiplied

#### Scenario: Backend rejects a permanently unsupported payload
- **WHEN** backend serialization or schema validation encounters an unknown schema version, invalid same-origin URL, or oversized payload before dispatch
- **THEN** the backend MUST mark the delivery failed with a sanitized reason, MUST NOT call the push service, and MUST NOT expose the rejected payload

#### Scenario: Service worker receives an invalid payload
- **WHEN** the service worker receives an unknown schema version, invalid same-origin URL, malformed value, or oversized payload
- **THEN** it MUST discard the payload locally without displaying or navigating and MUST NOT attempt a server acknowledgement or delivery-status mutation

#### Scenario: Push payload arrives after its validity window
- **WHEN** the service worker receives a payload whose `expiresAt` is in the past
- **THEN** it MUST discard the payload without presenting or navigating, even if the push service previously accepted it

#### Scenario: Terminal diagnostics reach retention age
- **WHEN** a terminal delivery or disabled/expired device reaches its `retentionExpiresAt` 30 days later
- **THEN** the configured Firestore TTL policy MAY remove that diagnostic document without affecting active devices, schedules, or canonical inbox events

#### Scenario: Delivery remains nonterminal
- **WHEN** a delivery is `pending`, `sending`, `retrying`, or `ambiguous`
- **THEN** it MUST NOT carry diagnostic `retentionExpiresAt`; only a terminal transition sets that field to `terminalAt + 30 days`

### Requirement: Time-based notification authority has one explicit owner
The system MUST expose a server-owned runtime authority per authenticated user
so client and backend monitors never intentionally create equivalent daily,
recurring, or debt inbox events.

#### Scenario: Runtime authority is durable
- **WHEN** the user's backfill has been verified, runtime authority is `durable`, and `activatedAt` is set for the current `configVersion`
- **THEN** the page timer, `PaymentMonitor`, and `DebtMonitor` MUST NOT evaluate, create an inbox event, or request page/system delivery for equivalent time-based reminders

#### Scenario: Runtime authority is foreground
- **WHEN** the user is a guest or the authenticated runtime authority is active `foreground`
- **THEN** the existing client fallback MUST retain its complete inbox and foreground notification behavior; guests MUST use `foreground:guest:*`, runtime-absent authenticated compatibility MUST use only `foreground:compat:*`, and an active authenticated generation MUST use only `foreground:v{configVersion}:daily-expense:*`, `foreground:v{configVersion}:recurring:*`, or `foreground:v{configVersion}:debt:*` with the exact active `authorityConfigVersion`

#### Scenario: Authority changes from foreground to durable
- **WHEN** an allowlisted account is promoted after its schedules and backfill are verified
- **THEN** an Admin compare-and-set transition MUST increment `configVersion` and set target `durable` with `activatedAt: null`, supersede only active events under the three exact outgoing-generation prefixes `foreground:v{fromConfigVersion}:daily-expense:*`, `foreground:v{fromConfigVersion}:recurring:*`, and `foreground:v{fromConfigVersion}:debt:*`, pause outgoing schedules and clear their leases, suppress and verify the drain of outgoing nonterminal deliveries, resumably promote only verified target-generation schedules from staged to active while fenced, and only then activate that same durable generation

#### Scenario: Runtime-absent account is promoted for the first time
- **WHEN** explicit Admin backfill has staged verified generation-one schedules for an allowlisted account with no runtime document
- **THEN** the transition MUST treat its outgoing compatibility authority as `foreground` version `null`, drain only `foreground:compat:*`, atomically create fenced durable version 1 plus its private journal, and resume that same transition on rerun rather than allocate another generation

#### Scenario: Initial or lost manifest needs authority discovery
- **WHEN** an authorized operator has an exact UID file but no usable authority manifest
- **THEN** a read-only manifest-free inspection MUST return only project/control and sanitized current-or-pending authority/version/phase fields for those UIDs, normalize absent runtime to foreground version `null`, expose no financial or capability data, and provide sufficient exact state to create or reconstruct the ignored manifest

#### Scenario: Authority rolls back from durable to foreground
- **WHEN** delivery is disabled and an allowlisted account must return to the compatibility fallback
- **THEN** an Admin compare-and-set transition MUST increment `configVersion` and set target `foreground` with `activatedAt: null`, resolve and supersede active backend-marked time events, pause outgoing schedules and clear their leases, promote no schedule, suppress and verify the drain of nonterminal deliveries, wait until the maximum possible-acceptance expiry of every outgoing dispatch that started even if its final result is accepted, ambiguous, sending, or stale, verify zero active/leased schedules, and only then activate that same foreground generation; the client MUST use only the fresh `foreground:v{toConfigVersion}:daily-expense:*`, `foreground:v{toConfigVersion}:recurring:*`, and `foreground:v{toConfigVersion}:debt:*` namespaces without mutating the immutable backend marker or reusing `foreground:compat:*`

#### Scenario: Target schedule activation is incomplete
- **WHEN** a durable target has an expected schedule still staged/mismatched, a foreground target has any schedule active/leased, any outgoing schedule remains active/leased, or any outgoing nonterminal work remains
- **THEN** the final authority compare-and-set MUST fail and the runtime MUST remain fenced; a rerun MUST resumably finish that target's transition

#### Scenario: Post-activate status is partial or mismatched
- **WHEN** sanitized status for any manifest UID is missing, duplicated, not active at the exact target authority and incremented generation, or still has a pending journal
- **THEN** the rollout MUST abort before durable control enable and MUST NOT declare foreground rollback complete; printing an unparsed status response is not sufficient evidence

#### Scenario: Process stops after one or more users activate
- **WHEN** the same manifest is rerun after a user already reached its exact target authority at source version plus one with activation set and no pending journal
- **THEN** `prepare`, `drain`, `verify`, and `activate` MUST treat that user as a completed no-op, MAY resume other exact source/pending users in the batch, MUST NOT allocate another generation, and MUST abort on any different target/version/journal combination

#### Scenario: Reminder source changes during a fenced promotion
- **WHEN** current preferences, an active recurring source, or an unresolved debt source changes between prepare and activate
- **THEN** exact-pending-generation synchronization MAY create only its missing deterministic staged schedule or pause its removed schedule without events/deliveries, and durable activation MUST transactionally re-read sources and require the exact expected active schedule-ID/source-digest map before its final compare-and-set

#### Scenario: Authority transition is fenced
- **WHEN** a runtime authority has `activatedAt: null`
- **THEN** neither foreground nor durable time-based writers MUST evaluate, create, lease, dispatch, or reactivate equivalent work for that generation

#### Scenario: A stale foreground client races a durable transition
- **WHEN** a client attempts to write a versioned authenticated `foreground:v{configVersion}:daily-expense:*`, `foreground:v{configVersion}:recurring:*`, or `foreground:v{configVersion}:debt:*` event without the exact active foreground `authorityConfigVersion`, or attempts a legacy/compatibility time-event shape after a runtime document exists
- **THEN** Firestore rules MUST reject the write while continuing to allow client-authored budget, low-balance, and unusual-spending events

#### Scenario: A stale worker races an authority transition
- **WHEN** a schedule/event transaction, delivery lease claim/recovery/release, external dispatch, or result commit observes a missing, fenced, non-durable, or different runtime generation, or a delivery has a missing or mismatched `authorityConfigVersion`
- **THEN** the backend MUST stop before committing or calling the push service; a result commit MUST also match the same lease owner/expiry and MUST suppress stale nonterminal work without clearing `dispatchStartedAt` or `possibleAcceptanceExpiresAt` rather than applying or presenting its stale adapter result

#### Scenario: Stale Admin enable races an emergency kill switch
- **WHEN** an Admin control command's expected `controlVersion` no longer matches because another operator disabled delivery
- **THEN** its compare-and-increment transaction MUST abort without changing the control document, and a successful command MUST read back the exact incremented result

#### Scenario: Canary control identity is malformed
- **WHEN** the control UID array is empty, oversized, duplicated, has an invalid UID, lacks its lowercase SHA-256 digest, or its digest does not recompute from UTF-8 `JSON.stringify` of the Unicode-code-unit-sorted array
- **THEN** every backend control read MUST treat delivery as disabled and MUST NOT contact the push service

#### Scenario: Durable enable response is lost
- **WHEN** the compare-and-increment enable write succeeds but the operator does not receive its response and reruns the same manifest and approved UID file
- **THEN** the rollout MUST classify enable as already complete only when control is true at the original disabled `controlVersion + 1`, its UID count and canonical digest exactly match that file, and every manifest UID is active at the exact durable target generation with no pending journal; it MUST perform no second control mutation, and every other enabled state MUST abort for emergency disable or investigation

#### Scenario: Control changes during authority activation
- **WHEN** the absent-or-disabled control state/version recorded for an authority transition becomes enabled, malformed, or version-changed before final activation
- **THEN** the private pending journal MUST retain the original version, every phase and final authority compare-and-set MUST require manifest = journal = live control and abort without activating the target generation, and only a durable target's later enable MAY use that exact expected disabled control version; a foreground target MUST leave control false and execute no enable

#### Scenario: A control change leaves users fenced
- **WHEN** a separately authorized operator elects to resume after the live control version changed during a pending transition
- **THEN** only an explicit idempotent `rebase-control` compare-and-set MAY adopt the newly approved exact false version after matching the old journal value and every unchanged pending user/target; it MUST update only journal control versions, keep authority fenced, leave control/schedules/deliveries unchanged, and reject enabled, malformed, absent-after-existing, or third-version state

#### Scenario: Outgoing namespace remains as lifecycle evidence
- **WHEN** an authority transition supersedes an outgoing time-event lifecycle
- **THEN** the canonical document MAY remain for audit and source-state resolution but MUST NOT appear as a second visible notification row beside the active writer namespace

#### Scenario: Backend authority returns after a foreground interval
- **WHEN** a superseded/resolved backend event from durable generation 2 becomes the current window again under durable generation 4 after foreground generation 3
- **THEN** the same backend document MUST reactivate at prior revision plus one, stamp generation 4, clear authority-supersession fields, become visible/unread, and MUST NOT create a second backend lifecycle

#### Scenario: Runtime authority cannot be refreshed
- **WHEN** a transient diagnostic failure prevents a fresh runtime read
- **THEN** the client MUST use the last confirmed authority, default to `foreground` only when none has ever been confirmed, and surface the diagnostic failure without switching an established authority implicitly

### Requirement: Current-device status and test delivery are truthful
For authenticated users, the notification preference surface MUST expose a
named current-device state, the next corrective action, and a rate-limited
end-to-end test. Guests MUST receive a separate foreground-only state.

#### Scenario: Device is fully registered
- **WHEN** permission, service worker, local subscription, and backend device registration agree
- **THEN** the surface MUST show `Activo` and enable `Enviar notificación de prueba`

#### Scenario: Device needs intervention
- **WHEN** permission is missing or blocked, installation is required, the subscription is absent, the endpoint expired, or the existing subscription uses a different VAPID application-server key
- **THEN** the surface MUST show `Requiere acción`, explain the exact next step, and MUST NOT claim that system notifications are active

#### Scenario: Platform cannot support push
- **WHEN** required APIs or a secure context are unavailable and there is no supported corrective installation step
- **THEN** the surface MUST show `No disponible` and provide platform-appropriate guidance instead of an operable-looking switch

#### Scenario: iOS or iPadOS PWA is not installed
- **WHEN** standards-based Web Push would be available after adding MoneyTrack to the Home Screen
- **THEN** the surface MUST show `Requiere acción` with Home Screen installation guidance rather than `No disponible`

#### Scenario: Guest inspects notification delivery
- **WHEN** no authenticated backend identity exists
- **THEN** the surface MUST show `Solo con MoneyTrack abierto`, preserve local behavior, and offer sign-in as the path to closed-app delivery without using the authenticated device-state triad

#### Scenario: Device diagnosis is pending or unavailable
- **WHEN** the current-device check is running or fails because the network/backend cannot be reached
- **THEN** the surface MUST show `Comprobando...` or `No se pudo comprobar` with `Reintentar` and MUST NOT infer an inactive or unsupported device; in the bounded runtime-absent/no-confirmation compatibility state it MUST disclose that existing local alerts work only while MoneyTrack is open and MUST NOT show `Activo` or the push test

#### Scenario: Test push is accepted
- **WHEN** an active device sends a test request outside the one-per-minute limit and its push service accepts it
- **THEN** the UI MUST report `Aceptada por el servicio push`, disclose that the test bypasses quiet hours, and MUST NOT claim that acceptance proves visible OS presentation

#### Scenario: Test push is rate-limited
- **WHEN** the device or user reaches the one-per-minute test limit
- **THEN** the UI MUST show the sanitized retry time and MUST NOT describe the immediate test as quiet-hour deferred

#### Scenario: Test push is outside the delivery canary
- **WHEN** `notificationControl/config` is absent, disabled, malformed, or does not allowlist the authenticated UID
- **THEN** the callable MUST recheck that state immediately before adapter I/O, return a sanitized configuration failure, and MUST NOT contact the push service; durable runtime authority is not required for this explicit diagnostic

#### Scenario: Test push fails
- **WHEN** permission, service worker, authentication, subscription, backend, or push service prevents the test
- **THEN** the UI MUST retain the settings surface and show the specific actionable failure without a generic success toast

### Requirement: Production infrastructure is read back before canary work
The rollout MUST fail closed until the deployed static artifact, Firestore
infrastructure, Functions configuration, secret bindings, and Scheduler job are
read back and match the reviewed release contract.

#### Scenario: Published artifact is verified
- **WHEN** the reviewed Pages workflow completes for an exact 40-character SHA
- **THEN** verification MUST fetch the current same-origin artifact, require the production public VAPID key, and require base-path `sw.js` to contain the cache-version suffix derived from the first seven SHA characters so a later deployment cannot pass on key equality alone

#### Scenario: Backend deployment is verified while disabled
- **WHEN** rules, indexes, TTL policies, and Functions have been deployed with absent-or-false delivery control
- **THEN** the rollout MUST prove every required composite index is `READY`, both required diagnostic TTL policies are `ACTIVE`, `dispatchNotificationWork` has minimum zero/maximum one instance, concurrency one and four-minute timeout, both it and `sendTestNotification` bind only the named VAPID secret metadata plus matching public parameters, and exactly one HTTPS Scheduler job is `ENABLED` at `*/5 * * * *` in `Etc/UTC` before backfill or canary work

### Requirement: Notification controls and validation meet WCAG AA
Every notification setting MUST have a stable programmatic name, associated help
or error text, keyboard operation, visible focus, and a 44–48 CSS-pixel target.

#### Scenario: Assistive technology navigates settings
- **WHEN** focus reaches a reminder switch, type switch, threshold input, time input, quiet-hour selector, device action, or test action
- **THEN** its accessible name MUST identify the setting and its current state without relying on nearby visual position or color

#### Scenario: An asynchronous device action completes
- **WHEN** status, activation, save, test, or retry completes or fails
- **THEN** an inline `aria-live` status or alert MUST announce the result, pending controls MUST expose `aria-busy`, and focus MUST remain stable unless validation moves it to the first invalid field

#### Scenario: Thresholds are saved out of order
- **WHEN** `budgetWarning >= budgetCritical`, `budgetCritical > budgetExceeded`, or `budgetExceeded < 100`
- **THEN** saving MUST be rejected with Spanish inline guidance, input MUST be preserved, and focus MUST move to the first invalid field

#### Scenario: Preference save fails
- **WHEN** Firestore or the device callable rejects a save
- **THEN** the surface MUST keep the user's draft, identify what was not saved, and provide a retry path

#### Scenario: Preference document is created or migrated
- **WHEN** an owner creates or updates notification preferences
- **THEN** the resultant document MUST contain only the complete schema-v2 root and nested fields, valid booleans, integer hours/minute, nonempty bounded timezone, budget thresholds `0 <= warning < critical <= 100 <= exceeded <= 200`, unusual-spending threshold 100–1000, and nonnegative low-balance threshold; legacy documents MAY remain readable until their next complete migration write

### Requirement: Foreground budget severity progression cannot be deduplicated away
One client-authored budget/month event MUST advance monotonically through
configured stages while remaining in the foreground/inbox path.

#### Scenario: Budget crosses warning then critical
- **WHEN** a budget already emitted warning and later reaches critical in the same local month
- **THEN** the canonical foreground event MUST advance and increment its revision without creating per-device background deliveries

#### Scenario: Lower or equal stage is reevaluated
- **WHEN** the same budget/month is evaluated again without a higher stage
- **THEN** the inbox and per-device deliveries MUST remain unchanged

#### Scenario: Budget becomes exceeded
- **WHEN** utilization reaches the valid exceeded threshold after a prior warning or critical stage
- **THEN** exceeded MUST replace the active foreground stage and MUST NOT be blocked by the earlier event identity

### Requirement: System push payloads protect financial privacy
Operating-system payloads MUST omit monetary amounts, account/merchant/debt
names, descriptions, and other free text, use constant type-aware copy, and
navigate only to an allowlisted same-origin application path.

#### Scenario: Financial event is dispatched
- **WHEN** a daily, recurring-payment, or debt reminder is sent to a device
- **THEN** the push title/body MUST contain no amount or identifying financial text and full detail MUST remain in the authenticated inbox

#### Scenario: User activates a push notification
- **WHEN** the service worker receives `notificationclick`
- **THEN** it MUST focus an existing MoneyTrack client or open the static app with the correct base path and canonical internal destination

#### Scenario: Repeated delivery payload is received
- **WHEN** the service worker receives a previously handled delivery ID again
- **THEN** it MUST discard the repeated payload without showing another operating-system notification

#### Scenario: Queued payload arrives after account cleanup
- **WHEN** the worker cleared account A and receives an account-A payload before a later explicit account SET reactivates that scope
- **THEN** its blocked-account tombstone MUST reject the payload even though account A's dedupe history was cleared

### Requirement: Individual inbox failures are recoverable
Individual mark-read and remove actions MUST match the existing bulk-action
feedback and optimistic-state safety.

#### Scenario: Mark-read fails
- **WHEN** Firestore rejects an individual mark-read operation
- **THEN** the unread state MUST be restored and an actionable error toast MUST be shown, but an activated notification action MUST still close the center and navigate exactly once

#### Scenario: Remove or dismissal fails
- **WHEN** Firestore rejects a versioned-event soft dismissal or a legacy notification deletion
- **THEN** the notification MUST remain or be restored and an actionable error toast MUST be shown

#### Scenario: Removal succeeds
- **WHEN** the focused notification is removed successfully
- **THEN** focus MUST move to the next notification action, otherwise the previous notification action, otherwise `Cerrar notificaciones` when the list becomes empty

#### Scenario: Removal rolls back
- **WHEN** removal fails after an optimistic update
- **THEN** the restored notification MUST retain or regain the focus position associated with the attempted action
