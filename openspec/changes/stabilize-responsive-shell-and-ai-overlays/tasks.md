## 1. Protect existing OPSX and dirty work

- [x] 1.1 Record the current Git and OpenSpec status before implementation and preserve the uncommitted `useModalA11y` work plus the untracked `review-debts-view-refactor` artifacts.
- [x] 1.2 Run the focused Header, assistant, shell-navigation, and modal tests to establish a baseline without modifying or marking tasks in `harden-desktop-shell-and-interactions` or `align-desktop-states-and-help`.

## 2. Contain the mobile header test-first

- [x] 2.1 Add failing Header regressions for compact authenticated composition: priority actions remain named and at least 44×44, direct logout is absent, and `Cerrar sesión` is present in Settings.
- [x] 2.2 Add a failing desktop regression that preserves direct logout and the relative order of theme, privacy, notifications, settings, and logout controls.
- [x] 2.3 Recompose compact Header actions and flex constraints so secondary account actions move into Settings without shrinking touch targets or changing their behavior.
- [x] 2.4 Add a browser-verifiable shell assertion or focused layout test for no page-level horizontal overflow at 320, 390, and 639 CSS pixels.

## 3. Move assistant entry ownership to the shell

- [x] 3.1 Add failing tests for the state-aware shell entry: guest opens authentication, unconfigured authenticated user opens AI settings, and configured user opens the assistant.
- [x] 3.2 Add failing responsive tests that require a dedicated assistant entry only at spacious desktop widths and a labeled Settings entry at compact widths, with no fixed closed-state trigger over main content.
- [x] 3.3 Lift assistant open state and trigger restoration ownership into `AuthenticatedApp`, keep the chat lazy-loaded, and pass narrow controlled props/callbacks to `Header` and `AIChatBot`.
- [x] 3.4 Retire the floating `AITeaserButton` and closed `AIChatBot` launcher only after the replacement entry tests pass; remove orphaned tests/imports without changing authentication or Gemini configuration behavior.

## 4. Bound and operate the assistant panel

- [x] 4.1 Add failing assistant tests for the `Asistente MoneyTrack` non-modal dialog name, initial focus, visible close action, Escape close, and focus restoration.
- [x] 4.2 Add failing layout-contract tests for a fixed title/composer, one message-scroll owner, dynamic viewport sizing, and safe separation from header and mobile navigation.
- [x] 4.3 Introduce the shell workspace boundary and render the controlled panel inside it so 1270×571 and 390×844 retain visible panel controls without horizontal overflow.
- [x] 4.4 Implement feature-local open/close focus behavior without importing, editing, or changing the contract of `useModalA11y`.

## 5. Align assistant visuals and motion

- [x] 5.1 Add focused assertions or detector expectations that reject assistant-specific purple gradients, shimmer, pulse, bounce, elastic easing, and non-reduced decorative motion.
- [x] 5.2 Migrate only assistant surfaces, message bubbles, badges, actions, borders, and focus states to existing card, muted, foreground, primary, and semantic status tokens.
- [x] 5.3 Implement 150–250 ms state transitions and a `prefers-reduced-motion` path while preserving the approved shell, button, balance-card, and `RecurringStatsCards` gradients.

## 6. Verify the change

- [x] 6.1 Run focused Header, assistant, shell, authentication-entry, and AI action-confirmation regressions plus the existing modal suite to prove no shared-focus regression.
- [x] 6.2 Run type checking, linting, the complete automated test suite, and `npx --no-install next build`; verify that validation does not mutate `public/sw.js` or unrelated user files.
- [x] 6.3 Run the deterministic design detector and classify approved brand exceptions separately from real assistant or motion findings.
- [x] 6.4 Verify in Chrome at 390×844 and 1270×571 in light and dark themes, plus one wider desktop sanity check: `scrollWidth <= clientWidth`, all header/panel controls visible, closed assistant entry covers no audited CTA, Escape closes, and focus returns to the trigger.
- [x] 6.5 Re-run `openspec validate stabilize-responsive-shell-and-ai-overlays --type change --strict --no-interactive`, reconcile task evidence, and leave existing OPSX changes and dirty modal work untouched.
