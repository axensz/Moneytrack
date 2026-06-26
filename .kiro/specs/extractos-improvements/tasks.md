# Implementation Plan: extractos-improvements

## Overview

Plan de implementación secuencial: (1) refactorizar el hook monolítico `useImportWizard` en hooks granulares con pipeline explícito, (2) implementar la feature de Extractos de Tarjetas, (3) eliminar el hook legacy, (4) tests de integración. Stack: Next.js 16, React 19, TypeScript, Firebase/Firestore, Vitest. Sin dependencias nuevas.

## Tasks

- [x] 1. Refactor: Extraer hooks granulares del Import Wizard
  - [x] 1.1 Crear `src/hooks/useImportParsing.ts`
    - Extraer de `useImportWizard` toda la lógica de detección de extensión y delegación a `parseCSV`, `parseXLSX`, `parsePDF`
    - Exponer: `fileName`, `parseError`, `parseStats`, `pdfParsing`, `pdfNeedsAI`, `fileInputRef`, `parseFile`, `resetParsing`
    - Aceptar `categories: Categories` y `aiReason` como argumentos
    - `parseFile` retorna `ImportRow[]` (datos puros, sin routing ni dedup)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 1.2 Crear `src/hooks/useImportAI.ts`
    - Extraer de `useImportWizard` la lógica de categorización AI: filtro de elegibilidad, agrupación por patrón, invocación de `categorizeWithAI`, filtro de confianza ≥ 0.75
    - Exponer: `aiCategorizing`, `aiApplied`, `aiSuggestions`, `aiSuggestionTransactionCount`, `aiSuggestionsByCategory`, `handleAICategorize`, `handleApplyAISuggestions`, `handleSuggestionCategoryChange`, `handleDiscardAISuggestions`
    - `handleApplyAISuggestions` retorna `ImportRow[]` (inmutable, no muta estado interno)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 1.3 Crear `src/hooks/useImportDedup.ts`
    - Extraer de `useImportWizard` la función `markDuplicates` como hook con interfaz `UseImportDedupArgs` / `UseImportDedupReturn`
    - Acepta `existingTransactions: Transaction[]`; todo en memoria, cero reads a Firestore
    - Exact key para movimientos normales: `type|day|amount|desc(20chars)`
    - Transfer key: `day|amount` (sin descripción)
    - Marcar `isDuplicate: true` + `include: false` para matches DB y same-file
    - Marcar `include: false` para transfers y `needsExchangeRate: true`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 1.4 Crear función pura `routeRows` y refactorizar `useImportWizard` como orquestador delgado
    - Extraer `routeRows(rows, baseAccountId, learningRules, accounts, categoryOptions)` como función pura exportada (puede vivir en `useImportWizard.ts` o un archivo separado)
    - Incluye `inferTransferRoute` y `findLearnedCategory`
    - Refactorizar `useImportWizard` para que delegue a `useImportParsing`, `useImportAI`, `useImportDedup`
    - Pipeline en `handleFileChange`: `parse → route → dedup → setState`
    - `handleAccountChange`: re-ejecuta `route + dedup` sin re-parsear
    - La interfaz pública de `useImportWizard` NO cambia (el modal sigue consumiéndolo igual)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 2. Checkpoint — Refactor completo
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Feature: Implementar Extractos de Tarjetas
  - [x] 3.1 Mover `creditCycles.ts` al main en `src/utils/creditCycles.ts`
    - Copiar el archivo desde el worktree (`.claude/worktrees/extractos-tarjetas/src/utils/creditCycles.ts`) a `src/utils/creditCycles.ts`
    - Verificar que exporta `getCycleByIndex`, `cycleIndexOf` y el tipo `CreditCycle`
    - Verificar importación de `effectiveDueDay` desde `./recurringDates`
    - _Requirements: 5.1_

  - [x] 3.2 Crear `src/hooks/useCardPaymentSchedule.ts`
    - Hook puro: `useCardPaymentSchedule(accounts, transactions, recurringPayments, now?) → MonthGroup[]`
    - `transactions` DEBE ser `balanceTransactions` (historial completo, NO paginado)
    - Filtrar cuentas credit con `cutoffDay` y `paymentDay`
    - Computar ciclos de -6 a +maxFuture (hard cap +12)
    - Distribuir installments: `monthlyInstallmentAmount ?? amount` en N ciclos consecutivos desde `cycleIndexOf(tx.date)`
    - Contado (`installments === 1` o undefined): solo el ciclo de la fecha
    - Recurring payments en ciclos futuros (`index > 0`): monthly → todos, yearly → solo mes ancla
    - Payment status para `index <= 0`: paid/partial/pending
    - Status para `index > 0`: projected
    - Omitir meses con total === 0
    - Agrupar por `paymentDueDate` month (`YYYY-MM`), marcar `isCurrent: true`
    - Ordenar ascendente por `monthKey`
    - Definir interfaces: `InstallmentItem`, `RecurringItem`, `CardMonthPayment`, `MonthGroup`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [x] 3.3 Crear `src/components/views/accounts/components/CardStatementsModal.tsx`
    - Reusar `BaseModal` con `maxWidth="max-w-lg"`, título "Extractos de tarjetas" con icono `Receipt`
    - Filter dropdown: "Todas" | nombres individuales de tarjetas
    - `MonthPaymentRow` con `label` + `total` (o "••••••" si `hideBalances`)
    - Highlight purple para mes actual (`isCurrent`)
    - Expandible: desglose por tarjeta con badges de status (green=paid, amber=partial, red=pending, gray=projected)
    - Detalle cuotas: "cuota 3/12 — $150.000"
    - Items periódicos: "Netflix (periódico) — $45.900"
    - Empty state: "No tienes pagos de tarjeta pendientes."
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 3.4 Agregar botón "Extractos" y wiring en `AccountsView.tsx`
    - Botón pill purple con icono `Receipt`, visible solo cuando `creditCards.length > 0`
    - onClick abre `CardStatementsModal`
    - Pasar `balanceTransactions` (de `useTransactionDomain()`), `recurringPayments`, credit card accounts, `formatCurrency`, `hideBalances`
    - _Requirements: 6.1, 6.2_

- [x] 4. Checkpoint — Feature completa
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Cleanup: Eliminar hook legacy
  - [x] 5.1 Eliminar `src/hooks/useCreditCardStatement.ts` y todas sus importaciones
    - Buscar todos los archivos que importen `useCreditCardStatement` y migrar o eliminar el uso
    - Verificar cero errores de compilación TypeScript tras la eliminación
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 6. Tests de integración y property tests
  - [x] 6.1 Property tests para `useImportDedup.markDuplicates`
    - **Property 5: Duplicate marking invariant**
    - **Property 6: Transfer and foreign-currency exclusion**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [x] 6.2 Property tests para `useCardPaymentSchedule`
    - **Property 8: Installment distribution across cycles**
    - **Property 9: Recurring payments appear in future cycles only**
    - **Property 10: Payment status computation**
    - **Property 11: Zero-month omission**
    - **Property 12: Horizon boundary limits**
    - **Property 13: Month grouping key format and isCurrent uniqueness**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8**

  - [x] 6.3 Property tests para `routeRows`
    - **Property 7: Route function assigns accounts and learned categories**
    - **Validates: Requirements 4.2**

  - [x] 6.4 Property tests para `useImportParsing`
    - **Property 1: File extension routing dispatch**
    - **Property 2: ImportRow field population invariant**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 6.5 Property tests para `useImportAI`
    - **Property 3: AI eligibility filter**
    - **Property 4: AI confidence threshold and sort order**
    - **Validates: Requirements 2.1, 2.2**

  - [x] 6.6 Integration test del pipeline de importación
    - Crear `src/__tests__/integration/importPipeline.test.ts`
    - Pipeline completo: parse CSV/XLSX fixture → route → dedup → `importTransactions` con Firestore batch mockeado
    - Verificar duplicados marcados `isDuplicate: true` y excluidos
    - Verificar transfers marcados `include: false`
    - Verificar `writeBatch.set` por cada fila incluida y `writeBatch.commit` invocado
    - Verificar `usedCredit` incrementado con delta correcto para credit cards
    - Usar `vi.mock('firebase/firestore')` y fixtures deterministas
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 6.7 Unit tests para `useCardPaymentSchedule`
    - **Property 14: Balance masking under hideBalances** (test en CardStatementsModal)
    - Edge cases: sin tarjetas, cutoffDay > días del mes, installments undefined
    - Fixtures con `now` inyectable para determinismo
    - _Requirements: 5.9, 6.6_

- [x] 7. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Priority order: refactor (1) → feature (3) → cleanup (5) → tests (6)
- `useImportTransactions.ts` permanece sin cambios (batch writes)
- Parsers (`csvParser`, `xlsxParser`, `pdfParser`) permanecen sin cambios
- `ImportTransactionsModal.tsx` sigue consumiendo `useImportWizard` (interfaz pública sin cambios)
- `balanceTransactions` de `useTransactionDomain()` es la fuente de datos (NO transacciones paginadas)
- `creditCycles.ts` ya existe implementado en el worktree — solo se mueve a `src/utils/`
- Test command: `npm run test:run -- path/to/test`
- Moneda: COP, locale: es-CO
- No se agregan dependencias nuevas

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "3.1"] },
    { "id": 1, "tasks": ["1.4"] },
    { "id": 2, "tasks": ["3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4"] },
    { "id": 4, "tasks": ["5.1"] },
    { "id": 5, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5"] },
    { "id": 6, "tasks": ["6.6", "6.7"] }
  ]
}
```
