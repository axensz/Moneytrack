# Design Document: Balance Comparison Total Debt

## Overview

La mejora cambia cómo se calcula "Sin registrar" en el `BalanceComparisonSection`. En vez de comparar `usedCredit` solo contra el ciclo actual, se compara contra la **deuda total proyectada** (suma de todos los ciclos actuales y futuros). Esto elimina falsos positivos donde cuotas futuras inflaban el "Sin registrar".

Además, se agrega un estado "Al día" cuando el saldo real es despreciable (< $5,000 COP).

### Ejemplo con datos reales (Nu Crédito del usuario)

**Antes (solo ciclo actual):**
- Saldo real: $3,878,987
- Proyectado: $1,162,013 (solo junio)
- Sin registrar: $2,716,974 ← **FALSO** — la mayoría son cuotas futuras del celular

**Después (deuda total):**
- Saldo real: $3,878,987
- Proyectado (total): $3,645,000 (junio + 11 meses de cuotas celular + recurrentes)
- Sin registrar: $233,987 ← **CORRECTO** — son intereses/cargos que el banco suma

### Key Design Decisions

- **Backward compatible**: `totalProjectedDebt` es opcional en props. Si no se pasa, se usa `projectedTotal` (comportamiento actual).
- **No modifica `projectedTotal`**: El campo existente sigue siendo el statementTotal del ciclo actual. Se agrega un campo NUEVO `totalProjectedDebt`.
- **Threshold fijo**: $5,000 COP es razonable para Colombia (equivale a ~$1 USD, cubriría redondeos bancarios).
- **"Al día" reemplaza las 3 filas**: Cuando el saldo es despreciable, no tiene sentido mostrar comparación — se muestra un badge simple.

## Architecture

```mermaid
graph TD
    A[buildCardPaymentSchedule] --> B[Iterate cycles 0 to horizon]
    B --> C[Sum statementTotal per card for index >= 0]
    C --> D[totalProjectedDebt per card]
    D --> E[CardMonthPayment.totalProjectedDebt]
    
    E --> F[CardPaymentScheduleResult.consolidatedTotalProjectedDebt]
    
    F --> G[CardStatementsModal]
    G --> H[BalanceComparisonSection]
    H --> I{usedCredit <= 5000?}
    I -->|Yes| J[Show "Al día" badge]
    I -->|No| K[Show 3-row comparison with totalProjectedDebt]
```

## Components and Interfaces

### Modified: `CardMonthPayment` interface

```typescript
export interface CardMonthPayment {
  // ... existing fields ...
  projectedTotal?: number;           // statementTotal of current cycle (unchanged)
  totalProjectedDebt?: number;       // NEW: sum of statementTotal for all cycles index >= 0
}
```

### Modified: `CardPaymentScheduleResult` interface

```typescript
export interface CardPaymentScheduleResult {
  months: MonthGroup[];
  consolidatedProjectedTotal: number;       // existing
  consolidatedTotalProjectedDebt: number;   // NEW: sum across all cards
}
```

### Modified: `BalanceComparisonSectionProps`

```typescript
export interface BalanceComparisonSectionProps {
  usedCredit: number;
  projectedTotal: number;
  totalProjectedDebt?: number;        // NEW — when provided, used for "Sin registrar"
  formatCurrency: (amount: number) => string;
  hideBalances: boolean;
}
```

### Modified: `BalanceComparisonSection` component logic

```typescript
const UP_TO_DATE_THRESHOLD = 5000; // COP

export const BalanceComparisonSection = ({ usedCredit, projectedTotal, totalProjectedDebt, formatCurrency, hideBalances }) => {
  // "Al día" state
  if (usedCredit <= UP_TO_DATE_THRESHOLD) {
    return <UpToDateBadge />;
  }

  // Use totalProjectedDebt if available, otherwise fall back to projectedTotal
  const effectiveProjected = totalProjectedDebt ?? projectedTotal;
  const unrecorded = usedCredit - effectiveProjected;
  const label = totalProjectedDebt != null ? 'Proyectado (total)' : 'Proyectado';
  
  // ... render 3 rows with effectiveProjected and updated label ...
};
```

### Computation in `buildCardPaymentSchedule`

```typescript
// After iterating all cycles for a card:
let totalDebt = 0;
for (let index = 0; index <= horizon; index++) {
  const cycle = getCycleByIndex(...);
  const stmt = cardStatementForCycle(...);
  const rec = recurringForCycle(...);
  totalDebt += roundMoney(stmt.total + rec.total);
}
// Attach to current cycle's CardMonthPayment:
cardMonth.totalProjectedDebt = roundMoney(totalDebt);
```

## Data Models

No Firestore schema changes needed. All computation is client-side.

## Correctness Properties

### Property 7: Total projected debt includes all current+future cycles

*For any* credit card with transactions and recurring payments, `totalProjectedDebt` SHALL equal the sum of `statementTotal` for all cycles where `index >= 0`, up to the computed horizon.

**Validates: Requirements 1.1, 1.4**

### Property 8: "Al día" threshold behavior

*For any* `usedCredit <= UP_TO_DATE_THRESHOLD` (5000), the component SHALL render the "Al día" badge. *For any* `usedCredit > UP_TO_DATE_THRESHOLD`, the component SHALL render the three-row comparison.

**Validates: Requirements 3.1, 3.3**

### Property 9: Fallback to projectedTotal when totalProjectedDebt undefined

*For any* rendering where `totalProjectedDebt` is `undefined`, the component SHALL compute "Sin registrar" as `usedCredit - projectedTotal` (existing behavior preserved).

**Validates: Requirements 2.4**

## Error Handling

| Scenario | Handling |
|----------|----------|
| `totalProjectedDebt` is undefined | Fallback to `projectedTotal` (Req 2.4) |
| `usedCredit <= 0` | Show "Al día" (threshold check includes 0 and negatives) |
| No future cycles (contado only) | `totalProjectedDebt === projectedTotal` (Req 1.4) |
| `hideBalances` + "Al día" | Still show "Al día" badge (it's status, not money) (Req 3.5) |

## Testing Strategy

### Property-Based Tests

| Property | File | Description |
|----------|------|-------------|
| P7 | `useCardPaymentSchedule.property.test.ts` | totalProjectedDebt === Σ statementTotal for index >= 0 |
| P8 | `BalanceComparisonSection.property.test.tsx` | Threshold behavior with random usedCredit values |
| P9 | `BalanceComparisonSection.property.test.tsx` | Fallback behavior when totalProjectedDebt undefined |

### Unit Tests

| Scenario | File |
|----------|------|
| Card with 12-month installment → totalProjectedDebt includes all 12 cuotas | unit test |
| Card with no future charges → totalProjectedDebt === projectedTotal | unit test |
| "Al día" badge renders for usedCredit=772 (Gold case) | component test |
| "Al día" NOT rendered for usedCredit=3,878,987 (Nu case) | component test |
| Label changes to "Proyectado (total)" when totalProjectedDebt provided | component test |
