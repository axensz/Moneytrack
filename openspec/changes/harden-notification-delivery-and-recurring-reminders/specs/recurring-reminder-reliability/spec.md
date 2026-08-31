## ADDED Requirements

### Requirement: Recurring reminder dates use local calendar semantics
The system MUST determine reminder stages from local calendar dates in the
configured IANA time zone rather than elapsed hours since local midnight.

#### Scenario: Payment is due later today
- **WHEN** the configured local time is at or after 09:00 on the payment's due calendar date and the current cycle is unpaid
- **THEN** the current stage MUST be `due` and MUST NOT advance to the next month or year

#### Scenario: Unpaid cycle crosses a month boundary
- **WHEN** a monthly cycle remains unpaid after a later calendar month begins
- **THEN** its persisted `cycleKey` and due local date MUST remain authoritative until resolution and MUST NOT silently roll to the new month's cycle

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

#### Scenario: A resolved stage window is reactivated
- **WHEN** unlinking or deleting a paid transaction makes the currently valid stage window active again
- **THEN** stage rank MUST validate the transition but the persisted revision MUST be allocated transactionally as the prior revision plus one rather than reused from a fixed stage number

### Requirement: Authenticated schedule evaluation is durable and authoritative
Authenticated time-based reminders MUST be derived by server-owned schedules
that re-read authoritative Firestore data and remain independent of React
mounting, visibility, and local in-memory guards.

Recurring schedules MUST persist `cycleKey`, `dueLocalDate`, `stageWindow`, and
`sourceVersion`. `cycleKey` MUST preserve the existing
`year-zeroBasedMonth-effectiveDueDay` serialization used by transactions, while
`dueLocalDate` MUST use `YYYY-MM-DD`.

#### Scenario: App never opens on reminder day
- **WHEN** a valid authenticated recurring or daily schedule becomes due while every app client is closed
- **THEN** the backend MUST create the canonical inbox event and eligible per-device deliveries

#### Scenario: Scheduler invocation overlaps
- **WHEN** two workers claim the same due schedule
- **THEN** a transactional lease and deterministic event identity MUST allow only one stage transition, and one transaction MUST re-read authority/source state, commit the event and device fan-out, advance or skip the schedule, and release its matching lease

#### Scenario: Payment or preference changes
- **WHEN** a recurring payment, debt, notification preference, or linked paid transaction changes
- **THEN** Firestore-triggered synchronization MUST recalculate or wake the affected server schedule without waiting for the user to reopen the view

#### Scenario: A source is created after durable activation
- **WHEN** an account with an active durable runtime creates a new recurring payment or debt source after its one-time provisioning marker was removed
- **THEN** Firestore-triggered synchronization MUST create the deterministic schedule for the exact active authority generation without recreating the marker; the same source creation under an absent or active-foreground runtime MUST NOT self-onboard the account

#### Scenario: Source triggers arrive twice or out of order
- **WHEN** an at-least-once Firestore trigger repeats or an older source update arrives after a newer one
- **THEN** synchronization MUST ignore the trigger's stale financial image, re-read current state, recompute a bounded sorted digest of authoritative preference/source/payment-proof descriptors and document update times, and ignore work that cannot advance that state

#### Scenario: Exact recurring-cycle payment proof is absent
- **WHEN** no paid transaction stamped with the current `recurringCycle` exists
- **THEN** the backend MUST use at most one bounded legacy query for that payment ID and cycle date window, ordered by date then document ID and limited to one result, and MUST digest the exact query atom `result: null` if no proof exists; a found proof MUST use `result: { path, updateTime }`, and the preceding exact query MUST also order by document ID before its limit

### Requirement: Reminder event validity is bounded by evaluation and stage windows
The backend MUST derive event expiry from the actual evaluation instant and the
current calendar window rather than granting a stale fixed lifetime from the
original schedule time.

#### Scenario: Daily reminder is evaluated late on its local date
- **WHEN** a daily schedule is evaluated after its intended time but before the local date ends
- **THEN** its event MUST preserve the original `scheduledAt` and expire at the end of that same local date

#### Scenario: Recurring or debt stage is still valid
- **WHEN** a recurring or debt schedule is evaluated before the current `stageValidUntil`
- **THEN** its event MUST expire at the earlier of `evaluatedAt + 24 hours` and `stageValidUntil`

#### Scenario: Stage window already ended
- **WHEN** evaluation occurs at or after `stageValidUntil`
- **THEN** the backend MUST record the stage as skipped, advance transactionally, and MUST NOT create delivery work for that stale window

### Requirement: Existing authenticated users receive an idempotent schedule backfill
The migration MUST create missing server schedules from existing recurring,
debt, and notification preference data without sending duplicate or stale
events.

#### Scenario: Backfill runs twice
- **WHEN** the migration is retried for the same user and source documents
- **THEN** deterministic schedule IDs and upserts MUST leave one current schedule per source

#### Scenario: Backfill finds an already overdue payment
- **WHEN** an unpaid cycle is overdue at migration time
- **THEN** it MUST initialize only the latest applicable unpaid cycle at the cutoff, persist its existing-format cycle key and ISO due date, schedule only the overdue occurrence/window valid for that date, and MUST NOT enumerate older cycles or replay earlier stages

#### Scenario: A persisted unpaid cursor later resolves
- **WHEN** the transaction for the cursor's cycle becomes authoritatively paid after one or more calendar months elapsed
- **THEN** schedule advancement MUST jump to the latest applicable current cycle without emitting each skipped monthly cycle

#### Scenario: Multiple authority histories exist for one payment
- **WHEN** foreground, durable, and later foreground lifecycles exist for the same recurring source
- **THEN** backfill and fallback MUST first prefer a lifecycle explicitly superseded into the target generation, otherwise the greatest prior/current `authorityConfigVersion` (`null` compatibility lowest), then prefer scheduled/active over resolved, preserve the oldest unpaid due date or newest resolved due date as applicable, and use update time/document ID only as final tie-breaks, so the current handoff feeds the next authority without reviving older history

#### Scenario: No recurring stage has ever become valid
- **WHEN** an authenticated evaluation occurs before D-3 and no earlier lifecycle exists
- **THEN** it MUST remain read-only and persist no cursor; if the app reopens months later it MUST choose the latest applicable cycle, while the first valid persisted stage receives revision 1 and becomes the cross-device cursor

### Requirement: Foreground fallback waits for complete source hydration
The guest/foreground fallback MUST NOT mark a daily check complete until the
required recurring, debt, and transaction sources are known to be hydrated.

#### Scenario: Cold start begins with empty placeholders
- **WHEN** a client monitor mounts before its source subscriptions report ready
- **THEN** it MUST defer evaluation and MUST NOT set a last-check guard from placeholder arrays

#### Scenario: Source data becomes ready
- **WHEN** all required sources finish their first load
- **THEN** the fallback MUST evaluate exactly once with the hydrated arrays and may then set its local guard

#### Scenario: Only transactions and balances are ready
- **WHEN** recurring payments or debts are still loading while transactions and balances report ready
- **THEN** the fallback MUST continue waiting and MUST NOT treat recurring or debt placeholder arrays as authoritative

#### Scenario: Authenticated backend authority is durable
- **WHEN** an authenticated user's runtime authority is active `durable` for the current generation
- **THEN** the page timer, `PaymentMonitor`, and `DebtMonitor` MUST NOT evaluate, write, or present equivalent time-based inbox/system notifications

#### Scenario: Foreground fallback resumes after durable rollback
- **WHEN** the Admin authority transition has superseded the outgoing backend recurring lifecycle and activated a new `foreground` generation
- **THEN** the next hydrated client evaluation MUST create or reactivate only the deterministic `foreground:v{configVersion}:recurring:*` lifecycle for the current unpaid cycle, stamp the exact active `authorityConfigVersion`, MUST NOT reuse `foreground:compat:*`, and MUST NOT mutate or visibly duplicate the resolved backend-marked lifecycle

#### Scenario: Recurring authority transition is fenced
- **WHEN** the runtime generation exists but has not been activated
- **THEN** neither the foreground monitor nor the durable scheduler MUST advance, reactivate, or present that recurring lifecycle

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

### Requirement: Debt reminder stages use one explicit calendar cadence
Active unresolved debts MUST use deterministic local-date stages without replaying
older windows or inventing additional intermediate reminders.

#### Scenario: Borrowed debt remains unresolved
- **WHEN** an amount owed by the user remains unresolved
- **THEN** at 09:00 local the `borrowed:30` window MUST begin at D+30 and remain current until D+60, `borrowed:60` MUST remain current from D+60 until D+67, and `borrowed:weekly:n` MUST begin at D+67+7n for every integer n greater than or equal to zero, with only the current window emitted after downtime

#### Scenario: Lent debt remains unresolved
- **WHEN** an amount owed to the user remains unresolved
- **THEN** at 09:00 local the `lent:90` window MUST begin at D+90 and remain current until D+97, and `lent:weekly:n` MUST begin at D+97+7n for every integer n greater than or equal to zero, with only the current window emitted after downtime

#### Scenario: Debt stage boundary has not reached 09:00
- **WHEN** the local date has reached a debt milestone but local time is still before 09:00
- **THEN** that new stage MUST NOT begin; the preceding valid window remains current, or no stage exists before the first milestone

#### Scenario: Debt is resolved or reactivated
- **WHEN** authoritative persisted debt/transaction state resolves or later reopens the debt
- **THEN** pending deliveries MUST be suppressed on resolution and any reactivation MUST use the current deterministic window with a revision greater than the resolved lifecycle

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
- **WHEN** a legacy user's notification preferences are backfilled before a browser can persist a detected zone
- **THEN** the schedule MUST use `America/Bogota`; the first authenticated browser MAY later persist a valid detected zone once and trigger replanning

#### Scenario: Existing preference has an invalid explicit time zone
- **WHEN** a stored nonempty time-zone value is not a valid IANA zone
- **THEN** backend evaluation MUST fail closed with a sanitized diagnostic and MUST NOT silently replace it with `America/Bogota`

#### Scenario: Another device has a different zone
- **WHEN** the user opens MoneyTrack on a device whose detected zone differs
- **THEN** the persisted reminder zone MUST remain unchanged until the user explicitly chooses to update it

#### Scenario: Configured local time does not exist or repeats
- **WHEN** a daylight-saving transition skips or repeats the configured local reminder time
- **THEN** a skipped time MUST move to the first valid instant after the gap, a repeated time MUST use its first occurrence, and the local-date event key MUST still deduplicate the reminder

### Requirement: Guest limitations are stated without blocking local use
Guest mode MUST preserve local notification features while accurately
describing their page-lifecycle limit.

#### Scenario: Guest enables daily reminders
- **WHEN** no authenticated backend identity exists
- **THEN** the UI MUST explain that MoneyTrack must remain open and MUST offer sign-in as the path to closed-app delivery

#### Scenario: Guest remains in the app
- **WHEN** a local reminder becomes due while the PWA page is alive and permission is granted
- **THEN** the existing local inbox and foreground system notification MUST remain operable
