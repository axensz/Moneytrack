## ADDED Requirements

### Requirement: Global summary metrics have explicit stable scopes
The system MUST calculate the desktop general overview independently from
Transaction account, category, date, and search filters.

#### Scenario: Consolidated balance scope
- **WHEN** the general overview is displayed
- **THEN** Balance MUST use the current `totalBalance` result with the existing account-strategy inclusion rules, including exclusion of credit-card available credit

#### Scenario: Monthly flow scope
- **WHEN** the general overview is displayed
- **THEN** Income and Expenses MUST represent paid real movements in the current calendar month across all accounts and categories
- **THEN** those figures MUST exclude transfers and card payment or adjustment categories, and Expenses MUST exclude unpaid credit-card purchases

#### Scenario: Outstanding scope
- **WHEN** the general overview is displayed
- **THEN** Pending MUST use the existing used-credit calculation across all credit-card accounts
- **THEN** Pending MUST NOT add loans, recurring payments, or other obligations

#### Scenario: Transaction filters change
- **WHEN** a user changes an account, category, date, or search filter in Transactions
- **THEN** the general overview values MUST remain on their declared scopes

### Requirement: General overview scope is visible
The system MUST label the summary as a general overview and MUST communicate
the period or as-of scope needed to interpret each figure.

#### Scenario: User reads overview labels
- **WHEN** the overview is visible
- **THEN** the user MUST be able to distinguish current balance, current-month flow, and current outstanding values without opening a filter

### Requirement: General overview belongs to Transactions
The system MUST render the global overview only in the Transactions surface and
MUST place primary desktop navigation before it.

#### Scenario: User opens a non-Transaction view
- **WHEN** the active view is Accounts, Recurring, Loans, Budgets, Goals, Statistics, or Financial Plan
- **THEN** the general overview cards MUST NOT precede that view's task content

### Requirement: Transaction list and export share one filter result
The system MUST apply the same account, category, date, and search filters to
the visible Transaction result and CSV export.

#### Scenario: User exports a filtered search
- **WHEN** the user applies Transaction filters and exports CSV
- **THEN** the exported rows MUST match the filtered result set rather than the unfiltered history

### Requirement: Statistics owns and communicates its periods
The Statistics view MUST use its complete-history source and MUST communicate
the period of each chart or custom query without claiming that Transaction
filters apply.

#### Scenario: User switches from filtered Transactions to Statistics
- **WHEN** Transaction filters are active and the user opens Statistics
- **THEN** Statistics MUST display its own period labels and MUST NOT imply that the hidden Transaction filters constrain its charts

### Requirement: Help text matches metric behavior
Help content MUST describe the general overview, Transaction filters, export,
and Statistics using the same scope rules as the running application.

#### Scenario: User reads filter help
- **WHEN** the user opens help after this change
- **THEN** help MUST NOT state that Transaction filters alter Statistics or the general overview
- **THEN** help MUST NOT mention a nonexistent Transaction State filter

### Requirement: Shared metric corrections preserve mobile journeys
The metric scope contract MUST remain consistent across breakpoints without
introducing a mobile-specific layout or navigation redesign.

#### Scenario: Shared mobile regression runs
- **WHEN** metric, Transaction, and export regression tests run in the existing mobile presentation
- **THEN** the same scope and filter contracts MUST hold and the established mobile journey MUST remain operable
