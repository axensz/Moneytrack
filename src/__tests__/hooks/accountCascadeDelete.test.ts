/**
 * A2 — Cobertura del CASCADE DELETE de cuenta (useAccounts.deleteAccount).
 *
 * Es la operación de escritura más riesgosa del proyecto: borra la cuenta + sus
 * transacciones/recurrentes/deudas vinculadas en un writeBatch multi-batch NO
 * atómico, y luego RECONCILIA el usedCredit de las TC afectadas recomputándolo
 * desde las transacciones SOBREVIVIENTES (SET idempotente, no increment). Un bug
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
  log: [] as Array<{ op: string; path?: string; id?: string; data?: Record<string, unknown> }>,
  firestoreData: {} as Record<string, unknown>,
  gen: 0,
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
  getDoc: async (ref: { __id: string }) => {
    const data = M.acctStore.get(ref.__id);
    return { exists: () => data !== undefined, data: () => data };
  },
  updateDoc: async (ref: { __key: string; __id: string }, data: Record<string, unknown>) => {
    M.log.push({ op: 'updateDoc', id: ref.__id, data });
    M.acctStore.set(ref.__id, { ...(M.acctStore.get(ref.__id) || {}), ...data });
  },
  deleteField: () => ({ __deleteField: true }),
  writeBatch: () => {
    const ops: Array<{ op: string; ref: { __path: string; __id: string }; data?: Record<string, unknown> }> = [];
    return {
      delete: (ref: { __path: string; __id: string }) => ops.push({ op: 'delete', ref }),
      update: (ref: { __path: string; __id: string }, data: Record<string, unknown>) => ops.push({ op: 'update', ref, data }),
      set: (ref: { __path: string; __id: string }, data: Record<string, unknown>) => ops.push({ op: 'set', ref, data }),
      commit: async () => {
        for (const o of ops) {
          M.log.push({ op: o.op, path: o.ref.__path, id: o.ref.__id, data: o.data });
          if (o.op === 'delete' && o.ref.__path.endsWith('/transactions')) M.txStore.delete(o.ref.__id);
          if (o.op === 'delete' && o.ref.__path.endsWith('/accounts')) M.acctStore.delete(o.ref.__id);
          if (o.op === 'update' && o.ref.__path.endsWith('/accounts')) {
            M.acctStore.set(o.ref.__id, { ...(M.acctStore.get(o.ref.__id) || {}), ...o.data });
          }
        }
        ops.length = 0;
      },
    };
  },
  runTransaction: async (_db: unknown, fn: (t: unknown) => Promise<unknown>) =>
    fn({ get: async () => ({ exists: () => false }), set: () => {}, update: () => {}, delete: () => {} }),
}));

// Import DESPUÉS de los mocks.
import { useAccounts } from '../../hooks/useAccounts';

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

const updateDocsOn = (id: string) => M.log.filter(l => l.op === 'updateDoc' && l.id === id);
const deletedIds = () => M.log.filter(l => l.op === 'delete').map(l => l.id);

const renderAccounts = () =>
  renderHook(() => useAccounts(UID, [], vi.fn())).result;

beforeEach(() => {
  M.txStore.clear();
  M.acctStore.clear();
  M.log.length = 0;
  M.gen = 0;
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => vi.restoreAllMocks());

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
    // La compra en la TC NO se borra (no referenciaba la cuenta de ahorro).
    expect(deletedIds()).not.toContain('t-purchase');

    // Reconciliación: usedCredit de la TC se RECOMPUTA desde los sobrevivientes
    // (solo la compra de 500k; el pago de 200k ya no existe) → 500k absoluto.
    const ccUpdates = updateDocsOn('cc');
    expect(ccUpdates).toHaveLength(1);
    expect(ccUpdates[0].data!.usedCredit).toBe(500_000);
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
    expect(updateDocsOn('cc')).toHaveLength(0);
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
