## 1. Lock the scope contract with tests

- [x] 1.1 Add failing selector and component tests proving that the general overview preserves the existing `totalBalance`, paid-real-movement, and credit-card-used-credit formulas on their declared current and current-month scopes.
- [x] 1.2 Add boundary cases for transfers, card payment or adjustment categories, unpaid credit-card purchases, non-credit obligations, and the first and last instant of the current calendar month.
- [x] 1.3 Add failing regression tests proving that Transaction account, category, date, and search filters do not change the general overview.
- [x] 1.4 Add failing rendering tests proving that primary navigation precedes the overview, that the overview appears only in Transactions, and that its scope labels are visible.
- [x] 1.5 Preserve or extend the regression test proving that the visible Transaction result and CSV export use the same account, category, date, and search filters.

## 2. Separate overview and Transaction state

- [x] 2.1 Derive the general overview from complete balance history without consuming Transaction filter state.
- [x] 2.2 Refactor the overview component interface and copy so each value exposes its declared current, current-month, or outstanding scope.
- [x] 2.3 Render the overview inside the Transactions surface after primary navigation and remove it from every non-Transaction view.

## 3. Align Statistics and guidance

- [x] 3.1 Add or update tests that assert Statistics uses complete history, exposes its own period labels, and does not inherit hidden Transaction filters.
- [x] 3.2 Update Statistics scope copy and only the affected Transaction-filter and Statistics help text, including removal of the nonexistent State filter, so the running UI and guidance describe the same metric contract.

## 4. Verify the change

- [x] 4.1 Run the focused overview, Transaction filtering, CSV export, Statistics, and help test suites.
- [x] 4.2 Run focused mobile regressions for the shared overview, Transaction-filter, and export paths without performing mobile visual remediation.
- [x] 4.3 Run type checking, linting, the production build, and the complete automated test suite.
- [x] 4.4 Verify overview placement, labels, and filter independence in the running desktop app at 1024, 1280, and 1440 pixel widths in light and dark themes.
