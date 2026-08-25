## 1. Privacy control in the ledger overview

- [x] 1.1 Extend `StatsCards.test.tsx` with failing contracts for visible/hidden values, `aria-pressed`, the dynamic label, a real 44×44 target, `balanceSettling`, and shared preference persistence.
- [x] 1.2 Replace the decorative `Wallet` badge in `StatsCards.tsx` with the only direct privacy action, using `EyeOff`/`Eye`, the existing `UIPreferencesContext`, and no new token or gradient.
- [x] 1.3 Remove the privacy action and preference dependency from `Header.tsx`; update `Header.test.tsx` so compact and desktop action-order checks require theme, notifications, settings, and logout only.

## 2. Single floating assistant launcher

- [x] 2.1 Add failing `AssistantLauncher.test.tsx` cases for guest, unconfigured, ready, pending authorization, 48×48 geometry, safe mobile/desktop offsets, reduced motion, and the mounted-but-inert open state.
- [x] 2.2 Create `src/components/chat/AssistantLauncher.tsx` as a presentational button using `Bot`, semantic primary tokens, a named pending indicator, `z-[50]`, and no decorative animation or gradient.
- [x] 2.3 Add an authenticated-shell contract test proving `AuthenticatedApp` owns guest/configuration/chat routing and passes the persistent launcher node to the existing `returnFocusRef`.
- [x] 2.4 Wire `AssistantLauncher` in `AuthenticatedApp.tsx`, keep it mounted while `AIChatBot` is open, and remove all assistant and pending-count props/entries from `Header` and its settings menu.

## 3. Focus and responsive regression

- [x] 3.1 Re-run and, only if necessary, extend `AIChatBot.test.tsx` so visible close and Escape both restore focus to the same floating launcher without changing the non-modal panel contract.
- [x] 3.2 Extend shell/header source contracts to reject legacy header/settings assistant entries, reject the header privacy control, and require launcher offsets above `--shell-nav-h` without changing mobile navigation.
- [x] 3.3 Run the focused Header, StatsCards, AssistantLauncher, AIChatBot, shell, contrast, and modal-focus suites; repair every regression before broad validation.

## 4. Integrated validation and PR evidence

- [x] 4.1 Run `npm run test:run`, `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`, and `openspec.cmd validate relocate-privacy-and-ai-controls --strict` on the final checkout.
- [x] 4.2 Rebuild the code-review graph and confirm the diff touches only the approved shell/privacy/assistant surfaces and their tests, with no financial, Firestore, debt, metric, or navigation-domain mutation.
- [x] 4.3 Verify in Chrome at 390×844, 1214×768, and 1440×900: light/dark, privacy toggle, launcher geometry, pending state, open/close/Escape focus, onboarding coexistence, zero document overflow, and no console errors.
- [x] 4.4 Commit and push the focused implementation to PR #76, update its title/body to reflect the actual combined scope, and keep it draft until the fresh checks are green.

## 5. Refinement after visual review

- [x] 5.1 Amend the SDD and add a failing `StatsCards` contract proving the privacy action shares the `Resumen general` row and is absent from every individual metric card.
- [x] 5.2 Move the existing 44×44 privacy action from `Saldo actual` to the overview heading row without changing its global state, persistence, icons, or masking behavior.
- [x] 5.3 Re-run focused and broad validation, rebuild the graph, complete task 4.3 in Chrome, update PR #76, and keep it draft until the new CI checks pass.

## 6. Brand return to Transactions

- [x] 6.1 Amend the SDD and add a failing `Header` behavior test proving the `MoneyTrack` brand is a named native action with a 44px target that invokes the Transactions callback.
- [x] 6.2 Wire the brand action to the existing `setView('transactions')` path without adding routes, state, dependencies, or a duplicate navigation implementation.
- [x] 6.3 Run focused and broad validation, rebuild the graph, update PR #76, and confirm the refreshed CI checks.

## 7. Global pointer affordance

- [x] 7.1 Add a failing design-system contract covering pointer cursors for semantic actions and blocked cursors for disabled controls.
- [x] 7.2 Add the minimal global semantic selectors in `utilities.css`, without styling non-interactive containers or introducing a dependency.
- [x] 7.3 Verify computed cursors in the browser, re-run broad validation, and publish the combined refinement through PR #76.

Validation evidence (2026-08-24, guest profile): at 390×844, 1214×768, and 1440×900 in light and dark themes, the privacy action remained in the `Resumen general` row at 44×44 CSS pixels, masked and restored every overview value with the expected dynamic name/`aria-pressed` state, and the 48×48 assistant launcher kept safe mobile and desktop offsets. The guest launcher opened the authentication dialog, moved focus to its close action, closed with Escape, restored focus to the launcher, produced zero document overflow, and logged no console errors. Task 4.3 remains unchecked because pending authorization, the configured authenticated assistant panel, and onboarding coexistence were not safely observable without altering persisted authentication, API-key, consent, or onboarding state.

Closure evidence (2026-08-24): the clean Chrome matrix was repeated at 390×844, 1214×768, and 1440×900 in light and dark themes. At 390×844 the onboarding dialog and 48×48 launcher coexisted without overlap or horizontal overflow; the privacy control measured 44×44, preserved focus, toggled `aria-pressed`/its dynamic name, masked all four overview amounts, and restored them. Guest authentication focus moved into `Cerrar` after the deferred modal mount and Escape returned it to the launcher. The configured authenticated assistant panel focused its composer on open and restored the persistent launcher on Escape; no assistant request was sent. Pending authorization was checked through a controlled visual-only state on the isolated server: the live launcher exposed `Autorización de IA pendiente` with `!`, remained 48×48 at `(330, 712)–(378, 760)`, and kept zero overflow; the temporary state was reverted immediately and a final DOM check confirmed the badge absent. The guest matrix logged zero console errors. Focused validation passed 93/93 and broad Vitest passed 1,401 tests with 14 intentional skips; typecheck, lint without warnings, and the static build passed. PR #76 is already merged and its relevant GitHub Actions checks are successful, superseding the earlier draft gate.
