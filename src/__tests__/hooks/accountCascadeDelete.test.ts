/**
 * A2 — Cobertura del CASCADE DELETE de cuenta (useAccounts.deleteAccount).
 *
 * Es la operación de escritura más riesgosa del proyecto: borra la cuenta + sus
 * transacciones/recurrentes/deudas vinculadas en un único writeBatch atómico y
 * RECONCILIA allí el usedCredit desde las transacciones SOBREVIVIENTES. Un bug
 * aquí corrompe balances/duplica deuda sin señal de test. Hasta ahora: 0 tests.
 *
 * Mockeamos firebase/firestore con un store en memoria que aplica los deletes al
 * hacer commit, de modo que la fase de reconciliación vea exactamente los
 * sobrevivientes correctos. Audit A2 (cascade delete de cuenta).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Account, Transaction } from '../../types/finance';

const M = vi.hoisted(() => ({
  txStore: new Map<string, Record<string, unknown>>(),   // id -> transacción (fuente de getDocs)
  acctStore: new Map<string, Record<string, unknown>>(), // id -> datos de cuenta (fuente de getDoc)
  userStore: new Map<string, Record<string, unknown>>(),
  log: [] as Array<{ op: string; path?: string; id?: string; data?: Record<string, unknown> }>,
  firestoreData: {} as Record<string, unknown>,
  gen: 0,
  commitError: null as Error | null,
}));

const mkRef = (path: string, id: string) => ({ __path: path, __id: id, __key: `${path}/${id}` });

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));

vi.mock('../../contexts/FirestoreContext', () => ({
  useFirestoreData: () => M.firestoreData,
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __path: path }),
  doc: (first: { __path?: string }, path?: string, id?: string) => {
    if (typeof path === 'string') return mkRef(path, id as string);
    M.gen += 1;
    return mkRef(first.__path as string, `__new${M.gen}`);
  },
  query: (coll: { __path: string }, ...cons: unknown[]) => ({ __path: coll.__path, __cons: cons }),
  where: (field: string, _op: string, value: unknown) => ({ field, value }),
  getDocs: async (q: { __cons: Array<{ field: string; value: unknown }> }) => {
    const cons = q.__cons || [];
    const matched = [...M.txStore.values()].filter(t => cons.every(c => t[c.field] === c.value));
    return { docs: matched.map(t => ({ id: t.id as string, data: () => t })) };
  },
  getDocsFromServer: async (q: {
    __path: string;
    __cons?: Array<{ field: string; value: unknown }>;
  }) => {
    const cons = q.__cons || [];
    const source = q.__path.endsWith('/accounts')
      ? [...M.acctStore.entries()].map(([id, data]) => ({ id, ...data }))
      : q.__path.endsWith('/recurringPayments')
        ? (M.firestoreData.recurringPayments as Record<string, unknown>[] ?? [])
        : q.__path.endsWith('/debts')
          ? (M.firestoreData.debts as Record<string, unknown>[] ?? [])
          : [...M.txStore.values()];
    const matched = source.filter(item => cons.every(c => item[c.field] === c.value));
    return {
      docs: matched.map(item => ({
        id: item.id as string,
        data: () => item,
      })),
    };
  },
  getDoc: async (ref: { __id: string; __path: string }) => {
    const data = ref.__path.endsWith('/transactions')
      ? M.txStore.get(ref.__id)
      : M.acctStore.get(ref.__id);
    return { exists: () => data !== undefined, data: () => data };
  },
  getDocFromServer: async (ref: { __id: string; __path: string }) => {
    const data = ref.__path.endsWith('/transactions')
      ? M.txStore.get(ref.__id)
      : M.acctStore.get(ref.__id);
    return { exists: () => data !== undefined, data: () => data };
  },
  updateDoc: async (ref: { __key: string; __id: string }, data: Record<string, unknown>) => {
    M.log.push({ op: 'updateDoc', id: ref.__id, data });
    M.acctStore.set(ref.__id, { ...(M.acctStore.get(ref.__id) || {}), ...data });
  },
  deleteField: () => ({ __deleteField: true }),
  serverTimestamp: () => new Date(),
  writeBatch: () => {
    const ops: Array<{ op: string; ref: { __path: string; __id: string }; data?: Record<string, unknown> }> = [];
    return {
      delete: (ref: { __path: string; __id: string }) => ops.push({ op: 'delete', ref }),
      update: (ref: { __path: string; __id: string }, data: Record<string, unknown>) => ops.push({ op: 'update', ref, data }),
      set: (ref: { __path: string; __id: string }, data: Record<string, unknown>) => ops.push({ op: 'set', ref, data }),
      commit: async () => {
        if (M.commitError) throw M.commitError;
        for (const o of ops) {
          M.log.push({ op: o.op, path: o.ref.__path, id: o.ref.__id, data: o.data });
          if (o.op === 'delete' && o.ref.__path.endsWith('/transactions')) M.txStore.delete(o.ref.__id);
          if (o.op === 'delete' && o.ref.__path.endsWith('/accounts')) M.acctStore.delete(o.ref.__id);
          if (o.op === 'update' && o.ref.__path.endsWith('/accounts')) {
            M.acctStore.set(o.ref.__id, { ...(M.acctStore.get(o.ref.__id) || {}), ...o.data });
          }
          if (o.op === 'set' && o.ref.__path === 'users') {
            const next = { ...(M.userStore.get(o.ref.__id) || {}), ...(o.data || {}) };
            if ((next.accountOperationLock as { __deleteField?: boolean } | undefined)?.__deleteField) {
              delete next.accountOperationLock;
            }
            M.userStore.set(o.ref.__id, next);
          }
        }
        ops.length = 0;
      },
    };
  },
  runTransaction: async (_db: unknown, fn: (t: unknown) => Promise<unknown>) =>
    fn({
      get: async (ref: { __path: string; __id: string }) => {
        const store = ref.__path === 'users' ? M.userStore : M.acctStore;
        return {
          exists: () => store.has(ref.__id),
          data: () => store.get(ref.__id),
        };
      },
      set: (ref: { __path: string; __id: string }, data: Record<string, unknown>) => {
        const store = ref.__path === 'users' ? M.userStore : M.acctStore;
        store.set(ref.__id, { ...(store.get(ref.__id) || {}), ...data });
      },
      update: (ref: { __path: string; __id: string }, data: Record<string, unknown>) => {
        const store = ref.__path === 'users' ? M.userStore : M.acctStore;
        const next = { ...(store.get(ref.__id) || {}), ...data };
        if ((next.accountOperationLock as { __deleteField?: boolean } | undefined)?.__deleteField) {
          delete next.accountOperationLock;
        }
        store.set(ref.__id, next);
      },
      delete: () => {},
    }),
}));

// Import DESPUÉS de los mocks.
import { useAccounts } from '../../hooks/useAccounts';
import {
  subscribeTransactionCacheMutations,
  type TransactionCacheMutation,
} from '../../hooks/firestore/transactionPaginationCache';

const UID = 'u1';

const sav: Account = { id: 'sav', name: 'Ahorros', type: 'savings', isDefault: false, initialBalance: 0 };
const cc: Account = { id: 'cc', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0, creditLimit: 5_000_000, usedCredit: 300_000 };

const seedFirestoreData = (accounts: Account[]) => {
  M.firestoreData = {
    accounts,
    recurringPayments: [],
    debts: [],
    loading: false,
    addAccount: vi.fn(),
    deleteAccount: vi.fn(),
    updateAccount: vi.fn(),
  };
  // El store de getDoc (reconciliación) refleja las mismas cuentas.
  accounts.forEach(a => M.acctStore.set(a.id!, { ...a }));
};

const seedTx = (t: Partial<Transaction> & { id: string }) => M.txStore.set(t.id, t as Record<string, unknown>);

const accountUpdatesOn = (id: string) => M.log.filter(
  l => l.op === 'update' && l.id === id && l.path?.endsWith('/accounts')
);
const deletedIds = () => M.log.filter(l => l.op === 'delete').map(l => l.id);
const expectReleasedLock = (kind: string) => {
  expect(M.userStore.get(UID)?.accountOperationLock).toEqual(
    expect.objectContaining({ kind, releasedAt: expect.any(Date) })
  );
};
const cacheMutations: TransactionCacheMutation[] = [];
let unsubscribeCacheMutations = () => {};

const renderAccounts = () =>
  renderHook(() => useAccounts(UID, [], vi.fn())).result;

beforeEach(() => {
  M.txStore.clear();
  M.acctStore.clear();
  M.userStore.clear();
  M.log.length = 0;
  M.gen = 0;
  M.commitError = null;
  cacheMutations.length = 0;
  unsubscribeCacheMutations = subscribeTransactionCacheMutations(mutation => {
    cacheMutations.push(mutation);
  });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  unsubscribeCacheMutations();
  vi.restoreAllMocks();
});

describe('useAccounts.deleteAccount — cascade + reconciliación (A2)', () => {
  it('reconcila usedCredit de la TC afectada desde los SOBREVIVIENTES (SET idempotente, no increment)', async () => {
    // Estado: la TC tenía una compra de 500k y un pago (transferencia) de 200k desde
    // la cuenta de ahorro → usedCredit persistido = 300k. Al BORRAR la cuenta de
    // ahorro, su transferencia-pago desaparece, así que la deuda real vuelve a 500k.
    seedFirestoreData([sav, cc]);
    seedTx({ id: 't-purchase', type: 'expense', amount: 500_000, accountId: 'cc', category: 'Compras', paid: true });
    seedTx({ id: 't-payment', type: 'transfer', amount: 200_000, accountId: 'sav', toAccountId: 'cc', category: 'Transferencia', paid: true });
    seedTx({ id: 't-other', type: 'expense', amount: 100_000, accountId: 'sav', category: 'Comida', paid: true });

    const acc = renderAccounts();
    await acc.current.deleteAccount('sav');

    // Se borran las transacciones de la cuenta de ahorro (origen) y la cuenta.
    expect(deletedIds()).toEqual(expect.arrayContaining(['t-payment', 't-other', 'sav']));
    expect(cacheMutations).toContainEqual({
      userId: UID,
      type: 'delete',
      transactionIds: expect.arrayContaining(['t-payment', 't-other']),
    });
    // La compra en la TC NO se borra (no referenciaba la cuenta de ahorro).
    expect(deletedIds()).not.toContain('t-purchase');

    // Reconciliación: usedCredit de la TC se RECOMPUTA desde los sobrevivientes
    // (solo la compra de 500k; el pago de 200k ya no existe) → 500k absoluto.
    const ccUpdates = accountUpdatesOn('cc');
    expect(ccUpdates).toHaveLength(1);
    expect(ccUpdates[0].data!.usedCredit).toBe(500_000);
    expectReleasedLock('delete-account');
  });

  it('no reconcila ninguna TC si el borrado no afecta tarjetas (cuenta de ahorro sin pagos a TC)', async () => {
    seedFirestoreData([sav, cc]);
    seedTx({ id: 't-cash', type: 'expense', amount: 100_000, accountId: 'sav', category: 'Comida', paid: true });
    // Compra en la TC, independiente de la cuenta que se borra.
    seedTx({ id: 't-cc', type: 'expense', amount: 500_000, accountId: 'cc', category: 'Compras', paid: true });

    const acc = renderAccounts();
    await acc.current.deleteAccount('sav');

    expect(deletedIds()).toEqual(expect.arrayContaining(['t-cash', 'sav']));
    // La TC no fue tocada por ninguna tx borrada → no se reconcilia.
    expect(accountUpdatesOn('cc')).toHaveLength(0);
  });

  it('descubre en servidor relaciones que aún no estaban en el estado de React', async () => {
    seedFirestoreData([sav]);
    const acc = renderAccounts();

    // Llegaron desde otro dispositivo después del último render local, pero
    // antes de adquirir el lock del cascade.
    M.acctStore.set('cc-remote', {
      ...cc,
      id: 'cc-remote',
      bankAccountId: 'sav',
    });
    M.firestoreData.recurringPayments = [{ id: 'r-remote', accountId: 'sav' }];
    M.firestoreData.debts = [{ id: 'd-remote', accountId: 'sav' }];

    await acc.current.deleteAccount('sav');

    expect(deletedIds()).toEqual(
      expect.arrayContaining(['r-remote', 'd-remote', 'sav'])
    );
    expect(accountUpdatesOn('cc-remote')[0]?.data?.bankAccountId)
      .toEqual({ __deleteField: true });
  });

  it('no invalida el caché si el commit del cascade falla', async () => {
    seedFirestoreData([sav, cc]);
    seedTx({ id: 't-cash', type: 'expense', amount: 100_000, accountId: 'sav', category: 'Comida', paid: true });
    M.commitError = new Error('permission denied');

    const acc = renderAccounts();
    await expect(acc.current.deleteAccount('sav')).rejects.toThrow(/permission denied/i);

    expect(cacheMutations).toHaveLength(0);
    expect(M.txStore.has('t-cash')).toBe(true);
  });

  it('al borrar una TC también elimina el egreso bancario vinculado', async () => {
    seedFirestoreData([sav, cc]);
    seedTx({
      id: 'pay-card', linkedTransactionId: 'pay-bank', type: 'income', amount: 200_000,
      accountId: 'cc', category: 'Pago Crédito', paid: true,
    });
    seedTx({
      id: 'pay-bank', linkedTransactionId: 'pay-card', type: 'expense', amount: 200_000,
      accountId: 'sav', category: 'Pago Crédito', paid: true,
    });

    const acc = renderAccounts();
    await acc.current.deleteAccount('cc');

    expect(deletedIds()).toEqual(expect.arrayContaining(['pay-card', 'pay-bank', 'cc']));
  });

  it('rechaza un cascade que excede el límite atómico antes de escribir', async () => {
    seedFirestoreData([sav, cc]);
    for (let index = 0; index < 490; index += 1) {
      seedTx({
        id: `bulk-${index}`,
        type: 'expense',
        amount: 1_000,
        accountId: 'sav',
        category: 'Carga masiva',
        paid: true,
      });
    }

    const acc = renderAccounts();
    await expect(acc.current.deleteAccount('sav')).rejects.toThrow(/límite atómico|forma segura/i);

    expect(M.log).toHaveLength(0);
    expect(M.acctStore.has('sav')).toBe(true);
    expect(M.txStore).toHaveLength(490);
    expect(cacheMutations).toHaveLength(0);
  });

  it('rechaza el cascade mientras otra pestaña conserva el lock de cuentas', async () => {
    seedFirestoreData([sav, cc]);
    seedTx({
      id: 't-cash',
      type: 'expense',
      amount: 100_000,
      accountId: 'sav',
      category: 'Comida',
      paid: true,
    });
    M.userStore.set(UID, {
      accountOperationLock: {
        id: 'merge-credit-cards:other-device',
        kind: 'merge-credit-cards',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const acc = renderAccounts();
    await expect(acc.current.deleteAccount('sav')).rejects.toThrow(/otra operación de cuentas/i);

    expect(M.log).toHaveLength(0);
    expect(M.txStore.has('t-cash')).toBe(true);
    expect(M.acctStore.has('sav')).toBe(true);
    expect(M.userStore.get(UID)?.accountOperationLock)
      .toEqual(expect.objectContaining({ id: 'merge-credit-cards:other-device' }));
  });

  it('protege la cuenta por defecto: lanza sin borrar nada', async () => {
    seedFirestoreData([{ ...sav, isDefault: true }, cc]);
    seedTx({ id: 't-x', type: 'expense', amount: 100_000, accountId: 'sav', category: 'Comida', paid: true });

    const acc = renderAccounts();
    await expect(acc.current.deleteAccount('sav')).rejects.toThrow(/cuenta por defecto/i);

    // Ninguna escritura ocurrió.
    expect(M.log).toHaveLength(0);
  });

  it('permite borrar la cuenta por defecto con allowDefaultDelete', async () => {
    seedFirestoreData([{ ...sav, isDefault: true }]);
    seedTx({ id: 't-x', type: 'expense', amount: 100_000, accountId: 'sav', category: 'Comida', paid: true });

    const acc = renderAccounts();
    await acc.current.deleteAccount('sav', { allowDefaultDelete: true });

    expect(deletedIds()).toEqual(expect.arrayContaining(['t-x', 'sav']));
  });
});
