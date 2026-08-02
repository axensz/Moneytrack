# Clarify Ledger Metric Scopes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the financial overview fixed, visible, and exclusive to Transactions while retaining shared Transaction/CSV filters and Statistics-local periods.

**Architecture:** Add a narrowly scoped overview selector beside the existing global-stat selector. Render the existing card component from `TransactionsView`, not the authenticated shell; therefore it follows the Transaction surface. Keep `filterTransactionsForView` as the one shared list/export filter implementation and delete the obsolete dynamic overview filter hook.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest 4, Testing Library, existing native `Date` utilities and CSS tokens.

## Global Constraints

- Do not change persistence, account strategies, external APIs, or the existing `totalBalance` formula.
- Balance remains the current consolidated `totalBalance`; credit-card available credit remains excluded.
- Income and Expenses are paid real movements in the current local calendar month; exclude transfers and `SPECIAL_CATEGORIES.adjustmentCategories`.
- Pending is only `getCreditCardUsedCredit` summed for credit-card accounts; no loans, recurring payments, or non-credit obligations.
- Transaction account, category, date, and search filters affect the visible list and CSV only, never the overview or Statistics.
- Statistics uses complete `balanceTransactions` and each chart/query states its own period.
- Render the overview only in Transactions after primary desktop navigation; do not add a Home route or global-filter framework.
- Preserve shared mobile behavior without a mobile-only layout/navigation redesign.
- Preserve light/dark tokens, `prefers-reduced-motion`, and the existing `.card-balance` gradient; add no dependency.
- Use exact Windows commands with `npm.cmd`; do not include unrelated files in commits.

---

### Task 1: Add the fixed overview selector with financial boundary tests

**Files:**
- Modify: `src/hooks/useGlobalStats.ts:15-123`
- Modify: `src/__tests__/hooks/useGlobalStats.test.ts:1-98`
- Create: `src/__tests__/hooks/useLedgerOverview.test.ts`

**Interfaces:**
- Consumes: `getCreditCardUsedCredit(account: Account, transactions: Transaction[]): number`, `SPECIAL_CATEGORIES.adjustmentCategories`, and `getDateRangeFromPreset('this-month')`.
- Produces:

```ts
export interface LedgerOverview {
  totalBalance: number;
  totalIncome: number;
  totalExpenses: number;
  pendingExpenses: number;
}

export function useLedgerOverview(
  transactions: Transaction[],
  accounts: Account[],
  totalBalance: number,
): LedgerOverview;
```

- Preserves: `useGlobalStats(transactions: Transaction[], accounts: Account[]): GlobalStats`, including `unpaidTCExpenses`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/hooks/useLedgerOverview.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { CREDIT_PAYMENT_CATEGORY, LOAN_CATEGORY } from '../../config/constants';
import { useLedgerOverview } from '../../hooks/useGlobalStats';
import type { Account, Transaction } from '../../types/finance';

const bank: Account = { id: 'bank', name: 'Banco', type: 'savings', initialBalance: 0, isDefault: true };
const card: Account = { id: 'card', name: 'Visa', type: 'credit', initialBalance: 0, isDefault: false, creditLimit: 1_000_000 };
const tx = (id: string, overrides: Partial<Transaction>): Transaction => ({
  id, type: 'expense', amount: 100, category: 'Compras', description: id,
  date: new Date('2026-07-15T12:00:00'), paid: true, accountId: 'bank', ...overrides,
});

describe('useLedgerOverview', () => {
  it('uses the month for real flow and complete history for balance and credit debt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12));
    try {
      const history = [
        tx('june', { type: 'income', amount: 900, category: 'Salario', date: new Date(2026, 5, 30, 23, 59, 59, 999) }),
        tx('start', { type: 'income', amount: 100, category: 'Salario', date: new Date(2026, 6, 1, 0, 0, 0, 0) }),
        tx('end', { amount: 40, date: new Date(2026, 6, 31, 23, 59, 59, 999) }),
        tx('august', { amount: 500, date: new Date(2026, 7, 1, 0, 0, 0, 0) }),
        tx('transfer', { type: 'transfer', amount: 30, category: 'Transferencia' }),
        tx('payment', { amount: 30, category: CREDIT_PAYMENT_CATEGORY }),
        tx('loan', { amount: 30, category: LOAN_CATEGORY }),
        tx('unpaid-card', { amount: 200, accountId: 'card', paid: false }),
      ];
      const { result } = renderHook(() => useLedgerOverview(history, [bank, card], 777));
      expect(result.current).toEqual({ totalBalance: 777, totalIncome: 100, totalExpenses: 40, pendingExpenses: 200 });
    } finally { vi.useRealTimers(); }
  });
});
```

Add to `useGlobalStats.test.ts` an assertion that the existing hook still excludes an unpaid card purchase from `totalExpenses` while retaining it in `pendingExpenses`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd run test:run -- src/__tests__/hooks/useLedgerOverview.test.ts src/__tests__/hooks/useGlobalStats.test.ts`

Expected: FAIL because `useLedgerOverview` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/hooks/useGlobalStats.ts`, import `getDateRangeFromPreset`, add the interface above, then add:

```ts
export function useLedgerOverview(
  transactions: Transaction[],
  accounts: Account[],
  totalBalance: number,
): LedgerOverview {
  const currentMonthTransactions = useMemo(() => {
    const { start, end } = getDateRangeFromPreset('this-month');
    return transactions.filter((transaction) => {
      const date = new Date(transaction.date);
      return (!start || date >= start) && (!end || date <= end);
    });
  }, [transactions]);

  const currentMonthStats = useGlobalStats(currentMonthTransactions, accounts);
  const fullHistoryStats = useGlobalStats(transactions, accounts);

  return {
    totalBalance,
    totalIncome: currentMonthStats.totalIncome,
    totalExpenses: currentMonthStats.totalExpenses,
    pendingExpenses: fullHistoryStats.pendingExpenses,
  };
}
```

Do not alter `isRealMovement`, `useGlobalStats`, or `getCreditCardUsedCredit`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd run test:run -- src/__tests__/hooks/useLedgerOverview.test.ts src/__tests__/hooks/useGlobalStats.test.ts`

Expected: PASS; exact first/last month instants count, adjacent months do not, and full-history card debt remains 200.

- [ ] **Step 5: Commit**

```powershell
git add src/hooks/useGlobalStats.ts src/__tests__/hooks/useGlobalStats.test.ts src/__tests__/hooks/useLedgerOverview.test.ts
git commit -m "feat: define fixed ledger overview scope"
```

### Task 2: Render explicit overview cards only inside Transactions

**Files:**
- Modify: `src/AuthenticatedApp.tsx:12,149-180,453-463`
- Modify: `src/components/views/transactions/TransactionsView.tsx:10,64-77,158-160`
- Modify: `src/components/shared/StatsCards.tsx:7-35,44-122`
- Create: `src/__tests__/components/StatsCards.test.tsx`
- Create: `src/__tests__/components/metricScopePlacement.test.tsx`

**Interfaces:**
- Consumes: `useLedgerOverview(transactions, accounts, totalBalance): LedgerOverview`.
- Produces:

```ts
interface StatsCardsProps {
  totalBalance: number;
  totalIncome: number;
  totalExpenses: number;
  pendingExpenses: number;
  formatCurrency: (amount: number) => string;
  hasAccounts?: boolean;
  balanceSettling?: boolean;
}
```

- Removes: `balanceLabel?: string` and `periodLabel?: string`. `TransactionsViewProps` stays unchanged.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/components/StatsCards.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatsCards } from '../../components/shared/StatsCards';

vi.mock('../../contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: false, setHideBalances: vi.fn() }),
}));

it('shows the general overview with explicit scopes', () => {
  render(<StatsCards totalBalance={100} totalIncome={20} totalExpenses={5} pendingExpenses={10} formatCurrency={(value) => `$${value}`} />);
  expect(screen.getByText('Resumen general')).toBeInTheDocument();
  expect(screen.getByText('Saldo actual')).toBeInTheDocument();
  expect(screen.getByText(/Ingresos.*mes actual/)).toBeInTheDocument();
  expect(screen.getByText(/Gastos.*mes actual/)).toBeInTheDocument();
  expect(screen.getByText(/Pendiente actual.*tarjetas de crédito/)).toBeInTheDocument();
});
```

Create `metricScopePlacement.test.tsx` with a local harness that renders the
real `TabNavigation`, `FinanceViewRouter`, and `TransactionsView`, while
mocking only the finance-domain hooks and lazy non-Transaction views. Its
assertions must use these exact test IDs:

```tsx
expect(screen.getByTestId('primary-navigation').compareDocumentPosition(
  screen.getByTestId('ledger-overview'),
) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
expect(screen.getByTestId('transactions-panel')).toContainElement(screen.getByTestId('ledger-overview'));
render(<FinanceShell initialView="accounts" />);
expect(screen.queryByTestId('ledger-overview')).not.toBeInTheDocument();
```

Add the test IDs to the real navigation, overview, and Transaction panel
elements. Render the harness once with `view="transactions"` and once for each
other `ViewType`. Do not export app internals or create a fake shell component
that merely repeats the intended placement.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd run test:run -- src/__tests__/components/StatsCards.test.tsx src/__tests__/components/metricScopePlacement.test.tsx`

Expected: FAIL: no overview heading exists and cards are globally rendered before navigation.

- [ ] **Step 3: Write minimal implementation**

1. In `AuthenticatedApp.tsx`, remove `StatsCards` and `useFilteredData` imports, `statsPeriodLabel`, the `useFilteredData(...)` call, and the global card block. Keep all filter state and all `TransactionsView` props.
2. In `TransactionsView.tsx`, import `StatsCards` and `useLedgerOverview`; change the account destructure and compute overview:

```tsx
const { accounts, balancesReady, totalBalance } = useAccountDomain();
const overview = useLedgerOverview(balanceTransactions, accounts, totalBalance);
```

Render immediately before the existing `<div className="card">`:

```tsx
<StatsCards
  balanceSettling={!balancesReady}
  totalBalance={overview.totalBalance}
  totalIncome={overview.totalIncome}
  totalExpenses={overview.totalExpenses}
  pendingExpenses={overview.pendingExpenses}
  formatCurrency={formatCurrency}
  hasAccounts={accounts.length > 0}
/>
```

3. In `StatsCards.tsx`, show `Resumen general` above the cards. Use the literal labels `Saldo actual`, `Ingresos · mes actual`, `Gastos · mes actual`, and `Pendiente actual · tarjetas de crédito`. Change the pending tooltip to say it is current used credit across cards and that unpaid card purchases are represented there, not in Gastos.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm.cmd run test:run -- src/__tests__/hooks/useLedgerOverview.test.ts src/__tests__/components/StatsCards.test.tsx src/__tests__/components/metricScopePlacement.test.tsx`

Expected: PASS; overview follows navigation and exists only inside Transactions.

- [ ] **Step 5: Commit**

```powershell
git add src/AuthenticatedApp.tsx src/components/views/transactions/TransactionsView.tsx src/components/shared/StatsCards.tsx src/__tests__/components/StatsCards.test.tsx src/__tests__/components/metricScopePlacement.test.tsx
git commit -m "feat: show scoped overview only in transactions"
```

### Task 3: Delete dynamic overview filtering and prove list/CSV equivalence

**Files:**
- Delete: `src/hooks/useFilteredData.ts`
- Delete: `src/__tests__/hooks/useFilteredDataDateRange.test.ts`
- Modify: `src/__tests__/hooks/transactionsViewExportFiltering.test.ts:1-59`
- Modify: `src/__tests__/utils/mergeCreditCards.test.ts:139-151`

**Interfaces:**
- Consumes: `filterTransactionsForView(transactions: Transaction[], options: TransactionViewFilterOptions): Transaction[]`.
- Produces: no new runtime API. Transactions and CSV keep using `filteredTransactions` and `filteredBalanceTransactions` derived by that same function.

- [ ] **Step 1: Write the characterization tests**

In `transactionsViewExportFiltering.test.ts`, import
`filterTransactionsForView` and add the combined account/category/date/search
case using explicit `Transaction` fixtures:

```ts
const options = {
  accounts: [account], recurringPayments: [], filterCategory: 'Comida', filterAccount: 'account-1',
  searchQuery: 'mercado', dateRangePreset: 'custom' as const, customStartDate: '2026-07-01', customEndDate: '2026-07-31',
};
expect(filterTransactionsForView(visible, options).map((item) => item.id)).toEqual(['match-visible']);
expect(filterTransactionsForView(fullHistory, options).map((item) => item.id)).toEqual(['match-visible', 'match-historical']);
```

Use `match-visible` at `2026-07-01T00:00:00.000`, `match-historical` at `2026-07-31T23:59:59.999`, and add adjacent June/August rows which must be absent.

In `mergeCreditCards.test.ts`, remove the `useFilteredData` import and only the `filtered.dynamicStats.pendingExpenses` assertion; retain the existing `useGlobalStats(...).pendingExpenses` assertion.

- [ ] **Step 2: Run tests to lock the current shared filter behavior**

Run: `npm.cmd run test:run -- src/__tests__/hooks/transactionsViewExportFiltering.test.ts src/__tests__/utils/mergeCreditCards.test.ts`

Expected: PASS. This is a characterization gate: the existing shared filter
already drives both the visible and full-history export sources. If it fails,
stop and diagnose before deleting the obsolete hook.

- [ ] **Step 3: Write minimal implementation**

Do not alter `filterTransactionsForView`; it already applies account, category,
normalized search, and inclusive dates to both sources. Delete
`src/hooks/useFilteredData.ts` and its date-range test only after the
characterization suite is green.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm.cmd run test:run -- src/__tests__/hooks/transactionsViewExportFiltering.test.ts src/__tests__/utils/mergeCreditCards.test.ts src/__tests__/hooks/useGlobalStats.test.ts`

Expected: PASS; list and CSV sources share all four criteria and merge-credit pending debt remains covered.

- [ ] **Step 5: Commit**

```powershell
git add src/__tests__/hooks/transactionsViewExportFiltering.test.ts src/__tests__/utils/mergeCreditCards.test.ts
git rm src/hooks/useFilteredData.ts src/__tests__/hooks/useFilteredDataDateRange.test.ts
git commit -m "refactor: remove filtered overview state"
```

### Task 4: Align Statistics labels and help copy to the independent scope

**Files:**
- Modify: `src/components/views/stats/components/CategoryPieChart.tsx:59`
- Modify: `src/components/views/stats/components/YearlyTrendChart.tsx:55`
- Modify: `src/components/views/stats/components/BeneficiarySpendTable.tsx:47-64`
- Modify: `src/components/modals/help/HelpSectionTransactions.tsx:108-176`
- Modify: `src/components/modals/help/HelpSectionStats.tsx:107-130`
- Modify: `src/__tests__/hooks/useStatsData.test.ts:43-110`
- Create: `src/__tests__/components/helpMetricScopes.test.tsx`

**Interfaces:**
- Consumes unchanged `StatsView` source: `const allTransactions = balanceTransactions`.
- Consumes local period controls in `BeneficiarySpendTable` and `PeriodSummaryCard`.
- Produces no data interface; only truthful visual labels and help text.

- [ ] **Step 1: Write the failing tests**

Append to `useStatsData.test.ts`:

```ts
it('aggregates the supplied complete history without Transaction-view filter state', () => {
  const history = [
    makeTx({ id: 'old', amount: 120_000, date: new Date(2025, 0, 15), paid: true }),
    makeTx({ id: 'current', amount: 80_000, date: recentDate(), paid: true }),
  ];
  const { result } = renderHook(() => useStatsData(history));
  expect(sumYearlyGastos(result.current.yearlyData)).toBe(200_000);
});
```

Create `helpMetricScopes.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelpSectionStats } from '../../components/modals/help/HelpSectionStats';
import { HelpSectionTransactions } from '../../components/modals/help/HelpSectionTransactions';

describe('metric-scope help', () => {
  it('states that Transaction filters apply to list and CSV, not Statistics or the overview', () => {
    render(<><HelpSectionTransactions /><HelpSectionStats /></>);
    expect(screen.getByText(/lista.*CSV/i)).toBeInTheDocument();
    expect(screen.getByText(/no cambian el resumen general ni las estadísticas/i)).toBeInTheDocument();
    expect(screen.getByText(/historial completo/i)).toBeInTheDocument();
    expect(screen.queryByText('Estado')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd run test:run -- src/__tests__/hooks/useStatsData.test.ts src/__tests__/components/helpMetricScopes.test.tsx`

Expected: FAIL because help currently says Transaction filters affect Statistics and lists `Estado`.

- [ ] **Step 3: Write minimal implementation**

1. Leave `StatsView` and `useStatsData` data flow unchanged.
2. Replace chart subtitles exactly:

```tsx
<ChartCard title="Gastos por Categoría" subtitle="Historial completo" icon={PieChartIcon}>
<ChartCard title="Tendencia Anual" subtitle="Historial completo por año" icon={TrendingUp}>
<ChartCard title="Gastos por Persona" subtitle={`Periodo: ${INTERVAL_OPTIONS.find((option) => option.value === interval)!.label}`} icon={UserRound}>
```

3. In Transaction help, show only Fecha, Cuenta, Categoría, and Búsqueda. Add: `Estos filtros cambian la lista y el CSV exportado; no cambian el Resumen general ni las Estadísticas.`
4. Replace Statistics help’s filter panel with heading `Alcance de las estadísticas` and: `Las Estadísticas usan el historial completo. Cada gráfico muestra su propio periodo: flujo y comparación usan los últimos 6 meses, tendencia anual y categorías usan historial completo, y las consultas muestran el periodo que eliges.`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm.cmd run test:run -- src/__tests__/hooks/useStatsData.test.ts src/__tests__/components/helpMetricScopes.test.tsx`

Expected: PASS; complete-history data and visible independent scope are both preserved.

- [ ] **Step 5: Commit**

```powershell
git add src/components/views/stats/components/CategoryPieChart.tsx src/components/views/stats/components/YearlyTrendChart.tsx src/components/views/stats/components/BeneficiarySpendTable.tsx src/components/modals/help/HelpSectionTransactions.tsx src/components/modals/help/HelpSectionStats.tsx src/__tests__/hooks/useStatsData.test.ts src/__tests__/components/helpMetricScopes.test.tsx
git commit -m "docs: clarify statistics and filter scopes"
```

### Task 5: Validate desktop scope and shared mobile regressions

**Files:**
- Modify: none unless a focused regression fails in a file already named above.
- Test: all test files created or modified in Tasks 1-4.

**Interfaces:**
- Consumes all completed Task 1-4 interfaces.
- Produces validated desktop behavior and preserved shared mobile-capable behavior; no new API.

- [ ] **Step 1: Write the failing regression assertion before any discovered fix**

If a shared responsive regression is found, add it to its owning test before editing source. For a missing pending label, add this assertion to `StatsCards.test.tsx`:

```tsx
expect(screen.getByText(/Pendiente actual.*tarjetas de crédito/)).toBeVisible();
```

Do not create a mobile-only component, route, navigation branch, or breakpoint-specific selector.

- [ ] **Step 2: Run focused shared mobile-capable regressions**

Run: `npm.cmd run test:run -- src/__tests__/components/StatsCards.test.tsx src/__tests__/components/metricScopePlacement.test.tsx src/__tests__/hooks/transactionsViewExportFiltering.test.ts`

Expected: PASS if no defect exists; otherwise FAIL on the Step 1 assertion.

- [ ] **Step 3: Write the minimal implementation**

Only if Step 2 fails, correct the failed label, accessibility attribute, or existing class. Keep the existing shared responsive grid exactly:

```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
```

Do not alter overview values by breakpoint or redesign mobile navigation.

- [ ] **Step 4: Run validation and manual desktop verification**

Run:

```powershell
npm.cmd run test:run -- src/__tests__/hooks/useGlobalStats.test.ts src/__tests__/hooks/useLedgerOverview.test.ts src/__tests__/hooks/transactionsViewExportFiltering.test.ts src/__tests__/utils/mergeCreditCards.test.ts src/__tests__/hooks/useStatsData.test.ts src/__tests__/components/StatsCards.test.tsx src/__tests__/components/metricScopePlacement.test.tsx src/__tests__/components/helpMetricScopes.test.tsx
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:run
```

Expected: every command exits 0.

In the running app, at 1024px, 1280px, and 1440px in light and dark themes: verify navigation precedes the overview; change account/category/date/search and confirm only list/CSV change; verify overview absence from Accounts, Recurring, Loans, Budgets, Goals, Statistics, and Financial Plan; verify Statistics period labels remain visible.

- [ ] **Step 5: Commit**

```powershell
git status --short
git add src
git commit -m "test: verify ledger metric scope contract"
```

Run this commit only when `git status --short` shows validation-related tracked changes not committed by Tasks 1-4. Do not create an empty commit.

## Plan self-review

- Task 1 covers stable formulas, full-history pending, special categories, unpaid card purchases, non-credit obligations, and both month boundaries.
- Task 2 covers visible scopes, primary-navigation order, and Transaction-only placement.
- Task 3 covers list/CSV alignment across account, category, date, and search.
- Task 4 covers full-history Statistics, chart-local labels, local query controls, and affected guidance.
- Task 5 limits desktop work to scope verification and protects shared mobile behavior without a redesign.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-26-clarify-ledger-metric-scopes.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** - Execute tasks in this session using executing-plans, with checkpoints.

Which approach?
