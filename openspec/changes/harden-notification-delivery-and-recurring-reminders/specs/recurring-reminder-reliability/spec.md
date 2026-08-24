## ADDED Requirements

### Requirement: Recurring reminder dates use local calendar semantics
The system MUST determine reminder stages from local calendar dates in the
configured IANA time zone rather than elapsed hours since local midnight.

#### Scenario: Payment is due later today
- **WHEN** the current time is any time on the payment's due calendar date and the current cycle is unpaid
- **THEN** the current stage MUST be `due` and MUST NOT advance to the next month or year

#### Scenario: Monthly day does not exist
- **WHEN** a monthly due day exceeds the last real day of the target month
- **THEN** the due date MUST clamp to that month's last day, including leap-year February

#### Scenario: Annual reminder is evaluated
- **WHEN** an annual payment has a persisted creation month
- **THEN** its due cycle MUST remain anchored to that month and use the same calendar-day stage semantics

### Requirement: Recurring lifecycle stages are explicit and monotonic
An active unpaid recurring cycle MUST progress through D-3, D-1, due, and
overdue without replaying an older stage.

#### Scenario: Payment is three days away
- **WHEN** the configured local date reaches D-3 at or after 09:00
- **THEN** the cycle event MUST advance to `d3` exactly once

#### Scenario: Payment reaches D-1 or D0
- **WHEN** the configured local date reaches D-1 or the due date at or after 09:00
- **THEN** the same cycle event MUST advance to `d1` or `due`, increment its revision, and create one logical delivery record per enabled device

#### Scenario: Payment remains overdue
- **WHEN** the cycle is unpaid at D+1 and each subsequent seven-calendar-day overdue interval
- **THEN** the cycle event MUST use `overdueOccurrence: 0`/`stageWindow: overdue:0` at D+1, increment the occurrence/window at D+8, D+15, and later intervals, and advance exactly once per deterministic window without creating a second inbox lifecycle

#### Scenario: Scheduler recovers after downtime
- **WHEN** an earlier reminder stage was missed and a later stage is currently valid
- **THEN** the system MUST emit only the highest currently valid stage window and MUST NOT replay stale earlier stages or overdue occurrences

### Requirement: Authenticated schedule evaluation is durable and authoritative
Authenticated time-based reminders MUST be derived by server-owned schedules
that re-read authoritative Firestore data and remain independent of React
mounting, visibility, and local in-memory guards.

#### Scenario: App never opens on reminder day
- **WHEN** a valid authenticated recurring or daily schedule becomes due while every app client is closed
- **THEN** the backend MUST create the canonical inbox event and eligible per-device deliveries

#### Scenario: Scheduler invocation overlaps
- **WHEN** two workers claim the same due schedule
- **THEN** a transactional lease and deterministic event identity MUST allow only one stage transition

#### Scenario: Payment or preference changes
- **WHEN** a recurring payment, debt, notification preference, or linked paid transaction changes
- **THEN** Firestore-triggered synchronization MUST recalculate or wake the affected server schedule without waiting for the user to reopen the view

### Requirement: Existing authenticated users receive an idempotent schedule backfill
The migration MUST create missing server schedules from existing recurring,
debt, and notification preference data without sending duplicate or stale
events.

#### Scenario: Backfill runs twice
- **WHEN** the migration is retried for the same user and source documents
- **THEN** deterministic schedule IDs and upserts MUST leave one current schedule per source

#### Scenario: Backfill finds an already overdue payment
- **WHEN** an unpaid cycle is overdue at migration time
- **THEN** it MUST schedule only the deterministic overdue occurrence/window valid for that calendar date and MUST NOT replay D-3, D-1, due, or earlier overdue windows

### Requirement: Foreground fallback waits for complete source hydration
The guest/foreground fallback MUST NOT mark a daily check complete until the
required recurring, debt, and transaction sources are known to be hydrated.

#### Scenario: Cold start begins with empty placeholders
- **WHEN** a client monitor mounts before its source subscriptions report ready
- **THEN** it MUST defer evaluation and MUST NOT set a last-check guard from placeholder arrays

#### Scenario: Source data becomes ready
- **WHEN** all required sources finish their first load
- **THEN** the fallback MUST evaluate exactly once with the hydrated arrays and may then set its local guard

#### Scenario: Authenticated backend delivery is active
- **WHEN** an authenticated user has durable scheduling enabled
- **THEN** the page timer and PaymentMonitor MUST NOT create a competing system delivery for the same event revision

### Requirement: Registering payment resolves the current reminder lifecycle
Recurring reminder state MUST follow the persisted payment transaction rather
than remaining stale until manual deletion.

#### Scenario: Current cycle is paid
- **WHEN** a paid transaction matches the recurring payment and current `recurringCycle`
- **THEN** the cycle event MUST become `resolved`, become read, suppress pending deliveries, and advance the schedule to the next cycle

#### Scenario: Payment is linked before the due date
- **WHEN** an explicitly stamped paid transaction belongs to the upcoming cycle
- **THEN** D-3, D-1, due, and overdue stages for that cycle MUST remain suppressed regardless of the transaction's calendar date

#### Scenario: Payment is deleted or unlinked
- **WHEN** the matching paid transaction no longer satisfies the current cycle
- **THEN** the next authoritative evaluation MUST recompute the lifecycle, may reactivate only the highest currently valid stage window, and MUST assign a revision greater than the previously resolved revision

### Requirement: Daily expense reminders recover only within the current local date
The authenticated daily expense reminder MUST run at the selected local time,
deduplicate by local date, and recover scheduler delay without sending a stale
previous-day prompt.

#### Scenario: Worker runs late on the same day
- **WHEN** the configured reminder time passed but the configured local date is still current
- **THEN** the worker MUST create that day's event once and preserve the original scheduled time

#### Scenario: Entire reminder day was missed
- **WHEN** the next worker run occurs on a later local date
- **THEN** it MUST record the skipped outcome and schedule the new day's reminder without sending yesterday's event

#### Scenario: Reminder time changes
- **WHEN** the user saves a new hour or minute
- **THEN** the next schedule MUST move to the new local time without duplicating the current local-date event

### Requirement: Quiet hours and reminder time share one user time zone
Daily, recurring, overdue, retry, and quiet-hour calculations MUST use the same
persisted IANA time zone.

#### Scenario: Existing preference has no time zone
- **WHEN** a legacy user's notification preferences are upgraded
- **THEN** the zone MUST initialize once from the browser when available and otherwise fall back to `America/Bogota`

#### Scenario: Another device has a different zone
- **WHEN** the user opens MoneyTrack on a device whose detected zone differs
- **THEN** the persisted reminder zone MUST remain unchanged until the user explicitly chooses to update it

### Requirement: Guest limitations are stated without blocking local use
Guest mode MUST preserve local notification features while accurately
describing their page-lifecycle limit.

#### Scenario: Guest enables daily reminders
- **WHEN** no authenticated backend identity exists
- **THEN** the UI MUST explain that MoneyTrack must remain open and MUST offer sign-in as the path to closed-app delivery

#### Scenario: Guest remains in the app
- **WHEN** a local reminder becomes due while the PWA page is alive and permission is granted
- **THEN** the existing local inbox and foreground system notification MUST remain operable
