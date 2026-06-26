# Requirements Document

## Introduction

This spec covers two improvements to the credit card payment calendar in Moneytrack:

1. **Payment detection window fix**: The `paidForCycle` function currently only detects payments made AFTER the cycle closes (`cycleEnd`). Early payments (made before cycle close) are not recognized, leaving status as "pending" when the user already paid.

2. **Real balance vs projected indicator**: Show in `CardStatementsModal` the real card balance (`usedCredit`) compared to the app-projected total, allowing users to identify unrecorded purchases.

## Glossary

- **Payment_Schedule_Engine**: The calculation module (`useCardPaymentSchedule` + `buildCardPaymentSchedule`) that projects installments month by month from transaction history.
- **Payment_Detection_Window**: The date range within which a payment is considered applicable to a specific billing cycle.
- **Cycle**: A credit card billing period bounded by `cycleStart` and `cycleEnd`, with a payment date (`paymentDueDate`).
- **CardStatementsModal**: The UI component displaying the card statements calendar.
- **usedCredit**: Optional numeric field on the `Account` model storing the real utilized balance of the card, updated atomically with each transaction.
- **Projected_Total**: The sum of installments and recurring items calculated by Payment_Schedule_Engine for a given cycle.
- **Unrecorded_Amount**: The difference between `usedCredit` and Projected_Total of the current cycle, representing purchases not imported into the app. Formula: `usedCredit - projectedTotal`.
- **Previous_Cycle**: The cycle immediately before the evaluated cycle (index - 1).

## Requirements

### Requirement 1: Payment detection window fix

**User Story:** As a credit card user, I want payments made before the cycle closes to be recognized as payments for the corresponding statement, so that the statement status correctly reflects that I already paid.

#### Acceptance Criteria

1. WHEN a payment to the card (transaction of type income or transfer to the card, with `paid === true`) has a date strictly after the paymentDueDate of the previous cycle (index - 1) and less than or equal to the cycleEnd of the next cycle (next.cycleEnd), THE Payment_Schedule_Engine SHALL add that payment amount to the total payments applied to the evaluated cycle.
2. IF no previous cycle exists (first cycle in history, index === -6), THEN THE Payment_Schedule_Engine SHALL use the cycleStart of the evaluated cycle as the exclusive lower bound of the Payment_Detection_Window.
3. WHEN the sum of detected payments in the Payment_Detection_Window is greater than or equal to the statementTotal of the cycle (with 0.01 COP tolerance for rounding), THE Payment_Schedule_Engine SHALL assign status "paid" to the cycle.
4. WHEN the sum of detected payments is greater than 0.01 COP but less than the statementTotal minus 0.01 COP, THE Payment_Schedule_Engine SHALL assign status "partial" to the cycle.
5. WHEN the sum of detected payments is less than or equal to 0.01 COP within the Payment_Detection_Window, THE Payment_Schedule_Engine SHALL assign status "pending" to the cycle.
6. THE Payment_Schedule_Engine SHALL include in the Payment_Detection_Window payments made after the cycleEnd of the evaluated cycle (late payments), since the upper bound of the window is next.cycleEnd.
7. WHEN a payment has a date exactly equal to the paymentDueDate of the previous cycle, THE Payment_Schedule_Engine SHALL exclude that payment from the evaluated cycle window (lower bound is strictly after previous cycle paymentDueDate).

### Requirement 2: Real balance vs projected indicator per card

**User Story:** As a user, I want to see the real balance of my credit card alongside the projected total from the app, so that I can identify purchases I have not yet recorded.

#### Acceptance Criteria

1. WHEN an account of type credit has the field `usedCredit` defined (numeric value >= 0, not `undefined` or `null`), THE CardStatementsModal SHALL display a balance comparison section for that card, positioned immediately below the expanded card header.
2. THE CardStatementsModal SHALL display three values in the comparison section: "Saldo real" (`usedCredit`), "Proyectado" (`projectedTotal` of the current cycle), and "Sin registrar" (`usedCredit - projectedTotal`).
3. WHEN the Unrecorded_Amount (`usedCredit - projectedTotal`) is greater than zero, THE CardStatementsModal SHALL display the "Sin registrar" value with a warning visual style (amber/yellow text color).
4. WHEN the Unrecorded_Amount is zero or negative (the app knows all charges or more), THE CardStatementsModal SHALL display the section without warning style (neutral text color).
5. WHEN an account of type credit does NOT have the field `usedCredit` defined (`undefined` or `null`), THE CardStatementsModal SHALL omit the balance comparison section for that card.
6. THE CardStatementsModal SHALL format monetary values in the comparison section using the existing `formatCurrency` function (locale es-CO, currency COP).
7. WHILE the `hideBalances` option is active, THE CardStatementsModal SHALL hide numeric values in the comparison section with the placeholder "------".

### Requirement 3: Projected_Total calculation for real balance comparison

**User Story:** As a user, I want the projected total to represent the total amount the app knows is owed in the current cycle, so I can compare it with the real credit card balance.

#### Acceptance Criteria

1. THE useCardPaymentSchedule SHALL calculate the Projected_Total per card as the sum of `statementTotal` of the current cycle (index === 0), including charges from active installments and assigned recurring payments, without subtracting payments made (`paidAmount`).
2. WHEN the current cycle (index === 0) has a `statementTotal` greater than zero for at least one card, THE useCardPaymentSchedule SHALL include a `projectedTotal` field per entry in `MonthGroup.cards[]` of the group marked `isCurrent: true`, with value equal to the `statementTotal` of that cycle.
3. IF a card has no charges or recurring items in the current cycle (statementTotal === 0), THEN THE useCardPaymentSchedule SHALL report a `projectedTotal` of 0 for that card in the output interface, enabling comparison against `usedCredit`.
4. THE useCardPaymentSchedule SHALL expose the consolidated Projected_Total (sum of `projectedTotal` across all cards) as a property of the hook return object, accessible without iterating `MonthGroup[]`.
