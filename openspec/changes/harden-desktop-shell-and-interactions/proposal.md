## Why

At 1024 pixels the desktop tablist is wider than its content area and pushes
the whole application horizontally. Critical dialogs, notifications, rows,
filters, and forms also expose incomplete keyboard or accessible-name
contracts, despite the product's WCAG 2.1 AA requirement.

## What Changes

- Contain desktop navigation overflow and implement the complete keyboard tab
  pattern in primary navigation and Help.
- Add a main landmark, skip link, one canonical heading per desktop view,
  consistent heading focus, and scroll reset on navigation.
- Correct modal focus entry, trapping, and restoration.
- Make Notification Center a named, keyboard-operable dialog surface.
- Remove nested interactive semantics from transaction rows.
- Give debt, budget, and goal forms associated labels, grouped choices, error
  state, and submit semantics.
- Replace hybrid listbox/button behavior with one complete dropdown keyboard
  pattern.
- Preserve established mobile layouts and journeys while shared semantic fixes
  apply consistently across breakpoints.

## Capabilities

### New Capabilities

- `desktop-operability`: Defines responsive desktop navigation, landmarks,
  focus management, keyboard interaction, and accessible form behavior.

### Modified Capabilities

None.

## Impact

Primary impact is in the application shell, tab navigation, modal accessibility
hook, Header/Notification Center, TransactionItem, FilterDropdown, and the debt,
budget, and goal forms plus each desktop view's entry heading and focused
regression tests. Data models and financial write paths remain unchanged. No
new dependency is required. Shared controls receive mobile regression coverage,
but mobile-specific layout and navigation remediation remain deferred.
