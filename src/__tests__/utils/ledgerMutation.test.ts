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
