# Aggregate-aware transaction undo plan

**Goal:** Replace generic transaction recreation with an idempotent restore command and expose Undo only when the complete financial aggregate can be restored safely.

**Scope guard:** Keep the user-owned notification preference and `BudgetMonitor` files untouched and unstaged.

## 1. Define restore eligibility

- Add a pure policy that distinguishes standalone savings/cash rows, debt payments, card rows, linked pairs, transfers, recurring rows, adjustments, and debt principal rows.
- Allow generic Undo only for standalone savings/cash income/expense.
- Allow debt-payment Undo only through a debt-aware aggregate command.
- Hide Undo for unsupported aggregates and include concise explanatory copy in the deletion toast.

## 2. Add authenticated idempotent restore

- Restore the original document ID under a stable `ledger-mutation:undo:*` identity.
- Acquire the existing ledger lease, prove the original ID is still absent, reload affected server authority, run the restore planner, and commit once.
- Treat an exact retry or lost commit acknowledgement as success; reject collisions and unsupported card/linked/debt-principal/recurring rows.
- Publish cache state only after the final commit.

## 3. Restore debt payments as an aggregate

- Reload the debt and transaction account under the same lease.
- Commit the original payment row, reduced `remainingAmount`, settlement fields, credit delta, and release together.
- Reject a missing debt, mismatched role/account, over-restoration, or any orphan-producing principal restore.
- Preserve equivalent logical behavior in guest mode while Task 9 owns durable multi-key atomicity.

## 4. Route UI and verify

- Pass the full deleted snapshot to the restore command rather than stripping identity/audit fields in the toast.
- Test synchronous double click, retry, ID collision, rejection with zero writes, and truthful unsupported copy.
- Cover authenticated and guest delete/undo outcomes for standalone income/expense, card purchase, linked card payment, debt principal, and debt payment.
- Run writer, debt, view, guest, planner, typecheck, lint, and diff validation before updating OpenSpec.
