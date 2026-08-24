# Canonical Transaction Ledger Adapters Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: use `superpowers:executing-plans` and `superpowers:test-driven-development`. Execute RED -> GREEN in order and preserve the user-owned notification WIP.

**Goal:** Route authenticated transaction create, transfer, edit, delete, and linked credit-payment operations through the server-current ledger facade so source funds, transaction rows, reciprocal links, debt side effects, credit authority, lease release, and cache publication cannot diverge.

**Architecture:** Keep `useTransactionsCRUD` as the public owner of transaction persistence, but replace its `addDoc`/`runTransaction` correctness paths with prepare callbacks for `executeAuthenticatedLedgerMutation`. Every callback reads target rows and affected accounts from Firestore only after the shared lease is acquired, builds one before/after intent, asks the existing planner and credit-authority helper for the result, and stages all domain writes plus the facade-owned release tombstone in one `writeBatch`. `accountsRef` must no longer determine authenticated correctness. Guest behavior remains unchanged in this plan.

**Scope proven by this plan:** OpenSpec 4.4, 4.5, 4.6, 5.4, 5.5, and the transaction persistence portion of 6.1. It does not complete rules-emulator expansion, performance measurement, recurring idempotency, guest-envelope atomicity, aggregate undo, account adjustments/merges, reconciliation UI, or browser validation.

**Constraints:**

- Reuse `executeAuthenticatedLedgerMutation`, `loadServerLedgerContext`, `planCreditAuthorityChanges`, `planLedgerMutation`, and `validateCreditPaymentPair`; do not introduce another lock or planner.
- Read transaction/account/debt documents only after lease acquisition.
- Derive account type, canonical IDs, balances, and `usedCredit` from server documents; never from `accountsRef` for correctness.
- Reject missing/malformed/non-reciprocal linked rows before staging any write.
- Normalize every persisted amount and keep TRM, financed-interest, beneficiary, recurring, debt, and optional audit metadata intact.
- Publish cache mutations only after the final batch commits.
- Do not modify `src/__tests__/hooks/notificationPreferencesMerge.test.ts`, `src/__tests__/services/BudgetMonitor.test.ts`, `src/hooks/useNotificationPreferences.ts`, `src/services/BudgetMonitor.ts`, `.codex/`, or `AGENTS.md`.

## Task 1: Add server-current transaction loaders

**Files:**

- Modify: `src/hooks/firestore/ledgerMutationOrchestration.ts`
- Modify: `src/__tests__/hooks/ledgerMutationOrchestration.test.ts`

- [ ] Add RED tests for present, missing, and malformed transaction documents loaded by ID.
- [ ] Export a minimal `loadServerLedgerTransaction(userId, id)` that reuses the strict runtime decoder and returns `null` only for an absent document.
- [ ] Add a pure affected-account-ID collector for before/after effects, including transfer destinations.
- [ ] Run orchestration/planner tests and typecheck GREEN.
- [ ] Commit as `feat: load server ledger transactions`.

## Task 2: Route ordinary creates and transfers

**Files:**

- Modify: `src/hooks/firestore/useTransactionsCRUD.ts`
- Modify: `src/__tests__/hooks/transactionsWritePath.test.ts`

- [ ] Add RED cases proving an unaffordable savings expense and transfer reject with zero writes/cache mutation, while exact affordability commits.
- [ ] Add a server-type case proving transfer from a persisted credit account rejects even when the render-time account list is stale or empty.
- [ ] Replace simple `addDoc`, transfer `runTransaction`, and credit-affecting create paths with one facade-backed create adapter.
- [ ] Persist normalized amount plus `operationId`, canonical `mutationKind`, and default/preserved `mutationSource` without dropping interest/TRM metadata.
- [ ] Stage the transaction and all server-derived credit changes in the final batch; publish cache only after commit.
- [ ] Run create/transfer, financed-interest, offline, cache, planner, and typecheck regressions GREEN.
- [ ] Commit as `feat: serialize transaction creates`.

## Task 3: Route linked credit-payment creation

**Files:**

- Modify: `src/hooks/firestore/useTransactionsCRUD.ts`
- Modify: `src/__tests__/hooks/transactionsWritePath.test.ts`

- [ ] Add RED cases for insufficient source funds, missing account, invalid persisted credit authority, overpayment, and batch rejection; require zero partial rows/account/cache state.
- [ ] Assign both document IDs before planning, build reciprocal rows, and validate the pair against the persisted credit account.
- [ ] Plan both rows together, stage both sets and the server-derived credit delta in the facade batch, and publish both cache rows only after commit.
- [ ] Preserve amount/date/beneficiary/paid/category parity and current caller behavior.
- [ ] Run authenticated and guest credit-payment regressions GREEN.
- [ ] Commit as `feat: serialize credit payment pairs`.

## Task 4: Route updates and deletes through before/after intents

**Files:**

- Modify: `src/hooks/firestore/useTransactionsCRUD.ts`
- Modify: `src/__tests__/hooks/transactionsWritePath.test.ts`

- [ ] Add RED delete cases for removing income/incoming transfer below zero and update cases for increasing/reassigning a debit beyond source funds; require zero writes/cache changes.
- [ ] Add RED corrupt-link cases for missing, one-way, wrong-role/account, and unrelated counterpart pointers.
- [ ] Load primary, optional counterpart, affected accounts, and optional debt after lease acquisition; validate reciprocal pairs before staging.
- [ ] Build complete before/after intents, preserve safe linked-field synchronization, and derive all credit changes from server context.
- [ ] Stage transaction edits/deletes, counterpart writes, debt-payment reopening, credit changes, and release in one batch; publish cache after commit only.
- [ ] Preserve no-op missing delete, generic update error copy, and existing delete/update regressions.
- [ ] Commit as `feat: serialize transaction edits and deletes`.

## Task 5: Verify and record proven routing

**Files:**

- Modify: `openspec/changes/harden-transaction-ledger-integrity/tasks.md`
- Modify: this plan

- [ ] Run focused CRUD, planner, facade, linked-pair, credit-delta, cache, offline, edit-form, debt-lifecycle, and guest-pair suites.
- [ ] Run full tests, typecheck, lint, build, and `git diff --check` independently.
- [ ] Run strict OpenSpec validation.
- [ ] Rebuild the graph; run scoped change/flow analysis and `tests_for` every routed writer.
- [ ] Mark only 4.4, 4.5, 4.6, 5.4, 5.5, and the proven part of 6.1 complete; leave later adapters and integrated gates open.
- [ ] Commit as `docs: record transaction ledger routing evidence`.

Do not push or open a PR at this checkpoint. Continue with account/AI/recurring adapters and the remaining user-owned notification/privacy work only after this routing is stable.
