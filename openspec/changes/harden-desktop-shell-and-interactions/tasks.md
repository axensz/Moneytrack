## 1. Harden the desktop shell and navigation

- [ ] 1.1 Add failing tests for navigation-owned overflow at 1024 pixels and for the Arrow Left, Arrow Right, Home, End, wrapping, and roving-tabindex behavior in primary navigation and Help.
- [ ] 1.2 Add failing tests for the skip link, `main-content` landmark, one canonical `h2` per desktop view, scroll reset, and active-view heading focus across every desktop view-change entry path.
- [ ] 1.3 Confine horizontal overflow to the desktop navigation, keep focused and selected tabs visible, and prevent the application content scroller from widening.
- [ ] 1.4 Implement the complete keyboard tab model in primary navigation and Help without changing mobile navigation behavior.
- [ ] 1.5 Add the main landmark, skip link, and the eight canonical desktop view headings with stable focus targets.
- [ ] 1.6 Centralize tabs, shortcuts, notifications, browser history, and cross-view actions on one view-change path that resets scroll and focuses the heading after lazy mount.
- [ ] 1.7 Add focused Suspense and browser-history tests that prove post-mount focus and scroll reset occur once.

## 2. Repair shared modal focus

- [ ] 2.1 Add failing shared-modal tests for initial focus past hidden or disabled controls, forward and reverse boundary trapping, outside focus recovery, and trigger restoration.
- [ ] 2.2 Update the shared modal accessibility hook to identify only visible enabled tabbable elements, trap both Tab directions, and restore the saved trigger.
- [ ] 2.3 Run every existing modal regression test to prove the shared change preserves dialog behavior.

## 3. Remove ambiguous interactive structures

- [ ] 3.1 Add failing Notification Center tests for its accessible dialog name, initial focus, keyboard activation and deletion, focus-visible delete action, Escape behavior, and trigger restoration.
- [ ] 3.2 Implement the Notification Center dialog and notification actions with native interactive elements and stable accessible names.
- [ ] 3.3 Replace the TransactionItem false-negative test with assertions that reject an interactive row ancestor and require a named expansion control.
- [ ] 3.4 Make the TransactionItem container non-interactive and delegate expansion exclusively to its chevron while preserving edit and delete behavior.

## 4. Make finance forms and filters semantic

- [ ] 4.1 Add failing accessible-name, Enter submission, button-type, grouped-choice, and validation-state tests for debt, budget, and goal creation and contribution forms.
- [ ] 4.2 Convert the affected blocks to native forms with associated labels, fieldsets, explicit button types, named icon actions, and programmatically associated errors.
- [ ] 4.3 Add failing keyboard tests for popup role consistency, Arrow Up, Arrow Down, Home, End, selection, Escape, and focus return in Transaction filter dropdowns.
- [ ] 4.4 Implement one complete keyboard model for the custom filter dropdowns without changing their filtering results.

## 5. Verify the change

- [ ] 5.1 Run the focused shell, navigation, modal, notification, TransactionItem, finance-form, and filter tests.
- [ ] 5.2 Run focused mobile regressions for navigation and every changed shared modal, notification, transaction row, finance form, and filter.
- [ ] 5.3 Run type checking, linting, the production build, and the complete automated test suite.
- [ ] 5.4 Verify keyboard-only operation, focus order, focus restoration, and absence of page-level horizontal overflow in the running desktop app at 1024, 1280, and 1440 pixel widths.
