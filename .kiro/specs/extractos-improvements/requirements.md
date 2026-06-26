# Requirements Document

## Introduction

Plan integral de mejoras para la funcionalidad de extractos en Moneytrack. Abarca tres áreas: (1) refactorización del hook monolítico `useImportWizard` en hooks granulares con pipeline explícito, (2) implementación de la nueva feature de Extractos de Tarjetas (Calendario de Pagos), y (3) tests de integración del flujo de importación. La prioridad es: refactor primero, feature nueva segundo, tests tercero.

## Glossary

- **Import_Wizard**: Sistema de importación de extractos bancarios compuesto por los hooks `useImportParsing`, `useImportAI`, `useImportDedup` y el orquestador delgado `useImportWizard`.
- **useImportParsing**: Hook encargado de la lectura y parseo de archivos (CSV, XLSX, PDF) y la producción de filas tipadas `ImportRow[]`.
- **useImportAI**: Hook encargado de la categorización asistida por IA (Gemini) de las filas parseadas.
- **useImportDedup**: Hook encargado de la detección de duplicados comparando filas importadas contra transacciones existentes en memoria.
- **useImportWizard**: Hook orquestador delgado que compone `useImportParsing`, `useImportAI` y `useImportDedup` y expone la interfaz unificada al modal de importación.
- **Pipeline**: Secuencia explícita de pasos puros: parse → route → dedup → setState, ejecutada dentro de `handleFileChange`.
- **Card_Payment_Schedule**: Sistema de cálculo y visualización del calendario de pagos mes a mes de tarjetas de crédito.
- **useCardPaymentSchedule**: Hook puro que calcula los `MonthGroup[]` a partir de cuentas, transacciones (historial completo) y pagos periódicos.
- **CardStatementsModal**: Componente modal que muestra el calendario de pagos de tarjetas con desglose por mes y por tarjeta.
- **CreditCycle**: Estructura que representa un ciclo de facturación (inicio, cierre, fecha de pago) indexado relativamente al ciclo actual.
- **MonthGroup**: Agrupación de pagos de tarjeta por mes calendario de `paymentDueDate`.
- **ImportRow**: Tipo que representa una fila parseada del extracto bancario antes de su escritura a Firestore.
- **balanceTransactions**: Historial completo de transacciones (no paginado) necesario para cálculos precisos de cuotas y deuda.
- **useCreditCardStatement**: Hook legacy a eliminar una vez que `useCardPaymentSchedule` lo reemplace.

## Requirements

### Requirement 1: Extracción del hook useImportParsing

**User Story:** As a developer, I want the file parsing logic extracted into a dedicated hook, so that parsing concerns are isolated and independently testable.

#### Acceptance Criteria

1. WHEN a file is provided to useImportParsing, THE useImportParsing SHALL detect the file type (CSV, XLSX, PDF) by extension and delegate to the corresponding parser (`parseCSV`, `parseXLSX`, `parsePDF`).
2. WHEN the parser returns rows, THE useImportParsing SHALL produce an array of `ImportRow[]` with `categorySource`, `suggestedCategory`, date, description, amount, and type populated from the parser output.
3. IF the parser returns zero valid rows, THEN THE useImportParsing SHALL expose a `parseError` string describing the failure reason.
4. WHILE a PDF file is being parsed asynchronously, THE useImportParsing SHALL expose a `pdfParsing: true` state.
5. IF a PDF file is selected and the AI key is not configured or consent is missing, THEN THE useImportParsing SHALL expose `pdfNeedsAI: true` without attempting to parse.
6. THE useImportParsing SHALL expose `fileName`, `parseStats` (total, skipped, duplicates, needsRate), and a `fileInputRef` for programmatic file input control.
7. THE useImportParsing SHALL accept a `categories: Categories` parameter and pass it to `parseXLSX` and `parseCSV` for file-based category matching.

### Requirement 2: Extracción del hook useImportAI

**User Story:** As a developer, I want the AI categorization logic extracted into a dedicated hook, so that AI concerns are decoupled from parsing and dedup.

#### Acceptance Criteria

1. WHEN `handleAICategorize` is invoked with rows, THE useImportAI SHALL filter rows eligible for AI (included, non-transfer, non-file-category, category "Otros") and group them by description pattern.
2. WHEN the AI returns results with confidence ≥ 0.75 and a non-"Otros" category, THE useImportAI SHALL produce `AISuggestion[]` sorted by category and pattern.
3. WHEN `handleApplyAISuggestions` is invoked, THE useImportAI SHALL apply suggestion categories to the corresponding row indexes and persist learning rules via `upsertImportLearningRule`.
4. WHILE the AI is processing, THE useImportAI SHALL expose `aiCategorizing: true`.
5. IF the AI call fails, THEN THE useImportAI SHALL leave rows unchanged and set `aiCategorizing: false` without surfacing an error to the user.
6. THE useImportAI SHALL expose `aiApplied`, `aiSuggestions`, `aiSuggestionTransactionCount`, `aiSuggestionsByCategory`, `handleSuggestionCategoryChange`, and `handleDiscardAISuggestions`.

### Requirement 3: Extracción del hook useImportDedup

**User Story:** As a developer, I want the duplicate detection logic extracted into a dedicated hook, so that dedup is reusable and testable in isolation.

#### Acceptance Criteria

1. WHEN `markDuplicates` is invoked with rows and an accountId, THE useImportDedup SHALL compare each row against `existingTransactions` using exact keys for normal movements and transfer keys (day + amount only) for transfers.
2. WHEN a row matches an existing transaction key OR has already been seen in the same file, THE useImportDedup SHALL mark the row as `isDuplicate: true` and `include: false`.
3. WHEN a row is an internal transfer (detected via `isInternalTransferDescription` or `type === 'transfer'`), THE useImportDedup SHALL mark it as `include: false` regardless of duplicate status.
4. WHEN a row has `needsExchangeRate: true`, THE useImportDedup SHALL mark it as `include: false`.
5. THE useImportDedup SHALL accept `existingTransactions: Transaction[]` as a parameter and perform all comparison in memory without Firestore reads.

### Requirement 4: Pipeline explícito en handleFileChange

**User Story:** As a developer, I want the file processing pipeline to be a sequence of pure, composable steps, so that each step can be tested and reasoned about independently.

#### Acceptance Criteria

1. WHEN a file is loaded, THE Import_Wizard SHALL execute the pipeline in order: parse → route → dedup → setState.
2. THE Import_Wizard SHALL implement the route step as a pure function that assigns `accountId`, `toAccountId`, and applies learned category rules to each row.
3. THE Import_Wizard SHALL implement the dedup step by invoking `useImportDedup.markDuplicates` on the routed rows with the selected account.
4. WHEN the account selection changes, THE Import_Wizard SHALL re-execute the route and dedup steps on the existing parsed rows without re-parsing the file.
5. THE Import_Wizard SHALL remain a thin orchestrator that delegates to `useImportParsing`, `useImportAI`, and `useImportDedup` without containing domain logic beyond coordination and state transitions.

### Requirement 5: Implementar Extractos de Tarjetas (Calendario de Pagos)

**User Story:** As a user, I want to see a month-by-month payment calendar for my credit cards, so that I know how much I owe each month including installment projections.

#### Acceptance Criteria

1. THE useCardPaymentSchedule SHALL compute `MonthGroup[]` from accounts (credit type with `cutoffDay` and `paymentDay`), the full transaction history (`balanceTransactions`), and `recurringPayments`.
2. WHEN a transaction has `installments > 1`, THE useCardPaymentSchedule SHALL distribute the monthly installment amount across `installments` consecutive cycles starting from the cycle containing the transaction date.
3. WHEN a transaction has `installments === 1` or no installments, THE useCardPaymentSchedule SHALL include its amount only in the cycle containing the transaction date.
4. WHILE computing future cycles (`index > 0`), THE useCardPaymentSchedule SHALL add active recurring payments assigned to the card (monthly in every future cycle, yearly only in the matching month).
5. WHILE computing past or current cycles (`index <= 0`), THE useCardPaymentSchedule SHALL compute payment status as `paid` (payments ≥ total), `partial` (0 < payments < total), or `pending` (payments === 0).
6. THE useCardPaymentSchedule SHALL omit months where the total across all cards is zero.
7. THE useCardPaymentSchedule SHALL limit the past horizon to 6 cycles and the future horizon to the last active installment cycle or +3 cycles for recurring-only cards, with a hard cap of +12 cycles.
8. THE useCardPaymentSchedule SHALL group results by the calendar month of `paymentDueDate` (`YYYY-MM`) and mark the bucket containing the current month as `isCurrent: true`.
9. WHEN cutoff or payment day exceeds the days in a given month, THE useCardPaymentSchedule SHALL clamp the day to the last day of that month using `effectiveDueDay`.

### Requirement 6: UI del Calendario de Pagos (CardStatementsModal)

**User Story:** As a user, I want to access the payment calendar from the Accounts view via a clear button, so that I can quickly check my upcoming card payments.

#### Acceptance Criteria

1. WHEN there is at least one credit card account, THE AccountsView SHALL display a button labeled "Extractos" with a `Receipt` icon in pill style with purple theme, positioned in the header alongside "Nueva Cuenta".
2. WHEN the "Extractos" button is clicked, THE AccountsView SHALL open `CardStatementsModal` passing `balanceTransactions`, `recurringPayments`, and credit card accounts.
3. THE CardStatementsModal SHALL display months ordered ascending by `monthKey` with the current month visually highlighted (purple border/background).
4. THE CardStatementsModal SHALL allow filtering by "Todas" (all cards consolidated) or a specific card.
5. WHEN a month row is expanded, THE CardStatementsModal SHALL show per-card breakdown including: card name, statement total, payment status badge (green=paid, amber=partial, red=pending, gray=projected), installment detail ("cuota 3/12"), and recurring items.
6. WHILE `hideBalances` is active, THE CardStatementsModal SHALL mask all monetary amounts with "••••••".
7. IF no months have debt, THEN THE CardStatementsModal SHALL display "No tienes pagos de tarjeta pendientes".

### Requirement 7: Eliminación de useCreditCardStatement

**User Story:** As a developer, I want the legacy hook removed once the replacement is ready, so that there is no dead code or duplicate logic.

#### Acceptance Criteria

1. WHEN `useCardPaymentSchedule` is implemented and verified, THE codebase SHALL delete `src/hooks/useCreditCardStatement.ts` and remove all imports referencing it.
2. IF any component previously consumed `useCreditCardStatement`, THEN THE codebase SHALL migrate that component to use `useCardPaymentSchedule` or remove the usage.
3. THE codebase SHALL have zero TypeScript compilation errors after the deletion.

### Requirement 8: Tests de integración del flujo de importación

**User Story:** As a developer, I want integration tests covering the full import wizard pipeline, so that regressions in parse → dedup → import are caught automatically.

#### Acceptance Criteria

1. THE test suite SHALL cover the pipeline: parse a CSV/XLSX fixture → detect duplicates against mock existing transactions → call `importTransactions` with Firestore batch mocks.
2. WHEN a fixture contains duplicate rows (same day, amount, description), THE test SHALL verify those rows are marked `isDuplicate: true` and excluded from import.
3. WHEN a fixture contains transfers (detected by description pattern), THE test SHALL verify those rows are marked `include: false`.
4. WHEN `importTransactions` is called with valid rows, THE test SHALL verify Firestore `writeBatch.set` is called for each included row and `writeBatch.commit` is invoked.
5. WHEN a credit card account is involved, THE test SHALL verify `usedCredit` is incremented via `batch.update` with the correct delta.
6. THE test suite SHALL use Vitest with mocked Firestore (`vi.mock('firebase/firestore')`) and deterministic fixture data (no network calls).
