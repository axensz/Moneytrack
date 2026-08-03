## Context

`AuthenticatedApp` owns account, category, and date state used by
`useFilteredData`, while `TransactionsView` owns search and applies it to the
list and CSV. `StatsCards` is rendered above every view, so account/category
filters can change figures after their controls disappear. `StatsView` uses
complete history and chart-specific periods.

The financial calculations and full-history selectors are already valid. The
problem is the coupling between presentation scope and hidden Transaction
state.

## Goals / Non-Goals

**Goals:**

- Make every summary figure's scope stable and visible.
- Keep list and CSV results aligned.
- Keep Statistics periods local and explicit.
- Remove metric grids from unrelated task surfaces.

**Non-Goals:**

- Recalculate account balances or change financial formulas.
- Add a dashboard route or global filter framework.
- Make free-text search alter financial aggregates.
- Perform a mobile-specific layout/navigation redesign or change persistence.

## Decisions

### Use a fixed general-overview scope

`StatsCards` will consume an overview derived from complete balance history:

- Balance is the existing `totalBalance` selector result. Its account strategy
  inclusion rules remain unchanged, including exclusion of credit-card
  available credit from the consolidated total.
- Income and Expenses use complete history restricted to the current calendar
  month, then apply the existing `isRealMovement` and paid-transaction rules.
  Transfers and `SPECIAL_CATEGORIES.adjustmentCategories` remain excluded, and
  unpaid credit-card purchases remain outside Expenses.
- Pending is the existing sum of `getCreditCardUsedCredit` across credit-card
  accounts. It does not expand to loans, recurring payments, or other
  obligations.

The visible card label is shortened to `Pendiente` to keep the summary easy to
scan. The existing contextual help retains the precise credit-card scope, so
the copy change does not broaden the metric or alter its calculation.

Account, category, date, and search controls in Transactions will not alter
this overview.

This is preferred over lifting every Transaction filter into global state:
lifting search and pagination would couple unrelated views and preserve the
hidden-filter problem. A fixed labeled overview is smaller and more honest.

### Render the overview only with Transactions

Primary navigation will precede the active surface. The overview will appear
inside the Transactions surface, before its controls. Other sections will lead
with their own heading and local information.

This is preferred over a new Home route, which would add navigation and
onboarding scope not required to resolve the audit.

### Keep Statistics self-contained

Statistics will continue to use complete history. Each chart or query will
display its own period, and the view will not imply that Transaction filters
apply.

### Keep list and CSV on one filter result

Transactions and CSV export will continue sharing the same filtered dataset,
including search. Regression tests will lock this behavior while proving those
filters do not change the overview.

### Preserve mobile journeys while fixing shared truth

Metric selectors, labels, and Transaction-only placement are shared product
contracts and remain consistent across breakpoints. This change does not audit
or redesign mobile layout or navigation. Automated mobile regressions will
guard the existing journey wherever shared components are touched.

## Risks / Trade-offs

- [Users may expect cards to react to filters] → Label the block “Resumen
  general” and display concise scope text.
- [Moving cards changes vertical order] → Verify the three desktop widths and
  keep existing card components/tokens.
- [Old help copy may preserve the contradiction] → Update only the affected
  filter/statistics statements, including removal of the nonexistent State
  filter, in the same change.

## Migration Plan

No data migration is required. Ship the presentation/selector change with
tests. Rollback is a normal code revert because stored data is untouched.

## Open Questions

None.
