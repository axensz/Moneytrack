## MODIFIED Requirements

### Requirement: Assistant entry points never cover financial content
The shell MUST provide one named viewport-fixed assistant launcher outside the header and settings menu, keep it mounted as the stable focus-return target, and position it without covering primary CTAs, calendar controls, charts, filters, onboarding actions, or bottom navigation.

#### Scenario: Desktop user can open the assistant
- **WHEN** the viewport is at least 640 CSS pixels wide and the assistant panel is closed
- **THEN** one 48×48 CSS pixel launcher named for its current assistant action MUST remain reachable at the safe lower-right edge without changing content width

#### Scenario: Mobile or compact user can open the assistant
- **WHEN** the viewport is narrower than 640 CSS pixels and the assistant panel is closed
- **THEN** the launcher MUST render above `--shell-nav-h` and the bottom safe-area inset without covering the mobile navigation or widening the document

#### Scenario: Assistant is not configured
- **WHEN** a guest or authenticated user without completed AI configuration activates the launcher
- **THEN** the existing authentication or AI-configuration journey MUST open instead of mounting a non-functional chat panel

#### Scenario: Assistant panel is open
- **WHEN** the configured assistant panel is visible
- **THEN** the launcher MUST remain mounted as the return target but MUST be visually hidden, non-interactive, and absent from the sequential focus order

### Requirement: Assistant has predictable close and focus behavior
The assistant MUST expose a named non-modal dialog contract, move focus into the opened panel, close with its visible control or Escape, and restore focus to the floating launcher.

#### Scenario: Assistant opens from the launcher
- **WHEN** a user activates the configured assistant launcher
- **THEN** a dialog named `Asistente MoneyTrack` MUST open and focus MUST move to the composer or the first enabled panel control

#### Scenario: User closes with the visible control
- **WHEN** the user activates `Cerrar chat`
- **THEN** the panel MUST close, the launcher MUST become visible and operable, and focus MUST return to it

#### Scenario: User presses Escape
- **WHEN** focus is anywhere inside the open assistant and the user presses Escape
- **THEN** the panel MUST close, the launcher MUST become visible and operable, and focus MUST return to it

#### Scenario: User continues interacting with the application
- **WHEN** the assistant is open
- **THEN** the panel MUST remain non-modal and MUST NOT reuse or alter the shared modal focus-trap contract

## ADDED Requirements

### Requirement: Assistant launcher communicates state without decorative motion
The assistant launcher MUST use existing semantic tokens, expose its current action by accessible name, and communicate pending authorization as status without pulse, bounce, shimmer, or a new gradient.

#### Scenario: Guest sees the launcher
- **WHEN** no authenticated user exists
- **THEN** the launcher MUST be named `Inicia sesión para usar el asistente IA`

#### Scenario: Configuration is incomplete
- **WHEN** an authenticated user has not completed AI configuration
- **THEN** the launcher MUST be named `Activar asistente IA`

#### Scenario: Assistant is ready
- **WHEN** AI configuration and consent are complete
- **THEN** the launcher MUST be named `Abrir asistente IA`

#### Scenario: Authorization is pending
- **WHEN** an AI key exists but consent is incomplete
- **THEN** the launcher MUST expose a named pending-status indicator without relying on color alone

#### Scenario: Reduced motion is active
- **WHEN** `prefers-reduced-motion: reduce` is enabled
- **THEN** launcher state changes MUST occur instantly or with a short opacity-only transition
