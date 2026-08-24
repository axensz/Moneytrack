import { describe, expect, it } from 'vitest';
import type { Account, Transaction } from '../../types/finance';
import { getTransactionRestorePolicy } from '../../utils/transactionRestorePolicy';
import {
  BALANCE_ADJUSTMENT_CATEGORY,
  LOAN_CATEGORY,
  LOAN_PAYMENT_CATEGORY,
} from '../../config/constants';

const savings: Account = {
  id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 1_000,
};
const credit: Account = {
  id: 'cc', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0,
  usedCredit: 500, creditLimit: 2_000,
};
const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1', type: 'expense', amount: 100, category: 'Comida', description: 'x',
  date: new Date('2026-06-01'), paid: true, accountId: 'sav',
  ...overrides,
});

describe('getTransactionRestorePolicy', () => {
  it.each([
    ['standalone expense', transaction(), 'standalone', true],
    ['standalone income', transaction({ type: 'income' }), 'standalone', true],
    ['debt payment', transaction({ debtId: 'debt-1', category: LOAN_PAYMENT_CATEGORY }), 'debt-payment', true],
    ['card purchase', transaction({ accountId: 'cc' }), 'unsupported', false],
    ['linked card pair', transaction({ linkedTransactionId: 'pair-2' }), 'unsupported', false],
    ['debt principal', transaction({ debtId: 'debt-1', category: LOAN_CATEGORY }), 'unsupported', false],
    ['recurring aggregate', transaction({ recurringPaymentId: 'rent', recurringCycle: '2026-5-5' }), 'unsupported', false],
    ['transfer', transaction({ type: 'transfer', toAccountId: 'cash' }), 'unsupported', false],
    ['balance adjustment', transaction({ category: BALANCE_ADJUSTMENT_CATEGORY, mutationKind: 'balance-adjustment' }), 'unsupported', false],
    ['migration row', transaction({ mutationKind: 'migration', mutationSource: 'migration' }), 'unsupported', false],
    ['incomplete card aggregate', transaction({ mutationKind: 'credit-payment' }), 'unsupported', false],
    ['incomplete debt aggregate', transaction({ mutationSource: 'debt' }), 'unsupported', false],
  ] as const)('%s receives the expected restore command', (_label, row, kind, allowed) => {
    const policy = getTransactionRestorePolicy(row, [savings, credit]);

    expect(policy.kind).toBe(kind);
    expect(policy.allowed).toBe(allowed);
    if (!policy.allowed) expect(policy.reason).toMatch(/no se puede deshacer/i);
  });

  it('rejects a row whose account authority cannot be resolved', () => {
    expect(getTransactionRestorePolicy(transaction({ accountId: 'missing' }), [savings]))
      .toMatchObject({ kind: 'unsupported', allowed: false });
  });

  it('directs unsupported aggregates to their recreation or reconciliation flow', () => {
    expect(getTransactionRestorePolicy(transaction({ accountId: 'cc' }), [savings, credit]))
      .toMatchObject({ allowed: false, reason: expect.stringMatching(/Cuentas/) });
    expect(getTransactionRestorePolicy(
      transaction({ debtId: 'debt-1', category: LOAN_CATEGORY }),
      [savings]
    )).toMatchObject({ allowed: false, reason: expect.stringMatching(/Deudas/) });
    expect(getTransactionRestorePolicy(
      transaction({ recurringPaymentId: 'rent' }),
      [savings]
    )).toMatchObject({ allowed: false, reason: expect.stringMatching(/Pagos peri.dicos/) });
  });

  it.each([
    transaction({
      debtId: 'debt-1', category: LOAN_PAYMENT_CATEGORY,
      recurringPaymentId: 'rent', mutationKind: 'recurring-post',
    }),
    transaction({
      debtId: 'debt-1', category: LOAN_PAYMENT_CATEGORY,
      linkedTransactionId: 'pair-2', mutationKind: 'credit-payment',
    }),
    transaction({
      debtId: 'debt-1', category: LOAN_PAYMENT_CATEGORY,
      type: 'transfer', toAccountId: 'cash',
    }),
  ])('rejects a debt payment snapshot with conflicting aggregate markers', (row) => {
    expect(getTransactionRestorePolicy(row, [savings, credit]))
      .toMatchObject({ allowed: false, kind: 'unsupported' });
  });
});
