# Implementation notes

## 2026-08-25 — baseline

- Base: `origin/main` at `cc19a63d57c118c42177fc2a73a9282eb28711d1`.
- Isolated worktree: `feature/android-transaction-ingestion`.
- Intentional starting files: `CONTEXT.md` and this OpenSpec change only.
- OpenSpec status: 4/4 artifacts complete; strict validation passed.
- Knowledge graph: 399 files parsed, 4,671 nodes, 46,333 edges, built at the base commit.

## Initial impact map

| Concern | Current authority / integration file |
| --- | --- |
| Authenticated financial commit | `src/hooks/firestore/ledgerMutationOrchestration.ts` |
| Existing transaction ingress | `src/hooks/firestore/useTransactionsCRUD.ts` |
| Account delete and credit-card merge | `src/hooks/firestore/accountOrchestration.ts` |
| Ledger/domain types | `src/types/finance.ts` |
| Transaction review surface | `src/components/views/transactions/TransactionsView.tsx` |
| Account management surface | `src/components/views/accounts/AccountsView.tsx` |

The graph confirms that current `main` already contains
`executeAuthenticatedLedgerMutation`, `deleteAccountCascade`, and
`mergeCreditCardsOrchestrated`. The new ingress can therefore extend the
existing ledger boundary without copying financial authority.

## Baseline verification

- Ledger boundary: 3 files passed, 119 tests passed.
- TypeScript: `npm.cmd run typecheck` passed.
- ESLint: `npm.cmd run lint` passed with no reported findings.

## Domain-contract slice

- RED: decoder and matching modules were absent; the Android ingress row also
  failed TypeScript because `LedgerMutationSource` did not include it.
- GREEN: 3 focused files passed, 77 tests passed; TypeScript passed.
- The decoder accepts only exact version-1 shapes and Firestore timestamp
  objects or `Date` values. It does not coerce strings/numbers into dates or
  malformed monetary values.
- Matching returns an account only for one active exact last-four match;
  duplicate active matches remain ambiguous.

## Firestore security slice

- RED: with the old default-deny rules, 8 positive import assertions failed
  while the original account-operation suite stayed green.
- The two emulator files must run without file parallelism because each owns and
  clears the same demo Firestore emulator.
- GREEN: 2 files passed, 49 tests passed.
- The composite index JSON parsed successfully; no deploy was performed.
- Confirmation requires a 64-character candidate ID, matching Android
  operation identity, active ledger lease, canonical transaction and exact
  release in the same batch. Terminal candidates cannot reopen.
- Scoped commit: `b2b6314 feat(import): define secure candidate contracts`.

## Payment-instrument persistence and account lifecycle

- RED: the new hook module was absent; merge/delete ignored linked instruments
  and passed batch limits that should include their writes.
- GREEN: 3 files passed, 41 tests passed; TypeScript passed.
- Every user switch unsubscribes and clears prior-user instrument state.
- Merge and cascade discover current instrument references from the server after
  acquiring the account-operation lease; React state is not treated as
  referential authority.

## Candidate subscription and canonical confirmation

- RED: both candidate-hook and confirmation modules were absent before their
  focused tests ran.
- GREEN: the bounded candidate hook passed 6 tests; canonical confirmation
  passed 8 focused tests and TypeScript passed.
- The existing shared `planCreditAuthorityChanges` primitive was already public,
  so no credit arithmetic was extracted or duplicated.
- The four ingress suites passed 129 tests. They cover the existing writer,
  normal transaction writes, ingress parity and the Android confirmation path.
- A successful confirmation uses `ledger-mutation:android:<candidateId>` for the
  operation and transaction identity, reloads the reviewed candidate after the
  lease, and stages transaction, credit authority, optional remembered medium,
  candidate terminal state and lease release in one commit.
- Retry recovery returns the canonical transaction only when candidate,
  transaction ID, operation ID, mutation kind and Android source all agree.
- The graph found no pre-existing create or credit-payment flow changed by the
  new isolated writer. It mapped 36 direct/indirect tests to the new module,
  including all 8 focused confirmation cases.

## Web management and review UI

- `PRODUCT.md` and `DESIGN.md` were re-read before JSX. The new surfaces reuse
  the system font, semantic tokens, existing modal focus management and 44 px
  controls; they add no color, gradient, motion library or shared primitive.
- The visual signature is a restrained violet intake rail: it identifies the
  phone-to-review boundary without presenting candidates as ledger metrics.
- RED: the payment-instrument section, candidate inbox and review modal modules
  were absent when their focused suites first ran.
- GREEN: the required 5 UI files passed 21 tests; TypeScript and ESLint passed.
  Three graph-identified shell/placement suites added 30 passing regression
  tests for routing, loading contracts and metric placement.
- The root authenticated shell passes its existing UID and online state down to
  the views. No extra auth listener was introduced, and guest rendering remains
  unchanged.
- Offline review preserves edits and blocks the financial action. Server
  failures remain visible and the synchronous guard permits only one canonical
  confirmation per submit gesture.
