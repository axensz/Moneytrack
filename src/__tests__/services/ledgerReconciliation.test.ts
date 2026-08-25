import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeDocument = {
  id: string;
  data: () => Record<string, unknown>;
};

type FakeReference = { path: string };

const state = vi.hoisted(() => ({
  collections: new Map<string, FakeDocument[]>(),
  stagedWrites: [] as Array<{
    action: 'set' | 'update';
    path: string;
    data: Record<string, unknown>;
  }>,
  commits: 0,
  execute: vi.fn(),
  cacheMutations: [] as unknown[],
}));

const deleteSentinel = { __deleteField: true } as const;

const mutateDocument = (
  action: 'set' | 'update',
  reference: FakeReference,
  values: Record<string, unknown>,
) => {
  const slash = reference.path.lastIndexOf('/');
  const collectionPath = reference.path.slice(0, slash);
  const id = reference.path.slice(slash + 1);
  const documents = state.collections.get(collectionPath) ?? [];
  const current = documents.find(document => document.id === id)?.data() ?? {};
  const next = action === 'set' ? { ...values } : { ...current, ...values };
  Object.entries(next).forEach(([key, value]) => {
    if (value === deleteSentinel) delete next[key];
  });
  state.collections.set(collectionPath, [
    ...documents.filter(document => document.id !== id),
    { id, data: () => next },
  ]);
};

vi.mock('../../lib/firebaseDb', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string): FakeReference => ({ path }),
  doc: (_db: unknown, ...segments: string[]): FakeReference => ({
    path: segments.join('/'),
  }),
  getDocsFromServer: vi.fn(async (reference: FakeReference) => ({
    docs: state.collections.get(reference.path) ?? [],
  })),
  deleteField: () => deleteSentinel,
}));

vi.mock('../../hooks/firestore/transactionPaginationCache', () => ({
  publishTransactionCacheMutation: (mutation: unknown) => {
    state.cacheMutations.push(mutation);
  },
}));

vi.mock('../../hooks/firestore/ledgerMutationOrchestration', () => ({
  executeAuthenticatedLedgerMutation: state.execute,
}));

import type { Account, Transaction } from '../../types/finance';
import {
  buildAssetAdjustmentPlan,
  buildCreditHistoryAuthorityPlan,
  buildLinkRepairPlan,
} from '../../utils/ledgerRepairPlans';
import {
  executeConfirmedLedgerRepair,
  loadServerLedgerReconciliation,
  loadServerLedgerReconciliationBundle,
} from '../../services/ledgerReconciliation';

const document = (id: string, data: Record<string, unknown>): FakeDocument => ({
  id,
  data: () => data,
});

const timestamp = (iso: string) => ({ toDate: () => new Date(iso) });

const seedNegativeLedger = () => {
  state.collections.set('users/user-1/accounts', [document('account-1', {
    name: 'Cuenta',
    type: 'savings',
    isDefault: true,
    initialBalance: 10,
  })]);
  state.collections.set('users/user-1/transactions', [document('expense', {
    type: 'expense',
    amount: 20,
    category: 'Otros',
    description: 'Compra',
    date: timestamp('2026-08-24T12:00:00.000Z'),
    paid: true,
    accountId: 'account-1',
  })]);
  state.collections.set('users/user-1/debts', []);
  state.collections.set('users/user-1/recurringPayments', []);
};

const installAuthenticatedExecutor = () => {
  state.execute.mockImplementation(async (
    _userId: string,
    prepare: (tools: {
      operationId: string;
      loadContext(accountIds: readonly string[]): Promise<{
        accounts: Account[];
        transactions: Transaction[];
        authorities: [];
        canonicalAccountId(referenceId: string): string;
      }>;
    }) => Promise<{
      stage(batch: {
        set(reference: FakeReference, data: Record<string, unknown>): void;
        update(reference: FakeReference, data: Record<string, unknown>): void;
      }): void;
      result: unknown;
    }>,
    options: { operationId: string },
  ) => {
    const preparation = await prepare({
      operationId: options.operationId,
      loadContext: async () => ({
        accounts: (state.collections.get('users/user-1/accounts') ?? []).map(item => ({
          id: item.id,
          ...item.data(),
        } as Account)),
        transactions: (state.collections.get('users/user-1/transactions') ?? []).map(item => {
          const data = item.data();
          return {
            id: item.id,
            ...data,
            date: (data.date as { toDate(): Date }).toDate(),
          } as Transaction;
        }),
        authorities: [],
        canonicalAccountId: referenceId => referenceId,
      }),
    });
    const batch = {
      set: (reference: FakeReference, data: Record<string, unknown>) => {
        state.stagedWrites.push({ action: 'set', path: reference.path, data });
        mutateDocument('set', reference, data);
      },
      update: (reference: FakeReference, data: Record<string, unknown>) => {
        state.stagedWrites.push({ action: 'update', path: reference.path, data });
        mutateDocument('update', reference, data);
      },
    };
    preparation.stage(batch);
    state.commits += 1;
    return preparation.result;
  });
};

beforeEach(() => {
  state.collections.clear();
  state.stagedWrites.length = 0;
  state.cacheMutations.length = 0;
  state.commits = 0;
  state.execute.mockReset();
  installAuthenticatedExecutor();
});

describe('ledgerReconciliation service', () => {
  it('lee toda la autoridad desde servidor y conserva documentos inválidos', async () => {
    seedNegativeLedger();
    state.collections.get('users/user-1/transactions')?.push(document('invalid', {
      type: 'expense',
      amount: 5,
      category: 'Otros',
      description: 'Inválida',
      date: timestamp('2026-08-24T13:00:00.000Z'),
      paid: 'sí',
      accountId: 'account-1',
    }));

    const report = await loadServerLedgerReconciliation('user-1');

    expect(report).toMatchObject({
      source: 'server',
      complete: true,
      sourceCounts: {
        accounts: 1,
        transactions: 1,
        invalidTransactions: 1,
      },
    });
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'invalid-record',
      entityId: 'invalid',
    }));
  });

  it('no adquiere lease ni escribe antes de la confirmación exacta', async () => {
    seedNegativeLedger();
    const report = await loadServerLedgerReconciliation('user-1');
    const plan = buildAssetAdjustmentPlan({
      report,
      accountId: 'account-1',
      targetBalance: 0,
      effectiveAt: new Date('2026-08-24T18:00:00.000Z'),
    });

    await expect(executeConfirmedLedgerRepair('user-1', plan, 'confirmar'))
      .rejects.toThrow(/confirmación/i);
    expect(state.execute).not.toHaveBeenCalled();
    expect(state.stagedWrites).toHaveLength(0);
    expect(state.commits).toBe(0);
  });

  it('rechaza un plan obsoleto después del lease y antes del batch de dominio', async () => {
    seedNegativeLedger();
    const report = await loadServerLedgerReconciliation('user-1');
    const plan = buildAssetAdjustmentPlan({
      report,
      accountId: 'account-1',
      targetBalance: 0,
      effectiveAt: new Date('2026-08-24T18:00:00.000Z'),
    });
    const accountDocument = state.collections.get('users/user-1/accounts')?.[0];
    state.collections.set('users/user-1/accounts', [document('account-1', {
      ...accountDocument?.data(),
      initialBalance: 11,
    })]);

    await expect(executeConfirmedLedgerRepair(
      'user-1',
      plan,
      plan.confirmationPhrase,
    )).rejects.toThrow(/obsoleto|cambió/i);
    expect(state.execute).toHaveBeenCalledTimes(1);
    expect(state.stagedWrites).toHaveLength(0);
    expect(state.commits).toBe(0);
  });

  it('invalida un plan de enlace si cambia el beneficiario antes del commit', async () => {
    const date = timestamp('2026-08-24T12:00:00.000Z');
    state.collections.set('users/user-1/accounts', [
      document('bank-1', {
        name: 'Banco', type: 'savings', isDefault: true, initialBalance: 1_000,
      }),
      document('card-1', {
        name: 'Tarjeta', type: 'credit', isDefault: false, initialBalance: 0, usedCredit: 0,
      }),
    ]);
    state.collections.set('users/user-1/transactions', [
      document('credit-payment', {
        type: 'income', amount: 100, category: 'Pago Crédito', description: 'Abono',
        beneficiary: 'Titular', date, paid: true, accountId: 'card-1',
        linkedTransactionId: 'wrong-id',
      }),
      document('source-payment', {
        type: 'expense', amount: 100, category: 'Pago Crédito', description: 'Pago a Tarjeta: Abono',
        beneficiary: 'Titular', date, paid: true, accountId: 'bank-1',
        linkedTransactionId: 'credit-payment',
      }),
    ]);
    state.collections.set('users/user-1/debts', []);
    state.collections.set('users/user-1/recurringPayments', []);
    const bundle = await loadServerLedgerReconciliationBundle('user-1');
    const plan = buildLinkRepairPlan({
      report: bundle.report,
      transactions: bundle.transactions,
      creditTransactionId: 'credit-payment',
      sourceTransactionId: 'source-payment',
    });
    const source = state.collections.get('users/user-1/transactions')?.find(
      item => item.id === 'source-payment'
    );
    state.collections.set('users/user-1/transactions', [
      ...(state.collections.get('users/user-1/transactions') ?? [])
        .filter(item => item.id !== 'source-payment'),
      document('source-payment', { ...source?.data(), beneficiary: 'Otra persona' }),
    ]);

    await expect(executeConfirmedLedgerRepair(
      'user-1',
      plan,
      plan.confirmationPhrase,
    )).rejects.toThrow(/obsoleto|cambió/i);

    expect(state.stagedWrites).toHaveLength(0);
    expect(state.commits).toBe(0);
  });

  it('confirma un solo batch bajo lease y devuelve conciliación fresca', async () => {
    seedNegativeLedger();
    const before = await loadServerLedgerReconciliation('user-1');
    const plan = buildAssetAdjustmentPlan({
      report: before,
      accountId: 'account-1',
      targetBalance: 0,
      effectiveAt: new Date('2026-08-24T18:00:00.000Z'),
    });

    const after = await executeConfirmedLedgerRepair(
      'user-1',
      plan,
      plan.confirmationPhrase,
    );

    expect(state.execute).toHaveBeenCalledTimes(1);
    expect(state.commits).toBe(1);
    expect(state.stagedWrites).toHaveLength(1);
    expect(state.stagedWrites[0]).toMatchObject({
      action: 'set',
      path: expect.stringMatching(/users\/user-1\/transactions\/repair-/),
    });
    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(after.accounts[0]).toMatchObject({ calculatedBalance: 0, status: 'ok' });
    expect(state.cacheMutations).toHaveLength(1);
  });

  it('soporta la reconciliación de autoridad crediticia como update confirmado', async () => {
    state.collections.set('users/user-1/accounts', [document('card-1', {
      name: 'Tarjeta',
      type: 'credit',
      isDefault: true,
      initialBalance: 0,
      creditLimit: 1_000,
      usedCredit: 250,
    })]);
    state.collections.set('users/user-1/transactions', [document('purchase', {
      type: 'expense',
      amount: 300,
      category: 'Otros',
      description: 'Compra',
      date: timestamp('2026-08-24T12:00:00.000Z'),
      paid: true,
      accountId: 'card-1',
    })]);
    state.collections.set('users/user-1/debts', []);
    state.collections.set('users/user-1/recurringPayments', []);
    const before = await loadServerLedgerReconciliation('user-1');
    const plan = buildCreditHistoryAuthorityPlan({
      report: before,
      accountId: 'card-1',
    });

    const after = await executeConfirmedLedgerRepair(
      'user-1',
      plan,
      plan.confirmationPhrase,
    );

    expect(state.stagedWrites).toContainEqual(expect.objectContaining({
      action: 'update',
      path: 'users/user-1/accounts/card-1',
      data: { usedCredit: 300 },
    }));
    expect(after.issues.some(issue => issue.code === 'credit-divergence')).toBe(false);
  });
});
