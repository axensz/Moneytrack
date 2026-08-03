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
- [ ] 4.3 Verify in Chrome at 390×844, 1214×768, and 1440×900: light/dark, privacy toggle, launcher geometry, pending state, open/close/Escape focus, onboarding coexistence, zero document overflow, and no console errors.
- [ ] 4.4 Commit and push the focused implementation to PR #76, update its title/body to reflect the actual combined scope, and keep it draft until the fresh checks are green.
