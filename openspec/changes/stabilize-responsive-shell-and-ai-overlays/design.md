## Context

Chrome verification on the authenticated application found two root problems outside the scope of the existing desktop OPSX changes. First, the authenticated mobile header combines the MoneyTrack wordmark with five 44-pixel utility controls; at 390 CSS pixels the body reaches 421 pixels and the logout control is clipped. Second, `AIChatBot` and `AITeaserButton` own viewport-fixed launchers, while the open chat uses fixed height and a lower stacking level than the header. The launcher covers view-owned CTAs and the panel header can sit behind the application header at 1270×571.

`harden-desktop-shell-and-interactions` already owns the skip link and shared modal focus behavior. `align-desktop-states-and-help` already owns empty/loading states, Help accuracy, and the semantic treatment of `Agregar y continuar`. Local uncommitted changes currently implement part of the shared modal task. This change MUST remain disjoint from those surfaces.

The product remains a short-session personal-finance PWA. `PRODUCT.md`, `DESIGN.md`, and the current token files remain authoritative: violet is brand/action/selection, green/red/amber are state, gradients stay confined to their approved exceptions, targets are at least 44–48 pixels, and no new motion or UI dependency is introduced.

## Goals / Non-Goals

**Goals:**

- Eliminate mobile page-level overflow caused by the authenticated header.
- Keep all account and utility actions reachable without shrinking touch targets.
- Remove closed-state assistant collisions from financial views.
- Keep AI discoverable for guests, unconfigured users, and configured users.
- Keep the open panel inside the shell workspace at short desktop, mobile, and dynamic viewport heights.
- Provide reliable dialog naming, initial focus, Escape, close-button, and focus-restoration behavior without turning the assistant into a modal.
- Replace assistant-only decorative gradients and motion with existing tokens and product motion rules.

**Non-Goals:**

- Change financial calculations, persistence, Gemini request/response behavior, consent, or write confirmations.
- Redesign primary mobile navigation, the desktop tablist, Help, onboarding, empty states, Categories/people, metric cards, or Plan hierarchy.
- Modify the shared modal accessibility hook or mark tasks in existing OPSX changes.
- Remove the approved shell gradient, `.btn-primary`, `.card-balance`, or `RecurringStatsCards` gradients.
- Add a dependency, collision-detection engine, portal framework, or new global state library.

## Decisions

### Make the shell own assistant visibility and entry

`AuthenticatedApp` will own whether the configured assistant panel is open and which element triggered it. `AIChatBot` becomes a controlled panel instead of owning a floating closed state. It remains lazy-loaded and mounts only when the user can open a configured chat.

At widths of 1024 CSS pixels and above, the header utility group exposes a dedicated assistant action inserted without changing the relative order of the existing theme, privacy, notifications, settings, and logout actions. Below 1024 pixels, the existing settings menu is the canonical assistant entry. Its label and behavior reflect state: guest → sign in, authenticated but not ready → activate/configure, ready → open assistant.

This replaces both fixed launchers, including the current teaser. It is preferred over runtime collision detection because every view would otherwise need to report CTA geometry, and over reserving a permanent content gutter because that would penalize every financial surface for an optional capability.

### Recompose the authenticated mobile header instead of shrinking controls

Below 640 CSS pixels, `Cerrar sesión` moves into the existing settings menu. From 640 pixels upward it remains a direct header action. Theme, privacy, notifications, and settings keep their current order, accessible names, badges, and minimum target size. Containers receive the necessary `min-width: 0`, shrink, and overflow constraints so the wordmark and utility group negotiate the available width without widening the document.

Shrinking icons or targets was rejected because it would violate the 44–48 pixel touch contract. Hiding logout without an equivalent labeled menu action was rejected because it would reduce user control.

### Bound the panel to a shell workspace, not to the raw viewport

The shell will expose a relative workspace below the header. The assistant panel will be positioned inside that workspace and use the existing mobile-navigation height/safe-area contract for its lower bound. Dynamic viewport units and top/bottom insets replace the current combination of fixed `600px` height and `max-height` calculations.

The panel remains a right-side compact surface on desktop and becomes a bounded near-full-width surface on mobile. Its own message region scrolls; its title bar and composer remain fixed within the panel. The application header and mobile navigation remain outside the panel's bounds and therefore cannot cover its close control.

This is preferred over increasing `z-index` alone: a larger stacking number would reveal the close button but would still allow the panel to cover shell controls and would not solve the height contract.

### Use a non-modal dialog with feature-local focus management

The panel will expose `role="dialog"`, `aria-modal="false"`, and an accessible name linked to its visible title. On open, focus moves to the composer when enabled, otherwise to the first enabled action. Escape and the close action run the same close path and restore focus to the saved trigger.

Focus is not trapped because the assistant is intentionally non-modal and users may continue consulting the ledger. The implementation MUST NOT reuse or edit `useModalA11y`; a small feature-local effect or hook is acceptable only if it remains simpler than duplicating listeners and has focused tests.

### Align assistant surfaces to existing tokens

The assistant will use card, muted, foreground, border, primary-solid, primary-text, and semantic state tokens already defined by the product. Decorative purple gradients, shimmer, pulse, rotating/overscaling launcher motion, and gray-on-colored text are removed from the assistant. The assistant may use solid violet for the shell entry and primary actions; green/red/amber remain reserved for confirmed state.

No global palette expansion is required. The explicitly approved gradients elsewhere remain untouched.

### Verify behavior at the failure dimensions

Automated tests will cover the shell composition, responsive class/contract, state-dependent assistant entry, controlled open/close, dialog name, initial focus, Escape, restoration, and preservation of existing AI flows. Browser verification in Chrome will use at minimum 390×844 and 1270×571 in light and dark themes, plus a wider desktop sanity check. The acceptance signal is measured `scrollWidth <= clientWidth`, fully visible controls, and no overlap with the audited primary actions when the assistant is closed.

## Risks / Trade-offs

- [Moving logout into Settings adds one tap on mobile] → Keep the label explicit, retain direct desktop logout, and verify keyboard/touch reachability.
- [Removing the floating teaser reduces passive AI prominence] → Keep state-aware labeled entries in the shell and preserve pending/configuration indicators; AI remains optional by product contract.
- [Lifting chat visibility couples Header and AuthenticatedApp] → Pass narrow callbacks/state only; keep Gemini and conversation behavior inside `AIChatBot`.
- [Workspace-relative positioning may interact with existing scrolling] → Keep one scroll owner for main content and one for chat messages; test short viewport, mobile nav, and keyboard resize.
- [Feature-local Escape handling can conflict with other overlays] → Mount the panel only when open, stop only its handled Escape path, and verify settings/modal precedence.
- [Token cleanup can unintentionally flatten hierarchy] → Preserve hierarchy through weight, spacing, solid brand action, and semantic surfaces rather than gradients.
- [Existing dirty modal work overlaps accessibility vocabulary] → Do not edit `useModalA11y` or its tests; validate this change with separate assistant-focused regressions.

## Migration Plan

1. Add failing responsive Header and assistant entry tests without touching the existing modal diff.
2. Recompose compact Header actions and add the labeled mobile logout menu action.
3. Lift assistant open state to the shell, replace floating triggers with state-aware shell entries, and preserve lazy loading.
4. Reposition the controlled panel within the shell workspace and implement feature-local focus/close behavior.
5. Migrate assistant-only surfaces and motion to existing tokens and reduced-motion behavior.
6. Run focused tests, type checking, lint, the full test suite, and `npx --no-install next build` to avoid mutating `public/sw.js` through the wrapper build script.
7. Verify Chrome at the required viewports/themes, then reconcile OPSX task evidence. Rollback is a normal code revert; no data migration or compatibility bridge is required.

## Open Questions

None.
