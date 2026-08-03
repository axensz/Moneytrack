/**
 * F-debt-cascade — deleteDebt ATÓMICO (useDebts, usuario autenticado).
 *
 * Antes deleteDebt borraba las transacciones vinculadas una por una y luego la deuda
 * en una secuencia NO atómica: un fallo a mitad dejaba deuda o transacciones huérfanas.
 * Ahora todo (borrar transacciones + revertir usedCredit de las TC afectadas + borrar
 * la deuda) ocurre en UN solo batch protegido por lease. Mockeamos Firestore con
 * un store en memoria para verificar el contenido de ese commit. Audit F-debt-cascade.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Account, Debt, Transaction } from '../../types/finance';

const M = vi.hoisted(() => ({
  txStore: new Map<string, Record<string, unknown>>(),
  acctStore: new Map<string, Record<string, unknown>>(),
  log: [] as Array<{
    op: string;
    id?: string;
    path?: string;
    data?: Record<string, unknown>;
    options?: Record<string, unknown>;
  }>,
  batchCommitCalls: 0,
  runTxnCalls: 0, // Alias heredado: representa el único commit atómico.
  lockAcquireCalls: 0,
  lockRenewCalls: 0,
  lockReleaseCalls: 0,
  batchCommitShouldFail: false,
}));

const ref = (path: string, id: string) => ({ __path: path, __id: id, __key: `${path}/${id}` });

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));

vi.mock('../../utils/firestoreHelpers', () => ({
  checkNetworkConnection: () => true,
  safeFirestoreOperation: (fn: () => Promise<unknown>) => fn(),
  isOffline: () => false,
}));

vi.mock('../../hooks/firestore/accountOrchestration', () => ({
  createAccountOperationId: () => 'delete-debt:test',
  createAccountOperationRelease: (id: string, kind: string) => ({
    accountOperationLock: { id, kind, releasedAt: new Date() },
  }),
  acquireAccountOperationLock: async () => {
    M.lockAcquireCalls += 1;
  },
  renewAccountOperationLock: async () => {
    M.lockRenewCalls += 1;
  },
  releaseAccountOperationLock: async () => {
    M.lockReleaseCalls += 1;
  },
  assertAtomicBatchCapacity: (_operation: string, count: number) => {
    if (count > 40) {
      throw new Error(
        `No se puede eliminar esta deuda de forma segura: límite atómico 40 (${count})`
      );
    }
  },
}));

vi.mock('../../hooks/firestore/transactionPaginationCache', () => ({
  publishTransactionCacheMutation: vi.fn(),
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
  getDocsFromServer: async (q: {
    __path: string;
    __cons?: Array<{ field: string; value: unknown }>;
  }) => {
    if (q.__path.endsWith('/accounts')) {
      return {
        docs: [...M.acctStore.entries()].map(([id, data]) => ({
          id,
          data: () => data,
        })),
      };
    }
    const cons = q.__cons || [];
    const matched = [...M.txStore.values()].filter(t => cons.every(c => t[c.field] === c.value));
    return { docs: matched.map(t => ({ id: t.id as string, data: () => t })) };
  },
  getDocFromServer: async () => ({
    exists: () => true,
    data: () => ({ id: 'd1' }),
  }),
  increment: (n: number) => ({ __increment: n }),
  deleteField: () => ({ __deleteField: true }),
  deleteDoc: async (r: { __id: string; __path: string }) => {
    M.log.push({ op: 'deleteDoc', id: r.__id, path: r.__path });
  },
  writeBatch: () => {
    const staged: typeof M.log = [];
    return {
      delete: (r: { __id: string; __path: string }) =>
        staged.push({ op: 'delete', id: r.__id, path: r.__path }),
      update: (r: { __id: string }, data: Record<string, unknown>) =>
        staged.push({ op: 'update', id: r.__id, data }),
      set: (
        r: { __id: string; __path: string },
        data: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => staged.push({ op: 'set', id: r.__id, path: r.__path, data, options }),
      commit: async () => {
        if (M.batchCommitShouldFail) throw new Error('batch rejected');
        M.log.push(...staged);
        M.batchCommitCalls += 1;
        M.runTxnCalls += 1;
      },
    };
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

const renderDebts = (...clientAccountSnapshots: Account[][]) =>
  renderHook(() => {
    // La orquestación autenticada debe ignorar snapshots React potencialmente
    // obsoletos y releer las cuentas autoritativas del servidor.
    void clientAccountSnapshots;
    return useDebts(UID, [], [{ id: 'd1', personName: 'Juan', type: 'lent', originalAmount: 1, remainingAmount: 1, isSettled: false } as Debt], {});
  }).result;

const renderSettledDebts = () =>
  renderHook(() => useDebts(UID, [], [{
    id: 'd1',
    personName: 'Juan',
    type: 'lent',
    originalAmount: 1,
    remainingAmount: 0,
    isSettled: true,
  } as Debt], {})).result;

beforeEach(() => {
  M.txStore.clear();
  M.acctStore.clear();
  M.log.length = 0;
  M.batchCommitCalls = 0;
  M.runTxnCalls = 0;
  M.lockAcquireCalls = 0;
  M.lockRenewCalls = 0;
  M.lockReleaseCalls = 0;
  M.batchCommitShouldFail = false;
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => vi.restoreAllMocks());

describe('useDebts.deleteDebt — borrado atómico (F-debt-cascade)', () => {
  it('borra transacciones + revierte usedCredit + borra la deuda en UN batch', async () => {
    M.acctStore.set('cc', { ...cc });
    // Préstamo prestado usando la TC: principal (gasto +1M) y un cobro (ingreso -400k).
    seedTx({ id: 't-principal', type: 'expense', amount: 1_000_000, accountId: 'cc', category: 'Préstamo', debtId: 'd1', paid: true });
    seedTx({ id: 't-cobro', type: 'income', amount: 400_000, accountId: 'cc', category: 'Cobro Préstamo', debtId: 'd1', paid: true });
    // Transacción de OTRA deuda: no debe tocarse.
    seedTx({ id: 't-otra', type: 'expense', amount: 50_000, accountId: 'cc', category: 'Préstamo', debtId: 'd2', paid: true });

    const result = renderDebts([cc, sav]);
    await result.current.deleteDebt('d1');

    // Todo ocurrió en un solo batch protegido por lease.
    expect(M.batchCommitCalls).toBe(1);
    expect(M.lockAcquireCalls).toBe(1);
    expect(M.lockRenewCalls).toBe(1);
    expect(M.lockReleaseCalls).toBe(0);
    const releaseWrite = M.log.find(entry => entry.op === 'set' && entry.path === 'users');
    expect(releaseWrite?.data?.accountOperationLock).toEqual({
      id: 'delete-debt:test',
      kind: 'delete-debt',
      releasedAt: expect.any(Date),
    });
    expect(releaseWrite?.options).toEqual({ mergeFields: ['accountOperationLock'] });
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

  it('rechaza historiales que exceden el límite seguro antes de borrar algo', async () => {
    for (let index = 0; index < 41; index += 1) {
      seedTx({
        id: `t-${index}`,
        type: 'expense',
        amount: 1,
        accountId: 'sav',
        category: 'Préstamo',
        debtId: 'd1',
        paid: true,
      });
    }

    const result = renderDebts([cc, sav]);

    await expect(result.current.deleteDebt('d1')).rejects.toThrow(
      /límite atómico|forma segura/i
    );
    expect(M.runTxnCalls).toBe(0);
    expect(M.log).toHaveLength(0);
    expect(M.txStore).toHaveLength(41);
  });

  it('usa la misma cascada para un préstamo saldado', async () => {
    M.acctStore.set('sav', { ...sav });
    seedTx({ id: 't-principal', type: 'expense', amount: 500_000, accountId: 'sav', category: 'Préstamo', debtId: 'd1', paid: true });
    seedTx({ id: 't-pago', type: 'income', amount: 500_000, accountId: 'sav', category: 'Cobro Préstamo', debtId: 'd1', paid: true });

    const result = renderSettledDebts();
    await result.current.deleteDebt('d1');

    expect(M.batchCommitCalls).toBe(1);
    expect(deletedIds()).toEqual(expect.arrayContaining(['t-principal', 't-pago', 'd1']));
  });

  it('borra pagos históricos vinculados aunque hayan ocurrido en cuentas distintas', async () => {
    const cc2: Account = { ...cc, id: 'cc-2', name: 'Mastercard', usedCredit: 200_000 };
    M.acctStore.set('cc', { ...cc });
    M.acctStore.set('cc-2', { ...cc2 });
    seedTx({ id: 't-principal', type: 'expense', amount: 1_000_000, accountId: 'cc', category: 'Préstamo', debtId: 'd1', paid: true });
    seedTx({ id: 't-pago', type: 'income', amount: 200_000, accountId: 'cc-2', category: 'Cobro Préstamo', debtId: 'd1', paid: true });

    const result = renderDebts();
    await result.current.deleteDebt('d1');

    expect(deletedIds()).toEqual(expect.arrayContaining(['t-principal', 't-pago', 'd1']));
    expect(accountUpdates('cc')[0].data?.usedCredit).toEqual({ __increment: -1_000_000 });
    expect(accountUpdates('cc-2')[0].data?.usedCredit).toEqual({ __increment: 200_000 });
  });

  it('no aplica ninguna escritura y libera el lease si Firestore rechaza el batch', async () => {
    M.acctStore.set('sav', { ...sav });
    seedTx({ id: 't-principal', type: 'expense', amount: 500_000, accountId: 'sav', category: 'Préstamo', debtId: 'd1', paid: true });
    M.batchCommitShouldFail = true;
    const result = renderDebts();

    await expect(result.current.deleteDebt('d1')).rejects.toThrow('batch rejected');

    expect(M.batchCommitCalls).toBe(0);
    expect(M.log).toEqual([]);
    expect(M.lockReleaseCalls).toBe(1);
  });
});
