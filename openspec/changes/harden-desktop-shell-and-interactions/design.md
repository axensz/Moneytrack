## Context

The primary tablist is a single `nowrap` row whose measured width exceeds its
945-pixel container at a 1024-pixel viewport. The overflow is inherited by the
application scroller. The tabs expose ARIA roles without the corresponding
keyboard model.

The same implementation-level gap appears in shared modal focus, Notification
Center, TransactionItem, custom filters, and debt/budget/goal forms: visual
controls exist, but their semantic and keyboard contracts are incomplete.

## Goals / Non-Goals

**Goals:**

- Keep all desktop navigation reachable without page-level horizontal scroll.
- Provide landmarks, bypass navigation, canonical view headings, predictable
  scroll, and view focus.
- Correct the root behavior once in shared hooks where ownership is shared.
- Make critical financial forms and interactive rows operable by keyboard and
  understandable by accessible name/state.

**Non-Goals:**

- Redesign mobile navigation or layout.
- Replace the current router or modal component library.
- Restyle every form or introduce new form abstractions.
- Add validation rules beyond existing business validation.

## Decisions

### Confine overflow to the tab navigation

The desktop nav will have `max-width: 100%` and its own horizontal overflow
surface; the tablist remains a single `min-width: max-content` row. Focusing a
tab will bring it into view. This preserves all eight destinations and avoids a
new “More” information architecture.

### Implement the ARIA tabs keyboard model locally

`TabNavigation` and the Help tablist will use roving `tabIndex`. Arrow
Left/Right wraps, Home moves to the first tab, End to the last, and activation
updates the selected panel. A small shared keyboard helper is acceptable only
if using it is simpler than two local handlers and does not introduce a new
abstraction layer.

### Centralize view-change behavior

The shell will provide `<main id="main-content">` and a skip link. Each desktop
view will expose one canonical `h2`. A single view-change callback will update
routing and reset the internal scroller, then record a pending focus target.
The active view wrapper will focus its heading after the lazy view mounts. All
desktop entry paths—tabs, shortcuts, notifications, browser history, and
cross-view actions—will use this path.

### Repair focus at the shared modal hook

`useModalA11y` will derive actually tabbable elements by excluding disabled,
hidden, and non-visible nodes. It will focus the first valid control, use the
container only when none exists, treat container/outside focus as a boundary,
and restore the saved trigger.

This is preferred over per-modal patches because every `BaseModal` shares the
same root cause.

### Use native interactive elements

Notification rows become buttons/links with a named dialog container and focus
restoration. The TransactionItem outer row loses `role="button"`; only its
chevron expands. Debt, budget, and goal blocks become native forms with labels
and fieldsets. Custom dropdowns use one complete menu/listbox model rather than
mixed roles.

### Preserve mobile-specific presentation

The main landmark and semantic corrections apply to shared controls at every
breakpoint. Desktop overflow, desktop tab routing, and desktop heading focus
stay behind the existing desktop presentation. No mobile navigation structure
or layout is redesigned. Focused mobile regressions cover every changed shared
modal, notification, transaction row, form, and filter.

## Risks / Trade-offs

- [Navigation scrollbar is visible at narrow desktop widths] → Keep it local,
  compact, and test that focused/selected tabs scroll into view.
- [Central view focus can feel abrupt] → Focus without forced smooth motion and
  respect reduced-motion preferences.
- [Lazy views do not expose their heading immediately] → Store the pending
  target and focus it from the mounted active-view wrapper; cover Suspense and
  browser-history paths.
- [Shared modal changes affect many dialogs] → Add boundary tests first and run
  all modal regression tests.
- [Form semantics can trigger accidental submission] → Define button types
  explicitly and test Enter behavior.

## Migration Plan

Implement in small TDD batches: shell/navigation, shared modal, notifications
and transaction row, then forms/filters. No data migration is required.
Rollback is a code revert.

## Open Questions

None.
