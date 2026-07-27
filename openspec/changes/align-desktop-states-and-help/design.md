## Context

The desktop state layer has several independent mismatches: onboarding counts
optional AI as required, PWA copy promises queued offline writes that the write
path rejects, Statistics lacks a consolidated empty state, some loaders are
silent, recurring calendar days hide entries, and help text describes removed
or relocated journeys.

The visual system already has semantic WCAG AA status tokens. The change should
reuse them rather than expand the palette or begin a broad theme migration.

## Goals / Non-Goals

**Goals:**

- Make onboarding and offline promises truthful.
- Communicate loading, empty, error, and calendar-detail states accessibly.
- Replace only verified contrast failures with existing tokens.
- Align user help with the final running journeys.

**Non-Goals:**

- Add offline write queuing.
- Redesign the AI assistant or require AI activation.
- Migrate every raw color class in the repository.
- Add new financial features or mobile-specific layouts and navigation.

## Decisions

### Make AI discovery independent from onboarding completion

The checklist is complete when an account and first transaction exist. AI is
removed from the completion denominator; the existing teaser remains its
discovery path. This is preferred over adding dismiss/minimize state because no
new persistence is required.

### Establish one offline capability contract

All PWA/runtime/help/README text will say that cached data can be consulted
offline and saving requires reconnection. The implementation will not add an
offline queue.

### Prefer native disclosure for crowded calendar days

The first two payments remain visible. Additional payments use a native
`details/summary` disclosure labeled with the hidden count. This avoids a new
popover, modal, portal, or focus trap.

### Consolidate state communication at view ownership

Statistics owns its scope description and one empty state before chart
composition. The desktop shell change owns canonical view headings. Lazy
fallbacks and skeleton regions expose `role="status"` or `aria-busy` with
concise text. Production errors keep internal setup details out of user-facing
copy.

### Apply token corrections only to verified failures

The implementation scope is limited to this inventory:

| Surface | Audited current pair | Required existing token pair |
| --- | --- | --- |
| `DebtCard` age, due-date, and return-day metadata | `text-gray-400 dark:text-gray-500` on card surfaces | `text-muted-foreground` |
| `DebtCard` inactive Add/Subtract choice | `text-gray-400` on `bg-gray-700` in dark mode | `btn-type btn-type-inactive` |
| `DebtCard` active Add choice | `bg-green-500 text-white` | `btn-type btn-type-active-success` |
| `DebtCard` active Subtract choice | `bg-red-500 text-white` | `btn-type btn-type-active-destructive` |
| `DebtCard` inline icon actions | `text-gray-400 hover:text-gray-600` on card surfaces | `text-muted-foreground hover:text-foreground` |
| `TransactionForm` debt and TRM notices | `text-amber-600` on card surfaces | `text-warning` |
| `TransactionForm` duplicate date and reason text | `text-amber-600` or `text-amber-500` on an amber warning surface | `text-warning` on `bg-warning-muted` |
| `TransactionForm` duplicate-confirm and cancel actions | `bg-amber-600 text-white` or `text-amber-600` on an amber surface | `bg-warning-muted text-warning` with `border-warning`, or `text-warning` for the text action |
| `TransactionForm` add-and-continue action | `bg-amber-500 text-white` although the action is not a warning | `bg-primary-solid text-primary-foreground` |
| `OfflineIndicator` banner | `bg-amber-500 text-white` | `bg-warning-muted text-warning` with `border-warning` |

No other raw color usage is part of this change. Intentional shell and
recurring gradients remain unchanged. Existing overdue/next-payment badges and
primary DebtCard action icons already pass their applicable thresholds and
MUST NOT be migrated in this change.

### Update help last

Help is edited after this change's functional work and after
`clarify-ledger-metric-scopes` and
`harden-desktop-shell-and-interactions`. This change updates Plan, Statements,
Recurring, onboarding, and offline guidance. It reruns the metric-scope help
tests from the first change but does not redefine their wording.

### Preserve mobile-specific presentation

Truthful onboarding/offline copy and shared accessibility states remain
consistent across breakpoints. This change does not perform the deferred mobile
visual audit or redesign mobile layout/navigation. Focused regressions guard
each touched shared journey.

## Risks / Trade-offs

- [AI teaser may be less prominent after checklist completion] → It remains
  globally discoverable and no longer blocks finance onboarding.
- [Native details can increase a calendar row's height] → Limit disclosure to
  days with more than two items and verify desktop layout.
- [Consolidated Statistics empty state hides chart-specific education] → Keep
  chart descriptions for non-empty data; use one actionable empty state only
  when there are no transactions.
- [Help drifts again] → Add focused copy assertions for contract-critical
  statements.
- [Shared copy or semantics regress mobile journeys] → Run focused mobile
  regressions while keeping visual review limited to the approved desktop
  widths.

## Migration Plan

No data migration is required. Onboarding/offline, data states, recurring
disclosure, contrast, and ErrorBoundary work are independent from the shell and
may be developed in parallel, while this change's integration remains after
the first two changes for a clear rollback boundary. Implement Help only after
both earlier contracts are final. Roll back through normal code/document
reverts.

## Open Questions

None.
