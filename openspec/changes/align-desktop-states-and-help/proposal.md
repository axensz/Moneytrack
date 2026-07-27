## Why

Several desktop states contradict the product's real behavior: optional AI
blocks onboarding completion, PWA copy promises offline writes that the app
rejects, some loading and empty states are silent, calendar items are hidden,
and help content describes obsolete journeys.

## What Changes

- Complete onboarding after the two required finance steps while keeping AI
  optional through the existing teaser.
- Align PWA, runtime, README, and help copy to a read-offline/write-online
  contract.
- Give the PWA welcome dialog its visible accessible name and remove developer
  setup instructions from production error UI.
- Add announced loading and actionable empty states.
- Expose all recurring payments hidden behind `+N more`.
- Replace only the closed, audit-confirmed set of low-contrast DebtCard,
  TransactionForm, and OfflineIndicator pairs with existing semantic or brand
  tokens.
- Synchronize help content with the final Plan, Statements, Recurring,
  onboarding, and offline journeys after the metric and shell changes.
- Preserve established mobile layouts and journeys while shared state and copy
  corrections apply consistently across breakpoints.

## Capabilities

### New Capabilities

- `desktop-state-guidance`: Defines truthful onboarding/offline messaging,
  loading and empty-state communication, recurring-day detail, contrast, and
  help accuracy.

### Modified Capabilities

None.

## Impact

Primary impact is in onboarding, PWA/offline surfaces, Statistics, loading
fallbacks, recurring calendar, a small confirmed set of status-color usages,
ErrorBoundary, README/help content, and their tests. Shared components receive
mobile regression coverage, but mobile-specific layout, navigation, data
capabilities, and the AI assistant's visual design remain out of scope.
