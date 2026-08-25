import { describe, expect, it } from 'vitest';
import type { Account, Transaction } from '../../types/finance';
import { buildLedgerReconciliationReport } from '../../utils/ledgerReconciliation';
import {
  buildAssetAdjustmentPlan,
  buildCreditHistoryAuthorityPlan,
  buildCreditPersistedAuthorityPlan,
  buildLinkRepairPlan,
  buildRecurringDeduplicationPlan,
} from '../../utils/ledgerRepairPlans';

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'account-1',
  name: 'Cuenta',
  type: 'savings',
  isDefault: false,
  initialBalance: 0,
  ...overrides,
});

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'transaction-1',
  type: 'expense',
  amount: 10,
  category: 'Otros',
  description: 'Movimiento',
  date: new Date('2026-08-24T12:00:00.000Z'),
  paid: true,
  accountId: 'account-1',
  ...overrides,
});

const reportFor = (
  accounts: Account[],
  transactions: Transaction[],
  complete = true,
) => buildLedgerReconciliationReport({
  source: 'server',
  complete,
  accounts,
  transactions,
  transactionIssues: [],
  debts: [],
  recurringPayments: [{
    id: 'recurring-1',
    name: 'Servicio',
    amount: 10,
    category: 'Servicios',
    dueDay: 1,
    frequency: 'monthly',
    isActive: true,
  }],
});

describe('ledgerRepairPlans', () => {
  it('crea un ajuste auditable de ahorro con evidencia antes/después', () => {
    const accounts = [account({ initialBalance: 10 })];
    const transactions = [transaction({ id: 'expense', amount: 20 })];
    const report = reportFor(accounts, transactions);
    const plan = buildAssetAdjustmentPlan({
      report,
      accountId: 'account-1',
      targetBalance: 0,
      effectiveAt: new Date('2026-08-24T18:00:00.000Z'),
    });

    expect(plan).toMatchObject({
      kind: 'asset-adjustment',
      sourceFingerprint: report.fingerprint,
      affectedIds: ['account-1'],
      before: { calculatedBalance: -10 },
      after: { calculatedBalance: 0 },
    });
    expect(plan.confirmationPhrase).toBe(`APLICAR ${plan.operationId}`);
    expect(plan.writes).toEqual([expect.objectContaining({
      entity: 'transaction',
      action: 'create',
      data: expect.objectContaining({
        type: 'income',
        amount: 10,
        category: 'Ajuste de saldo',
        accountId: 'account-1',
        paid: true,
        mutationKind: 'balance-adjustment',
        mutationSource: 'account',
        expectedBefore: -10,
        targetBalance: 0,
      }),
    })]);
  });

  it('permite elegir explícitamente historial o persistido para una tarjeta', () => {
    const card = account({
      id: 'card-1',
      name: 'Tarjeta',
      type: 'credit',
      creditLimit: 1_000,
      usedCredit: 250,
    });
    const transactions = [transaction({
      id: 'purchase',
      accountId: 'card-1',
      amount: 300,
    })];
    const report = reportFor([card], transactions);
    const historyPlan = buildCreditHistoryAuthorityPlan({ report, accountId: 'card-1' });
    const persistedPlan = buildCreditPersistedAuthorityPlan({
      report,
      accountId: 'card-1',
      effectiveAt: new Date('2026-08-24T18:00:00.000Z'),
    });

    expect(historyPlan.writes).toEqual([{
      entity: 'account',
      action: 'update',
      accountId: 'card-1',
      values: { usedCredit: 300 },
    }]);
    expect(historyPlan.before).toEqual({ persistedUsedCredit: 250, historicalUsedCredit: 300 });
    expect(historyPlan.after).toEqual({ persistedUsedCredit: 300, historicalUsedCredit: 300 });

    expect(persistedPlan.writes).toEqual([expect.objectContaining({
      entity: 'transaction',
      action: 'create',
      data: expect.objectContaining({
        type: 'income',
        amount: 50,
        accountId: 'card-1',
      }),
    })]);
    expect(persistedPlan.after).toEqual({ persistedUsedCredit: 250, historicalUsedCredit: 250 });
  });

  it('repara solo metadatos recíprocos sin reemplazar filas financieras', () => {
    const bank = account({ id: 'bank-1', name: 'Banco' });
    const card = account({
      id: 'card-1',
      name: 'Tarjeta',
      type: 'credit',
      usedCredit: 0,
    });
    const credit = transaction({
      id: 'credit-payment',
      type: 'income',
      amount: 100,
      category: 'Pago Crédito',
      description: 'Abono',
      beneficiary: 'Titular',
      accountId: 'card-1',
      linkedTransactionId: 'wrong-id',
    });
    const source = transaction({
      id: 'source-payment',
      amount: 100,
      category: 'Pago Crédito',
      description: 'Pago a Tarjeta: Abono',
      beneficiary: 'Titular',
      accountId: 'bank-1',
      linkedTransactionId: 'credit-payment',
    });
    const transactions = [credit, source];
    const report = reportFor([bank, card], transactions);
    const plan = buildLinkRepairPlan({
      report,
      transactions,
      creditTransactionId: 'credit-payment',
      sourceTransactionId: 'source-payment',
    });

    expect(plan.writes).toEqual([
      {
        entity: 'transaction',
        action: 'update',
        transactionId: 'credit-payment',
        values: { linkedTransactionId: 'source-payment' },
        unset: [],
      },
      {
        entity: 'transaction',
        action: 'update',
        transactionId: 'source-payment',
        values: { linkedTransactionId: 'credit-payment' },
        unset: [],
      },
    ]);
    expect(plan.writes.every(write => write.action === 'update')).toBe(true);
    expect(credit.linkedTransactionId).toBe('wrong-id');
  });

  it('desduplica un ciclo limpiando metadatos y conserva todas las filas', () => {
    const transactions = [
      transaction({
        id: 'cycle-a',
        recurringPaymentId: 'recurring-1',
        recurringCycle: '2026-7-1',
      }),
      transaction({
        id: 'cycle-b',
        recurringPaymentId: 'recurring-1',
        recurringCycle: '2026-7-1',
      }),
    ];
    const report = reportFor([account()], transactions);
    const plan = buildRecurringDeduplicationPlan({
      report,
      transactions,
      recurringPaymentId: 'recurring-1',
      recurringCycle: '2026-7-1',
      keepTransactionId: 'cycle-a',
    });

    expect(plan.affectedIds).toEqual(['cycle-a', 'cycle-b']);
    expect(plan.writes).toEqual([{
      entity: 'transaction',
      action: 'update',
      transactionId: 'cycle-b',
      values: {},
      unset: ['recurringCycle', 'recurringPaymentId'],
    }]);
    expect(transactions).toHaveLength(2);
    expect(transactions[1].recurringCycle).toBe('2026-7-1');
  });

  it('rechaza autoridad incompleta, inválida o un objetivo ambiguo', () => {
    const incompleteReport = reportFor([account()], [], false);
    expect(() => buildAssetAdjustmentPlan({
      report: incompleteReport,
      accountId: 'account-1',
      targetBalance: 0,
      effectiveAt: new Date(),
    })).toThrow(/completa/i);

    const report = reportFor([account()], []);
    expect(() => buildRecurringDeduplicationPlan({
      report,
      transactions: [],
      recurringPaymentId: 'recurring-1',
      recurringCycle: '2026-7-1',
      keepTransactionId: 'missing',
    })).toThrow(/duplicado|objetivo/i);
  });
});
