## Task 1: Freeze the contracts with failing tests

- [x] 1.1 Extend `useFirestoreSubscriptions.pagination.test.ts` to model `metadata.fromCache` and `hasPendingWrites`, proving a cached head below 500 never settles balance authority.
- [x] 1.2 Extend `useBalanceTransactions.test.ts` with cache `<500` → server `<500`, cache `<500` → server `500`, exact `499/500/501`, offline, error, user switch, and retry cases.
- [x] 1.3 Add a provider-level integration test from the head listener through `FinanceContext`, `useBalanceTransactions`, `useAccounts`, and the visible settling state.
- [x] 1.4 Invert the unsafe expectations in `addTransactionBalanceGate.test.ts` and `transactionEditValidation.test.ts`: unresolved authority MUST produce zero writer calls and preserve the form.
- [x] 1.5 Extend `metricScopeFilterIndependence.test.tsx` to change every lower filter independently and together while asserting all four General overview values remain identical and only list/CSV change.
- [ ] 1.6 Add a table-driven ingress parity suite for manual, edit, AI, recurring, account adjustment, debt adapter, delete, and undo against the same monetary invariants.

## Task 2: Make server-confirmed readiness explicit

- [x] 2.1 Subscribe to the transaction head with metadata changes and expose `transactionsServerSettled`, unresolved reason, and retry state from `useFirestoreSubscriptions`/`FirestoreContext`.
- [x] 2.2 Update `useBalanceTransactions` so short cache snapshots cannot disable the full-history decision or return `ready=true`; preserve the current efficient path after short server confirmation.
- [x] 2.3 Propagate authoritative readiness through `FinanceContext` and selectors without coupling it to Transaction filter or pagination UI state.
- [x] 2.4 Replace add/edit validation omission with a reusable preflight that blocks only balance-sensitive intents and returns the confident, actionable settling copy.
- [x] 2.5 Re-run readiness, pagination-corruption, settling UI, add, edit, adjustment, export, and metric-scope suites before changing writers.

## Task 3: Build the pure ledger mutation planner

- [ ] 3.1 Define typed mutation intents and optional audit/idempotency metadata in `types/finance.ts`, keeping every new transaction field optional for historical compatibility.
- [ ] 3.2 Extract one pure money normalizer that requires `Number.isFinite`, positive configured range, and `roundMoney` at the persistence boundary; add table tests for COP cents, interest, `NaN`, `Infinity`, maximum, and float residue.
- [ ] 3.3 Implement a pure before/after delta planner for create, edit, delete, restore, transfer, card payment, recurring post, and balance adjustment across all affected account IDs.
- [ ] 3.4 Define the ordinary-negative rule in planner tests: a mutation cannot cross a non-negative asset below zero or worsen a historical negative, but corrective intents can improve it.
- [ ] 3.5 Implement reciprocal linked-payment validation as a pure function and test missing, one-way, wrong-role, wrong-account, mismatched-amount/date, and valid historical pairs.
- [ ] 3.6 Replace duplicated UI-only balance checks with adapters to the planner while preserving `TransactionValidator` form errors and current interest/TRM behavior.

## Task 4: Serialize authenticated balance-sensitive writes

- [ ] 4.1 Add a ledger mutation kind to the existing `AccountOperationKind` and strict Firestore allow-list; do not copy or fork the lease implementation.
- [ ] 4.2 Add server query helpers that, after acquiring the lease, load affected accounts and all transactions referencing them by source or destination, deduplicate rows, and reject invalid records.
- [ ] 4.3 Implement the authenticated ledger facade: preflight, acquire, server-current plan, atomic final commit with exact release tombstone, safe release on failure, and post-commit cache publication.
- [ ] 4.4 Route ordinary savings/cash creates and transfers through the facade; add two-client tests where only the affordable subset commits.
- [ ] 4.5 Route edits and deletes through before/after validation, including deleting income/incoming transfer and editing a debit upward; prove all failed cases leave documents/cache unchanged.
- [ ] 4.6 Route mixed card-payment pairs through the facade so source funds, both rows, reciprocal IDs, and `usedCredit` update are one operation.
- [ ] 4.7 Extend rules-emulator tests for owner/non-owner, ledger kind acquire/release/reacquire, malformed/stale release, invalid transfer references, and zero partial writes.
- [ ] 4.8 Measure account-scoped server reads and commit latency with representative 499/500/501 and multi-account histories; document the threshold for a future rollup without adding one now.

## Task 5: Harden credit authority and linked pairs

- [ ] 5.1 Add writer and rules tests for absent, `null`, negative, non-finite, over-debt, and valid `usedCredit`; require zero writes until authority is valid.
- [ ] 5.2 Expose per-card `creditAuthorityReady`/reconciliation state and block every card-affecting entry point without a finite non-negative persisted value.
- [ ] 5.3 Serialize `useCreditMigration` under the shared lease, use server reads, verify the model version before commit, and persist value/version/release together.
- [ ] 5.4 Derive account type and affected credit deltas from server documents in create/update/delete, removing correctness dependence on `accountsRef` while retaining it only as a UI optimization.
- [ ] 5.5 Reject edit/delete on a corrupt linked pointer and surface a reconciliation issue; test that an unrelated pointed transaction is never touched.
- [ ] 5.6 Preserve current green regressions for financed interest, payment overage, transfer-to-card, delete reversal, pair edit, cache post-commit, and guest pair parity.

## Task 6: Route every product entry point and make compounds atomic

- [ ] 6.1 Route the manual form and inline edit through the canonical facade while preserving double-submit guards, user input on failure, TRM metadata, interest snapshots, and current success copy.
- [ ] 6.2 Give confirmed AI actions a stable operation ID, complete balance context, and the canonical facade; commit a missing category with the action or keep category creation strictly post-commit and non-authoritative.
- [ ] 6.3 Refactor account edit plus balance adjustment into one exact-target operation using server-current before balance, rounded delta, audit metadata, and the existing lease.
- [ ] 6.4 Extend `mergeCreditCardsDomain` to accept the desired post-merge debt so merge and adjustment commit together, or split them into two explicitly reported successful intentions.
- [ ] 6.5 Add debt-domain adapter tests proving lent origination/borrowed repayment cannot bypass source funds while preserving the atomic lifecycle owned by `repair-debt-lifecycle-and-account-links`.
- [ ] 6.6 Ensure cache mutation, form closure, success toast, monitoring, and notification observation run only after commit for every routed entry point.
- [ ] 6.7 Add failure injection after each step of manual, AI, adjustment, merge, recurring, and debt-integrated actions; assert no misleading success and no partial financial state.

## Task 7: Make recurring materialization authoritative and idempotent

- [ ] 7.1 Change recurring status/history consumers to use complete confirmed transactions when the head can be truncated, and expose a settling state instead of an incorrect unpaid state.
- [ ] 7.2 Make `useRecurringUtils`, `MarkPaidModal`, and `PaymentMonitor` share the rule that only `paid=true` satisfies a cycle; test pending link candidates and fallback historical rows.
- [ ] 7.3 Reserve a deterministic idempotency identity for `(recurringPaymentId, recurringCycle)` and enforce one post across double click, two tabs, retry, and a payment outside the head.
- [ ] 7.4 Commit the recurring transaction, cycle identity, amount change, and last-paid metadata atomically for authenticated mode.
- [ ] 7.5 Test unlink/delete/relink behavior, cycle boundaries, annual/monthly periods, old rows without `recurringCycle`, and notification observers without duplicating money.

## Task 8: Make delete and undo aggregate-aware

- [ ] 8.1 Add auth and guest round-trip tests for delete → undo of standalone expense/income, card purchase, linked card payment, debt principal, and debt payment.
- [ ] 8.2 Implement idempotent restore for a standalone row using its original identity or stable restore operation and the same before/after balance guard.
- [ ] 8.3 Hide generic Undo for linked/card/debt/cascade rows unless an aggregate restore command is available; add accessible explanatory copy.
- [ ] 8.4 Integrate debt-payment restore with `remainingAmount`, settlement fields, transaction, and any credit delta in one operation inside the debt-owned change.
- [ ] 8.5 Integrate debt-principal restore only if debt plus original operation can be recreated atomically; otherwise test that no orphan `debtId` can be written.

## Task 9: Make guest persistence durable and conflict-aware

- [ ] 9.1 Add tests where `localStorage.setItem`, serialization, quota, and read-back verification fail; require promise rejection, unchanged visible state, unchanged durable state, and no success toast.
- [ ] 9.2 Introduce a versioned guest-ledger envelope for transaction-critical collections and publish React/same-tab state only after one successful persisted snapshot.
- [ ] 9.3 Add a revision compare/retry path for two guest tabs and test concurrent income, expense, card payment, debt payment, and account adjustment without lost updates.
- [ ] 9.4 Route guest card/debt/account compound operations through one envelope mutation so no consumer observes a partial aggregate.
- [ ] 9.5 Migrate legacy keys idempotently with stable IDs, schema/reference validation, write/read-back verification, and removal only after success; test retry after an interrupted migration.
- [ ] 9.6 Preserve the previous verified envelope for one version and document recovery/export behavior when the next snapshot exceeds quota.

## Task 10: Add read-only reconciliation and explicit repair plans

- [ ] 10.1 Implement a pure per-account reconciliation report with initial balance, signed paid movements, crossing-zero sequence, calculated balance, and persisted card authority comparison.
- [ ] 10.2 Classify incomplete authority, invalid record, orphan account/debt, broken link, credit divergence, recurring duplicate, explained negative, and dependent debt mismatch; test each classification.
- [ ] 10.3 Make the paginated and complete readers share one runtime transaction decoder so invalid documents are reported consistently instead of silently filtered or inconsistently included.
- [ ] 10.4 Build the read-only reconciliation surface with existing cards/modals/tokens, keyboard focus, 44px targets, hidden-value preference, light/dark mode, and responsive behavior.
- [ ] 10.5 Implement pure repair-plan builders with before/after evidence and explicit confirmation; do not execute a real repair as part of automated migration or browser validation.
- [ ] 10.6 Add safe authenticated repair commands for confirmed savings adjustment, credit-ledger reconciliation, link repair, and recurring deduplication, each under lease and followed by a fresh server report.
- [ ] 10.7 Run reconciliation read-only on the current real account and record whether the negative is `negative-explained` or inconsistent; obtain separate authorization before applying any plan.

## Task 11: Integrated verification and handoff

- [ ] 11.1 Run focused readiness, planner, writer, concurrency, rules, credit, linked-pair, recurring, undo, guest, reconciliation, metric-scope, and dependent debt/notification suites; record exact passing counts.
- [ ] 11.2 Run `npm run test:run`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`; repair every regression before claiming completion.
- [ ] 11.3 Run `openspec.cmd validate harden-transaction-ledger-integrity --strict` and refresh statuses of `repair-debt-lifecycle-and-account-links`, `clarify-ledger-metric-scopes`, and `harden-notification-delivery-and-recurring-reminders`.
- [ ] 11.4 Rebuild the code-review graph, inspect detected changes/affected flows/tests, and verify no unrelated metric, shell, notification-delivery, debt-lifecycle, or user-owned file drift.
- [ ] 11.5 In Chrome, use only disposable savings, cash, credit, recurring, and debt records to verify success, rejection, two-tab contention, retry, undo, reconciliation, focus, dark mode, 375/1214/1440 widths, and zero console errors.
- [ ] 11.6 Re-check that every lower Transaction filter changes only list/CSV and leaves all four General overview values unchanged.
- [ ] 11.7 Record rules-before-client rollout, client rollback, guest-envelope recovery, performance evidence, and the explicit prohibition on automatic repair of real data.
