import { describe, expect, it } from 'vitest';
import type {
  Account,
  LedgerMutationIntent,
  LedgerMutationSource,
  Transaction,
} from '../../types/finance';
import { normalizeLedgerAmount, planLedgerMutation } from '../../utils/ledgerMutation';

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
    'manual',
    'ai',
    'recurring',
    'account',
    'debt',
    'undo',
    'migration',
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

describe('planLedgerMutation', () => {
  const authority = (currentBalance: number) => [{ account: savingsAccount, currentBalance }];

  it.each([
    { kind: 'create' as const, before: [], after: [effect({ amount: 30_000 })], delta: -30_000 },
    {
      kind: 'edit' as const,
      before: [effect({ amount: 10_000 })],
      after: [effect({ amount: 30_000 })],
      delta: -20_000,
    },
    {
      kind: 'delete' as const,
      before: [effect({ type: 'income', amount: 20_000 })],
      after: [],
      delta: -20_000,
    },
    { kind: 'restore' as const, before: [], after: [effect({ amount: 30_000 })], delta: -30_000 },
    {
      kind: 'recurring-post' as const,
      before: [],
      after: [effect({ amount: 30_000 })],
      delta: -30_000,
    },
    {
      kind: 'balance-adjustment' as const,
      before: [],
      after: [effect({ type: 'income', amount: 5_000 })],
      delta: 5_000,
    },
  ])('plans $kind as a $delta source delta', ({ kind, before, after, delta }) => {
    const plan = planLedgerMutation({ kind, before, after }, authority(100_000));

    expect(plan.accounts).toContainEqual({
      accountId: 'savings-1',
      beforeBalance: 100_000,
      delta,
      afterBalance: 100_000 + delta,
    });
  });

  it('plans both sides of a transfer', () => {
    const destination = { ...savingsAccount, id: 'savings-2', name: 'Destino' };
    const transfer = effect({
      type: 'transfer',
      amount: 40_000,
      toAccountId: destination.id,
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

  it('ignores an unpaid row for asset balances', () => {
    const plan = planLedgerMutation(
      { kind: 'create', before: [], after: [effect({ paid: false })] },
      authority(100_000)
    );

    expect(plan.affectedAccountIds).toEqual([]);
    expect(plan.accounts).toEqual([]);
  });

  it('rejects an invalid amount even when the row is unpaid', () => {
    expect(() =>
      planLedgerMutation(
        { kind: 'create', before: [], after: [effect({ amount: Number.NaN, paid: false })] },
        authority(100_000)
      )
    ).toThrowError(expect.objectContaining({ code: 'INVALID_AMOUNT' }));
  });

  it('rejects crossing a non-negative asset below zero', () => {
    expect(() =>
      planLedgerMutation(
        { kind: 'create', before: [], after: [effect({ amount: 100_000.01 })] },
        authority(100_000)
      )
    ).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_FUNDS' }));
  });

  it('rejects worsening a historical negative', () => {
    expect(() =>
      planLedgerMutation(
        { kind: 'create', before: [], after: [effect({ amount: 1 })] },
        authority(-100)
      )
    ).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_FUNDS' }));
  });

  it('allows improving a historical negative', () => {
    const plan = planLedgerMutation(
      { kind: 'create', before: [], after: [effect({ type: 'income', amount: 50 })] },
      authority(-100)
    );

    expect(plan.accounts[0].afterBalance).toBe(-50);
  });

  it('rejects a non-finite account authority', () => {
    expect(() =>
      planLedgerMutation(
        { kind: 'create', before: [], after: [effect({ amount: 1 })] },
        authority(Number.NaN)
      )
    ).toThrowError(expect.objectContaining({ code: 'INVALID_ACCOUNT_AUTHORITY' }));
  });
});
