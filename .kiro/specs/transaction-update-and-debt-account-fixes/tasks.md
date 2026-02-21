# Implementation Plan: Transaction Update and Debt Account Fixes

## Overview

Este plan implementa las correcciones para dos problemas críticos:
1. Validación robusta y manejo de errores en actualizaciones de transacciones
2. Funcionalidad completa de selección de cuenta y modificación de saldo en préstamos

La implementación se realizará en TypeScript siguiendo la arquitectura existente de la aplicación.

## Tasks

- [x] 1. Implement transaction update validation layer
  - [x] 1.1 Create validation types and interfaces in useTransactionsCRUD.ts
    - Add ValidationError interface with field and message properties
    - Add ValidationResult interface with isValid and errors array
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [x] 1.2 Implement validateTransactionUpdate function
    - Validate amount field (required, number, positive)
    - Validate description field (required, string, non-empty after trim)
    - Validate date field (required, valid Date object)
    - Validate category field (required, string, non-empty)
    - Collect all errors before returning
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.5_
  
  - [ ]* 1.3 Write property test for validation layer
    - **Property 2: Invalid field values are rejected**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5**
    - Generate random invalid transaction updates
    - Verify validation rejects them with appropriate errors
  
  - [ ]* 1.4 Write property test for multiple error collection
    - **Property 3: Multiple validation errors are collected**
    - **Validates: Requirements 2.5**
    - Generate updates with multiple invalid fields
    - Verify all errors are returned together

- [x] 2. Enhance updateTransaction with validation and error handling
  - [x] 2.1 Modify updateTransaction in useTransactionsCRUD.ts
    - Call validateTransactionUpdate before Firestore operation
    - Throw descriptive error if validation fails
    - Filter undefined values from updates object
    - Include try-catch for Firestore errors
    - _Requirements: 1.6, 5.1, 5.3, 5.5_
  
  - [ ]* 2.2 Write property test for undefined filtering
    - **Property 9: Undefined values are filtered from Firestore operations**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - Generate random update objects with undefined values
    - Verify undefined fields are removed before Firestore call
  
  - [ ]* 2.3 Write property test for validation-before-filtering
    - **Property 10: Validation precedes filtering**
    - **Validates: Requirements 5.5**
    - Generate updates with both validation errors and undefined values
    - Verify validation errors are thrown before filtering occurs
  
  - [ ]* 2.4 Write unit tests for updateTransaction error handling
    - Test validation error is thrown with invalid data
    - Test Firestore error is caught and re-thrown with message
    - Mock Firestore to verify it's not called on validation failure
    - _Requirements: 1.6, 2.2_

- [ ] 3. Checkpoint - Ensure validation tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Improve error handling in useTransactionsView
  - [x] 4.1 Enhance handleSaveEdit with client-side validation
    - Add validation for amount (must be positive number)
    - Add validation for description (must be non-empty)
    - Add validation for category (must be selected)
    - Show specific error messages for each validation failure
    - _Requirements: 2.1_
  
  - [x] 4.2 Improve error handling in handleSaveEdit try-catch
    - Extract error message from Error object
    - Log detailed error to console
    - Display user-friendly error message via toast
    - Preserve form state on error (don't clear editForm)
    - Clear form state only on success
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [ ]* 4.3 Write unit tests for handleSaveEdit error scenarios
    - Test client-side validation shows appropriate errors
    - Test form state is preserved on error
    - Test form state is cleared on success
    - Test error messages are displayed correctly
    - _Requirements: 2.1, 2.3, 2.4_

- [x] 5. Fix debt account selection
  - [x] 5.1 Update handleSubmit in DebtsView.tsx
    - Convert empty accountId string to undefined before calling addDebt
    - Ensure description is also converted (empty string to undefined)
    - _Requirements: 3.3, 3.4_
  
  - [x] 5.2 Enhance account selector UI in debt form
    - Verify select element has proper value binding
    - Verify onChange handler updates formData.accountId correctly
    - Ensure "Sin cuenta asociada" option has empty string value
    - Filter accounts to show only non-credit accounts
    - _Requirements: 3.1, 3.2_
  
  - [ ]* 5.3 Write property test for accountId conversion
    - **Property 5: Empty accountId becomes undefined**
    - **Validates: Requirements 3.3, 3.4**
    - Generate random debt data with empty string accountId
    - Verify it's converted to undefined before storage
  
  - [ ]* 5.4 Write unit tests for account selector
    - Test account selector displays non-credit accounts only
    - Test selected accountId is stored in form state
    - Test empty selection results in empty string in form state
    - Test empty string is converted to undefined in handleSubmit
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 6. Implement debt balance modification
  - [x] 6.1 Add modifyDebtBalance function to useDebts.ts
    - Accept debtId, amount, and operation ('add' | 'subtract') parameters
    - Find debt by ID and validate it exists
    - Validate debt is not settled
    - For 'add': increase both originalAmount and remainingAmount
    - For 'subtract': decrease both amounts, validate doesn't go negative
    - Check if debt becomes settled (remainingAmount === 0)
    - Call updateDebt with new amounts and settlement status
    - _Requirements: 4.2, 4.3, 4.4_
  
  - [x] 6.2 Export modifyDebtBalance from useDebts hook
    - Add modifyDebtBalance to return object of useDebts
    - _Requirements: 4.2, 4.3, 4.4_
  
  - [x] 6.3 Expose modifyDebtBalance in FinanceContext
    - Add modifyDebtBalance to FinanceContextValue interface
    - Include modifyDebtBalance in context value object
    - _Requirements: 4.2, 4.3, 4.4_
  
  - [ ]* 6.4 Write property test for add operation
    - **Property 6: Add operation increases debt amounts**
    - **Validates: Requirements 4.2**
    - Generate random active debts and positive amounts
    - Verify both originalAmount and remainingAmount increase correctly
  
  - [ ]* 6.5 Write property test for subtract operation
    - **Property 7: Subtract operation decreases debt amounts**
    - **Validates: Requirements 4.3**
    - Generate random active debts and valid subtract amounts
    - Verify both amounts decrease correctly
  
  - [ ]* 6.6 Write property test for invalid subtraction
    - **Property 8: Invalid subtraction is rejected**
    - **Validates: Requirements 4.4**
    - Generate random debts and amounts exceeding remainingAmount
    - Verify operation is rejected with error
  
  - [ ]* 6.7 Write unit tests for modifyDebtBalance edge cases
    - Test error when debt not found
    - Test error when debt is settled
    - Test debt becomes settled when remainingAmount reaches 0
    - Test settledAt is set when debt becomes settled
    - _Requirements: 4.2, 4.3, 4.4_

- [x] 7. Add balance modifier UI to DebtsView
  - [x] 7.1 Add state for balance modifier in DebtsView component
    - Add showBalanceModifier state (string | null for debt ID)
    - Add modifierAmount state (string for input)
    - Add modifierOperation state ('add' | 'subtract')
    - _Requirements: 4.1_
  
  - [x] 7.2 Create handleModifyBalance function
    - Parse modifierAmount to number
    - Validate amount is positive
    - Call modifyDebtBalance from context with debtId, amount, operation
    - Show success toast on success
    - Show error toast on failure
    - Clear modifier state on success
    - _Requirements: 4.5, 4.6_
  
  - [x] 7.3 Add balance modifier button to DebtCard component
    - Add button with icon (e.g., Edit or DollarSign) next to payment button
    - Button toggles showBalanceModifier state for that debt
    - _Requirements: 4.1_
  
  - [x] 7.4 Add balance modifier form UI to DebtCard
    - Show form when showBalanceModifier matches debt.id
    - Add operation selector buttons (Agregar / Restar)
    - Add amount input field with number formatting
    - Add "Aplicar" button to submit
    - Add cancel button to close form
    - Style with appropriate colors (green for add, red for subtract)
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [ ]* 7.5 Write unit tests for balance modifier UI
    - Test modifier form shows when button clicked
    - Test operation selector switches between add/subtract
    - Test amount input updates state correctly
    - Test handleModifyBalance is called with correct parameters
    - Test success message is shown on successful modification
    - Test error message is shown on failed modification
    - _Requirements: 4.1, 4.5, 4.6_

- [x] 8. Enhance undefined filtering in useDebts
  - [x] 8.1 Update addDebt to filter undefined values
    - Use Object.fromEntries and filter to remove undefined fields
    - Apply filtering before Firestore addDoc call
    - _Requirements: 5.1, 5.4_
  
  - [x] 8.2 Update updateDebt to filter undefined values
    - Use Object.fromEntries and filter to remove undefined fields
    - Apply filtering before Firestore updateDoc call
    - _Requirements: 5.1, 5.4_
  
  - [ ]* 8.3 Write unit tests for undefined filtering in debts
    - Test addDebt removes undefined fields before Firestore call
    - Test updateDebt removes undefined fields before Firestore call
    - Mock Firestore to verify clean data is sent
    - _Requirements: 5.1, 5.4_

- [x] 9. Final checkpoint - Integration testing
  - [x] 9.1 Manual testing of transaction update flow
    - Test updating transaction with valid data succeeds
    - Test updating with invalid amount shows error
    - Test updating with empty description shows error
    - Test form state is preserved on error
    - Test form is cleared on success
  
  - [x] 9.2 Manual testing of debt account selection
    - Test creating debt with account selected stores accountId
    - Test creating debt without account stores undefined
    - Test account selector shows only non-credit accounts
  
  - [x] 9.3 Manual testing of debt balance modification
    - Test adding to debt balance increases both amounts
    - Test subtracting from debt balance decreases both amounts
    - Test subtracting more than remaining shows error
    - Test debt becomes settled when remaining reaches 0
  
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based and unit tests
- Each property test should run minimum 100 iterations
- Use fast-check library for property-based testing in TypeScript
- All validation logic is centralized in useTransactionsCRUD for reusability
- Undefined filtering is applied consistently across all CRUD operations
- Error messages are user-friendly in Spanish to match the application language
- Balance modification preserves debt history by only modifying amounts, not creating new records
