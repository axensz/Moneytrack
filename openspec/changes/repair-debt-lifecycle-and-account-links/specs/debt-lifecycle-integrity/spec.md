## ADDED Requirements

### Requirement: Atomic debt creation
The system MUST create an authenticated debt, its original ledger transaction, and every affected credit-card balance in one atomic Firestore operation.

#### Scenario: Create a lent debt with a credit card
- **WHEN** the user lends money from a credit account
- **THEN** the debt and an expense transaction sharing the debt id are committed together
- **THEN** persisted `usedCredit` increases by the original amount in the same commit

#### Scenario: Create a borrowed debt with a credit card
- **WHEN** the user records borrowed money into a credit account
- **THEN** the debt and its income transaction are committed together
- **THEN** persisted `usedCredit` applies the existing income delta in the same commit

#### Scenario: Create a tracking-only debt
- **WHEN** the user selects no associated account
- **THEN** the system creates the debt without inventing a transaction or credit effect

#### Scenario: Any creation write fails
- **WHEN** account validation, rules, or the network prevents the atomic commit
- **THEN** neither the debt nor its transaction nor a `usedCredit` adjustment remains committed
- **THEN** the form reports the failure and retains the entered values

### Requirement: Atomic debt payments
The system MUST derive a payment from the persisted debt and commit its transaction, remaining balance, settlement state, and credit effect atomically.

#### Scenario: Receive a partial payment for money lent
- **WHEN** the user records a valid partial payment on a lent debt
- **THEN** one income transaction is linked to the debt
- **THEN** `remainingAmount` decreases by the same effective amount
- **THEN** a linked credit account releases that amount of `usedCredit`

#### Scenario: Pay a borrowed debt
- **WHEN** the user records a payment on a borrowed debt
- **THEN** one expense transaction is linked to the debt
- **THEN** the remaining debt and any credit-card effect change in the same commit

#### Scenario: Payment exceeds the remaining amount
- **WHEN** the requested payment is greater than the persisted balance
- **THEN** both the transaction and debt use the clamped remaining amount
- **THEN** the debt becomes settled without moving excess money

#### Scenario: Any payment write fails
- **WHEN** any participant in the payment commit is rejected
- **THEN** no payment transaction, balance reduction, settlement marker, or credit adjustment is committed

### Requirement: Complete debt deletion
The system MUST allow active and settled debts to be deleted through the same confirmed, atomic cascade.

#### Scenario: Delete an active debt
- **WHEN** the user confirms deletion of an active debt within the safe write limit
- **THEN** the debt and every transaction carrying its `debtId` are deleted together
- **THEN** every affected credit account reverses the deleted transactions' persisted effect in the same commit

#### Scenario: Delete a settled debt
- **WHEN** the user opens a settled debt and confirms deletion
- **THEN** the same cascade and financial reversal used for an active debt executes
- **THEN** no orphan debt transaction remains

#### Scenario: Deletion fails
- **WHEN** the cascade is rejected or exceeds its safe capacity
- **THEN** all existing debt and transaction data remains unchanged
- **THEN** the confirmation reports the failure instead of closing as successful

### Requirement: History-preserving account reassignment
The system MUST allow an associated account to be added, changed, or removed while preserving all historical payment transactions on their original accounts.

#### Scenario: Reassign a debt with payment history
- **WHEN** the user changes the associated account of a debt that already has payments
- **THEN** `Debt.accountId` and the single original `LOAN_CATEGORY` transaction move to the new account atomically
- **THEN** original and remaining debt amounts remain unchanged
- **THEN** the new account becomes the associated account for the pending balance and all future payments
- **THEN** every prior `LOAN_PAYMENT_CATEGORY` transaction keeps its existing account, amount, date, and category

#### Scenario: Reassign between credit and non-credit accounts
- **WHEN** either the previous or next associated account is a credit card
- **THEN** the system computes before-and-after credit deltas from the resulting ledger and updates every affected `usedCredit` in the same commit
- **THEN** no card is allowed to end with negative persisted debt

#### Scenario: Remove the account association
- **WHEN** the user selects “Sin cuenta”
- **THEN** the debt becomes tracking-only for future payments
- **THEN** the original transaction's previous account effect is removed atomically
- **THEN** historical payments remain unchanged

#### Scenario: Legacy debt has no original transaction
- **WHEN** a debt has no `LOAN_CATEGORY` transaction
- **THEN** its associated account can change for future payments without creating a retroactive transaction

#### Scenario: Original transaction is ambiguous
- **WHEN** more than one original transaction is linked to the debt
- **THEN** the system rejects the reassignment without changing any data
- **THEN** the user is told that the history needs review

### Requirement: Supported mode behavior remains truthful
The system MUST distinguish authenticated online guarantees from guest-local behavior.

#### Scenario: Authenticated user is offline
- **WHEN** an authenticated user attempts to create, pay, delete, or reassign a debt without network connectivity
- **THEN** the system performs no optimistic financial write
- **THEN** it asks the user to reconnect

#### Scenario: Guest uses debt lifecycle actions
- **WHEN** a guest creates, pays, deletes, or reassigns a debt
- **THEN** the same visible debt and transaction semantics apply to local data
- **THEN** a failed linked local mutation restores its previous snapshot

### Requirement: Debt actions are accessible and explicit
Debt editing and deletion controls MUST reuse the existing accessible modal, focus, token, and toast contracts on desktop and mobile.

#### Scenario: Settled debt actions are opened
- **WHEN** keyboard, pointer, or touch focus reaches a settled debt
- **THEN** edit-account and delete actions are available with accessible names and at least a 44 by 44 CSS pixel target

#### Scenario: Delete confirmation opens and closes
- **WHEN** the user requests deletion
- **THEN** the dialog identifies the debt and explains that linked transactions will also be removed
- **THEN** cancel or completion restores focus according to the existing modal contract
