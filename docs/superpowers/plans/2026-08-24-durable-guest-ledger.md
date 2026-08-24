# Durable and conflict-aware guest ledger plan

**Goal:** Make every guest monetary success mean that one complete, versioned ledger snapshot was durably written and verified before React state or success feedback is published.

**Scope guard:** Keep the user-owned notification preference and `BudgetMonitor` files untouched and unstaged.

## 1. Freeze the persistence contract

- Add storage-level tests for serialization, `setItem`, quota, read-back, and rollback failures.
- Require a rejected promise, unchanged visible state, unchanged authoritative envelope, and no success publication for every failed commit.
- Add deterministic conflict tests that force a revision change between read and write, then prove the original intention is reapplied to the winning snapshot without lost updates.

## 2. Introduce one versioned guest ledger

- Store accounts, transactions, debts, and recurring payments in one schema-versioned envelope with `revision`, commit identity, and timestamp metadata.
- Serialize the complete candidate, compare the base revision immediately before persistence, write it once, read it back byte-for-byte, and only then notify React/same-tab subscribers.
- Serialize same-tab writers and use the browser lock manager when available; retain revision compare/retry as the conflict boundary for other tabs and fallback environments.
- Preserve the previous verified envelope under a separate recovery key for exactly one version.

## 3. Migrate and validate legacy guest keys

- Build an envelope from legacy collection keys without changing existing identifiers; derive deterministic identifiers only when a legacy row lacks one.
- Validate collection shapes, finite monetary values, unique identifiers, and account/debt/link references before writing.
- Verify the persisted envelope before removing legacy critical keys, and finish cleanup idempotently when a previous migration was interrupted.
- Keep authenticated guest import reading from the envelope while retaining non-critical legacy categories, budgets, goals, and plan configuration.

## 4. Route guest monetary operations through the envelope

- Replace transaction-critical `useLocalStorage` consumers with one guest-ledger subscription/mutator.
- Await every guest commit so existing UI success feedback can only run after durable persistence.
- Commit credit-card payment pairs and credit authority, debt principal/payment/restore/cascade state, account adjustment/delete/merge state, and recurring materialization as complete after-states in one mutation each.
- Revalidate every retry against the latest snapshot and preserve stable operation and entity IDs across retries.

## 5. Verify recovery and regressions

- Cover concurrent income, expense, card payment, debt payment, and account adjustment from two simulated tabs.
- Cover remount and interrupted-migration retries, same-tab subscribers, cross-tab storage events, and recovery export when quota prevents the next version.
- Run focused guest, transaction, account, debt, recurring, migration, and UI feedback tests before the full suite, typecheck, lint, OpenSpec validation, and graph refresh.
