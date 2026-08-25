import { describe, expect, it } from 'vitest';
import type { Account, Debt, RecurringPayment, Transaction } from '../../types/finance';
import type { TransactionDecodeIssue } from '../../utils/transactionDecoder';
import {
  buildLedgerReconciliationReport,
  type LedgerReconciliationInput,
} from '../../utils/ledgerReconciliation';

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'account-1',
  name: 'Cuenta principal',
  type: 'savings',
  isDefault: false,
  initialBalance: 100,
  ...overrides,
});

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'transaction-1',
  type: 'expense',
  amount: 10,
  category: 'Otros',
  description: 'Movimiento',
  date: new Date('2026-01-01T12:00:00.000Z'),
  paid: true,
  accountId: 'account-1',
  ...overrides,
});

const recurringPayment = (
  overrides: Partial<RecurringPayment> = {},
): RecurringPayment => ({
  id: 'recurring-1',
  name: 'Servicio',
  amount: 10,
  category: 'Servicios',
  dueDay: 1,
  frequency: 'monthly',
  isActive: true,
  ...overrides,
});

const debt = (overrides: Partial<Debt> = {}): Debt => ({
  id: 'debt-1',
  personName: 'Andrea',
  type: 'lent',
  originalAmount: 100,
  remainingAmount: 80,
  accountId: 'account-1',
  isSettled: false,
  ...overrides,
});

const input = (
  overrides: Partial<LedgerReconciliationInput> = {},
): LedgerReconciliationInput => ({
  source: 'server',
  complete: true,
  accounts: [account()],
  transactions: [],
  transactionIssues: [],
  debts: [],
  recurringPayments: [],
  ...overrides,
});

describe('buildLedgerReconciliationReport', () => {
  it('explica el saldo con movimientos pagados ordenados y cruces por cero', () => {
    const report = buildLedgerReconciliationReport(input({
      accounts: [
        account(),
        account({ id: 'account-2', name: 'Secundaria', initialBalance: 0 }),
      ],
      transactions: [
        transaction({
          id: 'pending',
          amount: 999,
          paid: false,
          date: new Date('2026-01-05T12:00:00.000Z'),
        }),
        transaction({
          id: 'incoming',
          type: 'transfer',
          amount: 100,
          accountId: 'account-2',
          toAccountId: 'account-1',
          date: new Date('2026-01-03T12:00:00.000Z'),
        }),
        transaction({
          id: 'expense',
          amount: 150,
          date: new Date('2026-01-01T12:00:00.000Z'),
        }),
        transaction({
          id: 'outgoing',
          type: 'transfer',
          amount: 20,
          accountId: 'account-1',
          toAccountId: 'account-2',
          date: new Date('2026-01-04T12:00:00.000Z'),
        }),
        transaction({
          id: 'income',
          type: 'income',
          amount: 40,
          date: new Date('2026-01-02T12:00:00.000Z'),
        }),
      ],
    }));

    const primary = report.accounts.find(item => item.accountId === 'account-1');
    expect(primary).toMatchObject({
      initialBalance: 100,
      paidIncome: 40,
      paidExpense: 150,
      incomingTransfers: 100,
      outgoingTransfers: 20,
      calculatedBalance: 70,
      status: 'ok',
    });
    expect(primary?.movements.map(movement => [
      movement.transactionId,
      movement.signedAmount,
      movement.runningBalance,
      movement.crossesZero,
    ])).toEqual([
      ['expense', -150, -50, true],
      ['income', 40, -10, false],
      ['incoming', 100, 90, true],
      ['outgoing', -20, 70, false],
    ]);
    expect(primary?.crossingZeroTransactionIds).toEqual(['expense', 'incoming']);
    expect(primary?.pendingRows.map(row => row.transactionId)).toEqual(['pending']);
  });

  it('compara la deuda histórica con usedCredit sin modificar autoridades', () => {
    const card = account({
      id: 'card-1',
      name: 'Tarjeta',
      type: 'credit',
      initialBalance: 0,
      creditLimit: 1_000,
      usedCredit: 349.99,
    });
    const report = buildLedgerReconciliationReport(input({
      accounts: [card],
      transactions: [transaction({
        id: 'purchase',
        accountId: 'card-1',
        amount: 300,
        totalInterestAmount: 50,
      })],
    }));

    expect(report.accounts[0].creditAuthority).toEqual({
      persistedUsedCredit: 349.99,
      historicalUsedCredit: 350,
      difference: -0.01,
    });
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'credit-divergence',
      accountId: 'card-1',
      entityId: 'card-1',
    }));
    expect(card.usedCredit).toBe(349.99);
  });

  it.each([
    ['incomplete', input({ complete: false })],
    ['invalid-record', input({
      transactionIssues: [{
        code: 'invalid-date',
        transactionId: 'invalid-1',
        message: 'Fecha inválida',
      } satisfies TransactionDecodeIssue],
    })],
    ['orphan-reference', input({
      transactions: [transaction({ id: 'orphan-account', accountId: 'missing' })],
    })],
    ['orphan-reference', input({
      transactions: [transaction({ id: 'orphan-debt', debtId: 'missing' })],
    })],
    ['broken-link', input({
      transactions: [transaction({ id: 'half-payment', linkedTransactionId: 'missing' })],
    })],
    ['recurring-duplicate', input({
      recurringPayments: [recurringPayment()],
      transactions: [
        transaction({
          id: 'cycle-a',
          recurringPaymentId: 'recurring-1',
          recurringCycle: '2026-0-1',
        }),
        transaction({
          id: 'cycle-b',
          recurringPaymentId: 'recurring-1',
          recurringCycle: '2026-0-1',
        }),
      ],
    })],
    ['dependent-debt-mismatch', input({
      debts: [debt({ remainingAmount: 90 })],
      transactions: [
        transaction({
          id: 'principal',
          amount: 100,
          category: 'Préstamo',
          debtId: 'debt-1',
          mutationSource: 'debt',
        }),
        transaction({
          id: 'payment',
          type: 'income',
          amount: 20,
          category: 'Cobro Préstamo',
          debtId: 'debt-1',
          mutationSource: 'debt',
        }),
      ],
    })],
    ['negative-explained', input({
      accounts: [account({ initialBalance: 10 })],
      transactions: [transaction({ id: 'crossing', amount: 20 })],
    })],
  ] as const)('clasifica %s', (expectedCode, reconciliationInput) => {
    const report = buildLedgerReconciliationReport(reconciliationInput);

    expect(report.issues).toContainEqual(expect.objectContaining({ code: expectedCode }));
  });

  it('ordena las clasificaciones por prioridad y expone el estado más crítico', () => {
    const report = buildLedgerReconciliationReport(input({
      complete: false,
      transactionIssues: [{
        code: 'invalid-date',
        transactionId: 'invalid-1',
        message: 'Fecha inválida',
      }],
      transactions: [transaction({ id: 'orphan', accountId: 'missing' })],
    }));

    expect(report.issues.map(issue => issue.code)).toEqual([
      'incomplete',
      'invalid-record',
      'orphan-reference',
    ]);
    expect(report.status).toBe('incomplete');
  });

  it('produce una huella estable por contenido y sensible a cambios de autoridad', () => {
    const first = input({
      accounts: [account(), account({ id: 'account-2', name: 'Dos' })],
      transactions: [
        transaction({ id: 'one' }),
        transaction({ id: 'two', amount: 20 }),
      ],
    });
    const reordered = {
      ...first,
      accounts: [...first.accounts].reverse(),
      transactions: [...first.transactions].reverse(),
    };
    const changed = {
      ...first,
      transactions: first.transactions.map(item => (
        item.id === 'two' ? { ...item, amount: 21 } : item
      )),
    };
    const changedBeneficiary = {
      ...first,
      transactions: first.transactions.map(item => (
        item.id === 'two' ? { ...item, beneficiary: 'Otra persona' } : item
      )),
    };

    expect(buildLedgerReconciliationReport(first).fingerprint)
      .toBe(buildLedgerReconciliationReport(reordered).fingerprint);
    expect(buildLedgerReconciliationReport(first).fingerprint)
      .not.toBe(buildLedgerReconciliationReport(changed).fingerprint);
    expect(buildLedgerReconciliationReport(first).fingerprint)
      .not.toBe(buildLedgerReconciliationReport(changedBeneficiary).fingerprint);
  });
});
