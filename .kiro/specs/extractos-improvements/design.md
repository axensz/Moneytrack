# Design Document: extractos-improvements

## Overview

Plan integral de mejoras para la funcionalidad de extractos en Moneytrack. Abarca tres áreas ejecutadas secuencialmente:

1. **Import Wizard Refactor** — Split the monolithic `useImportWizard` into three focused hooks (`useImportParsing`, `useImportAI`, `useImportDedup`) composed by a thin orchestrator with an explicit pipeline.
2. **Card Payment Schedule (Extractos de Tarjetas)** — New hook + modal for month-by-month credit card payment calendar.
3. **Integration Tests** — End-to-end pipeline tests with mocked Firestore.

Stack: Next.js 16, React 19, TypeScript, Firebase/Firestore, Vitest. Moneda: COP, locale: es-CO. No new dependencies.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ ImportTransactionsModal (unchanged presentation layer)       │
└────────────────────────────┬────────────────────────────────┘
                             │ consumes
┌────────────────────────────▼────────────────────────────────┐
│ useImportWizard (thin orchestrator)                          │
│   pipeline: parse → route → dedup → setState                │
├─────────────┬──────────────┬────────────────────────────────┤
│ useImport   │ useImportAI  │ useImportDedup                  │
│ Parsing     │              │                                 │
└─────────────┴──────────────┴────────────────────────────────┘
        │              │                    │
        ▼              ▼                    ▼
  parseCSV/XLSX/PDF  categorizeWithAI  importDuplicates utils

┌─────────────────────────────────────────────────────────────┐
│ AccountsView                                                 │
│   └── "Extractos" button (pill, Receipt, purple)            │
│       └── CardStatementsModal (BaseModal)                    │
│           └── useCardPaymentSchedule (pure hook)            │
│               └── creditCycles.ts (getCycleByIndex,         │
│                   cycleIndexOf)                              │
└─────────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**
- The orchestrator (`useImportWizard`) remains the single hook consumed by the modal. It delegates ALL domain logic to the three sub-hooks.
- `useCardPaymentSchedule` is a pure computation hook (no React-Firebase coupling), making it trivially testable with injected `now`.
- `creditCycles.ts` (already implemented in worktree) moves to `src/utils/` in main — pure utility reused by the payment schedule hook.
- `useImportTransactions` (batch writes) is untouched.

## Components and Interfaces

### Area 1: Import Wizard Refactor

#### useImportParsing

```typescript
interface UseImportParsingArgs {
  categories: Categories;
  aiReason: 'no-key' | 'no-consent' | null;
}

interface UseImportParsingReturn {
  fileName: string;
  parseError: string;
  parseStats: ImportParseStats | null;
  pdfParsing: boolean;
  pdfNeedsAI: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  parseFile: (file: File) => Promise<ImportRow[]>;
  resetParsing: () => void;
}
```

**Responsibilities:**
- Detect file extension (`.csv`, `.xlsx`/`.xls`, `.pdf`) and delegate to `parseCSV`, `parseXLSX`, or `parsePDF`.
- Map parser output to `ImportRow[]` with all required fields (`categorySource`, `suggestedCategory`, `date`, `description`, `amount`, `type`).
- Manage `pdfParsing` async state and `pdfNeedsAI` guard.
- Accept `categories` and pass to `parseXLSX`/`parseCSV` for file-based category matching.
- Expose `parseError` when parser returns zero rows.

**Key decision:** `parseFile` returns `ImportRow[]` (pure data), leaving routing and dedup to the orchestrator pipeline.

#### useImportAI

```typescript
interface UseImportAIArgs {
  availableCategoryOptions: string[];
  learningRules: ImportLearningRule[];
  setLearningRules: (updater: (prev: ImportLearningRule[]) => ImportLearningRule[]) => void;
}

interface UseImportAIReturn {
  aiCategorizing: boolean;
  aiApplied: boolean;
  aiSuggestions: AISuggestion[];
  aiSuggestionTransactionCount: number;
  aiSuggestionsByCategory: { category: string; suggestions: AISuggestion[] }[];
  handleAICategorize: (rows: ImportRow[]) => Promise<void>;
  handleApplyAISuggestions: (rows: ImportRow[]) => ImportRow[];
  handleSuggestionCategoryChange: (suggestionId: string, category: string) => void;
  handleDiscardAISuggestions: () => void;
}
```

**Responsibilities:**
- Filter eligible rows (included, non-transfer, non-file-category, category "Otros") and group by description pattern.
- Invoke `categorizeWithAI` and filter results by confidence ≥ 0.75 and non-"Otros" category.
- Sort suggestions by category then pattern (es-CO collation).
- Apply suggestions to row indexes and persist learning rules via `upsertImportLearningRule`.
- Silently handle AI failures (leave rows unchanged).

**Key decision:** `handleApplyAISuggestions` returns new `ImportRow[]` rather than mutating state internally, so the orchestrator controls when state updates.

#### useImportDedup

```typescript
interface UseImportDedupArgs {
  existingTransactions: Transaction[];
}

interface UseImportDedupReturn {
  markDuplicates: (rows: ImportRow[], accountId: string) => ImportRow[];
}
```

**Responsibilities:**
- Build key sets from `existingTransactions` for the given `accountId`.
- Normal movements: exact key = `type|day|amount|desc(20chars)`.
- Transfers: transfer key = `day|amount` (no description — text differs between banks).
- Mark `isDuplicate: true` and `include: false` for matches against DB or same-file duplicates.
- Mark `include: false` for transfers and `needsExchangeRate: true` rows.
- All comparison in memory — zero Firestore reads.

**Key decision:** `markDuplicates` is a pure function (rows + accountId → new rows). Trivially testable and re-runnable on account change.

#### Pipeline (routeRows pure function)

```typescript
function routeRows(
  rows: ImportRow[],
  baseAccountId: string,
  learningRules: ImportLearningRule[],
  accounts: Account[],
  categoryOptions: string[]
): ImportRow[] {
  return rows.map(row => {
    const isTransfer = row.type === 'transfer' || isInternalTransferDescription(row.description);
    const { accountId, toAccountId } = inferTransferRoute(baseAccountId, isTransfer, accounts);
    const learnedCategory = row.categorySource === 'file'
      ? null
      : findLearnedCategory(row.description, learningRules, categoryOptions);
    return {
      ...row,
      accountId,
      toAccountId,
      category: learnedCategory ?? row.suggestedCategory,
    };
  });
}
```

#### Orchestrator flow (useImportWizard)

```typescript
// handleFileChange pipeline:
// 1. PARSE  → const parsedRows = await parseFile(file);
// 2. ROUTE  → const routed = routeRows(parsedRows, accountId, ...);
// 3. DEDUP  → const deduped = markDuplicates(routed, accountId);
// 4. STATE  → setRows(deduped); computeParseStats(deduped);

// handleAccountChange (re-runs route+dedup without re-parsing):
// setRows(prev => markDuplicates(routeRows(prev, newAccountId, ...), newAccountId));
```

### Area 2: Card Payment Schedule

#### useCardPaymentSchedule

```typescript
function useCardPaymentSchedule(
  accounts: Account[],
  transactions: Transaction[],       // MUST be balanceTransactions (full history)
  recurringPayments: RecurringPayment[],
  now?: Date                          // injectable for deterministic tests
): MonthGroup[]
```

**Algorithm:**
1. Filter credit accounts with `cutoffDay` and `paymentDay`.
2. For each card, compute cycles from `-6` to `+maxFuture`:
   - `maxFuture` = max cycle index of any active installment, or +3 for recurring-only, hard cap +12.
3. For each cycle, compute `statementTotal`:
   - `firstIndex = cycleIndexOf(cutoffDay, tx.date, now)` — cycle where installment 1 is billed.
   - Transaction contributes to cycle `t` if `(t - firstIndex) ∈ [0, installments)`.
   - Amount = `tx.monthlyInstallmentAmount ?? tx.amount` (installments > 1) or `tx.amount` (contado).
4. For future cycles (`index > 0`), add active recurring payments:
   - `monthly` → every future cycle.
   - `yearly` → only if cycle's payment month matches `getYearlyAnchorMonth`.
5. For past/current cycles (`index <= 0`), compute payment status:
   - Sum payments (income + transfer-to-card) in payment window.
   - `paid`: payments ≥ total. `partial`: 0 < payments < total. `pending`: payments === 0.
6. Group by `paymentDueDate` month (`YYYY-MM`).
7. Mark bucket containing current month as `isCurrent: true`.
8. Filter out months with total === 0.
9. Sort ascending by `monthKey`.

#### CardStatementsModal

```typescript
interface CardStatementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];               // credit cards only
  transactions: Transaction[];       // balanceTransactions (full history)
  recurringPayments: RecurringPayment[];
  formatCurrency: (amount: number) => string;
  hideBalances: boolean;
}
```

**UI behavior:**
- Reuses `BaseModal` with `maxWidth="max-w-lg"`, title "Extractos de tarjetas" with `Receipt` icon.
- Filter dropdown: "Todas" | individual card names.
- Each `MonthPaymentRow` shows `label` + `total` (or "••••••" if `hideBalances`).
- Current month row has purple border/background highlight.
- Expandable rows show per-card breakdown with status badges:
  - `paid` → green badge. `partial` → amber ("pagaste X de Y"). `pending` → red. `projected` → gray.
- Installment detail: "cuota 3/12 — $150.000".
- Recurring items: "Netflix (periódico) — $45.900".
- Empty state: "No tienes pagos de tarjeta pendientes."

#### AccountsView Changes

"Extractos" button in header (pill style, purple, `Receipt` icon), visible when `creditCards.length > 0`:

```typescript
{creditCards.length > 0 && (
  <button
    onClick={() => setShowStatements(true)}
    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
      bg-purple-100 text-purple-700 hover:bg-purple-200
      dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 transition-colors"
  >
    <Receipt size={16} />
    Extractos
  </button>
)}
```

Passes `balanceTransactions` (from `useTransactionDomain()`), `recurringPayments`, and credit card accounts to the modal.

## Data Models

### Existing Types (unchanged)

- `ImportRow` — defined in `src/hooks/useImportTransactions.ts`
- `Transaction`, `Account`, `RecurringPayment`, `Categories` — defined in `src/types/finance.ts`
- `WizardStep`, `ImportParseStats`, `AISuggestion` — defined in `src/types/import.ts`
- `CreditCycle` — defined in `src/utils/creditCycles.ts` (moved from worktree)

### New Types

```typescript
// src/hooks/useCardPaymentSchedule.ts

interface InstallmentItem {
  description: string;
  cuota: number;      // current installment number (1-based)
  total: number;      // total installments
  amount: number;     // monthly installment amount (COP)
}

interface RecurringItem {
  name: string;
  amount: number;     // monthly amount (COP)
}

interface CardMonthPayment {
  cardId: string;
  cardName: string;
  statementTotal: number;          // total owed for this card this month (COP)
  paidAmount: number;              // payments applied (for "partial")
  status: 'paid' | 'partial' | 'pending' | 'projected';
  installmentItems: InstallmentItem[];
  recurringItems: RecurringItem[];
  cycleStart: Date;
  cycleEnd: Date;
  paymentDueDate: Date;
}

interface MonthGroup {
  monthKey: string;                // 'YYYY-MM' of paymentDueDate
  label: string;                   // 'Julio 2026' (es-CO formatted)
  total: number;                   // Σ statementTotal across cards (COP)
  isCurrent: boolean;              // bucket containing current month's payment
  isFuture: boolean;
  cards: CardMonthPayment[];
}
```

### File Changes Summary

| File | Action |
|------|--------|
| `src/utils/creditCycles.ts` | **New** (moved from worktree) |
| `src/hooks/useImportParsing.ts` | **New** — parsing hook |
| `src/hooks/useImportAI.ts` | **New** — AI categorization hook |
| `src/hooks/useImportDedup.ts` | **New** — dedup hook |
| `src/hooks/useImportWizard.ts` | **Refactor** — thin orchestrator |
| `src/hooks/useCardPaymentSchedule.ts` | **New** — pure calculation hook |
| `src/components/views/accounts/components/CardStatementsModal.tsx` | **New** — modal UI |
| `src/components/views/accounts/AccountsView.tsx` | **Edit** — "Extractos" button + modal |
| `src/hooks/useCreditCardStatement.ts` | **Delete** — replaced |
| `src/__tests__/integration/importPipeline.test.ts` | **New** — integration tests |
| `src/__tests__/hooks/useCardPaymentSchedule.test.ts` | **New** — property + unit tests |

## Error Handling

| Scenario | Handling |
|----------|----------|
| Parser returns 0 rows | `parseError` string exposed; UI shows error message |
| PDF without AI key/consent | `pdfNeedsAI: true`; UI shows CTA to configure AI |
| AI categorization fails | Silent catch; rows unchanged, `aiCategorizing: false` |
| File type unrecognized | Treat as CSV (existing behavior preserved) |
| Import batch partially fails | Already-committed chunks are consistent (tx + usedCredit in same batch); retry safe via dedup |
| No credit cards configured | "Extractos" button hidden; no computation |
| Transaction with no installments field | Treated as `installments = 1` (contado) |
| cutoffDay/paymentDay exceeds month days | Clamped via `effectiveDueDay` (e.g., 31 in Feb → 28/29) |

## Testing Strategy

**Dual approach:**
- **Property-based tests** (Vitest + fast-check): validate universal invariants across randomized inputs (minimum 100 iterations per property).
- **Example-based unit tests**: cover specific edge cases, error conditions, and integration points.
- **Integration tests**: full pipeline with mocked Firestore and deterministic fixtures.

Priority areas for property testing:
1. `useImportDedup.markDuplicates` — keying strategy, exclusion rules
2. `useCardPaymentSchedule` — installment distribution, horizon limits, zero-month omission
3. `routeRows` — account assignment, learned category application

Priority areas for example/integration testing:
1. Full import pipeline (parse → route → dedup → Firestore write)
2. Payment status computation with known fixture data
3. UI edge cases (empty state, hideBalances, no credit cards)

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: File extension routing dispatch

*For any* file with a recognized extension (`.csv`, `.xlsx`, `.xls`, `.pdf`), `useImportParsing` SHALL invoke the corresponding parser function (`parseCSV`, `parseXLSX`, or `parsePDF`) and no other parser.

**Validates: Requirements 1.1**

### Property 2: ImportRow field population invariant

*For any* non-empty output from a parser, every element in the resulting `ImportRow[]` SHALL have non-undefined values for `date` (valid Date), `description` (string), `amount` (positive number), `type` (income|expense|transfer), and `suggestedCategory` (string).

**Validates: Requirements 1.2**

### Property 3: AI eligibility filter

*For any* set of `ImportRow[]`, only rows where `include === true` AND `type !== 'transfer'` AND `categorySource !== 'file'` AND normalized `category` equals "otros" SHALL be passed to the AI categorizer.

**Validates: Requirements 2.1**

### Property 4: AI confidence threshold and sort order

*For any* set of AI results, only results with `confidence >= 0.75` and a non-"Otros" category SHALL appear in the final `aiSuggestions` array, and that array SHALL be sorted by category then by pattern using es-CO collation.

**Validates: Requirements 2.2**

### Property 5: Duplicate marking invariant

*For any* `ImportRow` and set of `existingTransactions`, if the row's computed key (exact key for normal movements, transfer key for transfers) matches an existing transaction key for the target account OR matches a previously-seen key in the same file, the row SHALL have `isDuplicate === true` and `include === false`.

**Validates: Requirements 3.1, 3.2**

### Property 6: Transfer and foreign-currency exclusion

*For any* `ImportRow` where `type === 'transfer'` OR `isInternalTransferDescription(description)` returns true OR `needsExchangeRate === true`, the row SHALL have `include === false` after dedup processing.

**Validates: Requirements 3.3, 3.4**

### Property 7: Route function assigns accounts and learned categories

*For any* parsed `ImportRow` and valid account context, `routeRows` SHALL assign a non-empty `accountId`. If the row is a transfer and a single linked credit card exists for the base account, `toAccountId` SHALL be set to that card's ID. If a learned category rule matches the description and `categorySource !== 'file'`, the output category SHALL equal the learned category.

**Validates: Requirements 4.2**

### Property 8: Installment distribution across cycles

*For any* expense transaction with `installments = N` (where N ≥ 1), the transaction SHALL contribute its monthly amount to exactly N consecutive cycles starting from `cycleIndexOf(tx.date)`. For `installments = 1` (or undefined), it appears in exactly 1 cycle. For `installments > 1`, the amount `monthlyInstallmentAmount ?? amount` appears in cycles `[firstIndex, firstIndex + N)`.

**Validates: Requirements 5.2, 5.3**

### Property 9: Recurring payments appear in future cycles only

*For any* active `RecurringPayment` assigned to a credit card, it SHALL contribute to cycles with `index > 0` (monthly: every future cycle; yearly: only the cycle whose payment month matches `getYearlyAnchorMonth`) and SHALL NOT contribute to cycles with `index <= 0`.

**Validates: Requirements 5.4**

### Property 10: Payment status computation

*For any* cycle with `index <= 0`, the payment status SHALL be `'paid'` when payments ≥ statementTotal, `'partial'` when 0 < payments < statementTotal, and `'pending'` when payments === 0. *For any* cycle with `index > 0`, status SHALL be `'projected'`.

**Validates: Requirements 5.5**

### Property 11: Zero-month omission

*For any* output of `useCardPaymentSchedule`, every `MonthGroup` in the array SHALL have `total > 0`. No month with zero total SHALL appear in the result.

**Validates: Requirements 5.6**

### Property 12: Horizon boundary limits

*For any* input to `useCardPaymentSchedule`, the output SHALL contain at most 6 past-cycle months and at most 12 future-cycle months, regardless of how many transactions or recurring payments span beyond those limits.

**Validates: Requirements 5.7**

### Property 13: Month grouping key format and isCurrent uniqueness

*For any* output `MonthGroup[]`, each `monthKey` SHALL be in `YYYY-MM` format derived from its cards' `paymentDueDate`. At most one `MonthGroup` SHALL have `isCurrent === true`, and its `monthKey` SHALL equal the current month's `YYYY-MM` string.

**Validates: Requirements 5.8**

### Property 14: Balance masking under hideBalances

*For any* rendered `CardStatementsModal` with `hideBalances === true` and non-empty data, all monetary display slots (month totals, statement totals, paid amounts, installment amounts, recurring amounts) SHALL render the mask "••••••" instead of formatted currency values.

**Validates: Requirements 6.6**
