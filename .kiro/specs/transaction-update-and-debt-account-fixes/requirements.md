# Requirements Document

## Introduction

Este documento especifica los requisitos para resolver dos problemas críticos en la aplicación de finanzas personales:

1. **Error al actualizar transacciones**: Aunque los servicios retornan código 200, las actualizaciones de transacciones fallan silenciosamente debido a validación incompleta, campos undefined, y falta de manejo de errores detallado.

2. **Funcionalidad faltante en préstamos**: El módulo de préstamos carece de funcionalidad para seleccionar cuenta al crear préstamos y para modificar el saldo del préstamo después de su creación.

La aplicación utiliza Next.js, TypeScript y Firebase Firestore como stack tecnológico.

## Glossary

- **Transaction**: Registro de movimiento financiero (ingreso, gasto o transferencia) con campos como amount, description, date, category, accountId
- **Debt**: Registro de préstamo o deuda con campos como personName, type (lent/borrowed), originalAmount, remainingAmount, accountId
- **Update_Service**: Función updateTransaction en useTransactionsCRUD.ts que actualiza transacciones en Firestore
- **Validation_Layer**: Lógica de validación que verifica la integridad de datos antes de operaciones CRUD
- **Account_Selector**: Componente UI select que permite elegir una cuenta al crear un préstamo
- **Debt_Balance_Modifier**: Funcionalidad para agregar o restar saldo al monto original de un préstamo

## Requirements

### Requirement 1: Transaction Update Validation

**User Story:** Como usuario, quiero que las actualizaciones de transacciones validen todos los campos requeridos, para que no se envíen datos incompletos o inválidos a Firestore.

#### Acceptance Criteria

1. WHEN a transaction update is submitted, THE Validation_Layer SHALL verify that all required fields (amount, description, date, category) are present and valid
2. WHEN the amount field is undefined, null, or not a positive number, THE Validation_Layer SHALL reject the update and return a descriptive error message
3. WHEN the description field is undefined, null, or empty after trimming, THE Validation_Layer SHALL reject the update and return a descriptive error message
4. WHEN the date field is undefined, null, or not a valid Date object, THE Validation_Layer SHALL reject the update and return a descriptive error message
5. WHEN the category field is undefined, null, or empty, THE Validation_Layer SHALL reject the update and return a descriptive error message
6. WHEN validation fails, THE Update_Service SHALL not call Firestore and SHALL throw an error with specific field information

### Requirement 2: Transaction Update Error Handling

**User Story:** Como usuario, quiero recibir mensajes de error claros cuando una actualización de transacción falla, para que pueda entender qué salió mal y cómo corregirlo.

#### Acceptance Criteria

1. WHEN the Update_Service encounters a validation error, THE System SHALL display a user-friendly error message indicating which field is invalid
2. WHEN the Update_Service encounters a Firestore error, THE System SHALL log the detailed error and display a generic error message to the user
3. WHEN an update succeeds, THE System SHALL display a success message and clear the edit form
4. WHEN an update fails, THE System SHALL preserve the edit form state so the user can correct the error
5. WHEN multiple validation errors exist, THE System SHALL report all errors at once rather than one at a time

### Requirement 3: Debt Account Selection

**User Story:** Como usuario, quiero seleccionar una cuenta al crear un préstamo, para que el sistema registre desde qué cuenta se prestó o recibió el dinero.

#### Acceptance Criteria

1. WHEN creating a new debt, THE Account_Selector SHALL display all non-credit accounts as selectable options
2. WHEN the user selects an account, THE System SHALL store the accountId in the Debt record
3. WHEN the user does not select an account, THE System SHALL store undefined (not an empty string) for the accountId field
4. WHEN submitting a debt with an empty accountId string, THE System SHALL convert it to undefined before saving to Firestore
5. WHEN displaying existing debts, THE System SHALL show the associated account name if accountId is defined

### Requirement 4: Debt Balance Modification

**User Story:** Como usuario, quiero poder agregar o restar saldo al monto original de un préstamo, para que pueda ajustar el préstamo cuando se presta o recibe dinero adicional.

#### Acceptance Criteria

1. WHEN viewing an active debt, THE System SHALL display an option to modify the debt balance
2. WHEN the user chooses to add to the debt balance, THE Debt_Balance_Modifier SHALL increase both originalAmount and remainingAmount by the specified amount
3. WHEN the user chooses to subtract from the debt balance, THE Debt_Balance_Modifier SHALL decrease both originalAmount and remainingAmount by the specified amount
4. WHEN subtracting would result in a negative remainingAmount, THE System SHALL reject the operation and display an error message
5. WHEN a balance modification is successful, THE System SHALL update the debt record in Firestore and display a success message
6. WHEN a balance modification fails, THE System SHALL display an error message and preserve the current debt state

### Requirement 5: Undefined Field Handling

**User Story:** Como desarrollador, quiero que el sistema maneje correctamente campos undefined en operaciones CRUD, para que Firestore no reciba valores undefined que causan errores silenciosos.

#### Acceptance Criteria

1. WHEN preparing data for Firestore operations, THE System SHALL filter out all undefined values from the data object
2. WHEN a field should be optional and empty, THE System SHALL omit the field entirely rather than sending undefined
3. WHEN updating a transaction, THE Update_Service SHALL only include fields that have defined values in the update payload
4. WHEN creating a debt, THE System SHALL only include fields that have defined values in the creation payload
5. WHEN a required field is undefined, THE Validation_Layer SHALL reject the operation before attempting to filter undefined values
