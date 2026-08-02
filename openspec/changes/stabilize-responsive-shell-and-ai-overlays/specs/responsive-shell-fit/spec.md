## ADDED Requirements

### Requirement: Mobile shell stays within the viewport
The authenticated application shell MUST keep its header, main content, and fixed navigation within the layout viewport without page-level horizontal overflow.

#### Scenario: Authenticated user opens the app at 390 pixels
- **WHEN** an authenticated user opens any primary view at 390×844 in light or dark theme
- **THEN** the document and application shell MUST have no horizontal overflow and no header control MUST be clipped by the right or left viewport edge

#### Scenario: Supported narrow mobile width
- **WHEN** the layout viewport is between 320 and 639 CSS pixels wide
- **THEN** the shell MUST reflow or relocate secondary actions instead of widening the document

### Requirement: Mobile header keeps priority actions reachable
The mobile header MUST keep the brand and its priority utility actions operable while placing secondary account actions in an existing labeled menu when space is constrained.

#### Scenario: Authenticated mobile header renders
- **WHEN** the authenticated header renders below 640 CSS pixels
- **THEN** theme, balance privacy, notifications, and settings MUST remain fully visible with stable accessible names and touch targets of at least 44×44 CSS pixels

#### Scenario: User needs to sign out on mobile
- **WHEN** an authenticated mobile user opens the settings menu
- **THEN** a clearly labeled `Cerrar sesión` action MUST be available without horizontal scrolling or a clipped trigger

#### Scenario: Wider header renders
- **WHEN** the viewport is at least 640 CSS pixels wide
- **THEN** the direct logout action MUST remain visible and the relative order of the existing theme, privacy, notifications, settings, and logout controls MUST be preserved

### Requirement: Shell respects device safe areas
The mobile shell MUST account for safe-area insets without reducing the visible or interactive portion of header and navigation controls below their required size.

#### Scenario: Device exposes top or side safe-area insets
- **WHEN** the browser reports non-zero safe-area insets
- **THEN** header content MUST remain inside the safe area and the document MUST still avoid horizontal overflow

### Requirement: Responsive shell changes preserve application behavior
Responsive shell corrections MUST NOT alter financial navigation destinations, authentication behavior, balance privacy state, notification behavior, or desktop content width beyond what is necessary to contain shell controls.

#### Scenario: Existing shell regressions run
- **WHEN** desktop and mobile shell regression suites execute
- **THEN** all existing destinations and utility actions MUST retain their current behavior while satisfying the new viewport-fit contract
