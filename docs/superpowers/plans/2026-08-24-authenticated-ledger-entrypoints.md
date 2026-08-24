# Authenticated Ledger Entrypoints Plan

> **Required workflow:** execute RED -> GREEN in order with `superpowers:test-driven-development`, keep the implementation minimal with `ponytail`, and preserve the user-owned notification WIP.

**Goal:** Close the remaining authenticated compound paths that can currently diverge from the canonical ledger: credit migration, account edit plus exact balance target, card merge plus desired debt, and confirmed AI transaction actions.

**Architecture:** Reuse the shared account lease and `executeAuthenticatedLedgerMutation`. Financial truth comes from post-lease server accounts and complete server transaction rows. Each compound emits one final batch containing domain rows, account authority, audit metadata, and the lease release tombstone. UI state, cache publication, category convenience writes, form closure, and success copy happen only after the financial commit.

**Out of scope:** recurring-cycle idempotency, aggregate undo/restore, guest-envelope atomicity, reconciliation UI/repairs, notification backend work, and real-data mutation.

**Protected user work:** do not edit or stage `src/__tests__/hooks/notificationPreferencesMerge.test.ts`, `src/__tests__/services/BudgetMonitor.test.ts`, `src/hooks/useNotificationPreferences.ts`, `src/services/BudgetMonitor.ts`, `.codex/`, or `AGENTS.md`.

## Task 1: Serialize server-current credit migration

**Files:**

- Modify: `src/hooks/firestore/ledgerMutationOrchestration.ts`
- Modify: `src/hooks/firestore/useCreditMigration.ts`
- Modify: `src/__tests__/hooks/creditPaymentMigration.test.ts`
- Modify: `src/__tests__/hooks/useCreditMigration.test.ts`

- [x] Add RED cases for stale render state versus current server model version, invalid/missing `usedCredit`, malformed server rows, link-pair revalidation, lost lease/final batch failure, and retry without partial version/link writes.
- [x] Add one strict complete-server transaction loader for one-time migration use.
- [x] Recheck the persisted credit account and model versions only after the shared ledger lease is acquired.
- [x] Recompute `usedCredit`, reciprocal historical links, both model versions, and release in one bounded batch per card.
- [x] Remove correctness dependence on `accounts` beyond candidate IDs; retry failed candidates safely.
- [x] Run migration, facade, linked-pair, credit-delta, typecheck, lint, and diff gates.
- [x] Commit as `feat: serialize credit authority migration`.

## Task 2: Make account edit plus balance target one operation

**Files:**

- Modify: `src/hooks/firestore/accountOrchestration.ts`
- Modify: `src/hooks/useAccounts.ts`
- Modify: `src/contexts/FinanceContext.tsx`
- Modify: `src/components/views/accounts/hooks/useAccountForm.ts`
- Modify: `src/__tests__/utils/accountBalanceAdjust.test.ts`
- Add or modify: focused authenticated account-adjustment tests

- [x] Add RED cases for concurrent server balance drift, exact affordability, invalid target, missing account, batch failure, and zero account/transaction/cache partial state.
- [x] Accept an optional exact balance/debt target on account update and compute its rounded delta from server-current authority after lease acquisition.
- [x] Stage account fields, optional adjustment transaction, credit-authority change, audit metadata (`balance-adjustment`, `account`, expected/target values), cache publication, and release as one operation.
- [x] Preserve name-only edits, credit fields, double-submit protection, actionable validation, guest behavior, form closure, and success copy.
- [x] Run account form/orchestration, planner, cache, typecheck, lint, and diff gates.
- [x] Commit as `feat: commit account balance targets atomically`.

## Task 3: Commit card merge plus desired debt atomically

**Files:**

- Modify: `src/hooks/useAccounts.ts`
- Modify: `src/hooks/firestore/accountOrchestration.ts`
- Modify: `src/components/views/accounts/AccountsView.tsx`
- Modify: `src/__tests__/hooks/accountMergeAndDefault.test.ts`
- Modify: relevant merge-view tests

- [x] Add RED cases proving a desired-debt adjustment is in the merge batch, uses server-reconciled debt, publishes cache only after commit, and never creates a second-phase transaction on failure.
- [x] Extend `MergeCreditCardsParams`/orchestration with an optional normalized desired post-merge debt.
- [x] Reconcile rewritten server rows, create one audited adjustment row when required, and persist the exact target `usedCredit` in the same merge batch/release.
- [x] Remove the post-merge `addTransaction` call from `AccountsView`; preserve inline warning and success behavior.
- [x] Run merge/default/cascade/cache/form/typecheck/lint/diff regressions.
- [x] Commit as `feat: merge cards at an exact debt target`.

## Task 4: Give confirmed AI ledger actions stable authority

**Files:**

- Modify: `src/hooks/firestore/ledgerMutationOrchestration.ts`
- Modify: `src/hooks/firestore/useTransactionsCRUD.ts`
- Modify: `src/components/chat/AIChatBot.tsx`
- Modify: `src/__tests__/components/AIChatBot.test.tsx`
- Modify: `src/__tests__/hooks/transactionsWritePath.test.ts`

- [x] Add RED cases for incomplete balance context, stable operation IDs, double-confirm, transaction failure before category creation, post-commit category failure, and retry/idempotency.
- [x] Allow a validated caller-supplied `ledger-mutation:*` operation ID and preserve it through create/edit audit metadata.
- [x] Build AI IDs deterministically from the confirmed message/action; set `mutationSource='ai'` and use complete balance transactions.
- [x] Commit the financial action first; create a missing category only afterward as a non-authoritative convenience write.
- [x] Keep success/error messaging truthful and prevent duplicate confirmation while a request is pending.
- [x] Run AI, add/edit, form, planner, full typecheck/lint/diff regressions.
- [x] Commit as `feat: authorize confirmed AI ledger actions`.

## Task 5: Verify and record the authenticated entrypoints

- [x] Run all focused migration, authority, account, merge, AI, facade, cache, debt-dependent, and UI-form suites.
- [x] Run full tests, typecheck, lint, production build, and `git diff --check` independently.
- [x] Run strict OpenSpec validation.
- [x] Rebuild the graph and inspect changed flows/tests.
- [x] Mark only genuinely satisfied parts of OpenSpec 5.1-5.3 and 5.6, 6.1-6.4, 6.6-6.7; leave recurring/undo/guest/reconciliation/rules/performance/browser gates open.
- [x] Commit as `docs: record authenticated ledger entrypoint evidence`.

### Checkpoint evidence (2026-08-24)

- Focused authenticated entrypoints: 24 files, 256 tests passed.
- Full Vitest: 139 files passed and 1 skipped; 1,195 tests passed and 5 skipped.
- `typecheck`, `lint`, production build, `git diff --check`, and strict OpenSpec validation passed independently.
- The build-only service-worker version change was restored; `public/sw.js` returned to hash `5fdf5c29e2193c1d692d2dd6a54477ce10abf115`.
- The graph at `42b9b10` contains 6,459 nodes and 72,029 edges across 708 files. Change detection reported medium aggregate risk; the priority ledger nodes have focused coverage. Automatic flow detection returned zero mapped flows, so it is recorded as unavailable evidence rather than a passing flow assertion.
- OpenSpec 5.3, 5.6, and 6.1-6.4 are complete. 5.1-5.2 and 6.6-6.7 remain open with explicit gaps; recurring, undo, guest envelope, reconciliation, expanded rules, performance, and browser gates remain untouched.
- Protected notification/presupuesto WIP and untracked `.codex/`/`AGENTS.md` remained unstaged and unmodified by this checkpoint.

Do not push at this checkpoint. Continue with recurring authority only after these compounds are stable.
