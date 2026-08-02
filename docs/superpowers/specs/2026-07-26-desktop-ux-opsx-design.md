# MoneyTrack Desktop UX Remediation Design

## Context

The desktop audit on `main` confirmed that MoneyTrack's automated baseline is
healthy, but several UX contracts are either missing or contradictory. The
largest risks are not visual novelty; they are trust in financial numbers,
desktop navigation at narrow laptop widths, and keyboard/accessibility
behavior.

This program follows `PRODUCT.md` and `DESIGN.md`: MoneyTrack remains a
confident, warm, expert product UI with violet as its only brand hue. It does
not become a generic SaaS dashboard, add decorative gradients, or introduce a
new component library.

## Goals

1. Give every visible financial number one explicit, stable scope.
2. Make the desktop shell reachable and predictable at 1024, 1280, and
   1440-pixel widths.
3. Bring critical dialogs, notifications, transaction rows, filters, and
   forms to a reliable keyboard and screen-reader baseline.
4. Make onboarding, offline behavior, loading, empty states, calendar detail,
   and help text match the product's real behavior.
5. Preserve current financial calculations, persistence behavior, and
   mobile-specific layout, navigation, and journeys.

## Non-goals

- A mobile-specific UX audit, layout redesign, or navigation change. Corrections
  to shared semantics and truthful copy may apply at every breakpoint, with
  mobile regressions required.
- A new home/dashboard route.
- New budget or goal editing features.
- Backup/restore UI or new data capabilities.
- A broad rewrite of all raw color classes.
- A visual redesign of the AI assistant.
- New runtime dependencies or a new component framework.

## Delivery Strategy

The work is split into three OpenSpec changes. They stay on the same branch but
are implemented and verified sequentially so each change has a clear contract
and rollback boundary. Independent state work from sections 1–4 of the third
change may be developed in parallel with the shell change, but integration and
verification remain ordered 1 → 2 → 3. Only the final Help section is logically
blocked by both earlier changes.

### 1. `clarify-ledger-metric-scopes`

The global summary stops inheriting hidden Transaction filters. Its four
figures use explicit scopes:

- Balance: the current `totalBalance` result, preserving the existing
  account-strategy inclusion rules; credit-card available credit is excluded.
- Income and expenses: paid real movements in the current calendar month,
  excluding transfers and card payment/adjustment categories. Unpaid
  credit-card purchases stay out of Expenses.
- Pending: existing used credit across all credit-card accounts; it does not
  add loans, recurring payments, or other obligations.

The summary is shown only in the Transactions surface and is labeled as a
general overview. Transaction filters affect the transaction list and CSV
export together, but never silently alter the overview. Statistics keeps its
own visible period labels and full-history calculations.

### 2. `harden-desktop-shell-and-interactions`

The primary desktop navigation appears before the overview and owns its
overflow; it must never widen the page. Primary and Help tablists use roving
focus and support Arrow Left/Right, Home, and End. Changing view resets the
internal scroll container and moves focus to the active view heading after the
lazy view has mounted. Every desktop view exposes one canonical `h2` so this
behavior has a stable target.

The scrollable application area becomes `<main id="main-content">` and gains a
skip link. Critical interaction fixes use existing components and hooks:

- Modal focus starts on the first visible, enabled control, remains trapped,
  and returns to the trigger.
- Notification Center has a named dialog contract, keyboard-operable rows, and
  focus-visible secondary actions.
- A transaction row is no longer an outer button containing inner buttons;
  the chevron is the single expand/collapse control.
- Debt, budget, and goal creation use real forms, associated labels, grouped
  exclusive choices, and programmatic error state.
- Custom filter dropdowns implement one complete keyboard pattern rather than
  mixing listbox and button semantics.

### 3. `align-desktop-states-and-help`

The onboarding checklist is complete after account plus first transaction;
AI remains optional and discoverable through the existing teaser. Offline
copy consistently promises read-only access without a connection and requires
reconnection to save.

Statistics uses its canonical page heading and gains one consolidated empty
state. Loading surfaces announce status. The recurring calendar exposes all
payments through a native, keyboard-accessible disclosure for `+N more`. The
PWA welcome dialog receives a visible accessible name, and production errors
hide developer setup instructions. The closed contrast inventory in the third
OpenSpec design moves only confirmed failures to existing semantic status or
brand tokens. Help content is updated only after the functional behavior from
the first two changes is final.

## Data and Interaction Boundaries

No financial formula changes. Existing `totalBalance`,
`isRealMovement`/`useGlobalStats`, and `getCreditCardUsedCredit` rules remain
authoritative. The overview selects the current calendar-month subset before
applying the existing income/expense rules. The change is in which scope is
displayed and how that scope is communicated.

Navigation continues to use `ViewType` and URL-backed routing. Accessibility
behavior stays feature-local unless an existing shared hook already owns the
behavior, such as `useModalA11y`.

## Testing

Every behavioral correction starts with a failing test. Coverage includes:

- Summary scope and filter independence.
- Tab overflow containment, roving focus, and view-change scroll/focus.
- Modal focus boundaries and disabled/hidden controls.
- Notification focus, keyboard activation, and restoration.
- No nested interactive transaction row.
- Named form controls, exclusive choice state, errors, and Enter submission.
- Optional AI onboarding, honest offline copy, loading announcements, calendar
  disclosure, headings, and help text.
- Mobile regressions for every shared component changed, without performing a
  separate mobile visual audit.

Each change must pass targeted tests, the full Vitest suite, typecheck, lint,
build, and browser verification at 1024×768, 1280×720, and 1440×900 in light
and dark themes where relevant.

## Rollout

Implement in the listed order. Re-run the desktop audit after each change.
Do not start mobile remediation until the user explicitly opens that scope.
