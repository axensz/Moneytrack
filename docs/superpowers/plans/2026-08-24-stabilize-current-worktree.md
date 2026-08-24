# Stabilize Current MoneyTrack Worktree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the approved unfiltered ledger-overview contract without discarding the separate notification work in progress, then produce fresh verification evidence.

**Architecture:** Transaction account/category/date/search filters remain view/export state owned by `useTransactionsView`; `useLedgerOverview` consumes the complete authoritative transaction history, accounts, and global balance only. Notification lifecycle edits are preserved as a separate change and are not treated as completed by this stabilization.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Vitest 4, Testing Library, OpenSpec.

**Spec:** `openspec/changes/harden-transaction-ledger-integrity/specs/transaction-ledger-integrity/spec.md`

## Global Constraints

- Every lower Transaction filter changes only the list and CSV; Saldo actual, Ingresos del mes actual, Gastos del mes actual, and Pendiente retain their unfiltered values.
- Preserve all notification files and user-owned untracked files unless a later independently reviewed task explicitly owns them.
- Do not deploy, modify real financial data, or push an unverified SHA.
- Keep the MoneyTrack product contract "The Confident Ledger" and the existing design tokens; add no dependency or visual pattern for this fix.

---

### Task 1: Re-establish the metric-scope regression test

**Files:**
- Modify: `src/__tests__/components/metricScopeFilterIndependence.test.tsx:34-181`
- Reference: `openspec/changes/harden-transaction-ledger-integrity/specs/transaction-ledger-integrity/spec.md:43-47`

**Interfaces:**
- Consumes: `useLedgerOverview(transactions, accounts, totalBalance)` and `useTransactionsView(...)`.
- Produces: a regression test proving every real filter changes list/CSV while the four overview values remain `1000|100|100|0`.

- [x] **Step 1: Replace the reversed filter expectations with the approved behavior**

```tsx
it('keeps the rendered overview stable while each real Transaction criterion changes the visible result', () => {
  render(<FilterScopeHarness />);
  const overview = screen.getByTestId('overview');

  for (const [label, expectedCount] of [
    ['Cuenta', '4'],
    ['Categoría', '3'],
    ['Fecha', '4'],
    ['Búsqueda', '3'],
    ['Todos', '1'],
  ] as const) {
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByTestId('visible-results')).toHaveTextContent(expectedCount);
    expect(screen.getByTestId('csv-results')).toHaveTextContent(expectedCount);
    expect(overview).toHaveTextContent('1000|100|100|0');
  }
});
```

- [x] **Step 2: Run the regression test and verify RED**

Run: `npm.cmd run test:run -- src/__tests__/components/metricScopeFilterIndependence.test.tsx --reporter=dot`

Expected: FAIL because the current implementation returns filtered overview values such as `20|100|80|0`.

### Task 2: Restore the authoritative overview boundary

**Files:**
- Modify: `src/hooks/useGlobalStats.ts:139-330`
- Modify: `src/components/views/transactions/TransactionsView.tsx:76-83`
- Modify: `src/components/shared/StatsCards.tsx:7-34`
- Test: `src/__tests__/components/metricScopeFilterIndependence.test.tsx`

**Interfaces:**
- Consumes: complete `Transaction[]`, `Account[]`, and authoritative `totalBalance`.
- Produces: `useLedgerOverview(transactions, accounts, totalBalance): LedgerOverview` with no lower-filter parameter.

- [x] **Step 1: Remove lower-filter state from `useLedgerOverview`**

```ts
export function useLedgerOverview(
  transactions: Transaction[],
  accounts: Account[],
  totalBalance: number,
): LedgerOverview {
  const stats = useGlobalStats(transactions, accounts);
  return useMemo(() => ({ totalBalance, ...stats }), [totalBalance, stats]);
}
```

- [x] **Step 2: Make `TransactionsView` call the three-argument overview and keep the global balance label**

```tsx
const { accounts, balancesReady, totalBalance } = useAccountDomain();
const overview = useLedgerOverview(balanceTransactions, accounts, totalBalance);
```

- [x] **Step 3: Run the focused test and verify GREEN**

Run: `npm.cmd run test:run -- src/__tests__/components/metricScopeFilterIndependence.test.tsx --reporter=dot`

Expected: 2 tests pass with zero failures.

### Task 3: Verify the stabilized slice

**Files:**
- Verify: `src/hooks/useGlobalStats.ts`
- Verify: `src/components/views/transactions/TransactionsView.tsx`
- Verify: `src/components/shared/StatsCards.tsx`
- Verify: `src/__tests__/components/metricScopeFilterIndependence.test.tsx`

**Interfaces:**
- Consumes: the restored metric contract.
- Produces: fresh test, type, lint, diff, and graph evidence without claiming notification completion.

- [x] **Step 1: Run related metric tests**

Run: `npm.cmd run test:run -- src/__tests__/components/metricScopeFilterIndependence.test.tsx src/__tests__/components/metricScopePlacement.test.tsx src/__tests__/hooks/useGlobalStats.test.ts --reporter=dot`

- [x] **Step 2: Run static verification**

Run: `npm.cmd run typecheck`

Run: `npm.cmd run lint`

Run: `git diff --check`

- [x] **Step 3: Confirm the four metric files no longer differ from `HEAD`**

Run: `git diff -- src/hooks/useGlobalStats.ts src/components/views/transactions/TransactionsView.tsx src/components/shared/StatsCards.tsx src/__tests__/components/metricScopeFilterIndependence.test.tsx`

Expected: no diff. The notification files remain untouched and uncommitted.

- [x] **Step 4: Record the outcome without a code commit**

The intended result is restoration of the already committed contract at `2948a3d`; no new production commit is warranted for a zero-diff restoration. Keep this completed plan as the durable audit trail.

## Execution Evidence

- RED: focused regression failed 2/2 with filtered values `20|100|80|0` and `20|0|10|0`.
- GREEN: focused regression passed 2/2 after restoring the three-argument overview boundary.
- Related verification: 3 files and 14 tests passed; `typecheck`, ESLint, and `git diff --check` exited 0.
- The four metric files hash-identically match `HEAD`; code-review-graph now reports only the four notification files as changed.
- Existing React `act(...)` warnings in `metricScopePlacement.test.tsx` remain separate non-blocking test debt.
