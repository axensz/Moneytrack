# Implementation Plan: Balance Comparison Total Debt

## Overview

Tres cambios incrementales: (1) calcular `totalProjectedDebt` en el hook, (2) actualizar el componente para usarlo, (3) agregar el indicador "Al día". Tasks ordenadas para no romper nada en el camino.

## Tasks

- [x] 1. Compute `totalProjectedDebt` in the hook
  - [x] 1.1 Add `totalProjectedDebt` field to `CardMonthPayment` and compute it
    - Add `totalProjectedDebt?: number` to `CardMonthPayment` interface
    - In `buildCardPaymentSchedule`, after iterating all cycles for a card, sum `statementTotal` for cycles where `index >= 0` (current + future)
    - Attach `totalProjectedDebt = roundMoney(totalDebt)` to the current cycle's `CardMonthPayment` entry (same entry that has `projectedTotal`)
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 1.2 Add `consolidatedTotalProjectedDebt` to `CardPaymentScheduleResult`
    - Add `consolidatedTotalProjectedDebt: number` to the interface
    - Compute as sum of `totalProjectedDebt` across all cards in the current month
    - Update `CardStatementsModal` to destructure the new field
    - _Requirements: 1.3_

  - [x] 1.3 Write property test for `totalProjectedDebt` correctness
    - **Property 7: Total projected debt includes all current+future cycles**
    - Generate cards with installments (N > 1) and recurring payments
    - Assert `totalProjectedDebt === Σ statementTotal for index >= 0 to horizon`
    - Assert `totalProjectedDebt >= projectedTotal` (superset)
    - **Validates: Requirements 1.1, 1.4**

  - [x] 1.4 Write unit test: card with 12-month installment
    - Create a card with a 12-installment purchase
    - Assert `totalProjectedDebt` includes all 12 cuotas (current + 11 future)
    - Assert `projectedTotal` only includes the current cuota
    - _Requirements: 1.1, 1.4_

- [x] 2. Update `BalanceComparisonSection` to use total debt
  - [x] 2.1 Add `totalProjectedDebt` prop and update rendering logic
    - Add optional `totalProjectedDebt?: number` prop
    - When provided: use it for "Sin registrar" calculation and show label "Proyectado (total)"
    - When undefined: fall back to `projectedTotal` (existing behavior)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 Pass `totalProjectedDebt` from `CardStatementsModal`
    - In `CardBreakdown`, pass `card.totalProjectedDebt` to `BalanceComparisonSection`
    - _Requirements: 2.1_

  - [x] 2.3 Write property test for fallback behavior
    - **Property 9: Fallback to projectedTotal when totalProjectedDebt undefined**
    - Generate random values with `totalProjectedDebt = undefined`
    - Assert "Sin registrar" === `usedCredit - projectedTotal`
    - Assert label is "Proyectado" (not "Proyectado (total)")
    - **Validates: Requirements 2.4**

  - [x] 2.4 Write property test with totalProjectedDebt provided
    - Generate random `usedCredit`, `projectedTotal`, and `totalProjectedDebt`
    - Assert "Sin registrar" === `usedCredit - totalProjectedDebt`
    - Assert label is "Proyectado (total)"
    - **Validates: Requirements 2.2, 2.3**

- [x] 3. Implement "Al día" indicator
  - [x] 3.1 Add "Al día" badge to `BalanceComparisonSection`
    - Define `UP_TO_DATE_THRESHOLD = 5000` constant
    - When `usedCredit <= UP_TO_DATE_THRESHOLD`: render green badge "Al día" instead of 3 rows
    - When `hideBalances` is true and card is "Al día": still show the badge
    - _Requirements: 3.1, 3.2, 3.4, 3.5_

  - [x] 3.2 Write property test for threshold behavior
    - **Property 8: "Al día" threshold behavior**
    - Generate random `usedCredit` values (0 to 10,000,000)
    - Assert "Al día" badge when `usedCredit <= 5000`
    - Assert three-row comparison when `usedCredit > 5000`
    - **Validates: Requirements 3.1, 3.3**

  - [x] 3.3 Write unit tests for "Al día" edge cases
    - usedCredit = 0 → shows "Al día"
    - usedCredit = 5000 → shows "Al día" (boundary)
    - usedCredit = 5001 → shows comparison rows
    - usedCredit = 772 (Gold real case) → shows "Al día"
    - hideBalances = true + "Al día" → still shows badge
    - _Requirements: 3.1, 3.3, 3.5_

- [x] 4. Final checkpoint - Ensure all tests pass

## Notes

- The `totalProjectedDebt` field is only set on current-cycle entries (same as `projectedTotal`)
- Existing tests for `BalanceComparisonSection` must continue passing (backward compat via optional prop)
- The "Al día" check happens BEFORE the comparison logic — it's a fast exit

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 4, "tasks": ["3.1"] },
    { "id": 5, "tasks": ["3.2", "3.3"] }
  ]
}
```
