# Authenticated Ledger Facade and Debt Adapter Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` and follow RED -> GREEN task by task. This plan deliberately stops before routing the general transaction CRUD.

**Goal:** Reuse the existing account-operation lease to build the authenticated ledger execution boundary, calculate savings/cash authority from server-confirmed account-scoped history, and prevent lent origination or borrowed repayment from overdrawing their source account in both authenticated and guest debt flows.

**Architecture:** Add one Firestore orchestration module beside `accountOrchestration.ts`. It acquires the existing lease with a new `ledger-mutation` kind, exposes a server-current context loader, runs the pure `planLedgerMutation`, stages the domain writes plus the exact release tombstone in one `writeBatch`, and safely releases on every pre-commit failure. `useDebts` remains owner of debt lifecycle and supplies only the debt-specific prepare/stage callback. Guest debt flows use the same pure planner over the complete local account/transaction arrays before their first mutation.

**Scope proven by this plan:** OpenSpec 4.1, 4.2, 4.3, and the debt-domain portion of 6.5. It does not complete 3.6, 4.4-4.8, 5.x, guest-envelope atomicity, generic undo, or any UI task.

**Constraints:**

- Reuse `acquireAccountOperationLock`, `renewAccountOperationLock`, `createAccountOperationRelease`, and `releaseAccountOperationLock`; do not fork lease logic.
- Reuse `BalanceCalculator`, `planLedgerMutation`, `creditDeltasByAccount`, `roundMoney`, and `stripUndefined`.
- Query server state only after the lease is acquired.
- Query both `accountId` and `toAccountId` references, including merged credit aliases, and deduplicate documents by ID.
- Reject malformed financial records; do not silently omit them from authority.
- Require finite, non-negative persisted `usedCredit` before a debt mutation changes a card.
- Publish cache state only after the final batch commits.
- Do not modify the four pre-existing notification WIP files, `.codex/`, or `AGENTS.md`.

## Task 1: Extend the shared lease kind and Firestore allow-list

**Files:**

- Modify: `src/hooks/firestore/accountOrchestration.ts`
- Modify: `firestore.rules`
- Modify: `src/__tests__/firestore/accountOperationLock.rules.test.ts`
- Create: `src/__tests__/hooks/accountOperationKind.test.ts`

- [ ] Add a compile/runtime contract that calls `createAccountOperationId('ledger-mutation')` and expects the prefix.
- [ ] Run the focused test and `npm.cmd run typecheck`; require RED from the missing union member.
- [ ] Add only `'ledger-mutation'` to `AccountOperationKind` and the strict rules allow-list.
- [ ] Extend the emulator contract to acquire/release the new kind while retaining owner/non-owner and exact-map assertions.
- [ ] Run the focused unit test, typecheck, and the rules test (the rules case may be skipped only when the emulator is absent).
- [ ] Commit as `feat: authorize shared ledger mutation lease`.

## Task 2: Load and validate server-current ledger context

**Files:**

- Create: `src/hooks/firestore/ledgerMutationOrchestration.ts`
- Create: `src/__tests__/hooks/ledgerMutationOrchestration.test.ts`

**Public contract:**

```ts
export interface LedgerServerContext {
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  authorities: readonly LedgerAssetAuthority[];
  canonicalAccountId(referenceId: string): string;
}

export async function loadServerLedgerContext(
  userId: string,
  requestedAccountIds: readonly string[]
): Promise<LedgerServerContext>;
```

- [ ] Write failing tests for: source and destination query coverage; document-ID deduplication; merged credit aliases; savings balance derived from complete paid history; missing account; malformed amount/type/date/account reference; and non-finite calculated authority.
- [ ] Run the new suite and capture RED before adding production code.
- [ ] Load the server accounts collection once, resolve every requested reference to one canonical account, query transaction rows by both reference fields for every canonical account reference, and deduplicate by Firestore document ID.
- [ ] Decode each transaction into a `Transaction` with its document ID and reject invalid type, finite positive amount, paid flag, source ID, transfer destination, or date.
- [ ] Build one canonical authority per affected account with `BalanceCalculator.calculateAccountBalance`; keep credit accounts in context for credit-delta validation even though the ordinary-negative rule applies only to savings/cash.
- [ ] Normalize planning references to canonical account IDs through a small exported pure helper and test alias-to-canonical before/after edits.
- [ ] Run the new suite, balance calculator regressions, and typecheck GREEN.
- [ ] Commit as `feat: load authoritative ledger context`.

## Task 3: Execute a prepared mutation under the shared lease

**Files:**

- Modify: `src/hooks/firestore/ledgerMutationOrchestration.ts`
- Modify: `src/__tests__/hooks/ledgerMutationOrchestration.test.ts`

**Public contract:**

```ts
export interface LedgerMutationPreparation<TResult> {
  intent: LedgerMutationIntent;
  context: LedgerServerContext;
  writeCount: number;
  stage(batch: WriteBatch): void;
  result: TResult;
}

export async function executeAuthenticatedLedgerMutation<TResult>(
  userId: string,
  prepare: (tools: LedgerMutationPreparationTools) =>
    Promise<LedgerMutationPreparation<TResult>>
): Promise<TResult>;
```

- [ ] Add failing tests proving exact order: acquire -> server prepare -> pure plan -> renew -> stage -> release tombstone -> one commit.
- [ ] Add failing cases for plan rejection, lost renewal, batch rejection, and preparation rejection; require zero domain writes and a best-effort safe release without masking the original error.
- [ ] Add a write-limit test where `writeCount + release` exceeds `RULE_SAFE_SIMPLE_WRITE_LIMIT`.
- [ ] Implement the minimal executor using the existing lock functions and one `writeBatch`; attach the generated `operationId`, `mutationKind`, and `mutationSource` only in the debt adapter, not generically.
- [ ] Add `planCreditAuthorityChanges` tests for absent, null, negative, non-finite, overpayment, and valid persisted `usedCredit`; return rounded per-card deltas for the caller to stage.
- [ ] Run the orchestration suite and typecheck GREEN.
- [ ] Commit as `feat: execute authenticated ledger mutations`.

## Task 4: Route authenticated debt origination and repayment through the facade

**Files:**

- Modify: `src/hooks/useDebts.ts`
- Modify: `src/__tests__/hooks/debtAtomicWrites.test.ts`
- Modify: `src/__tests__/hooks/registerDebtPayment.test.ts`

- [ ] Add RED cases where a lent origination of 1,000.01 against 1,000 savings and a borrowed repayment of 1,000.01 against 1,000 savings reject with zero debt/transaction/account writes.
- [ ] Add a two-attempt/concurrency case: the first prepared mutation holds the lease and the second fails before writes; after release a valid exact-balance attempt commits to zero.
- [ ] Replace only authenticated `addDebt` and `registerDebtPayment` transaction bodies with `executeAuthenticatedLedgerMutation` prepare callbacks.
- [ ] Persist normalized amounts plus `operationId`, `mutationKind: 'create'`, and `mutationSource: 'debt'` on created debt transactions.
- [ ] Stage debt document, optional transaction, any credit-authority increments, and the release tombstone in the facade's one final batch.
- [ ] Preserve tracking-only debt behavior, payment clamping against the server debt, settlement fields, current error copy, and cache publication after commit.
- [ ] Run `debtAtomicWrites`, `registerDebtPayment`, delete/reassign debt regressions, and typecheck GREEN.
- [ ] Commit as `fix: guard authenticated debt ledger mutations`.

## Task 5: Apply the same source-funds guard before guest debt writes

**Files:**

- Modify: `src/hooks/useDebts.ts`
- Modify: `src/__tests__/hooks/debtAmountGuard.test.ts`
- Modify: `src/__tests__/hooks/registerDebtPayment.test.ts`

- [ ] Add RED tests for unaffordable lent origination and borrowed repayment with a savings account; assert `addTransaction` is not called and local debt state is unchanged.
- [ ] Add exact-affordability controls and historical-negative improvement/worsening cases.
- [ ] Build the candidate debt transaction first, require its account in `txOps.accounts`, calculate current authority with `BalanceCalculator` over the complete guest transactions array, and call the same pure planner before `addTransaction` or `setLocalDebts`.
- [ ] Keep tracking-only debt unchanged and preserve the existing amount/error semantics.
- [ ] Run the guest debt suites and the ledger planner suite GREEN.
- [ ] Commit as `fix: prevent guest debt overdrafts`.

## Task 6: Verify and record only proven OpenSpec work

**Files:**

- Modify: `openspec/changes/harden-transaction-ledger-integrity/tasks.md`
- Modify: this plan

- [ ] Run focused facade, debt, ledger, credit-delta, cache, account-lock, and dependent lifecycle suites.
- [ ] Run `npm.cmd run test:run`, `npm.cmd run typecheck`, `npm.cmd run lint`, and `git diff --check` independently.
- [ ] Run strict OpenSpec validation using the already cached CLI; do not install a dependency.
- [ ] Rebuild the code-review graph, run a scoped `detect_changes`, inspect affected flows and `tests_for` the facade/context/debt planner.
- [ ] Mark only 4.1, 4.2, 4.3, and 6.5 complete when every gate above proves them; keep 3.6 and 4.4 onward open.
- [ ] Commit as `docs: record authenticated debt ledger evidence`.

Do not push or open a PR at this checkpoint. The next plan routes the general transaction create/transfer/update/delete/card-payment adapters onto this stable facade.
