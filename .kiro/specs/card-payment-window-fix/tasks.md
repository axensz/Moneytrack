# Implementation Plan: Card Payment Window Fix

## Overview

This implementation plan covers three interconnected changes: fixing the payment detection window in `paidForCycle`, exposing `projectedTotal` from the hook, and adding a `BalanceComparisonSection` UI component. Tasks are structured to build incrementally — core logic first, then hook interface changes, then UI integration.

## Tasks

- [x] 1. Fix payment detection window in `paidForCycle`
  - [x] 1.1 Modify `paidForCycle` to use new window bounds
    - Change the lower bound from `cycleEnd` to `prev.paymentDueDate` (exclusive)
    - Add fallback to `cyc.cycleStart` when `index === -PAST_MONTHS` (no previous cycle)
    - Keep upper bound as `next.cycleEnd` (inclusive)
    - Ensure `roundMoney` is applied to the sum
    - _Requirements: 1.1, 1.2, 1.6, 1.7_

  - [x] 1.2 Write property test for payment window boundary correctness
    - **Property 1: Payment window boundary correctness**
    - Generate random cutoffDay/paymentDay, payment dates, and cycle indices
    - Assert payment is counted iff `date > prev.paymentDueDate && date <= next.cycleEnd`
    - Assert first-cycle fallback uses `cyc.cycleStart` as lower bound
    - **Validates: Requirements 1.1, 1.2, 1.6, 1.7**

  - [x] 1.3 Write unit tests for `paidForCycle` edge cases
    - Payment day after prev.paymentDueDate → counted
    - Payment on exact prev.paymentDueDate → excluded
    - Payment after cycleEnd but before next.cycleEnd → counted (late payment)
    - First cycle (index === -6) uses cycleStart as lower bound
    - _Requirements: 1.1, 1.2, 1.6, 1.7_

  - [x] 1.4 Write property test for cycle status classification
    - **Property 2: Cycle status classification is exhaustive and correct**
    - Generate random statementTotal > 0 and paidAmount >= 0
    - Assert status is "paid" when `paidAmount >= statementTotal - 0.01`
    - Assert status is "partial" when `0.01 < paidAmount < statementTotal - 0.01`
    - Assert status is "pending" when `paidAmount <= 0.01`
    - **Validates: Requirements 1.3, 1.4, 1.5**

- [x] 2. Expose `projectedTotal` from hook and update return type
  - [x] 2.1 Update `CardMonthPayment` interface to include `projectedTotal`
    - Add `projectedTotal?: number` field to the interface
    - Set `projectedTotal = statementTotal` for current cycle entries (`index === 0`)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 2.2 Update hook return type to `CardPaymentScheduleResult`
    - Create `CardPaymentScheduleResult` interface with `months` and `consolidatedProjectedTotal`
    - Modify `buildCardPaymentSchedule` to return the new shape
    - Compute `consolidatedProjectedTotal` as sum of per-card `projectedTotal` values
    - Update `useCardPaymentSchedule` to return `CardPaymentScheduleResult`
    - _Requirements: 3.4_

  - [x] 2.3 Update `CardStatementsModal` to destructure new hook return
    - Change from using array directly to destructuring `{ months, consolidatedProjectedTotal }`
    - Ensure existing functionality remains intact
    - _Requirements: 3.4_

  - [x] 2.4 Write property test for projected total invariant
    - **Property 3: Projected total invariant**
    - Generate cards with random charges and recurring items
    - Assert `projectedTotal === statementTotal` for each card in the current cycle
    - Assert `consolidatedProjectedTotal === sum of per-card projectedTotal`
    - **Validates: Requirements 3.1, 3.2, 3.4**

- [x] 3. Checkpoint - Verify core logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement `BalanceComparisonSection` component
  - [x] 4.1 Create `BalanceComparisonSection` component
    - Implement component accepting `usedCredit`, `projectedTotal`, `formatCurrency`, and `hideBalances` props
    - Display "Saldo real" with `usedCredit` value
    - Display "Proyectado" with `projectedTotal` value
    - Display "Sin registrar" with `usedCredit - projectedTotal` value
    - Apply amber/warning style when unrecorded amount > 0, neutral otherwise
    - Mask all values with "------" when `hideBalances` is true
    - _Requirements: 2.2, 2.3, 2.4, 2.6, 2.7_

  - [x] 4.2 Integrate `BalanceComparisonSection` into `CardStatementsModal`
    - Render section below expanded card header when `account.usedCredit` is defined
    - Omit section when `usedCredit` is `undefined` or `null`
    - Pass `projectedTotal` from `MonthGroup.cards[]` for the current cycle
    - Pass `formatCurrency` and `hideBalances` from existing context
    - _Requirements: 2.1, 2.5_

  - [x] 4.3 Write property test for balance comparison styling
    - **Property 4: Balance comparison styling reflects unrecorded amount sign**
    - Generate random `usedCredit` and `projectedTotal` values
    - Assert amber styling when `usedCredit - projectedTotal > 0`
    - Assert neutral styling when `usedCredit - projectedTotal <= 0`
    - **Validates: Requirements 2.3, 2.4**

  - [x] 4.4 Write property test for balance masking under hideBalances
    - **Property 5: Balance comparison masking under hideBalances**
    - Generate random monetary values with `hideBalances === true`
    - Assert all three labels render "------" instead of formatted currency
    - **Validates: Requirements 2.7**

  - [x] 4.5 Write property test for balance comparison values
    - **Property 6: Balance comparison values correctness**
    - Generate random `usedCredit >= 0` and `projectedTotal` values
    - Assert "Saldo real" shows `formatCurrency(usedCredit)`
    - Assert "Proyectado" shows `formatCurrency(projectedTotal)`
    - Assert "Sin registrar" shows `formatCurrency(usedCredit - projectedTotal)`
    - **Validates: Requirements 2.2, 2.6**

  - [x] 4.6 Write unit tests for balance comparison conditional rendering
    - Balance section renders when `usedCredit` is defined
    - Balance section omitted when `usedCredit` is `undefined`
    - `consolidatedProjectedTotal` with zero-charge card
    - _Requirements: 2.1, 2.5_

- [x] 5. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The hook return type change (`MonthGroup[]` → `CardPaymentScheduleResult`) is the main breaking change — task 2.3 ensures `CardStatementsModal` adapts
- Existing property tests (Properties 8–14 from extractos-improvements) must continue to pass

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3", "2.4"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6"] }
  ]
}
```
