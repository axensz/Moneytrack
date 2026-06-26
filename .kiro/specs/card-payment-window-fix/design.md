# Design Document: Card Payment Window Fix

## Overview

This design addresses two improvements to the credit card payment calendar system in Moneytrack:

1. **Payment Detection Window Fix**: The current `paidForCycle` function uses a window of `(cycleEnd, next.cycleEnd]` — meaning it only recognizes payments made AFTER the cycle closes. In practice, users frequently pay early (before cycleEnd). The fix expands the lower bound to `previous.paymentDueDate` (exclusive), capturing early payments within the billing cycle.

2. **Real Balance vs Projected Indicator**: A new comparison section in `CardStatementsModal` shows the real card balance (`usedCredit` from the Account model) next to the app-projected total (`statementTotal` of the current cycle). The difference highlights unrecorded purchases.

3. **Projected_Total Calculation**: The `useCardPaymentSchedule` hook exposes `projectedTotal` per card in the current cycle's `MonthGroup.cards[]` entry, and a consolidated total at the hook return level, enabling the UI comparison without additional iteration.

### Key Design Decisions

- **Window bound change is backward-compatible**: The new window `(prev.paymentDueDate, next.cycleEnd]` is strictly a superset of the old window `(cycleEnd, next.cycleEnd]`. All previously detected payments remain detected; only early payments gain recognition.
- **`projectedTotal` equals `statementTotal` (not net of payments)**: This matches the real credit card statement total the bank reports, making the comparison with `usedCredit` meaningful.
- **UI conditionally renders**: The comparison section only appears when `usedCredit` is defined on the account, keeping the UI unchanged for users who haven't configured this field.

## Architecture

```mermaid
graph TD
    A[AccountsView] --> B[CardStatementsModal]
    B --> C[useCardPaymentSchedule]
    C --> D[buildCardPaymentSchedule]
    D --> E[paidForCycle - MODIFIED]
    D --> F[cardStatementForCycle]
    D --> G[recurringForCycle]
    E --> H[getCycleByIndex]
    
    B --> I[BalanceComparisonSection - NEW]
    I --> J[account.usedCredit]
    I --> K[MonthGroup.cards[].projectedTotal - NEW]
    
    D --> L[Hook return: consolidatedProjectedTotal - NEW]
```

**Data flow:**

1. `buildCardPaymentSchedule` iterates cycles per card, computing `statementTotal` (charges + recurring).
2. For cycles where `index <= 0`, `paidForCycle` sums payments within the **new** window: `(prev.paymentDueDate, next.cycleEnd]`.
3. The current cycle (`index === 0`) attaches `projectedTotal = statementTotal` to each `CardMonthPayment`.
4. The hook return now includes `consolidatedProjectedTotal` (sum across all cards for the current cycle).
5. `CardStatementsModal` receives the data and conditionally renders a `BalanceComparisonSection` per card.

## Components and Interfaces

### Modified: `paidForCycle` function

```typescript
/**
 * Sum of payments to the card within the Payment Detection Window.
 * NEW Window: (prev.paymentDueDate, next.cycleEnd]
 * - Lower bound (exclusive): paymentDueDate of previous cycle (index - 1)
 * - Upper bound (inclusive): cycleEnd of next cycle (index + 1)
 * - Edge case: if no previous cycle (index === -6), use cycleStart of evaluated cycle
 */
function paidForCycle(
  cutoffDay: number,
  paymentDay: number,
  index: number,
  payments: Transaction[],
  now: Date,
): number {
  const cyc = getCycleByIndex(cutoffDay, paymentDay, index, now);
  const next = getCycleByIndex(cutoffDay, paymentDay, index + 1, now);

  // Determine exclusive lower bound
  let lowerBound: Date;
  if (index <= -PAST_MONTHS) {
    // First cycle in history — use cycleStart as exclusive lower bound
    lowerBound = cyc.cycleStart;
  } else {
    const prev = getCycleByIndex(cutoffDay, paymentDay, index - 1, now);
    lowerBound = prev.paymentDueDate;
  }

  let sum = 0;
  for (const p of payments) {
    if (!p.paid) continue;
    const d = new Date(p.date);
    // Window: (lowerBound, next.cycleEnd]
    if (d > lowerBound && d <= next.cycleEnd) sum += p.amount;
  }

  return roundMoney(sum);
}
```

### Modified: `CardMonthPayment` interface

```typescript
export interface CardMonthPayment {
  cardId: string;
  cardName: string;
  statementTotal: number;
  paidAmount: number;
  status: 'paid' | 'partial' | 'pending' | 'projected';
  installmentItems: InstallmentItem[];
  recurringItems: RecurringItem[];
  cycleStart: Date;
  cycleEnd: Date;
  paymentDueDate: Date;
  projectedTotal?: number;  // NEW — only present in current cycle (index === 0)
}
```

### Modified: Hook return type

```typescript
export interface CardPaymentScheduleResult {
  months: MonthGroup[];
  consolidatedProjectedTotal: number;  // Sum of projectedTotal across all cards
}
```

The `useCardPaymentSchedule` hook signature changes from returning `MonthGroup[]` to returning `CardPaymentScheduleResult`. The `buildCardPaymentSchedule` function also returns this new shape.

### New: `BalanceComparisonSection` component

```typescript
interface BalanceComparisonSectionProps {
  usedCredit: number;
  projectedTotal: number;
  formatCurrency: (amount: number) => string;
  hideBalances: boolean;
}
```

Renders immediately below the card header inside `CardBreakdown`, showing:
- "Saldo real": `usedCredit`
- "Proyectado": `projectedTotal`
- "Sin registrar": `usedCredit - projectedTotal` (amber text if > 0, neutral otherwise)

## Data Models

### Account (existing — no schema change)

The `usedCredit` field already exists on the Account type:

```typescript
interface Account {
  // ... existing fields
  usedCredit?: number; // persisted, updated atomically with each transaction
}
```

### MonthGroup (unchanged)

```typescript
interface MonthGroup {
  monthKey: string;
  label: string;
  total: number;
  isCurrent: boolean;
  isFuture: boolean;
  cards: CardMonthPayment[];
}
```

### CardPaymentScheduleResult (new)

```typescript
interface CardPaymentScheduleResult {
  months: MonthGroup[];
  consolidatedProjectedTotal: number;
}
```

### Payment Detection Window Summary

| Scenario | Lower Bound (exclusive) | Upper Bound (inclusive) |
|----------|------------------------|----------------------|
| Normal cycle (index > -PAST_MONTHS) | `prev.paymentDueDate` | `next.cycleEnd` |
| First cycle (index === -PAST_MONTHS) | `cyc.cycleStart` | `next.cycleEnd` |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Payment window boundary correctness

*For any* credit card with valid cutoffDay/paymentDay, and *for any* payment transaction with `paid === true`, that payment SHALL be counted toward cycle `i` if and only if its date is strictly after the paymentDueDate of cycle `i-1` (or cycleStart of cycle `i` when `i === -PAST_MONTHS`) AND less than or equal to the cycleEnd of cycle `i+1`.

**Validates: Requirements 1.1, 1.2, 1.6, 1.7**

### Property 2: Cycle status classification is exhaustive and correct

*For any* cycle with `index <= 0`, given a `statementTotal > 0` and a `paidAmount >= 0`, the status SHALL be:
- "paid" if `paidAmount >= statementTotal - 0.01`
- "partial" if `0.01 < paidAmount < statementTotal - 0.01`
- "pending" if `paidAmount <= 0.01`

These three cases are mutually exclusive and exhaustive for all non-negative payment amounts.

**Validates: Requirements 1.3, 1.4, 1.5**

### Property 3: Projected total invariant

*For any* set of credit card accounts with transactions and recurring payments, the `projectedTotal` field in each `CardMonthPayment` of the current cycle (`isCurrent: true`) SHALL equal the `statementTotal` of that card in that cycle. Furthermore, the `consolidatedProjectedTotal` in the hook return SHALL equal the sum of all per-card `projectedTotal` values.

**Validates: Requirements 3.1, 3.2, 3.4**

### Property 4: Balance comparison styling reflects unrecorded amount sign

*For any* account with `usedCredit` defined and a `projectedTotal` value, the "Sin registrar" display SHALL use warning style (amber) when `usedCredit - projectedTotal > 0`, and neutral style when `usedCredit - projectedTotal <= 0`.

**Validates: Requirements 2.3, 2.4**

### Property 5: Balance comparison masking under hideBalances

*For any* rendered balance comparison section with `hideBalances === true`, all monetary values ("Saldo real", "Proyectado", "Sin registrar") SHALL render the mask "------" instead of formatted currency values, regardless of the underlying numeric values.

**Validates: Requirements 2.7**

### Property 6: Balance comparison values correctness

*For any* account with `usedCredit` defined (numeric >= 0) and a `projectedTotal` value, the balance comparison section SHALL display exactly three values: `usedCredit` as "Saldo real", `projectedTotal` as "Proyectado", and `usedCredit - projectedTotal` as "Sin registrar", all formatted with `formatCurrency`.

**Validates: Requirements 2.2, 2.6**

## Error Handling

| Scenario | Handling |
|----------|----------|
| `usedCredit` is `undefined` or `null` | Omit balance comparison section entirely (Req 2.5) |
| No previous cycle (first in history) | Fallback lower bound to `cycleStart` (Req 1.2) |
| Floating point rounding in payment sums | Use `roundMoney` utility and 0.01 COP tolerance (Req 1.3) |
| `statementTotal === 0` for current cycle | Report `projectedTotal: 0` for that card (Req 3.3) |
| No credit cards in accounts array | Hook returns empty months array and `consolidatedProjectedTotal: 0` |
| `hideBalances` active | Mask all monetary values with "------" (Req 2.7) |

## Testing Strategy

### Property-Based Tests (fast-check + vitest)

Each property test runs a minimum of 100 iterations. The project already uses `fast-check` with existing generators for credit card accounts and transactions.

| Property | Test File | Description |
|----------|-----------|-------------|
| Property 1 | `useCardPaymentSchedule.property.test.ts` | Generate random payment dates, verify window inclusion/exclusion |
| Property 2 | `useCardPaymentSchedule.property.test.ts` | Generate random statementTotal/paidAmount pairs, verify status |
| Property 3 | `useCardPaymentSchedule.property.test.ts` | Generate cards with charges, verify projectedTotal === statementTotal |

Properties 4, 5, and 6 are UI-level and will be tested with component-level property tests using generated numeric inputs for `usedCredit` and `projectedTotal`:

| Property | Test File | Description |
|----------|-----------|-------------|
| Property 4 | `CardStatementsModal.test.tsx` | Generate usedCredit/projectedTotal pairs, verify styling |
| Property 5 | `CardStatementsModal.test.tsx` | Generate values with hideBalances=true, verify masking |
| Property 6 | `CardStatementsModal.test.tsx` | Generate values, verify all three labels and formatted amounts |

**Tag format**: `Feature: card-payment-window-fix, Property {N}: {title}`

### Unit Tests (example-based)

| Scenario | Test File |
|----------|-----------|
| Payment made day after prev.paymentDueDate → counted | `useCardPaymentSchedule.unit.test.ts` |
| Payment on exact prev.paymentDueDate → excluded | `useCardPaymentSchedule.unit.test.ts` |
| Payment after cycleEnd but before next.cycleEnd → counted (late payment) | `useCardPaymentSchedule.unit.test.ts` |
| First cycle (index === -6) uses cycleStart as lower bound | `useCardPaymentSchedule.unit.test.ts` |
| Balance section renders when usedCredit defined | `CardStatementsModal.test.tsx` |
| Balance section omitted when usedCredit undefined | `CardStatementsModal.test.tsx` |
| consolidatedProjectedTotal with zero-charge card | `useCardPaymentSchedule.unit.test.ts` |

### Integration Points

- The hook return type change (`MonthGroup[]` → `CardPaymentScheduleResult`) requires updating `CardStatementsModal` to destructure `{ months, consolidatedProjectedTotal }` instead of using the array directly.
- The `usedCredit` field is already persisted atomically — no Firestore schema changes needed.
- Existing property tests (Properties 8–14 from extractos-improvements) remain valid and must continue to pass.

