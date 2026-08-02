## ADDED Requirements

### Requirement: Desktop navigation never widens the application
The system MUST keep the complete desktop tablist reachable without causing
page-level or application-content horizontal overflow.

#### Scenario: Navigation at 1024 pixels
- **WHEN** the viewport is 1024×768
- **THEN** all eight destinations MUST remain reachable inside a navigation-owned overflow surface and the main content scroller MUST NOT widen

#### Scenario: Navigation at wider desktop sizes
- **WHEN** the viewport is 1280×720 or 1440×900
- **THEN** the navigation MUST fit or scroll locally without clipping the active destination

### Requirement: Application tablists implement keyboard navigation
The primary desktop and Help tablists MUST each use one tabbable active tab and
MUST support Arrow Left, Arrow Right, Home, and End with wrapping behavior.

#### Scenario: User presses Arrow Right
- **WHEN** focus is on a desktop tab and the user presses Arrow Right
- **THEN** focus and active view MUST move to the next tab, wrapping after the last tab

#### Scenario: User presses Home or End
- **WHEN** focus is on a desktop tab and the user presses Home or End
- **THEN** focus and active view MUST move to the first or last tab respectively

#### Scenario: User navigates Help tabs
- **WHEN** focus is on a Help tab and the user presses Arrow Left, Arrow Right, Home, or End
- **THEN** focus and the selected Help panel MUST move according to the same wrapping tab pattern

### Requirement: Application exposes a main landmark and bypass link
The application MUST expose one main landmark with id `main-content` and a
keyboard-visible skip link that targets it.

#### Scenario: Keyboard user enters the application
- **WHEN** the user focuses the first bypass control and activates it
- **THEN** focus MUST move to the main application content

### Requirement: Every desktop view has an entry heading
Each active desktop view MUST expose one `h2` entry heading with the canonical
section title.

#### Scenario: User opens Statistics
- **WHEN** Statistics becomes active
- **THEN** an `h2` named “Estadísticas” MUST precede chart headings

### Requirement: View changes reset scroll and announce context
Every desktop view-change entry path MUST reset the application scroller to the
top and move focus to the active view heading.

#### Scenario: User changes view from a deep scroll position
- **WHEN** the user navigates using a tab, shortcut, notification, browser history, or cross-view action
- **THEN** the new view MUST start at scroll position zero and its heading MUST receive programmatic focus after the active view has mounted

### Requirement: Modal focus remains contained and recoverable
Shared modals MUST focus the first visible enabled control, trap Tab and
Shift+Tab within the active modal, and restore focus to the opening trigger.

#### Scenario: Modal contains disabled or hidden controls
- **WHEN** a modal opens with disabled or hidden controls before an enabled control
- **THEN** focus MUST skip non-tabbable controls and land on the first enabled visible control

#### Scenario: User presses Shift+Tab at the modal boundary
- **WHEN** focus is on the modal container, outside the modal, or on its first tabbable control
- **THEN** Shift+Tab MUST move focus to the last tabbable control inside the modal

#### Scenario: Modal closes
- **WHEN** an active modal closes
- **THEN** focus MUST return to the element that opened it when that element still exists

### Requirement: Notification Center is keyboard operable
Notification Center MUST expose a named dialog contract, move focus into the
panel, allow notification activation and deletion by keyboard, and restore
focus to its trigger.

#### Scenario: User opens Notification Center
- **WHEN** the trigger is activated
- **THEN** a dialog named “Notificaciones” MUST open and receive focus

#### Scenario: User navigates notification actions
- **WHEN** focus reaches a notification or its delete action
- **THEN** Enter or Space MUST perform the labeled action and the delete action MUST be visibly focusable without hover

### Requirement: Transaction rows avoid nested interactive controls
A transaction row MUST NOT act as an outer button containing edit, delete, or
expand buttons. Expansion MUST have one dedicated named control.

#### Scenario: User inspects a transaction row
- **WHEN** a transaction exposes edit, delete, and expand actions
- **THEN** assistive technology MUST encounter separate controls without an interactive ancestor

### Requirement: Critical finance forms expose semantic controls
Debt, budget, and goal creation and contribution blocks MUST use native form
submission, associated labels, grouped exclusive choices, named icon actions,
and programmatic validation state.

#### Scenario: User navigates a finance form by accessible name
- **WHEN** a screen reader or test queries each required input
- **THEN** every input, select, exclusive choice group, and icon-only action MUST have a stable accessible name

#### Scenario: User submits with Enter
- **WHEN** focus is in a valid finance form field and the user presses Enter
- **THEN** the existing submit behavior MUST run once and non-submit controls MUST NOT submit the form

#### Scenario: Validation fails
- **WHEN** existing business validation rejects a field
- **THEN** the control MUST expose invalid state and an associated error message

### Requirement: Custom filter dropdown uses one complete keyboard model
Transaction filter dropdowns MUST expose a coherent popup role and MUST manage
focus, arrow navigation, selection, Escape, and return to the trigger.

#### Scenario: User opens and navigates a filter
- **WHEN** the user opens a filter and presses Arrow Up, Arrow Down, Home, or End
- **THEN** focus MUST move among available options according to the selected popup pattern

#### Scenario: User closes a filter
- **WHEN** the user selects an option or presses Escape
- **THEN** the popup MUST close and focus MUST return to its trigger

### Requirement: Shared corrections preserve mobile journeys
The change MUST NOT alter the mobile navigation structure, mobile layout, or
established mobile journeys while shared semantic corrections apply across
breakpoints.

#### Scenario: Mobile navigation regression suite runs
- **WHEN** existing mobile navigation tests execute
- **THEN** the navigation structure and breakpoint behavior MUST remain unchanged

#### Scenario: Shared-control mobile regressions run
- **WHEN** mobile regressions exercise changed modals, notifications, transaction rows, finance forms, and filters
- **THEN** each journey MUST remain operable with the corrected accessible semantics and no mobile-specific layout redesign
