/**
 * Caracterización de useAccounts.mergeCreditCards y setDefaultAccount (Q-useAccounts).
 *
 * Red de seguridad ANTES de extraer la orquestación cruda a accountOrchestration.
 * Verifica el comportamiento observable (operaciones Firestore emitidas) de:
 *  - mergeCreditCards: consolida usedCredit (Σ destino+orígenes), reapunta
 *    tx/recurring/debts source→destino, borra los orígenes.
 *  - setDefaultAccount: runTransaction que deja isDefault solo en la elegida.
 * Mock de firebase/firestore con log de operaciones (mismo enfoque que A2).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Account, Transaction, RecurringPayment, Debt } from '../../types/finance';

const M = vi.hoisted(() => ({
  acctStore: new Map<string, Record<string, unknown>>(),
  txStore: new Map<string, Record<string, unknown>>(),
  log: [] as Array<{ op: string; path?: string; id?: string; data?: Record<string, unknown> }>,
  firestoreData: {} as Record<string, unknown>,
  gen: 0,
}));

const mkRef = (path: string, id: string) => ({ __path: path, __id: id, __key: `${path}/${id}` });

vi.mock('../../lib/firebase', () => ({ db: { __db: true } }));
vi.mock('../../contexts/FirestoreContext', () => ({ useFirestoreData: () => M.firestoreData }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __path: path }),
  doc: (first: { __path?: string }, path?: string, id?: string) => {
    if (typeof id === 'string') return mkRef(path as string, id);        // doc(db, collectionPath, id)
    if (typeof path === 'string') return mkRef(first.__path as string, path); // doc(collectionRef, id)
    M.gen += 1;
    return mkRef(first.__path as string, `__new${M.gen}`);               // doc(collectionRef)
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
  updateDoc: async (ref: { __id: string }, data: Record<string, unknown>) => {
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
        }
        ops.length = 0;
      },
    };
  },
  runTransaction: async (_db: unknown, fn: (t: unknown) => Promise<unknown>) =>
    fn({
      get: async () => ({ exists: () => false }),
      set: () => {},
      update: (ref: { __id: string }, data: Record<string, unknown>) => M.log.push({ op: 'txn-update', id: ref.__id, data }),
      delete: () => {},
    }),
}));

import { useAccounts } from '../../hooks/useAccounts';

const UID = 'u1';

const seed = (accounts: Account[], recurringPayments: RecurringPayment[] = [], debts: Debt[] = []) => {
  M.firestoreData = {
    accounts, recurringPayments, debts, loading: false,
    addAccount: vi.fn(), deleteAccount: vi.fn(), updateAccount: vi.fn(),
  };
  accounts.forEach(a => M.acctStore.set(a.id!, { ...a }));
};

const opsByType = (op: string) => M.log.filter(l => l.op === op);
const findOp = (op: string, id: string) => M.log.find(l => l.op === op && l.id === id);

beforeEach(() => {
  M.acctStore.clear();
  M.txStore.clear();
  M.log.length = 0;
  M.gen = 0;
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => vi.restoreAllMocks());

const bank: Account = { id: 'bank', name: 'Banco', type: 'savings', isDefault: true, initialBalance: 0 };
const cc1: Account = { id: 'cc1', name: 'Visa 1', type: 'credit', isDefault: false, initialBalance: 0, creditLimit: 5_000_000, usedCredit: 300_000, bankAccountId: 'bank' };
const cc2: Account = { id: 'cc2', name: 'Visa 2', type: 'credit', isDefault: false, initialBalance: 0, creditLimit: 3_000_000, usedCredit: 200_000, bankAccountId: 'bank' };
const dest: Account = { id: 'dest', name: 'Visa Unificada', type: 'credit', isDefault: false, initialBalance: 0, creditLimit: 8_000_000, usedCredit: 100_000, bankAccountId: 'bank' };

describe('useAccounts.mergeCreditCards — caracterización', () => {
  it('consolida usedCredit, reapunta tx/recurring/debts y borra los orígenes', async () => {
    const transactions: Transaction[] = [
      { id: 't1', type: 'expense', amount: 500_000, category: 'Compras', description: '', date: new Date(), paid: true, accountId: 'cc1' },
      { id: 't2', type: 'expense', amount: 400_000, category: 'Compras', description: '', date: new Date(), paid: true, accountId: 'cc2' },
    ];
    const recurring: RecurringPayment[] = [{ id: 'r1', accountId: 'cc1' } as RecurringPayment];
    const debts: Debt[] = [{ id: 'd1', accountId: 'cc2' } as Debt];
    seed([bank, cc1, cc2, dest], recurring, debts);

    const acc = renderHook(() => useAccounts(UID, transactions, vi.fn())).result;
    await acc.current.mergeCreditCards({ sourceAccountIds: ['cc1', 'cc2'], destination: { id: 'dest', name: 'Visa Unificada' } });

    // Consolidación: 100k(dest) + 300k(cc1) + 200k(cc2) = 600k.
    const destUpdate = findOp('update', 'dest');
    expect(destUpdate?.data?.usedCredit).toBe(600_000);

    // Reapunte de transacciones source→destino.
    expect(findOp('update', 't1')?.data?.accountId).toBe('dest');
    expect(findOp('update', 't2')?.data?.accountId).toBe('dest');
    // Reapunte de recurrente + deuda.
    expect(findOp('update', 'r1')?.data?.accountId).toBe('dest');
    expect(findOp('update', 'd1')?.data?.accountId).toBe('dest');
    // Orígenes borrados.
    const deleted = opsByType('delete').map(l => l.id);
    expect(deleted).toEqual(expect.arrayContaining(['cc1', 'cc2']));
    expect(deleted).not.toContain('dest');
  });

  it('rechaza si las tarjetas no son del mismo banco', async () => {
    const otherCc: Account = { ...cc2, id: 'cc2', bankAccountId: 'otroBanco' };
    seed([bank, cc1, otherCc, dest]);
    const acc = renderHook(() => useAccounts(UID, [], vi.fn())).result;
    await expect(
      acc.current.mergeCreditCards({ sourceAccountIds: ['cc1', 'cc2'], destination: { id: 'dest', name: 'X' } })
    ).rejects.toThrow(/mismo banco/i);
    expect(M.log).toHaveLength(0);
  });

  it('rechaza si la tarjeta destino es también origen', async () => {
    seed([bank, cc1, cc2, dest]);
    const acc = renderHook(() => useAccounts(UID, [], vi.fn())).result;
    await expect(
      acc.current.mergeCreditCards({ sourceAccountIds: ['cc1', 'dest'], destination: { id: 'dest', name: 'X' } })
    ).rejects.toThrow(/no puede ser también/i);
  });
});

describe('useAccounts.setDefaultAccount — caracterización', () => {
  it('deja isDefault solo en la cuenta elegida (runTransaction atómico)', async () => {
    seed([{ ...bank, isDefault: true }, { ...cc1, isDefault: false }, { ...cc2, isDefault: false }]);
    const acc = renderHook(() => useAccounts(UID, [], vi.fn())).result;
    await acc.current.setDefaultAccount('cc1');

    const txnUpdates = opsByType('txn-update');
    expect(txnUpdates.find(u => u.id === 'cc1')?.data?.isDefault).toBe(true);
    expect(txnUpdates.find(u => u.id === 'bank')?.data?.isDefault).toBe(false);
    expect(txnUpdates.find(u => u.id === 'cc2')?.data?.isDefault).toBe(false);
  });
});
