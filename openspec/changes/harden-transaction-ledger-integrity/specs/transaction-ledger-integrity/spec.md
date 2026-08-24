## ADDED Requirements

### Requirement: Balance authority is confirmed by the server
The system MUST distinguish cached transaction data from a server-confirmed exhaustive ledger and MUST NOT declare authenticated balances ready from record count alone.

#### Scenario: Short cached head arrives first
- **WHEN** an authenticated listener receives fewer than 500 transactions from cache and no server snapshot has arrived
- **THEN** the list MAY display the cached rows
- **THEN** balances MUST remain unsettled and balance-sensitive writes MUST remain disabled

#### Scenario: Server confirms a short history
- **WHEN** the server confirms a transaction head containing fewer than 500 documents
- **THEN** the system MUST treat that server head as exhaustive
- **THEN** balances MAY become ready without starting a redundant full-history listener

#### Scenario: Server confirms a saturated head
- **WHEN** the server confirms 500 or more transaction documents in the head
- **THEN** the system MUST use a no-limit server-confirmed history for balances, validation, reconciliation, and global analysis
- **THEN** the paginated head MUST remain a presentation source only

#### Scenario: Offline cache has not been confirmed
- **WHEN** only cached data is available or the first server read fails
- **THEN** readiness MUST remain unresolved rather than silently becoming true
- **THEN** a blocked write MUST preserve all user input and expose a retryable explanation

### Requirement: Ledger formulas retain one declared authority
The system MUST calculate savings and cash balances from initial balance plus all paid ledger movements, and MUST calculate contractual card debt from finite non-negative persisted `usedCredit`.

#### Scenario: Savings account balance is calculated
- **WHEN** a server-confirmed history contains paid income, expense, outgoing transfer, and incoming transfer rows for a savings account
- **THEN** its balance MUST equal `initialBalance + income - expense - outgoing transfers + incoming transfers`, rounded to cents

#### Scenario: Pending row does not affect an asset balance
- **WHEN** a savings or cash transaction has `paid=false`
- **THEN** it MUST remain visible as pending but MUST NOT change that account's current balance

#### Scenario: Card debt is displayed
- **WHEN** a credit account has a valid `usedCredit`
- **THEN** contractual debt MUST use that persisted value
- **THEN** available credit MUST equal `max(0, creditLimit - usedCredit)` rounded to cents

### Requirement: The General overview is independent from lower filters
The transaction-integrity change MUST preserve the metric scopes defined by `clarify-ledger-metric-scopes`: lower Transaction filters affect only the result list and CSV, never the four General overview values.

#### Scenario: Any lower filter changes
- **WHEN** the user changes search, account, category, date preset, or custom date range
- **THEN** Saldo actual, Ingresos del mes actual, Gastos del mes actual, and Pendiente MUST retain their unfiltered values
- **THEN** only the visible rows and CSV result MUST reflect the filters

#### Scenario: Server settlement completes while a filter is active
- **WHEN** complete server history arrives while a lower filter is active
- **THEN** any legitimate overview update MUST be attributable to the newly confirmed ledger
- **THEN** the system MUST NOT describe that update as an effect of the filter

### Requirement: Every monetary entry point uses one validated boundary
Manual creation, manual edit, delete, restore, transfer, card payment, recurring posting, account adjustment, AI action, debt integration, and migration MUST use the same schema, reference, readiness, and financial-invariant boundary before persistence.

#### Scenario: Manual debit is submitted before settlement
- **WHEN** a user submits an expense or outgoing transfer while balance authority is unresolved
- **THEN** the system MUST perform zero persistent writes
- **THEN** it MUST preserve the form and ask the user to retry after reconciliation

#### Scenario: AI proposes an expense
- **WHEN** the user confirms an AI `add_transaction` action
- **THEN** the action MUST validate against the same complete balance and account rules as the manual form
- **THEN** the raw Firestore writer MUST NOT be directly callable by that action

#### Scenario: A recurring or debt flow creates a debit
- **WHEN** a recurring-payment or debt aggregate needs an expense in savings or cash
- **THEN** it MUST apply the shared before/after balance planner inside its own atomic aggregate commit

#### Scenario: Programmatic payload has an invalid amount
- **WHEN** any caller supplies `NaN`, `Infinity`, a non-positive amount, an amount above the configured maximum, or a sub-cent residue
- **THEN** the system MUST reject invalid values and normalize valid values exactly once to cents before persistence

### Requirement: Balance-sensitive writes are serialized against server state
The system MUST serialize any authenticated mutation that can reduce a savings/cash balance or requires an exact target, and MUST validate its after-state from server-current account history.

#### Scenario: Two concurrent expenses spend the same funds
- **WHEN** two compatible clients concurrently submit expenses that are individually affordable from the same prior balance but jointly unaffordable
- **THEN** at most one expense MUST commit
- **THEN** the rejected intent MUST report insufficient funds without a partial row

#### Scenario: Concurrent transfer and expense
- **WHEN** an outgoing transfer and an expense race on the same source account
- **THEN** they MUST be ordered against server state
- **THEN** the final ledger MUST NOT cross from a non-negative balance to a negative balance

#### Scenario: Edit or delete reduces an account balance
- **WHEN** editing an amount, deleting an income, deleting an incoming transfer, or restoring a debit lowers an affected asset balance
- **THEN** the system MUST validate the complete before/after state under the same serialization contract

#### Scenario: Account already has a negative historical balance
- **WHEN** an account begins below zero because of initial or inherited history
- **THEN** an ordinary mutation MUST NOT make that balance more negative
- **THEN** improving income, expense deletion, or an explicit reconciliation adjustment MUST remain possible

### Requirement: Credit authority is present before card mutation
The system MUST block a card-affecting write when persisted `usedCredit` is absent, non-finite, or negative, and MUST migrate or reconcile that authority without racing normal ledger writes.

#### Scenario: Legacy card has no used credit value
- **WHEN** a purchase, payment, transfer, edit, delete, merge, or debt action references a card whose `usedCredit` is absent
- **THEN** the system MUST perform zero money writes
- **THEN** the card MUST remain in a visible reconciliation state until migration succeeds

#### Scenario: Credit migration races with a purchase
- **WHEN** a migration and a normal card write start concurrently
- **THEN** they MUST be serialized so the migration cannot overwrite the confirmed purchase delta

#### Scenario: Client account cache is stale
- **WHEN** the React account array omits or misclassifies an affected account but the server document exists
- **THEN** the writer MUST use the server account type and MUST apply the correct `usedCredit` delta

#### Scenario: A payment exceeds contractual debt
- **WHEN** a payment or transfer into a card is larger than server-current `usedCredit`
- **THEN** the complete operation MUST be rejected and `usedCredit` MUST remain unchanged and non-negative

### Requirement: Linked card-payment pairs are reciprocal and atomic
The system MUST create, update, and delete a card-payment pair as one aggregate and MUST verify reciprocal linkage and payment semantics before following either link.

#### Scenario: Card payment commits
- **WHEN** a valid card payment is made from a savings or cash account
- **THEN** the card income, source expense, reciprocal IDs, source balance validation, and `usedCredit` delta MUST commit together

#### Scenario: Link is not reciprocal
- **WHEN** a transaction points to a document that is missing, does not point back, or is not the semantic payment counterpart
- **THEN** edit and delete MUST touch neither document
- **THEN** reconciliation MUST report a broken link with explicit repair options

#### Scenario: Pair edit changes synchronized fields
- **WHEN** a valid pair's amount, date, beneficiary, or paid state changes
- **THEN** both rows and the net credit delta MUST update atomically
- **THEN** account, category, type, and link identity MUST remain protected

### Requirement: Repeatable intentions are idempotent
The system MUST assign a stable idempotency identity to recurring-cycle posts, confirmed AI actions, aggregate restores, and retryable compound operations.

#### Scenario: Same recurring cycle is posted twice
- **WHEN** two tabs, a double click, or an ambiguous retry submits the same `(recurringPaymentId, recurringCycle)`
- **THEN** exactly one paid ledger transaction MUST exist for that cycle

#### Scenario: Confirmed AI action is retried
- **WHEN** the client retries an AI action after an ambiguous response
- **THEN** its stable operation ID MUST resolve to the original committed result rather than creating another transaction

#### Scenario: Firestore transaction callback retries
- **WHEN** Firestore reruns a transaction callback because of contention
- **THEN** all reserved document identities MUST remain stable and only the final commit MUST become visible

### Requirement: Recurring payment state has one paid definition
Only a valid `paid=true` transaction assigned to the intended recurring cycle MUST satisfy that cycle, and recurring status MUST use complete confirmed history when required.

#### Scenario: Pending expense is offered for linking
- **WHEN** an expense has `paid=false`
- **THEN** it MUST NOT mark a recurring cycle as paid
- **THEN** the link UI MUST either exclude it or require making it paid within the same confirmed operation

#### Scenario: Current-cycle payment falls outside the first 500 rows
- **WHEN** a valid cycle transaction exists in complete history but not in the paginated head
- **THEN** recurring status MUST still report the cycle as paid and MUST prevent a duplicate post

#### Scenario: Actual amount changes the template
- **WHEN** posting a recurring payment also changes its base amount or last-paid metadata
- **THEN** the template and ledger transaction MUST commit together or neither MUST change

### Requirement: Compound monetary actions are all-or-nothing
Any user intention spanning transactions, accounts, categories, recurring templates, or other financial aggregates MUST either commit every required financial effect or leave the prior state unchanged.

#### Scenario: Balance adjustment is requested with an account edit
- **WHEN** a user edits account metadata and requests an exact non-negative target balance
- **THEN** the server-current before balance, adjustment row, account update, audit metadata, and release MUST commit as one intention
- **THEN** a concurrent movement MUST be included in the before balance or cause a retry

#### Scenario: Credit-card merge includes a desired debt adjustment
- **WHEN** a merge requires a post-merge debt different from the combined debt
- **THEN** the merge and adjustment MUST commit together
- **THEN** the UI MUST NOT report a total failure after a merge has already committed

#### Scenario: AI needs a new category
- **WHEN** an AI transaction references a missing category
- **THEN** category creation and the monetary row MUST commit together when category persistence is required
- **THEN** failure MUST NOT leave a misleading success message or partial financial intent

### Requirement: Undo is a semantic inverse
The system MUST offer Undo only when it can atomically restore every entity and financial delta removed by the original action.

#### Scenario: Simple independent row is restored
- **WHEN** a user undoes deletion of a standalone transaction and its invariants still hold
- **THEN** the system MUST restore it idempotently with its original identity or stable restore operation

#### Scenario: Debt payment is undone
- **WHEN** a deleted debt payment is restored
- **THEN** the payment row and debt `remainingAmount`/settlement state MUST be reapplied atomically
- **THEN** restoring only the row MUST be impossible

#### Scenario: Aggregate restore is unsupported
- **WHEN** a linked payment, debt principal, migration, or cascade has no safe aggregate restore command
- **THEN** the UI MUST NOT offer generic Undo
- **THEN** it MUST direct the user to the applicable reconciliation or recreation flow

### Requirement: Guest success means durable atomic persistence
Guest monetary operations MUST commit a versioned local ledger snapshot before publishing state or success, and MUST detect cross-tab revision conflicts.

#### Scenario: Local storage quota is exceeded
- **WHEN** persisting the next guest-ledger envelope fails
- **THEN** the prior durable snapshot and visible state MUST remain authoritative
- **THEN** the operation MUST reject and no success toast MUST appear

#### Scenario: Guest operation spans multiple collections
- **WHEN** a card payment, debt action, account merge, or adjustment changes multiple guest entities
- **THEN** one versioned financial envelope MUST contain the complete after-state
- **THEN** consumers MUST never observe only part of the aggregate

#### Scenario: Two guest tabs write concurrently
- **WHEN** two tabs submit against the same guest revision
- **THEN** one commit MUST detect a revision conflict, reload, and revalidate rather than overwrite the other silently

#### Scenario: Legacy guest keys are migrated
- **WHEN** valid legacy keys exist and no envelope exists
- **THEN** migration MUST write and read-back verify the envelope before removing legacy keys
- **THEN** a failed or retried migration MUST preserve identifiers and MUST NOT duplicate transactions

### Requirement: Ledger reconciliation is deterministic and read-only by default
The system MUST explain each account balance from source rows, classify every inconsistency, and MUST NOT mutate financial data merely because a discrepancy or negative value is detected.

#### Scenario: Account is reconciled
- **WHEN** the user opens reconciliation after server settlement
- **THEN** the report MUST show initial balance, paid income, paid expense, incoming/outgoing transfers, calculated balance, and ordered contributing rows

#### Scenario: Negative balance has a complete equation
- **WHEN** the complete valid ledger mathematically produces a negative balance
- **THEN** the report MUST classify it as explained rather than silently calling it corruption
- **THEN** it MUST identify the movements that cross zero

#### Scenario: Invalid or orphaned row is found
- **WHEN** a row has an invalid amount/date/type, missing account/debt, broken linked pair, duplicate recurring cycle, or inconsistent card delta
- **THEN** the row MUST be reported with its ID and reason
- **THEN** it MUST NOT disappear silently from one read model while contaminating another

#### Scenario: User requests a repair
- **WHEN** the user chooses a reconciliation action
- **THEN** the system MUST present a before/after plan and require explicit confirmation
- **THEN** the confirmed repair MUST be atomic, auditable, and followed by a fresh server reconciliation

### Requirement: Cache and external effects follow the financial commit
Pagination cache mutation, form closure, success feedback, and notification observation MUST happen only after the financial commit succeeds.

#### Scenario: Firestore commit fails
- **WHEN** any required write rejects
- **THEN** no optimistic cache row, success toast, closed form, template-only update, or notification MUST claim success
- **THEN** retry MUST reuse the same intention identity where applicable

#### Scenario: Notification delivery fails after commit
- **WHEN** the ledger commit succeeds but a notification observer fails
- **THEN** the transaction MUST remain committed exactly once
- **THEN** notification retry MUST NOT replay or roll back the money operation

### Requirement: Firestore rules preserve ledger shape and references
Firestore rules MUST continue owner scoping and MUST validate transaction amounts, immutable type, dates, paid state, account/debt references, credit authority bounds, and the supported operation-lock shapes.

#### Scenario: Transfer has invalid references
- **WHEN** a transfer lacks a destination, uses the same source/destination, starts from a credit card, or references a missing account
- **THEN** rules and the domain boundary MUST reject it without writes

#### Scenario: Account authority update is invalid
- **WHEN** a write attempts to persist negative, non-finite, or out-of-range `usedCredit`
- **THEN** Firestore rules MUST reject the account update

#### Scenario: Ledger lease shape is invalid
- **WHEN** a balance-sensitive operation uses an unknown kind, stale ID, malformed lock, or mismatched release tombstone
- **THEN** the complete write MUST be denied in the real rules emulator

### Requirement: Shared behavior remains accessible across breakpoints
The integrity states and reconciliation actions MUST use the existing semantic tokens, focus contracts, and touch targets without changing established desktop or mobile navigation.

#### Scenario: Reconciliation is pending
- **WHEN** balances are settling on desktop or mobile
- **THEN** the user MUST receive a readable status and disabled action explanation
- **THEN** keyboard focus and entered data MUST be preserved

#### Scenario: Integrity error is displayed
- **WHEN** a write is blocked or a reconciliation issue is shown
- **THEN** state colors MUST use semantic success/destructive/warning tokens and action/selection MAY use violet
- **THEN** interactive targets MUST remain at least 44 CSS pixels
