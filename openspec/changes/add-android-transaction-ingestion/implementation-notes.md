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
