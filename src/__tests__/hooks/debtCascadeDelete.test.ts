/**
 * F-debt-cascade — deleteDebt ATÓMICO (useDebts, usuario autenticado).
 *
 * Antes deleteDebt borraba las transacciones vinculadas una por una y luego la deuda
 * en una secuencia NO atómica: un fallo a mitad dejaba deuda o transacciones huérfanas.
 * Ahora todo (borrar transacciones + revertir usedCredit de las TC afectadas + borrar
 * la deuda) ocurre en UNA sola runTransaction. Mockeamos firebase/firestore con un
 * store en memoria para verificar el contenido de esa transacción única. Audit F-debt-cascade.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Account, Debt, Transaction } from '../../types/finance';

const M = vi.hoisted(() => ({
  txStore: new Map<string, Record<string, unknown>>(),
  acctStore: new Map<string, Record<string, unknown>>(),
  log: [] as Array<{ op: string; id?: string; path?: string; data?: Record<string, unknown> }>,
  runTxnCalls: 0,
}));

const ref = (path: string, id: string) => ({ __path: path, __id: id, __key: `${path}/${id}` });

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));

vi.mock('../../utils/firestoreHelpers', () => ({
  checkNetworkConnection: () => true,
  safeFirestoreOperation: (fn: () => Promise<unknown>) => fn(),
  isOffline: () => false,
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __path: path }),
  doc: (first: { __path?: string }, path?: string, id?: string) =>
    typeof path === 'string' ? ref(path, id as string) : ref(first.__path as string, 'new'),
  query: (coll: { __path: string }, ...cons: unknown[]) => ({ __path: coll.__path, __cons: cons }),
  where: (field: string, _op: string, value: unknown) => ({ field, value }),
  getDocs: async (q: { __cons: Array<{ field: string; value: unknown }> }) => {
    const cons = q.__cons || [];
    const matched = [...M.txStore.values()].filter(t => cons.every(c => t[c.field] === c.value));
    return { docs: matched.map(t => ({ id: t.id as string, data: () => t })) };
  },
  increment: (n: number) => ({ __increment: n }),
  deleteDoc: async (r: { __id: string; __path: string }) => {
    M.log.push({ op: 'deleteDoc', id: r.__id, path: r.__path });
  },
  runTransaction: async (_db: unknown, fn: (t: unknown) => Promise<unknown>) => {
    M.runTxnCalls += 1;
    const txn = {
      get: async (r: { __id: string; __path: string }) => {
        const store = r.__path.endsWith('/accounts') ? M.acctStore : M.txStore;
        const data = store.get(r.__id);
        return { id: r.__id, exists: () => data !== undefined, data: () => data };
      },
      delete: (r: { __id: string; __path: string }) =>
        M.log.push({ op: 'delete', id: r.__id, path: r.__path }),
      update: (r: { __id: string }, data: Record<string, unknown>) =>
        M.log.push({ op: 'update', id: r.__id, data }),
      set: () => {},
    };
    return fn(txn);
  },
  // No usados con externalDebts (la suscripción se salta), pero deben existir al importar.
  onSnapshot: () => () => {},
  orderBy: () => ({}),
  addDoc: async () => ({ id: 'x' }),
  updateDoc: async () => {},
}));

import { useDebts } from '../../hooks/useDebts';

const UID = 'u1';
const cc: Account = { id: 'cc', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0, creditLimit: 5_000_000, usedCredit: 600_000 };
const sav: Account = { id: 'sav', name: 'Banco', type: 'savings', isDefault: true, initialBalance: 0 };

const seedTx = (t: Partial<Transaction> & { id: string }) => M.txStore.set(t.id, t as Record<string, unknown>);

const deletedIds = () => M.log.filter(l => l.op === 'delete' || l.op === 'deleteDoc').map(l => l.id);
const accountUpdates = (id: string) => M.log.filter(l => l.op === 'update' && l.id === id);

const renderDebts = (accounts: Account[]) =>
  renderHook(() =>
    useDebts(UID, [], [{ id: 'd1', personName: 'Juan', type: 'lent', originalAmount: 1, remainingAmount: 1, isSettled: false } as Debt], {}, accounts)
  ).result;

beforeEach(() => {
  M.txStore.clear();
  M.acctStore.clear();
  M.log.length = 0;
  M.runTxnCalls = 0;
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => vi.restoreAllMocks());

describe('useDebts.deleteDebt — borrado atómico (F-debt-cascade)', () => {
  it('borra transacciones + revierte usedCredit + borra la deuda en UNA runTransaction', async () => {
    M.acctStore.set('cc', { ...cc });
    // Préstamo prestado usando la TC: principal (gasto +1M) y un cobro (ingreso -400k).
    seedTx({ id: 't-principal', type: 'expense', amount: 1_000_000, accountId: 'cc', category: 'Préstamo', debtId: 'd1', paid: true });
    seedTx({ id: 't-cobro', type: 'income', amount: 400_000, accountId: 'cc', category: 'Cobro Préstamo', debtId: 'd1', paid: true });
    // Transacción de OTRA deuda: no debe tocarse.
    seedTx({ id: 't-otra', type: 'expense', amount: 50_000, accountId: 'cc', category: 'Préstamo', debtId: 'd2', paid: true });

    const result = renderDebts([cc, sav]);
    await result.current.deleteDebt('d1');

    // Todo ocurrió en una sola transacción atómica.
    expect(M.runTxnCalls).toBe(1);
    // Se borraron las dos transacciones del préstamo + la deuda; NO la de otra deuda.
    expect(deletedIds()).toEqual(expect.arrayContaining(['t-principal', 't-cobro', 'd1']));
    expect(deletedIds()).not.toContain('t-otra');
    // usedCredit de la TC se revierte por el delta NETO (+1M -400k = +600k) → increment(-600k).
    const upd = accountUpdates('cc');
    expect(upd).toHaveLength(1);
    expect(upd[0].data!.usedCredit).toEqual({ __increment: -600_000 });
  });

  it('préstamo sin TC (cuenta de ahorro): borra transacciones + deuda, sin tocar usedCredit', async () => {
    M.acctStore.set('sav', { ...sav });
    seedTx({ id: 't-p', type: 'expense', amount: 500_000, accountId: 'sav', category: 'Préstamo', debtId: 'd1', paid: true });

    const result = renderDebts([cc, sav]);
    await result.current.deleteDebt('d1');

    expect(M.runTxnCalls).toBe(1);
    expect(deletedIds()).toEqual(expect.arrayContaining(['t-p', 'd1']));
    // Ninguna cuenta de crédito afectada → ningún update de usedCredit.
    expect(M.log.filter(l => l.op === 'update')).toHaveLength(0);
  });

  it('préstamo sin transacciones vinculadas: borra solo la deuda (atómico)', async () => {
    const result = renderDebts([cc, sav]);
    await result.current.deleteDebt('d1');

    expect(M.runTxnCalls).toBe(1);
    expect(deletedIds()).toEqual(['d1']);
  });
});
