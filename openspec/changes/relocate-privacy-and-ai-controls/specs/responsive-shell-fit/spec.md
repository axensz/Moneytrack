## MODIFIED Requirements

### Requirement: Mobile header keeps priority actions reachable
The mobile header MUST keep brand, theme, notifications, and settings operable while privacy moves to the ledger overview and the assistant moves to its floating launcher.

#### Scenario: Authenticated mobile header renders
- **WHEN** the authenticated header renders below 640 CSS pixels
- **THEN** theme, notifications, and settings MUST remain fully visible with stable accessible names and touch targets of at least 44×44 CSS pixels, while privacy and assistant controls MUST NOT occupy the header

#### Scenario: User needs to sign out on mobile
- **WHEN** an authenticated mobile user opens the settings menu
- **THEN** a clearly labeled `Cerrar sesión` action MUST be available without horizontal scrolling or a clipped trigger

#### Scenario: Wider header renders
- **WHEN** the viewport is at least 640 CSS pixels wide
- **THEN** the direct logout action MUST remain visible, privacy and assistant controls MUST remain outside the header, and the relative order of theme, notifications, settings, and logout MUST be preserved

## ADDED Requirements

### Requirement: Ledger overview owns the global privacy action
The `Saldo actual` card MUST expose the only direct balance-privacy control, keep it immediately reachable, and continue using the existing global persisted preference.

#### Scenario: Values are visible
- **WHEN** `hideBalances` is false
- **THEN** the top-right action in `Saldo actual` MUST be named `Ocultar valores`, expose `aria-pressed="false"`, and provide at least a 44×44 CSS pixel target

#### Scenario: User hides values
- **WHEN** the user activates `Ocultar valores`
- **THEN** all existing consumers of the shared privacy preference MUST mask their monetary values immediately and the same action MUST become `Mostrar valores` with `aria-pressed="true"`

#### Scenario: Balances are settling
- **WHEN** the ledger overview displays `Calculando…`
- **THEN** the privacy action MUST remain visible and operable without replacing or falsifying the settling state

#### Scenario: Overview renders on a narrow viewport
- **WHEN** the `Saldo actual` card renders between 320 and 639 CSS pixels wide
- **THEN** its privacy action MUST remain inside the card without clipping, overlapping the label/value, or causing horizontal overflow

#### Scenario: User navigates away and returns
- **WHEN** the user changes views after hiding or showing values
- **THEN** the existing persisted privacy state MUST remain unchanged
