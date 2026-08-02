## ADDED Requirements

### Requirement: Assistant entry points never cover financial content
The shell MUST provide labeled assistant entry points without rendering a closed-state viewport-fixed trigger over CTAs, calendar cells, charts, filters, or bottom navigation.

#### Scenario: Desktop user can open the assistant
- **WHEN** the viewport is at least 1024 CSS pixels wide
- **THEN** a named assistant action MUST be available from the shell without changing the relative order of existing header actions or covering main content

#### Scenario: Mobile or compact user can open the assistant
- **WHEN** the viewport is narrower than 1024 CSS pixels
- **THEN** the existing settings menu MUST expose a labeled assistant action and no floating assistant trigger MUST cover the active view

#### Scenario: Assistant is not configured
- **WHEN** a guest or authenticated user without completed AI configuration activates the assistant entry
- **THEN** the existing authentication or AI-configuration journey MUST open instead of mounting a non-functional chat panel

### Requirement: Assistant panel stays inside shell safe bounds
The open assistant panel MUST fit between shell-owned top and bottom boundaries and MUST keep its title and all header controls visible at every supported viewport.

#### Scenario: Short desktop viewport
- **WHEN** the assistant opens at 1270×571
- **THEN** its title, clear action, close action, message region, and composer MUST remain visible or reachable inside one panel-owned vertical scroll contract without being covered by the application header

#### Scenario: Mobile viewport
- **WHEN** the assistant opens at 390×844
- **THEN** the panel MUST fit within the viewport above the mobile navigation and safe-area inset without horizontal overflow

#### Scenario: Dynamic viewport height changes
- **WHEN** browser chrome or the virtual keyboard changes the dynamic viewport height
- **THEN** the assistant MUST recompute its usable bounds without moving its close control outside the visible area

### Requirement: Assistant has predictable close and focus behavior
The assistant MUST expose a named non-modal dialog contract, move focus into the opened panel, close with its visible control or Escape, and restore focus to the action that opened it.

#### Scenario: Assistant opens from the shell
- **WHEN** a user activates a configured assistant entry
- **THEN** a dialog named `Asistente MoneyTrack` MUST open and focus MUST move to the composer or the first enabled panel control

#### Scenario: User closes with the visible control
- **WHEN** the user activates `Cerrar chat`
- **THEN** the panel MUST close and focus MUST return to its opening trigger when that trigger still exists

#### Scenario: User presses Escape
- **WHEN** focus is anywhere inside the open assistant and the user presses Escape
- **THEN** the panel MUST close and focus MUST return to its opening trigger

#### Scenario: User continues interacting with the application
- **WHEN** the assistant is open
- **THEN** the panel MUST remain non-modal and MUST NOT reuse or alter the shared modal focus-trap contract

### Requirement: Assistant visual language follows the product contract
The assistant MUST use existing semantic and brand tokens so violet communicates brand, action, focus, or selection rather than decorative gradients, and status colors communicate only status.

#### Scenario: Assistant renders in light or dark theme
- **WHEN** the assistant panel, message bubbles, badges, or action cards render
- **THEN** their text, surfaces, borders, and focus states MUST use existing theme tokens and MUST meet the WCAG 2.1 AA contract declared by the product

#### Scenario: Detector inspects assistant styles
- **WHEN** the deterministic design detector scans `AIChatBot`
- **THEN** no assistant-specific purple gradient outside the exceptions declared by `PRODUCT.md` and `DESIGN.md` MUST remain

### Requirement: Assistant motion is purposeful and reducible
Assistant transitions MUST communicate opening, closing, or state change within the product motion timing and MUST NOT use bounce or elastic easing.

#### Scenario: Standard motion preference
- **WHEN** the assistant entry or panel changes state
- **THEN** the transition MUST complete with a smooth non-bouncing easing in approximately 150–250 milliseconds

#### Scenario: Reduced motion preference
- **WHEN** `prefers-reduced-motion: reduce` is active
- **THEN** assistant movement MUST reduce to an instant change or short crossfade without scale, rotation, shimmer, pulse, bounce, or elastic motion

### Requirement: Assistant financial behavior remains unchanged
The change MUST preserve AI authentication, consent, Gemini configuration, conversation state, action confirmation, and financial write safeguards.

#### Scenario: Existing assistant flows run
- **WHEN** configured, unconfigured, guest, message, action-confirmation, and rejection regressions execute
- **THEN** their existing functional outcomes MUST remain unchanged while the new shell and overlay contracts apply
