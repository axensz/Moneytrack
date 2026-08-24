# Ledger Mutation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, typed ledger boundary that normalizes persisted money, plans before/after account deltas, enforces the ordinary-negative rule, validates linked credit-card payments, and proves every ingress can consume the same invariants.

**Architecture:** Keep the financial formulas already owned by `BalanceCalculator`, `creditDeltas`, and `roundMoney`. Add one pure `ledgerMutation` module whose input is a typed before/after intent and whose output is deterministic account deltas plus asset-balance validation; `TransactionValidator` remains the form-error adapter and Firestore routing remains a later plan. Extend the existing `creditPaymentPairs` module for current reciprocal-pair validation instead of creating a second payment-pair subsystem.

**Tech Stack:** TypeScript, React-domain utilities, Vitest 4, existing MoneyTrack finance types and helpers.

**Spec:** `openspec/changes/harden-transaction-ledger-integrity/design.md` and `openspec/changes/harden-transaction-ledger-integrity/specs/transaction-ledger-integrity/spec.md`

## Global Constraints

- Add no runtime or development dependency.
- Savings/cash authority remains `initialBalance + complete paid ledger movements`; credit authority remains finite non-negative persisted `Account.usedCredit`.
- Every new `Transaction` metadata field is optional so historical documents remain readable without a backfill.
- Preserve the exact form copy `Saldo insuficiente. Disponible: $...` and all current interest/TRM behavior.
- This plan provides pure planning and client preflight only; it MUST NOT mark authenticated facade, lease, Firestore rules, recurring atomicity, guest envelope, or reconciliation tasks complete.
- Do not modify the four uncommitted notification files, `.codex/`, or `AGENTS.md`.
- Follow RED → GREEN for every production change; commit only the files named by the current task.

---

## File Structure

- `src/types/finance.ts`: shared optional transaction audit metadata and typed ledger intent contracts.
- `src/utils/ledgerMutation.ts`: the only new production module; money normalization, signed effects, before/after delta planning, and asset negative-rule validation.
- `src/utils/creditPaymentPairs.ts`: current and historical linked-payment recognition/validation.
- `src/__tests__/utils/ledgerMutation.test.ts`: normalization, planner, and negative-rule contract.
- `src/__tests__/integration/ledgerIngressParity.test.ts`: table-driven parity across manual, edit, AI, recurring, account adjustment, debt, delete, and undo intent sources.
- `src/__tests__/utils/creditPaymentPairs.test.ts`: reciprocal pair validation cases.
- `openspec/changes/harden-transaction-ledger-integrity/tasks.md`: check only tasks proven by focused and broad evidence.

### Task 1: Add backward-compatible intent and audit contracts

**Files:**
- Modify: `src/types/finance.ts:1-42`
- Test: `src/__tests__/utils/ledgerMutation.test.ts`

**Interfaces:**
- Consumes: existing `Transaction` and `Account` unions.
- Produces: `LedgerMutationKind`, `LedgerMutationSource`, `LedgerMutationMetadata`, `LedgerTransactionEffect`, and `LedgerMutationIntent`.

- [ ] **Step 1: Write the compile-time/runtime shape test**

Create `src/__tests__/utils/ledgerMutation.test.ts` with the imports and fixture below. The first test deliberately imports contracts that do not yet exist.

```ts
import { describe, expect, it } from 'vitest';
import type {
  Account,
  LedgerMutationIntent,
  LedgerMutationSource,
  Transaction,
} from '../../types/finance';

const savingsAccount: Account = {
  id: 'savings-1',
  name: 'Ahorros',
  type: 'savings',
  isDefault: true,
  initialBalance: 100_000,
};

const effect = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  type: 'expense',
  amount: 10_000,
  category: 'Comida',
  description: 'Compra',
  date: new Date('2026-08-24T12:00:00-05:00'),
  paid: true,
  accountId: savingsAccount.id!,
  ...overrides,
});

describe('ledger mutation contracts', () => {
  it('keeps audit metadata optional on historical transactions', () => {
    const historical = effect();
    expect(historical.operationId).toBeUndefined();
    expect(historical.mutationKind).toBeUndefined();
    expect(historical.mutationSource).toBeUndefined();
  });

  it.each<LedgerMutationSource>([
    'manual', 'ai', 'recurring', 'account', 'debt', 'undo', 'migration',
  ])('accepts the %s ingress source', mutationSource => {
    const intent: LedgerMutationIntent = {
      kind: 'create',
      before: [],
      after: [effect()],
      metadata: { mutationSource, operationId: 'op-1' },
    };
    expect(intent.metadata?.mutationSource).toBe(mutationSource);
  });
});
```

- [ ] **Step 2: Run typecheck to verify RED**

Run: `npm.cmd run typecheck`

Expected: FAIL because the ledger contracts and optional `Transaction` fields do not exist on `types/finance`. Vitest alone is not the RED gate for a type-only change because its transformer erases type imports.

- [ ] **Step 3: Add the exact optional contracts**

Add these unions/interfaces to `src/types/finance.ts`, and add the five optional metadata fields to `Transaction`:

```ts
export type LedgerMutationKind =
  | 'create'
  | 'edit'
  | 'delete'
  | 'restore'
  | 'transfer'
  | 'credit-payment'
  | 'recurring-post'
  | 'balance-adjustment'
  | 'migration';

export type LedgerMutationSource =
  | 'manual'
  | 'ai'
  | 'recurring'
  | 'account'
  | 'debt'
  | 'undo'
  | 'migration';

export interface LedgerMutationMetadata {
  operationId?: string;
  mutationSource?: LedgerMutationSource;
  expectedBefore?: number;
  targetBalance?: number;
}

export type LedgerTransactionEffect = Pick<
  Transaction,
  | 'id'
  | 'type'
  | 'amount'
  | 'date'
  | 'paid'
  | 'accountId'
  | 'toAccountId'
  | 'linkedTransactionId'
>;

export interface LedgerMutationIntent {
  kind: LedgerMutationKind;
  before: readonly LedgerTransactionEffect[];
  after: readonly LedgerTransactionEffect[];
  metadata?: LedgerMutationMetadata;
}
```

Optional `Transaction` fields:

```ts
operationId?: string;
mutationKind?: LedgerMutationKind;
mutationSource?: LedgerMutationSource;
expectedBefore?: number;
targetBalance?: number;
```

- [ ] **Step 4: Verify GREEN and type compatibility**

Run: `npm.cmd run test:run -- src/__tests__/utils/ledgerMutation.test.ts`

Expected: PASS, 2 tests.

Run: `npm.cmd run typecheck`

Expected: PASS with historical `Transaction` fixtures unchanged.

- [ ] **Step 5: Commit the contract**

```powershell
git add -- src/types/finance.ts src/__tests__/utils/ledgerMutation.test.ts
git commit -m "feat: define ledger mutation contracts"
```

### Task 2: Normalize money and plan before/after account deltas

**Files:**
- Create: `src/utils/ledgerMutation.ts`
- Modify: `src/__tests__/utils/ledgerMutation.test.ts`

**Interfaces:**
- Consumes: `LedgerMutationIntent`, `Account`, `TRANSACTION_VALIDATION.amount`, and `roundMoney`.
- Produces:
  - `normalizeLedgerAmount(value: number): number`
  - `planLedgerMutation(intent: LedgerMutationIntent, assets: readonly LedgerAssetAuthority[]): LedgerMutationPlan`
  - `LedgerMutationValidationError` with stable codes.

- [ ] **Step 1: Add failing normalization cases**

Append table tests for the persistence boundary:

```ts
import { normalizeLedgerAmount, planLedgerMutation } from '../../utils/ledgerMutation';

describe('normalizeLedgerAmount', () => {
  it.each([
    [0.01, 0.01],
    [12_345.67, 12_345.67],
    [39_999.21999999997, 39_999.22],
    [1_000_000_000, 1_000_000_000],
  ])('normalizes %d to %d exactly once', (input, expected) => {
    expect(normalizeLedgerAmount(input)).toBe(expected);
  });

  it.each([
    [Number.NaN, 'INVALID_AMOUNT'],
    [Number.POSITIVE_INFINITY, 'INVALID_AMOUNT'],
    [0, 'OUT_OF_RANGE'],
    [-1, 'OUT_OF_RANGE'],
    [1_000_000_000.01, 'OUT_OF_RANGE'],
    [10.001, 'SUB_CENT_AMOUNT'],
  ] as const)('rejects %s with %s', (input, code) => {
    expect(() => normalizeLedgerAmount(input)).toThrowError(
      expect.objectContaining({ code })
    );
  });
});
```

- [ ] **Step 2: Verify normalization RED**

Run: `npm.cmd run test:run -- src/__tests__/utils/ledgerMutation.test.ts`

Expected: FAIL because `src/utils/ledgerMutation.ts` does not exist.

- [ ] **Step 3: Implement the minimal normalizer**

Create `src/utils/ledgerMutation.ts` with stable error codes and a floating-residue tolerance that accepts IEEE-754 noise but rejects genuine sub-cent inputs:

```ts
import { TRANSACTION_VALIDATION } from '../config/constants';
import type {
  Account,
  LedgerMutationIntent,
  LedgerTransactionEffect,
} from '../types/finance';
import { roundMoney } from './formatters';

export type LedgerMutationErrorCode =
  | 'INVALID_AMOUNT'
  | 'OUT_OF_RANGE'
  | 'SUB_CENT_AMOUNT'
  | 'INVALID_ACCOUNT_AUTHORITY'
  | 'INSUFFICIENT_FUNDS';

export class LedgerMutationValidationError extends Error {
  constructor(
    public readonly code: LedgerMutationErrorCode,
    message: string,
    public readonly accountId?: string
  ) {
    super(message);
    this.name = 'LedgerMutationValidationError';
  }
}

export function normalizeLedgerAmount(value: number): number {
  if (!Number.isFinite(value)) {
    throw new LedgerMutationValidationError('INVALID_AMOUNT', 'El monto no es válido');
  }
  const { min, max } = TRANSACTION_VALIDATION.amount;
  if (value < min || value > max) {
    throw new LedgerMutationValidationError('OUT_OF_RANGE', TRANSACTION_VALIDATION.amount.errorMessage);
  }
  const rounded = roundMoney(value);
  const floatTolerance = Number.EPSILON * Math.max(1, Math.abs(value)) * 8;
  if (Math.abs(value - rounded) > floatTolerance) {
    throw new LedgerMutationValidationError(
      'SUB_CENT_AMOUNT',
      'El monto debe expresarse con máximo dos decimales'
    );
  }
  return rounded;
}
```

- [ ] **Step 4: Verify normalization GREEN**

Run: `npm.cmd run test:run -- src/__tests__/utils/ledgerMutation.test.ts`

Expected: PASS for contract and normalization tests.

- [ ] **Step 5: Add failing planner and negative-rule cases**

Append fixtures covering create, edit, delete, restore, transfer, credit-payment pair, recurring post, and balance adjustment. Use the same generic before/after API for every kind:

```ts
describe('planLedgerMutation', () => {
  const authority = (balance: number) => [{ account: savingsAccount, currentBalance: balance }];

  it.each([
    ['create', [], [effect({ amount: 30_000 })], -30_000],
    ['edit', [effect({ amount: 10_000 })], [effect({ amount: 30_000 })], -20_000],
    ['delete', [effect({ type: 'income', amount: 20_000 })], [], -20_000],
    ['restore', [], [effect({ amount: 30_000 })], -30_000],
    ['recurring-post', [], [effect({ amount: 30_000 })], -30_000],
    ['balance-adjustment', [], [effect({ type: 'income', amount: 5_000 })], 5_000],
  ] as const)('plans %s as a %d source delta', (kind, before, after, expectedDelta) => {
    const plan = planLedgerMutation({ kind, before, after }, authority(100_000));
    expect(plan.accounts).toContainEqual({
      accountId: 'savings-1',
      beforeBalance: 100_000,
      delta: expectedDelta,
      afterBalance: 100_000 + expectedDelta,
    });
  });

  it('plans both sides of a transfer', () => {
    const destination = { ...savingsAccount, id: 'savings-2', name: 'Destino' };
    const transfer = effect({
      type: 'transfer', amount: 40_000, toAccountId: destination.id,
    });
    const plan = planLedgerMutation(
      { kind: 'transfer', before: [], after: [transfer] },
      [
        { account: savingsAccount, currentBalance: 100_000 },
        { account: destination, currentBalance: 20_000 },
      ]
    );
    expect(plan.accounts.map(item => [item.accountId, item.delta])).toEqual([
      ['savings-1', -40_000],
      ['savings-2', 40_000],
    ]);
  });

  it('rejects crossing a non-negative asset below zero', () => {
    expect(() => planLedgerMutation(
      { kind: 'create', before: [], after: [effect({ amount: 100_000.01 })] },
      authority(100_000)
    )).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_FUNDS' }));
  });

  it('rejects worsening a historical negative and allows improving it', () => {
    expect(() => planLedgerMutation(
      { kind: 'create', before: [], after: [effect({ amount: 1 })] },
      authority(-100)
    )).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_FUNDS' }));

    expect(planLedgerMutation(
      { kind: 'create', before: [], after: [effect({ type: 'income', amount: 50 })] },
      authority(-100)
    ).accounts[0].afterBalance).toBe(-50);
  });
});
```

- [ ] **Step 6: Verify planner RED**

Run: `npm.cmd run test:run -- src/__tests__/utils/ledgerMutation.test.ts`

Expected: FAIL because `planLedgerMutation` and its output types are not implemented.

- [ ] **Step 7: Implement signed effects and the planner**

Add these public shapes and implement `signedEffects` with the exact rules: unpaid rows contribute zero; income credits `accountId`; expense debits `accountId`; transfer debits `accountId` and credits `toAccountId`; before effects are subtracted from after effects; all amounts pass `normalizeLedgerAmount`.

```ts
export interface LedgerAssetAuthority {
  account: Pick<Account, 'id' | 'type'>;
  currentBalance: number;
}

export interface LedgerAccountDelta {
  accountId: string;
  beforeBalance: number;
  delta: number;
  afterBalance: number;
}

export interface LedgerMutationPlan {
  intent: LedgerMutationIntent;
  affectedAccountIds: readonly string[];
  accounts: readonly LedgerAccountDelta[];
}

const addDelta = (deltas: Map<string, number>, accountId: string | undefined, value: number): void => {
  if (!accountId) return;
  deltas.set(accountId, roundMoney((deltas.get(accountId) ?? 0) + value));
};

const addEffect = (
  deltas: Map<string, number>,
  transaction: LedgerTransactionEffect,
  direction: 1 | -1
): void => {
  if (!transaction.paid) return;
  const amount = normalizeLedgerAmount(transaction.amount) * direction;
  if (transaction.type === 'income') addDelta(deltas, transaction.accountId, amount);
  if (transaction.type === 'expense') addDelta(deltas, transaction.accountId, -amount);
  if (transaction.type === 'transfer') {
    addDelta(deltas, transaction.accountId, -amount);
    addDelta(deltas, transaction.toAccountId, amount);
  }
};
```

`planLedgerMutation` MUST iterate `before` with direction `-1`, `after` with direction `1`, sort `affectedAccountIds`, round finite current balances, and apply the negative rule only to `savings`/`cash` authorities:

```ts
const worsensAsset = (before: number, after: number): boolean =>
  (before >= 0 && after < 0) || (before < 0 && after < before);

export function planLedgerMutation(
  intent: LedgerMutationIntent,
  assets: readonly LedgerAssetAuthority[]
): LedgerMutationPlan {
  const deltas = new Map<string, number>();
  intent.before.forEach(transaction => addEffect(deltas, transaction, -1));
  intent.after.forEach(transaction => addEffect(deltas, transaction, 1));

  const affectedAccountIds = [...deltas.keys()].sort();
  const accounts = assets.flatMap(({ account, currentBalance }) => {
    const accountId = account.id;
    if (!accountId) {
      throw new LedgerMutationValidationError(
        'INVALID_ACCOUNT_AUTHORITY',
        'La cuenta no tiene una autoridad válida'
      );
    }
    if (!deltas.has(accountId)) return [];
    if (!Number.isFinite(currentBalance)) {
      throw new LedgerMutationValidationError(
        'INVALID_ACCOUNT_AUTHORITY',
        'No se pudo validar el saldo de la cuenta',
        accountId
      );
    }

    const beforeBalance = roundMoney(currentBalance);
    const delta = roundMoney(deltas.get(accountId) ?? 0);
    const afterBalance = roundMoney(beforeBalance + delta);
    if (
      (account.type === 'savings' || account.type === 'cash') &&
      worsensAsset(beforeBalance, afterBalance)
    ) {
      throw new LedgerMutationValidationError(
        'INSUFFICIENT_FUNDS',
        `Saldo insuficiente. Disponible: $${beforeBalance.toLocaleString('es-CO')}`,
        accountId
      );
    }

    return [{ accountId, beforeBalance, delta, afterBalance }];
  }).sort((left, right) => left.accountId.localeCompare(right.accountId));

  return { intent, affectedAccountIds, accounts };
}
```

The function above throws `INVALID_ACCOUNT_AUTHORITY` for a missing account ID or non-finite current balance. It throws `INSUFFICIENT_FUNDS` with the existing Spanish message and `accountId` when `worsensAsset` is true.

- [ ] **Step 8: Verify planner GREEN**

Run: `npm.cmd run test:run -- src/__tests__/utils/ledgerMutation.test.ts`

Expected: PASS for all normalization, intent, delta, transfer, and negative-rule cases.

- [ ] **Step 9: Commit the pure planner**

```powershell
git add -- src/utils/ledgerMutation.ts src/__tests__/utils/ledgerMutation.test.ts
git commit -m "feat: plan ledger mutations before persistence"
```

### Task 3: Validate current reciprocal credit-payment pairs

**Files:**
- Modify: `src/utils/creditPaymentPairs.ts`
- Modify: `src/__tests__/utils/creditPaymentPairs.test.ts`

**Interfaces:**
- Consumes: existing `isHistoricalCreditPaymentPair`, `ensureDate`, and `getAccountReferenceIds`.
- Produces: `validateCreditPaymentPair(creditTransaction, sourceTransaction, account): CreditPaymentPairValidation`.

- [ ] **Step 1: Add failing pair-validation table**

Extend the existing import and add this reciprocal current-pair helper plus table cases. Assert stable reason codes rather than prose:

```ts
import {
  findHistoricalCreditPaymentPairs,
  validateCreditPaymentPair,
} from '../../utils/creditPaymentPairs';

const currentPair = () => ({
  account: card,
  credit: transaction({
    id: 'credit-current',
    beneficiary: 'Banco Prueba',
    linkedTransactionId: 'source-current',
  }),
  source: transaction({
    id: 'source-current',
    type: 'expense',
    accountId: 'savings',
    beneficiary: 'Banco Prueba',
    description: 'Pago a Visa Gold: Junio',
    linkedTransactionId: 'credit-current',
  }),
});

it.each([
  ['missing-counterpart', undefined, 'MISSING_COUNTERPART'],
  ['one-way', { linkedTransactionId: undefined }, 'NON_RECIPROCAL_LINK'],
  ['wrong-role', { type: 'income' }, 'WRONG_ROLE'],
  ['wrong-account', { accountId: 'card' }, 'WRONG_ACCOUNT'],
  ['category', { category: 'Comida' }, 'CATEGORY_MISMATCH'],
  ['beneficiary', { beneficiary: 'Otro banco' }, 'BENEFICIARY_MISMATCH'],
  ['amount', { amount: 99_999 }, 'AMOUNT_MISMATCH'],
  ['date', { date: new Date('2026-08-25T12:00:00-05:00') }, 'DATE_MISMATCH'],
  ['paid', { paid: false }, 'PAID_MISMATCH'],
] as const)('rejects %s pairs', (_name, sourceOverrides, reason) => {
  const { credit, source, account } = currentPair();
  const candidate = sourceOverrides === undefined ? undefined : { ...source, ...sourceOverrides };
  expect(validateCreditPaymentPair(credit, candidate, account)).toEqual({
    valid: false,
    reason,
  });
});
```

Also retain one test proving `isHistoricalCreditPaymentPair` still accepts the exact unlinked legacy shape and rejects ambiguity.

- [ ] **Step 2: Verify pair-validation RED**

Run: `npm.cmd run test:run -- src/__tests__/utils/creditPaymentPairs.test.ts`

Expected: FAIL because `validateCreditPaymentPair` and its reason union do not exist.

- [ ] **Step 3: Implement the smallest current-pair validator**

Add:

```ts
export type CreditPaymentPairIssue =
  | 'MISSING_COUNTERPART'
  | 'NON_RECIPROCAL_LINK'
  | 'WRONG_ROLE'
  | 'WRONG_ACCOUNT'
  | 'CATEGORY_MISMATCH'
  | 'BENEFICIARY_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'DATE_MISMATCH'
  | 'PAID_MISMATCH';

export type CreditPaymentPairValidation =
  | { valid: true; creditTransaction: Transaction; sourceTransaction: Transaction }
  | { valid: false; reason: CreditPaymentPairIssue };

export function validateCreditPaymentPair(
  creditTransaction: Transaction,
  sourceTransaction: Transaction | undefined,
  account: Account
): CreditPaymentPairValidation {
  if (!sourceTransaction) return { valid: false, reason: 'MISSING_COUNTERPART' };
  if (
    !creditTransaction.id ||
    !sourceTransaction.id ||
    creditTransaction.linkedTransactionId !== sourceTransaction.id ||
    sourceTransaction.linkedTransactionId !== creditTransaction.id
  ) {
    return { valid: false, reason: 'NON_RECIPROCAL_LINK' };
  }
  if (creditTransaction.type !== 'income' || sourceTransaction.type !== 'expense') {
    return { valid: false, reason: 'WRONG_ROLE' };
  }

  const creditAccountIds = getAccountReferenceIds(account);
  if (
    account.type !== 'credit' ||
    !creditAccountIds.includes(creditTransaction.accountId) ||
    creditAccountIds.includes(sourceTransaction.accountId)
  ) {
    return { valid: false, reason: 'WRONG_ACCOUNT' };
  }
  if (
    !isCreditPaymentCategory(creditTransaction.category) ||
    !isCreditPaymentCategory(sourceTransaction.category)
  ) {
    return { valid: false, reason: 'CATEGORY_MISMATCH' };
  }
  if (
    normalizeText(creditTransaction.beneficiary ?? '') !==
    normalizeText(sourceTransaction.beneficiary ?? '')
  ) {
    return { valid: false, reason: 'BENEFICIARY_MISMATCH' };
  }
  if (roundMoney(creditTransaction.amount) !== roundMoney(sourceTransaction.amount)) {
    return { valid: false, reason: 'AMOUNT_MISMATCH' };
  }
  if (ensureDate(creditTransaction.date).getTime() !== ensureDate(sourceTransaction.date).getTime()) {
    return { valid: false, reason: 'DATE_MISMATCH' };
  }
  if (creditTransaction.paid !== sourceTransaction.paid) {
    return { valid: false, reason: 'PAID_MISMATCH' };
  }
  return { valid: true, creditTransaction, sourceTransaction };
}
```

Add `roundMoney` to the module imports from `./formatters`; reuse the existing private `normalizeText` and `isCreditPaymentCategory` helpers.

Validate in fail-fast order: counterpart exists; both IDs and reciprocal IDs; `income` credit / `expense` source roles; credit row belongs to `getAccountReferenceIds(account)` and source row does not; normalized amount equality; `ensureDate(...).getTime()` equality; equal `paid`. Return the two rows only on success. Do not change the legacy matcher.

- [ ] **Step 4: Verify pair-validation GREEN**

Run: `npm.cmd run test:run -- src/__tests__/utils/creditPaymentPairs.test.ts`

Expected: PASS for legacy and current pair cases.

- [ ] **Step 5: Commit reciprocal validation**

```powershell
git add -- src/utils/creditPaymentPairs.ts src/__tests__/utils/creditPaymentPairs.test.ts
git commit -m "feat: validate reciprocal credit payment pairs"
```

### Task 4: Prove table-driven ingress parity

**Files:**
- Create: `src/__tests__/integration/ledgerIngressParity.test.ts`

**Interfaces:**
- Consumes: `planLedgerMutation`, all `LedgerMutationSource` values, and the generic before/after contract implemented by Task 2.
- Produces: one regression matrix proving every named ingress label receives the same insufficient-funds invariant. It intentionally does not route real writers; authenticated adapters belong to the next plan.

- [ ] **Step 1: Add the table-driven ingress parity test**

Create `src/__tests__/integration/ledgerIngressParity.test.ts` with the complete matrix below. Each row asserts a 100,000.01 net debit against 100,000 rejects with `INSUFFICIENT_FUNDS`; then repeats with 100,000 and asserts the after balance is zero.

```ts
import { describe, expect, it } from 'vitest';
import type {
  Account,
  LedgerMutationIntent,
  LedgerMutationKind,
  LedgerMutationSource,
  Transaction,
} from '../../types/finance';
import { planLedgerMutation } from '../../utils/ledgerMutation';

const savings: Account = {
  id: 'savings-1',
  name: 'Ahorros',
  type: 'savings',
  isDefault: true,
  initialBalance: 100_000,
};

const row = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx-1',
  type: 'expense',
  amount: 100_000,
  category: 'Prueba',
  description: 'Prueba de paridad',
  date: new Date('2026-08-24T12:00:00-05:00'),
  paid: true,
  accountId: savings.id!,
  ...overrides,
});

const cases = [
  ['manual', 'create'],
  ['manual', 'edit'],
  ['manual', 'credit-payment'],
  ['ai', 'create'],
  ['recurring', 'recurring-post'],
  ['account', 'balance-adjustment'],
  ['debt', 'create'],
  ['manual', 'delete'],
  ['undo', 'restore'],
] as const satisfies readonly [LedgerMutationSource, LedgerMutationKind][];

const buildIntent = (
  mutationSource: LedgerMutationSource,
  kind: LedgerMutationKind,
  debit: number
): LedgerMutationIntent => {
  const metadata = { mutationSource, operationId: `${mutationSource}:${kind}` };
  if (kind === 'edit') {
    return {
      kind,
      before: [row({ amount: 10_000 })],
      after: [row({ amount: 10_000 + debit })],
      metadata,
    };
  }
  if (kind === 'delete') {
    return {
      kind,
      before: [row({ type: 'income', amount: debit })],
      after: [],
      metadata,
    };
  }
  if (kind === 'credit-payment') {
    return {
      kind,
      before: [],
      after: [
        row({ id: 'card-income', type: 'income', accountId: 'card-1', amount: debit }),
        row({ id: 'source-expense', amount: debit }),
      ],
      metadata,
    };
  }
  return { kind, before: [], after: [row({ amount: debit })], metadata };
};

describe('ledger ingress parity', () => {
  it.each(cases)('%s/%s rejects the same unaffordable debit', (source, kind) => {
    expect(() => planLedgerMutation(
      buildIntent(source, kind, 100_000.01),
      [{ account: savings, currentBalance: 100_000 }]
    )).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_FUNDS' }));
  });

  it.each(cases)('%s/%s accepts the exact affordable debit', (source, kind) => {
    const plan = planLedgerMutation(
      buildIntent(source, kind, 100_000),
      [{ account: savings, currentBalance: 100_000 }]
    );
    expect(plan.accounts.find(item => item.accountId === savings.id)?.afterBalance).toBe(0);
  });
});
```

- [ ] **Step 2: Verify the complete parity matrix**

Run: `npm.cmd run test:run -- src/__tests__/integration/ledgerIngressParity.test.ts`

Expected: PASS for rejection and exact-affordability rows across create, edit, credit payment, AI, recurring, account adjustment, debt, delete, and restore. A failure is fixed in `ledgerMutation.ts`; the test must not special-case an ingress.

- [ ] **Step 3: Commit the parity contract**

```powershell
git add -- src/__tests__/integration/ledgerIngressParity.test.ts
git commit -m "test: enforce ledger invariant parity across ingresses"
```

### Task 5: Verify the foundation and update only proven OpenSpec tasks

**Files:**
- Modify: `openspec/changes/harden-transaction-ledger-integrity/tasks.md`
- Modify: `docs/superpowers/plans/2026-08-24-build-ledger-mutation-foundation.md`

**Interfaces:**
- Consumes: Tasks 1–4 and the existing repository validation scripts.
- Produces: evidence for OpenSpec 1.6 and 3.1–3.5. Task 3.6 remains unchecked until the real form adapters are routed in the authenticated-facade plan.

- [ ] **Step 1: Run the focused ledger foundation suite**

Run:

```powershell
npm.cmd run test:run -- src/__tests__/utils/ledgerMutation.test.ts src/__tests__/integration/ledgerIngressParity.test.ts src/__tests__/utils/creditPaymentPairs.test.ts src/__tests__/utils/accountStrategies.test.ts src/__tests__/utils/validators.test.ts src/__tests__/hooks/transactionEditValidation.test.ts
```

Expected: all selected files pass, zero failures.

- [ ] **Step 2: Run broad static and test validation**

Run each command independently:

```powershell
npm.cmd run test:run
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

Expected: all exit 0. Do not run `npm run build` until the branch is ready for its integrated checkpoint because the build mutates `public/sw.js`.

- [ ] **Step 3: Validate OpenSpec strictly**

Run the repository-local executable if present:

```powershell
& .\node_modules\.bin\openspec.cmd validate harden-transaction-ledger-integrity --strict
```

If that executable is absent, locate the already-installed `openspec.cmd` with `Get-Command openspec.cmd -All`; do not install a new package merely to validate.

Expected: strict validation passes.

- [ ] **Step 4: Update task evidence conservatively**

Mark 1.6 and 3.1–3.5 complete only after Steps 1–3 pass. Leave 3.6 and 4.x onward unchecked.

Update this plan's completed checkboxes to match actual evidence; never pre-check a step.

- [ ] **Step 5: Refresh and review the graph**

Run the code-review graph incremental update, then `detect_changes` and `get_affected_flows` for the changed files. Require no notification-file drift and no unexplained high-risk untested planner node.

- [ ] **Step 6: Commit the verified foundation checkpoint**

```powershell
git add -- openspec/changes/harden-transaction-ledger-integrity/tasks.md docs/superpowers/plans/2026-08-24-build-ledger-mutation-foundation.md
git commit -m "docs: record ledger mutation foundation evidence"
```

Do not push or open a PR until the diff has been independently reviewed and the next authenticated-facade plan has a stable base SHA.
