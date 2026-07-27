## ADDED Requirements

### Requirement: Finance onboarding has two required steps
The onboarding checklist MUST complete after the user has at least one
financial account and one transaction. AI activation MUST remain optional and
MUST NOT block completion.

#### Scenario: Required finance steps are complete
- **WHEN** the user has an account and a transaction but has not enabled AI
- **THEN** the onboarding checklist MUST be complete and MUST no longer cover desktop task content

#### Scenario: User wants AI later
- **WHEN** onboarding is complete and AI is not configured
- **THEN** the existing AI teaser MUST remain available as the optional discovery path

### Requirement: Offline capability copy matches implementation
PWA, runtime, README, and help copy MUST state that cached financial data can be
consulted offline and that saving changes requires a connection.

#### Scenario: User reads offline guidance
- **WHEN** the app is installed or loses connectivity
- **THEN** no user-facing statement MUST promise automatic synchronization or queued writes

#### Scenario: Connection returns
- **WHEN** the app transitions from offline to online
- **THEN** the user MUST be told that saving is available again rather than that queued changes were synchronized

### Requirement: PWA welcome dialog has an accessible name
The PWA welcome modal MUST expose a non-empty accessible dialog name linked to
its visible title.

#### Scenario: Assistive technology opens PWA welcome
- **WHEN** the PWA welcome modal is displayed
- **THEN** its dialog role MUST be announced with the visible MoneyTrack welcome title

### Requirement: Loading state is announced
Lazy view fallbacks and content skeleton regions MUST expose concise status text
and busy state to assistive technology.

#### Scenario: A view chunk or list is loading
- **WHEN** visible content is replaced by a fallback or skeleton
- **THEN** the relevant region MUST expose `role="status"` or `aria-busy="true"` with a meaningful loading label

### Requirement: Statistics uses one actionable empty state
When there are no transactions, Statistics MUST show one view-level empty state
that explains why charts are unavailable and offers a route to Transactions.

#### Scenario: Statistics has no transactions
- **WHEN** the complete transaction history is empty
- **THEN** the view MUST show one explanation and a keyboard-operable action to register or reach Transactions instead of repeated chart-level empty cards

### Requirement: Recurring calendar reveals every payment
The system MUST NOT leave any recurring payment due in the displayed month
available only through a non-interactive `+N more` label.

#### Scenario: More than two payments share a day
- **WHEN** a desktop calendar cell contains more than two payments
- **THEN** a native keyboard-accessible disclosure MUST reveal every additional payment name, amount, and status

### Requirement: Verified contrast pairs meet WCAG AA
The closed audit inventory in the design MUST use existing semantic or brand
tokens that provide at least 4.5:1 contrast for text and 3:1 for non-text
interactive indicators in light and dark themes.

#### Scenario: User views DebtCard metadata or actions
- **WHEN** DebtCard metadata, Add/Subtract choices, or inline icon actions render
- **THEN** they MUST use the existing muted foreground, type-choice, success, destructive, and foreground tokens declared in the closed inventory

#### Scenario: User views TransactionForm duplicate warning
- **WHEN** a debt/TRM notice, duplicate detail, confirmation action, or cancel action renders
- **THEN** it MUST use the existing warning solid-on-muted token pair declared in the closed inventory

#### Scenario: User uses add-and-continue
- **WHEN** the non-warning add-and-continue action renders
- **THEN** it MUST use the existing solid brand pair declared in the closed inventory

#### Scenario: Application is offline
- **WHEN** OfflineIndicator renders
- **THEN** it MUST use the existing warning solid-on-muted token pair declared in the closed inventory

#### Scenario: Existing compliant DebtCard states render
- **WHEN** overdue or next-payment badges and primary action icons render
- **THEN** this change MUST preserve their existing color treatment

### Requirement: Production errors hide developer setup instructions
User-facing production error screens MUST offer recovery and support guidance
without exposing environment filenames, console setup steps, or development
commands.

#### Scenario: Global error occurs in production
- **WHEN** the ErrorBoundary displays its fallback
- **THEN** the user MUST see a retry/recovery path and internal setup details MUST remain in logs or development-only output

### Requirement: Help content matches live journeys
Help MUST document the final Plan, Statements, Recurring, onboarding, and
offline journeys without referencing removed controls or locations. The final
help update MUST preserve the Transaction-filter and Statistics metric-scope
contract established by `clarify-ledger-metric-scopes`.

#### Scenario: User reads Statements help
- **WHEN** help describes credit-card statements
- **THEN** it MUST identify the current modal entry point rather than claiming statements appear below account cards

#### Scenario: Final help update preserves metric guidance
- **WHEN** this change updates the remaining Help content
- **THEN** the metric-scope help assertions from `clarify-ledger-metric-scopes` MUST continue to pass

#### Scenario: User reads Financial Plan help
- **WHEN** the user opens the manual
- **THEN** Financial Plan MUST be included as a primary desktop journey

### Requirement: Shared state corrections preserve mobile journeys
Shared onboarding, PWA/offline, loading, Statistics, recurring-calendar, error,
and help corrections MUST preserve established mobile layouts, navigation, and
journeys.

#### Scenario: Shared-state mobile regressions run
- **WHEN** mobile regressions exercise every touched shared state surface
- **THEN** corrected semantics and copy MUST remain operable without a mobile-specific visual redesign
