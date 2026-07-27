## Why

MoneyTrack currently lets Transaction filters alter summary figures that
remain visible after those filters disappear, while Statistics uses different
periods over full history. A financial product cannot show several plausible
truths without making each scope explicit.

## What Changes

- Give Balance, Income, Expenses, and Pending explicit, stable scopes that
  preserve the existing balance, real-movement, and used-credit formulas.
- Show the global summary only in the Transactions surface, after primary
  navigation.
- Keep Transaction list and CSV filters aligned without applying those filters
  silently to the global summary.
- Keep Statistics on its own visible periods and full-history datasets.
- Update affected labels, help text, and regression tests.
- Apply the shared metric contract consistently across breakpoints without a
  mobile-specific layout or navigation change.

## Capabilities

### New Capabilities

- `ledger-metric-scopes`: Defines the scope, placement, and labeling contract
  for global summary metrics, Transaction filters, CSV export, and Statistics.

### Modified Capabilities

None.

## Impact

Primary impact is in `AuthenticatedApp`, filtered summary selectors,
Transactions, Statistics, shared metric cards, help copy, and their tests.
Financial persistence, formulas, and external APIs do not change. No new
dependency is required. Shared metric components keep their existing mobile
journeys; mobile-specific visual remediation remains deferred.
