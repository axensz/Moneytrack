## 1. Correct onboarding and offline promises

- [ ] 1.1 Add a failing onboarding regression test proving that an account plus a transaction completes the required checklist without AI activation.
- [ ] 1.2 Change onboarding completion to the two required finance steps while preserving the existing AI teaser as an optional discovery path.
- [ ] 1.3 Add failing copy and accessibility tests for the offline runtime states, PWA welcome dialog name, and read-offline/write-online capability contract.
- [ ] 1.4 Align PWA and runtime copy with cached read access and connection-required saving, and connect the PWA dialog name to its visible title.

## 2. Make view and data states understandable

- [ ] 2.1 Add failing tests that require announced busy or status text for lazy and skeleton loading regions.
- [ ] 2.2 Add accessible loading contracts without changing the established visual hierarchy.
- [ ] 2.3 Add a failing Statistics test for one view-level empty explanation and a keyboard-operable route to Transactions when complete history is empty.
- [ ] 2.4 Consolidate empty Statistics into the actionable view-level state while preserving chart descriptions when data exists.

## 3. Reveal crowded recurring-calendar days

- [ ] 3.1 Add a failing test proving that a day with more than two recurring payments exposes every hidden name, amount, and status through a keyboard-accessible control.
- [ ] 3.2 Replace the non-interactive `+N more` label with a native `details` and `summary` disclosure while preserving the compact two-item preview.

## 4. Correct verified visual and error states

- [ ] 4.1 Add focused light/dark contrast assertions for every DebtCard, TransactionForm, and OfflineIndicator row in the design's closed inventory, plus production-safe ErrorBoundary copy.
- [ ] 4.2 Replace only the closed inventoried pairs with the specified existing type-choice, muted-foreground, warning, success, destructive, or solid-brand tokens.
- [ ] 4.3 Add a regression assertion that preserves the already-compliant DebtCard overdue/next-payment badges and primary action icons.
- [ ] 4.4 Keep developer setup details in development diagnostics and give production users only recovery and support guidance.

## 5. Align help with the running product

- [ ] 5.1 Confirm `clarify-ledger-metric-scopes` and `harden-desktop-shell-and-interactions` are implemented and their focused help and navigation tests pass.
- [ ] 5.2 Update Help and README copy for Financial Plan, Statements, Recurring, onboarding, and offline behavior without redefining the established metric-scope contract.
- [ ] 5.3 Add focused copy assertions that reject the obsolete statement location, optional-AI requirement, and offline queue promise, then rerun the metric-scope help assertions from the first change.

## 6. Verify the change

- [ ] 6.1 Run the focused onboarding, PWA, loading, Statistics, recurring-calendar, status-token, ErrorBoundary, and help test suites.
- [ ] 6.2 Run focused mobile regressions for every touched shared onboarding, PWA/offline, loading, Statistics, recurring-calendar, and error journey.
- [ ] 6.3 Run type checking, linting, the production build, and the complete automated test suite.
- [ ] 6.4 Verify checklist completion, offline messaging, inherited view headings, empty/loading states, recurring disclosures, and confirmed contrast pairs in the running desktop app at 1024, 1280, and 1440 pixel widths in light and dark themes.
