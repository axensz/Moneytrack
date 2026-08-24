# Deterministic Ledger Reconciliation Implementation Plan

> Base checkpoint: `1f15524` on `feature/complete-pending-work`.
> Scope: OpenSpec Task 10 only. No real financial repair is authorized by this plan.

## Outcome

Deliver one deterministic, read-only reconciliation model that explains every account from complete source rows, preserves invalid documents as explicit issues, and produces reviewable repair plans. A repair command may run only after exact confirmation, under the existing ledger lease, against a fresh server report, and must return a new report. Browser validation is read-only unless the user separately authorizes a specific plan.

## 1. Shared runtime transaction decoder

Files:

- Add `src/utils/transactionDecoder.ts`.
- Add `src/__tests__/utils/transactionDecoder.test.ts`.
- Update `src/hooks/firestore/ledgerMutationOrchestration.ts`.
- Update `src/hooks/firestore/useFirestoreSubscriptions.ts`.
- Update `src/hooks/useAllTransactions.ts` and its tests.

Steps:

1. Write failing tests for invalid type, non-finite/non-positive amount, paid state, account/destination, date, and createdAt. Require the document ID and stable reason code.
2. Implement a discriminated decoder result (`valid` transaction or `invalid-record` issue) plus batch helpers.
3. Replace the private mutation decoder, paginated filter/mapper, and full-history cast with the shared decoder.
4. Keep invalid rows out of financial math but retain/report their IDs and reasons; never silently substitute `new Date()`.

Checkpoint: focused decoder, pagination, full-history, and mutation-orchestration suites; typecheck.

## 2. Pure reconciliation report and classifications

Files:

- Add `src/utils/ledgerReconciliation.ts`.
- Add `src/__tests__/utils/ledgerReconciliation.test.ts`.

Steps:

1. Test per-account initial balance, paid income/expense, incoming/outgoing transfer totals, ordered signed movements, running balance, crossing-zero rows, and final calculated balance.
2. Compare credit history with persisted `usedCredit` without changing either authority.
3. Test every required issue: incomplete authority/source, invalid record, orphan account/debt, broken reciprocal link, credit divergence, duplicate recurring cycle, explained negative, and dependent debt mismatch.
4. Define deterministic issue ordering and a stable report fingerprint from source IDs/values so repair plans can detect stale authority.
5. Keep pending rows visible but excluded from paid balance math.

Checkpoint: pure tests cover each classification independently and combined priority behavior.

## 3. Pure repair-plan builders

Files:

- Add `src/utils/ledgerRepairPlans.ts`.
- Add `src/__tests__/utils/ledgerRepairPlans.test.ts`.

Steps:

1. Build a savings/cash adjustment plan that creates one auditable balance-adjustment row.
2. Build both explicit credit choices: history-authoritative (`usedCredit` update) and persisted-authoritative (ledger adjustment row).
3. Build reciprocal-link and recurring-dedup metadata plans that preserve financial rows.
4. Include before/after evidence, affected IDs, source fingerprint, operation ID, confirmation phrase, and a human-readable risk summary.
5. Reject plans for incomplete/invalid authority or ambiguous targets.

Checkpoint: builders remain pure and no test writes Firestore/localStorage.

## 4. Fresh server reader and confirmed authenticated executor

Files:

- Add `src/services/ledgerReconciliation.ts`.
- Add `src/__tests__/services/ledgerReconciliation.test.ts`.
- Reuse `src/hooks/firestore/accountOrchestration.ts` and the ledger lock/release contract.

Steps:

1. Load accounts, transactions, debts, and recurring payments with server-only reads; decode every transaction with the shared decoder.
2. Produce the report from those source documents.
3. Require exact confirmation and matching fresh report fingerprint before staging any repair.
4. Acquire `ledger-mutation`, stage the supported plan atomically with the release tombstone, commit once, then reload and return a new server report.
5. Preserve financial evidence during link/dedup repairs and reject unsupported or stale actions without writes.

Checkpoint: mocked server tests prove no write before confirmation, stale-plan rejection, one batch under lease, and mandatory post-commit refresh.

## 5. Read-only reconciliation UI

Files:

- Add `src/hooks/useLedgerReconciliation.ts`.
- Add `src/components/modals/LedgerReconciliationModal.tsx`.
- Add focused component/hook tests.
- Wire the existing settings menu and `AuthenticatedApp.tsx` without adding a new primary navigation destination.

Steps:

1. Add a settings action named `Integridad del libro` and open the existing `BaseModal` pattern.
2. Show settling, source/completeness, global issues, per-account equation, credit comparison, and crossing-zero movements.
3. Respect hidden-value preference, semantic success/warning/destructive tokens, light/dark mode, keyboard focus, Escape/close restoration, responsive stacking, and 44px targets.
4. Expose plan preview and exact confirmation UI, but keep execution unavailable for guest/incomplete reports.
5. Never auto-run a plan when the modal opens or when browser validation runs.

Checkpoint: component tests cover focus, privacy, disabled reasons, issue labels, plan preview, and responsive class contracts.

## 6. Read-only real-account verification and evidence

1. Run the complete test suite, typecheck, lint, production build, diff check, strict OpenSpec validation, and graph review.
2. In Chrome, open reconciliation for the current authenticated account, wait for server completeness, and record only the read-only classification and evidence fingerprint.
3. Classify any negative as `negative-explained` only when the complete valid equation proves it; otherwise record the concrete inconsistency.
4. Do not click or invoke a repair command. A specific plan requires a separate user authorization after its before/after evidence is shown.
5. Mark 10.1–10.7 complete only when their exact evidence exists; otherwise leave the unmet item open.

## Verification commands

```powershell
npm run test:run -- src/__tests__/utils/transactionDecoder.test.ts src/__tests__/utils/ledgerReconciliation.test.ts src/__tests__/utils/ledgerRepairPlans.test.ts src/__tests__/services/ledgerReconciliation.test.ts
npm run test:run
npm run typecheck
npm run lint
npm run build
git diff --check
npx --yes --offline @fission-ai/openspec@1.10.0 validate harden-transaction-ledger-integrity --type change --strict --no-interactive
```

Protected work remains outside every stage/commit: notification-preference and BudgetMonitor files, `.codex/`, and `AGENTS.md`.
