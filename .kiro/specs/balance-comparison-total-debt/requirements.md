# Requirements Document

## Introduction

Actualmente el `BalanceComparisonSection` compara el saldo real del banco (`usedCredit`) contra el `projectedTotal` del ciclo actual únicamente. Esto genera un "Sin registrar" inflado cuando la tarjeta tiene cuotas futuras — el banco suma toda la deuda pendiente (incluyendo cuotas de meses siguientes) mientras que la app solo muestra lo que toca en el mes actual.

Este spec mejora la comparación para usar la **deuda total proyectada** (suma de `statementTotal` de todos los ciclos presentes y futuros) en vez de solo el ciclo actual, y agrega un indicador "Al día" cuando el saldo real es despreciable.

## Glossary

- **usedCredit**: Cupo utilizado real reportado por el banco. Incluye TODA la deuda: cuotas actuales + cuotas futuras + intereses + cargos no importados.
- **projectedTotal** (actual): `statementTotal` del ciclo actual (index === 0). Solo lo que se factura ESTE mes.
- **totalProjectedDebt** (nuevo): Suma de `statementTotal` de todos los ciclos con `index >= 0` (actual + futuros). Representa la deuda total que la app conoce.
- **unrecordedAmount**: `usedCredit - totalProjectedDebt`. Lo que el banco cobra que la app NO explica (compras no importadas, intereses, cargos ocultos).
- **upToDate**: Condición cuando `usedCredit` es menor a un umbral (ej: $5,000 COP), indicando que la tarjeta está prácticamente saldada.

## Requirements

### Requirement 1: Calcular deuda total proyectada por tarjeta

**User Story:** As a user, I want the "Proyectado" value to reflect ALL debt the app knows about (current + future installments), so that the "Sin registrar" value only shows truly unknown charges.

#### Acceptance Criteria

1. THE `useCardPaymentSchedule` hook SHALL compute `totalProjectedDebt` per card as the sum of `statementTotal` for all cycles where `index >= 0` (current cycle + all future projected cycles).
2. THE `useCardPaymentSchedule` hook SHALL expose `totalProjectedDebt` per card as a field on the `CardMonthPayment` entries of the current cycle (`index === 0`), alongside the existing `projectedTotal`.
3. THE `CardPaymentScheduleResult` interface SHALL include `consolidatedTotalProjectedDebt` (sum of `totalProjectedDebt` across all cards) as a top-level field.
4. WHEN a card has no future cycles with charges (no installments, no recurring), THEN `totalProjectedDebt` SHALL equal `projectedTotal` (statementTotal of current cycle only).
5. THE calculation SHALL exclude payments already made (`paidAmount`) — `totalProjectedDebt` represents gross charges, not net balance.

### Requirement 2: Actualizar BalanceComparisonSection para usar deuda total

**User Story:** As a user, I want to see the comparison between my real bank balance and the TOTAL debt the app projects (not just this month), so I can accurately identify truly unrecorded purchases.

#### Acceptance Criteria

1. THE `BalanceComparisonSection` SHALL accept a new prop `totalProjectedDebt` (optional, for backward compat).
2. WHEN `totalProjectedDebt` is provided, THE component SHALL use it instead of `projectedTotal` to compute "Sin registrar": `usedCredit - totalProjectedDebt`.
3. THE component SHALL display "Proyectado (total)" as the label when using `totalProjectedDebt`, to differentiate from per-cycle projection.
4. WHEN `totalProjectedDebt` is NOT provided (undefined), THE component SHALL fall back to using `projectedTotal` (existing behavior preserved).
5. THE component SHALL continue formatting all values with `formatCurrency` and respecting `hideBalances`.

### Requirement 3: Indicador "Al día" cuando saldo real es despreciable

**User Story:** As a user, when my credit card has almost no balance, I want to see a clear "Al día" indicator instead of a confusing pending status, so I know at a glance that I owe nothing significant.

#### Acceptance Criteria

1. WHEN `usedCredit` is less than or equal to 5000 COP (configurable threshold), THE `BalanceComparisonSection` SHALL display a green "Al día" badge instead of the three-row comparison.
2. THE "Al día" badge SHALL display the text "Al día" with a green/emerald style (consistent with "Pagado" badge styling).
3. WHEN `usedCredit` is greater than the threshold, THE component SHALL display the normal three-row comparison.
4. THE threshold SHALL be defined as a constant (`UP_TO_DATE_THRESHOLD = 5000`) in the component file.
5. WHILE `hideBalances` is active and the card is "Al día", THE component SHALL still display "Al día" (it's a status, not a monetary value).
