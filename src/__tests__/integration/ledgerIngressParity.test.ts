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
    expect(() =>
      planLedgerMutation(
        buildIntent(source, kind, 100_000.01),
        [{ account: savings, currentBalance: 100_000 }]
      )
    ).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_FUNDS' }));
  });

  it.each(cases)('%s/%s accepts the exact affordable debit', (source, kind) => {
    const plan = planLedgerMutation(
      buildIntent(source, kind, 100_000),
      [{ account: savings, currentBalance: 100_000 }]
    );

    expect(plan.intent.metadata?.mutationSource).toBe(source);
    expect(plan.accounts.find(item => item.accountId === savings.id)?.afterBalance).toBe(0);
  });

  it('includes both documents of a credit payment in the affected account set', () => {
    const plan = planLedgerMutation(
      buildIntent('manual', 'credit-payment', 50_000),
      [{ account: savings, currentBalance: 100_000 }]
    );

    expect(plan.affectedAccountIds).toEqual(['card-1', 'savings-1']);
  });
});
