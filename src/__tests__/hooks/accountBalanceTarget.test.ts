import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Transaction } from '../../types/finance';

const mockState = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  writeLog: [] as Array<{
    op: 'set' | 'update';
    key: string;
    data: Record<string, unknown>;
  }>,
  generatedId: 0,
  batchCommits: 0,
  failBatchCommit: false,
}));

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));

vi.mock('../../hooks/firestore/accountOrchestration', () => ({
  acquireAccountOperationLock: vi.fn(async () => undefined),
  assertAtomicBatchCapacity: vi.fn(),
  createAccountOperationId: vi.fn(() => 'ledger-mutation:balance-target-test'),
  createAccountOperationRelease: vi.fn((id: string, kind: string) => ({
    accountOperationLock: { id, kind, releasedAt: true },
  })),
  releaseAccountOperationLock: vi.fn(async () => undefined),
  renewAccountOperationLock: vi.fn(async () => undefined),
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __collection: path }),
  doc: (first: { __collection?: string }, path?: string, id?: string) => {
    if (path === undefined) {
      mockState.generatedId += 1;
      const generatedId = `adjustment-${mockState.generatedId}`;
      return {
        id: generatedId,
        __key: `${first.__collection}/${generatedId}`,
        __path: first.__collection,
      };
    }
    return { id, __key: `${path}/${id}`, __path: path };
  },
  where: (field: string, _operator: string, value: unknown) => ({ field, value }),
  query: (
    source: { __collection: string },
    ...filters: Array<{ field: string; value: unknown }>
  ) => ({ ...source, __filters: filters }),
  getDocFromServer: async (ref: { id: string; __key: string }) => {
    const data = mockState.store.get(ref.__key);
    return {
      id: ref.id,
      exists: () => Boolean(data),
      data: () => data ?? {},
    };
  },
  getDocsFromServer: async (reference: {
    __collection: string;
    __filters?: Array<{ field: string; value: unknown }>;
  }) => {
    const prefix = `${reference.__collection}/`;
    const filters = reference.__filters ?? [];
    const docs = [...mockState.store.entries()]
      .filter(([key, data]) => (
        key.startsWith(prefix) &&
        !key.slice(prefix.length).includes('/') &&
        filters.every(filter => data[filter.field] === filter.value)
      ))
      .map(([key, data]) => ({
        id: key.slice(prefix.length),
        data: () => data,
      }));
    return { docs };
  },
  writeBatch: () => {
    const staged: Array<{
      op: 'set' | 'update';
      ref: { __key: string; __path: string };
      data: Record<string, unknown>;
    }> = [];
    return {
      set: (
        ref: { __key: string; __path: string },
        data: Record<string, unknown>
      ) => staged.push({ op: 'set', ref, data }),
      update: (
        ref: { __key: string; __path: string },
        data: Record<string, unknown>
      ) => staged.push({ op: 'update', ref, data }),
      commit: async () => {
        if (mockState.failBatchCommit) throw new Error('batch rejected');
        staged.forEach(({ op, ref, data }) => {
          const next = op === 'update'
            ? { ...(mockState.store.get(ref.__key) ?? {}), ...data }
            : data;
          mockState.store.set(ref.__key, next);
          if (ref.__path !== 'users') {
            mockState.writeLog.push({ op, key: ref.__key, data });
          }
        });
        mockState.batchCommits += 1;
      },
    };
  },
}));

import {
  buildBalanceTargetAdjustment,
  updateAccountWithBalanceTarget,
} from '../../hooks/firestore/accountBalanceTarget';
import {
  subscribeTransactionCacheMutations,
  type TransactionCacheMutation,
} from '../../hooks/firestore/transactionPaginationCache';

const USER_ID = 'balance-target-user';
const accountKey = (id: string) => `users/${USER_ID}/accounts/${id}`;
const transactionKey = (id: string) => `users/${USER_ID}/transactions/${id}`;

const savings: Account = {
  id: 'savings',
  name: 'Ahorros',
  type: 'savings',
  isDefault: true,
  initialBalance: 100,
};

const credit: Account = {
  id: 'credit',
  name: 'Visa',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  creditLimit: 1_000,
  usedCredit: 400,
};

const seedAccount = (account: Account) => {
  mockState.store.set(accountKey(account.id!), account as unknown as Record<string, unknown>);
};

const seedTransaction = (id: string, overrides: Partial<Transaction>) => {
  mockState.store.set(transactionKey(id), {
    type: 'income',
    amount: 50,
    category: 'Otros',
    description: 'Seed',
    date: new Date('2026-08-24T12:00:00-05:00'),
    paid: true,
    accountId: 'savings',
    ...overrides,
  } as unknown as Record<string, unknown>);
};

const cacheMutations: TransactionCacheMutation[] = [];
let unsubscribe = () => {};

beforeEach(() => {
  mockState.store.clear();
  mockState.writeLog.length = 0;
  mockState.generatedId = 0;
  mockState.batchCommits = 0;
  mockState.failBatchCommit = false;
  cacheMutations.length = 0;
  unsubscribe = subscribeTransactionCacheMutations(mutation => {
    cacheMutations.push(mutation);
  });
});

afterEach(() => {
  unsubscribe();
  vi.clearAllMocks();
});

describe('buildBalanceTargetAdjustment', () => {
  it('crea el efecto exacto y auditable para bajar un saldo activo', () => {
    const adjustment = buildBalanceTargetAdjustment({
      account: savings,
      currentValue: 150,
      targetBalance: 120,
      operationId: 'operation-1',
      transactionId: 'adjustment-1',
      now: new Date('2026-08-24T12:00:00-05:00'),
    });

    expect(adjustment).toMatchObject({
      id: 'adjustment-1',
      type: 'expense',
      amount: 30,
      accountId: 'savings',
      operationId: 'operation-1',
      mutationKind: 'balance-adjustment',
      mutationSource: 'account',
      expectedBefore: 150,
      targetBalance: 120,
    });
  });

  it('permite corregir un saldo activo histórico negativo hasta cero', () => {
    const adjustment = buildBalanceTargetAdjustment({
      account: savings,
      currentValue: -25,
      targetBalance: 0,
      operationId: 'operation-2',
      transactionId: 'adjustment-2',
    });

    expect(adjustment).toMatchObject({ type: 'income', amount: 25, targetBalance: 0 });
  });

  it('rechaza objetivos negativos o con fracciones inferiores a un centavo', () => {
    expect(() => buildBalanceTargetAdjustment({
      account: savings,
      currentValue: 100,
      targetBalance: -1,
      operationId: 'operation-3',
      transactionId: 'adjustment-3',
    })).toThrow();
    expect(() => buildBalanceTargetAdjustment({
      account: savings,
      currentValue: 100,
      targetBalance: 100.001,
      operationId: 'operation-4',
      transactionId: 'adjustment-4',
    })).toThrow();
  });
});

describe('updateAccountWithBalanceTarget', () => {
  it('recalcula desde el historial del servidor y confirma cuenta + ajuste en un batch', async () => {
    seedAccount(savings);
    seedTransaction('income-1', {});

    const adjustment = await updateAccountWithBalanceTarget(
      USER_ID,
      'savings',
      { name: 'Ahorro principal', initialBalance: 999_999 },
      120
    );

    expect(mockState.batchCommits).toBe(1);
    expect(mockState.store.get(accountKey('savings'))).toMatchObject({
      name: 'Ahorro principal',
      initialBalance: 100,
    });
    expect(adjustment).toMatchObject({
      type: 'expense',
      amount: 30,
      expectedBefore: 150,
      targetBalance: 120,
    });
    expect(mockState.store.get(transactionKey('adjustment-1'))).toMatchObject({
      type: 'expense',
      amount: 30,
      expectedBefore: 150,
      targetBalance: 120,
    });
    expect(cacheMutations).toEqual([
      expect.objectContaining({ type: 'update', userId: USER_ID }),
    ]);
  });

  it('si el servidor ya está en el objetivo, edita la cuenta sin duplicar el ajuste', async () => {
    seedAccount(savings);
    seedTransaction('income-1', {});

    const adjustment = await updateAccountWithBalanceTarget(
      USER_ID,
      'savings',
      { name: 'Ahorro confirmado' },
      150
    );

    expect(adjustment).toBeNull();
    expect(mockState.writeLog).toEqual([
      expect.objectContaining({ op: 'update', key: accountKey('savings') }),
    ]);
    expect(cacheMutations).toHaveLength(0);
  });

  it('permite fijar el activo exactamente en cero sin fallar por fondos', async () => {
    seedAccount(savings);

    const adjustment = await updateAccountWithBalanceTarget(
      USER_ID,
      'savings',
      {},
      0
    );

    expect(adjustment).toMatchObject({ type: 'expense', amount: 100, targetBalance: 0 });
    expect(mockState.store.get(transactionKey('adjustment-1'))).toMatchObject({
      type: 'expense',
      amount: 100,
      targetBalance: 0,
    });
    expect(mockState.batchCommits).toBe(1);
  });

  it('fija usedCredit al objetivo y evita que updates del cliente sobrescriban la autoridad', async () => {
    seedAccount(credit);

    const adjustment = await updateAccountWithBalanceTarget(
      USER_ID,
      'credit',
      { name: 'Visa principal', usedCredit: 999, creditDebtModelVersion: 999 },
      250
    );

    expect(adjustment).toMatchObject({ type: 'income', amount: 150 });
    expect(mockState.store.get(accountKey('credit'))).toMatchObject({
      name: 'Visa principal',
      usedCredit: 250,
    });
    expect(mockState.store.get(accountKey('credit'))?.creditDebtModelVersion).toBeUndefined();
  });

  it('un rechazo del commit no deja cuenta, transacción ni caché parcialmente actualizadas', async () => {
    seedAccount(savings);
    seedTransaction('income-1', {});
    mockState.failBatchCommit = true;

    await expect(updateAccountWithBalanceTarget(
      USER_ID,
      'savings',
      { name: 'No debe persistir' },
      120
    )).rejects.toThrow('batch rejected');

    expect(mockState.store.get(accountKey('savings'))?.name).toBe('Ahorros');
    expect(mockState.store.has(transactionKey('adjustment-1'))).toBe(false);
    expect(mockState.writeLog).toHaveLength(0);
    expect(mockState.batchCommits).toBe(0);
    expect(cacheMutations).toHaveLength(0);
  });

  it('rechaza una tarjeta sin autoridad usedCredit válida antes del batch', async () => {
    const invalidCredit = { ...credit };
    delete invalidCredit.usedCredit;
    seedAccount(invalidCredit);

    await expect(updateAccountWithBalanceTarget(
      USER_ID,
      'credit',
      { name: 'Visa inválida' },
      250
    )).rejects.toMatchObject({ code: 'INVALID_ACCOUNT_AUTHORITY' });

    expect(mockState.batchCommits).toBe(0);
    expect(mockState.writeLog).toHaveLength(0);
    expect(cacheMutations).toHaveLength(0);
  });

  it('rechaza una cuenta inexistente sin escribir', async () => {
    await expect(updateAccountWithBalanceTarget(
      USER_ID,
      'missing',
      { name: 'No existe' },
      100
    )).rejects.toMatchObject({ code: 'INVALID_ACCOUNT_AUTHORITY' });

    expect(mockState.batchCommits).toBe(0);
    expect(mockState.writeLog).toHaveLength(0);
  });
});
