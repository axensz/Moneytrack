# Authoritative recurring ledger implementation plan

**Goal:** Make recurring-payment status use confirmed complete history and make each authenticated paid cycle a single atomic, idempotent ledger operation.

**Scope guard:** Do not edit or stage the user-owned notification preference and `BudgetMonitor` worktree changes.

## 1. Define shared cycle truth

- Add failing tests proving only `paid=true` can satisfy a recurring cycle or appear in paid history.
- Cover explicit `recurringCycle`, legacy date-window fallback, monthly/yearly boundaries, and pending link candidates.
- Reuse one pure predicate in recurring utilities, link candidates, and monitoring.

## 2. Use complete confirmed history

- Feed `useRecurringPayments` from `balanceTransactions`, not the paginated head.
- Propagate `balancesReady` as recurring authority readiness.
- Render a visible settling state and block mark/link actions until the complete history is confirmed.

## 3. Add authenticated recurring aggregate writers

- Add a deterministic operation identity for `(recurringPaymentId, recurringCycle)`.
- Under the existing per-user ledger lease, reload the recurring document, candidate transaction, affected accounts, and every server transaction linked to the recurring payment.
- Reject pending/non-expense link targets and a link owned by another recurring payment.
- Treat an already-paid cycle as an idempotent success, including legacy rows outside the paginated head.
- Commit the transaction/link, cycle identity, template amount, last-paid metadata, credit authority delta, and lease release in one batch.
- Publish cache changes only after the commit.

## 4. Route product entry points

- Route the recurring card's “register” and “link existing” actions through the aggregate writers.
- Route manual-form transactions associated with a recurring payment through the same authenticated writer, eliminating the current pre-transaction template update.
- Preserve the existing guest behavior for now; guest durability remains owned by OpenSpec Task 9.

## 5. Verify and document

- Add write-path tests for double invocation, cross-attempt retry, ambiguous acknowledgement, outside-head duplicates, pending targets, atomic failure, and relinking.
- Run recurring, transaction writer, form, monitoring, notification, readiness, typecheck, lint, and diff checks.
- Update OpenSpec Task 7 only for requirements demonstrated by tests and evidence.

