/**
 * Caracterización de useAccounts.mergeCreditCards y setDefaultAccount (Q-useAccounts).
 *
 * Red de seguridad ANTES de extraer la orquestación cruda a accountOrchestration.
 * Verifica el comportamiento observable (operaciones Firestore emitidas) de:
 *  - mergeCreditCards: calcula usedCredit desde el historial real, reapunta
 *    tx/recurring/debts source→destino y borra los orígenes atómicamente.
 *  - setDefaultAccount: lock + batch que deja isDefault solo en la elegida.
 * Mock de firebase/firestore con log de operaciones (mismo enfoque que A2).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Account, Transaction, RecurringPayment, Debt } from '../../types/finance';

const M = vi.hoisted(() => ({
  acctStore: new Map<string, Record<string, unknown>>(),
  userStore: new Map<string, Record<string, unknown>>(),
  txStore: new Map<string, Record<string, unknown>>(),
  log: [] as Array<{ op: string; path?: string; id?: string; data?: Record<string, unknown> }>,
  firestoreData: {} as Record<string, unknown>,
  gen: 0,
  commitError: null as Error | null,
}));

const mkRef = (path: string, id: string) => ({ __path: path, __id: id, __key: `${path}/${id}` });

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));
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
  getDoc: async (ref: { __id: string }) => {
    const data = M.acctStore.get(ref.__id);
    return { exists: () => data !== undefined, data: () => data };
  },
  getDocFromServer: async (ref: { __id: string }) => {
    const data = M.acctStore.get(ref.__id);
    return { exists: () => data !== undefined, data: () => data };
  },
  updateDoc: async (ref: { __id: string }, data: Record<string, unknown>) => {
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
          // Aplicar al store para reflejar el commit atómico.
          const store = o.ref.__path?.endsWith('/transactions') ? M.txStore
            : o.ref.__path?.endsWith('/accounts') ? M.acctStore
              : o.ref.__path === 'users' ? M.userStore : null;
          if (store) {
            if (o.op === 'delete') store.delete(o.ref.__id);
            else if (o.op === 'set') {
              const next = { ...(store.get(o.ref.__id) || {}), ...(o.data || {}) };
              if ((next.accountOperationLock as { __deleteField?: boolean } | undefined)?.__deleteField) {
                delete next.accountOperationLock;
              }
              store.set(o.ref.__id, { id: o.ref.__id, ...next });
            }
            else store.set(o.ref.__id, { ...(store.get(o.ref.__id) || {}), ...(o.data || {}) });
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
        if (ref.__path === 'users') {
          const next = { ...(M.userStore.get(ref.__id) || {}), ...data };
          if ((next.accountOperationLock as { __deleteField?: boolean } | undefined)?.__deleteField) {
            delete next.accountOperationLock;
          }
          M.userStore.set(ref.__id, next);
          return;
        }
        M.log.push({ op: 'txn-update', id: ref.__id, data });
      },
      delete: () => {},
    }),
}));

import { useAccounts } from '../../hooks/useAccounts';
import {
  subscribeTransactionCacheMutations,
  type TransactionCacheMutation,
} from '../../hooks/firestore/transactionPaginationCache';

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
const expectReleasedLock = (kind: string) => {
  expect(M.userStore.get(UID)?.accountOperationLock).toEqual(
    expect.objectContaining({ kind, releasedAt: expect.any(Date) })
  );
};
const cacheMutations: TransactionCacheMutation[] = [];
let unsubscribeCacheMutations = () => {};

beforeEach(() => {
  M.acctStore.clear();
  M.userStore.clear();
  M.txStore.clear();
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
    // El reapunte consulta Firestore (no el array en memoria): sembrar el store.
    transactions.forEach(t => M.txStore.set(t.id!, { ...t }));

    const acc = renderHook(() => useAccounts(UID, transactions, vi.fn())).result;
    await acc.current.mergeCreditCards({ sourceAccountIds: ['cc1', 'cc2'], destination: { id: 'dest', name: 'Visa Unificada' } });

    // Reconciliación desde el historial real: 500k(cc1) + 400k(cc2) = 900k.
    const destUpdate = findOp('update', 'dest');
    expect(destUpdate?.data?.usedCredit).toBe(900_000);
    expect(destUpdate?.data?.mergedAccountIds).toEqual(
      expect.arrayContaining(['cc1', 'cc2'])
    );

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
    expectReleasedLock('merge-credit-cards');
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

  it('reapunta vía Firestore las transacciones FUERA del array en memoria (ventana paginada)', async () => {
    seed([bank, cc1, cc2, dest]);
    // Historial completo en Firestore: t-mem está en memoria; t-old y t-transfer
    // quedaron fuera de la ventana paginada de 500 (no están en el array).
    const tMem: Transaction = { id: 't-mem', type: 'expense', amount: 100_000, category: 'Compras', description: '', date: new Date(), paid: true, accountId: 'cc1' };
    M.txStore.set('t-mem', { ...tMem });
    M.txStore.set('t-old', { id: 't-old', type: 'expense', amount: 50_000, accountId: 'cc1' });
    M.txStore.set('t-transfer', { id: 't-transfer', type: 'transfer', amount: 70_000, accountId: 'bank', toAccountId: 'cc2' });

    const acc = renderHook(() => useAccounts(UID, [tMem], vi.fn())).result;
    await acc.current.mergeCreditCards({ sourceAccountIds: ['cc1', 'cc2'], destination: { id: 'dest', name: 'Visa Unificada' } });

    expect(findOp('update', 't-mem')?.data?.accountId).toBe('dest');
    expect(findOp('update', 't-old')?.data?.accountId).toBe('dest');
    expect(findOp('update', 't-transfer')?.data?.toAccountId).toBe('dest');
    // La transferencia sale de una cuenta NO fusionada: accountId no se toca.
    expect(findOp('update', 't-transfer')?.data?.accountId).toBeUndefined();
    expect(cacheMutations).toContainEqual(expect.objectContaining({
      userId: UID,
      type: 'update',
      transactions: expect.arrayContaining([
        expect.objectContaining({ id: 't-old', accountId: 'dest' }),
        expect.objectContaining({ id: 't-transfer', accountId: 'bank', toAccountId: 'dest' }),
      ]),
    }));
  });

  it('reapunta relaciones remotas aunque aún no estén en el estado de React', async () => {
    seed([bank, cc1, cc2, dest]);
    const acc = renderHook(() => useAccounts(UID, [], vi.fn())).result;

    // Simula una escritura confirmada por otro dispositivo antes del lock, pero
    // posterior al render que preparó el plan.
    M.firestoreData.recurringPayments = [{ id: 'r-remote', accountId: 'cc1' }];
    M.firestoreData.debts = [{ id: 'd-remote', accountId: 'cc2' }];

    await acc.current.mergeCreditCards({
      sourceAccountIds: ['cc1', 'cc2'],
      destination: { id: 'dest', name: 'Visa Unificada' },
    });

    expect(findOp('update', 'r-remote')?.data?.accountId).toBe('dest');
    expect(findOp('update', 'd-remote')?.data?.accountId).toBe('dest');
  });

  it('aborta sin sobrescribir si el destino cambio remotamente tras el render', async () => {
    seed([bank, cc1, cc2, dest]);
    const acc = renderHook(() => useAccounts(UID, [], vi.fn())).result;

    M.acctStore.set('dest', {
      ...dest,
      creditLimit: 9_000_000,
      name: 'Visa actualizada en otro dispositivo',
    });

    await expect(
      acc.current.mergeCreditCards({
        sourceAccountIds: ['cc1', 'cc2'],
        destination: { id: 'dest', name: 'Visa Unificada' },
      })
    ).rejects.toThrow(/destino cambi[oó] en otro dispositivo/i);

    expect(M.log).toHaveLength(0);
    expect(M.acctStore.get('dest')).toEqual(expect.objectContaining({
      creditLimit: 9_000_000,
      name: 'Visa actualizada en otro dispositivo',
    }));
    expect(M.acctStore.has('cc1')).toBe(true);
    expect(M.acctStore.has('cc2')).toBe(true);
    expectReleasedLock('merge-credit-cards');
    expect(cacheMutations).toHaveLength(0);
  });

  it('no actualiza el caché si el commit del merge falla', async () => {
    seed([bank, cc1, cc2, dest]);
    M.txStore.set('t-old', {
      id: 't-old',
      type: 'expense',
      amount: 50_000,
      accountId: 'cc1',
      category: 'Compras',
      paid: true,
    });
    M.commitError = new Error('permission denied');

    const acc = renderHook(() => useAccounts(UID, [], vi.fn())).result;
    await expect(
      acc.current.mergeCreditCards({
        sourceAccountIds: ['cc1', 'cc2'],
        destination: { id: 'dest', name: 'Visa Unificada' },
      })
    ).rejects.toThrow(/permission denied/i);

    expect(cacheMutations).toHaveLength(0);
    expect(M.txStore.get('t-old')?.accountId).toBe('cc1');
  });

  it('bloquea el merge si falta usedCredit persistido y los saldos no están asentados (balancesReady=false)', async () => {
    const ccSinCupo: Account = { ...cc1, usedCredit: undefined };
    seed([bank, ccSinCupo, cc2, dest]);
    const acc = renderHook(() => useAccounts(UID, [], vi.fn(), false)).result;
    await expect(
      acc.current.mergeCreditCards({ sourceAccountIds: ['cc1', 'cc2'], destination: { id: 'dest', name: 'X' } })
    ).rejects.toThrow(/asentando|calculando/i);
    expect(M.log).toHaveLength(0);
  });

  it('reconcilia usedCredit del destino desde las transacciones reapuntadas, ignorando un persistido stale (#4b)', async () => {
    // cc1 tiene un persistido STALE (0) pero en Firestore ya hay una compra de
    // 200k suya. Confiar en el persistido subcontaría la deuda consolidada; la
    // fusión debe reconciliar desde las transacciones, igual que el cascade.
    const cc1Stale: Account = { ...cc1, usedCredit: 0 };
    seed([bank, cc1Stale, cc2, dest]);
    M.txStore.set('s1', { id: 's1', type: 'expense', amount: 200_000, category: 'Compras', paid: true, accountId: 'cc1' });
    M.txStore.set('s2', { id: 's2', type: 'expense', amount: 200_000, category: 'Compras', paid: true, accountId: 'cc2' });
    M.txStore.set('sd', { id: 'sd', type: 'expense', amount: 100_000, category: 'Compras', paid: true, accountId: 'dest' });

    const acc = renderHook(() => useAccounts(UID, [], vi.fn())).result;
    await acc.current.mergeCreditCards({ sourceAccountIds: ['cc1', 'cc2'], destination: { id: 'dest', name: 'Visa Unificada' } });

    // Persistido (buggy): 0(cc1 stale) + 200k(cc2) + 100k(dest) = 300k.
    // Reconciliado desde transacciones reapuntadas: 200k + 200k + 100k = 500k.
    const reconciled = findOp('update', 'dest');
    expect(reconciled?.data?.usedCredit).toBe(500_000);
  });

  it('con saldos asentados, confirma el usedCredit exacto del historial persistido', async () => {
    const ccSinCupo: Account = { ...cc1, usedCredit: undefined };
    seed([bank, ccSinCupo, cc2, dest]);
    const fullHistory: Transaction[] = [
      { id: 'h1', type: 'expense', amount: 500_000, category: 'Compras', description: '', date: new Date(), paid: false, accountId: 'cc1' },
    ];
    M.txStore.set('h1', { ...fullHistory[0] });

    const acc = renderHook(() => useAccounts(UID, fullHistory, vi.fn(), true)).result;
    await acc.current.mergeCreditCards({ sourceAccountIds: ['cc1', 'cc2'], destination: { id: 'dest', name: 'Visa Unificada' } });

    // El historial persistido contiene 500k; los campos acumulados stale no se arrastran.
    expect(findOp('update', 'dest')?.data?.usedCredit).toBe(500_000);
  });

  it('rechaza una fusión que excede el límite atómico antes de escribir', async () => {
    seed([bank, cc1, cc2, dest]);
    for (let index = 0; index < 488; index += 1) {
      M.txStore.set(`bulk-${index}`, {
        id: `bulk-${index}`,
        type: 'expense',
        amount: 1_000,
        accountId: 'cc1',
        category: 'Carga masiva',
        paid: true,
      });
    }

    const acc = renderHook(() => useAccounts(UID, [], vi.fn())).result;
    await expect(
      acc.current.mergeCreditCards({
        sourceAccountIds: ['cc1', 'cc2'],
        destination: { id: 'dest', name: 'Visa Unificada' },
      })
    ).rejects.toThrow(/límite atómico|forma segura/i);

    expect(M.log).toHaveLength(0);
    expect(M.acctStore.has('cc1')).toBe(true);
    expect(M.txStore).toHaveLength(488);
    expect(cacheMutations).toHaveLength(0);
  });

  it('rechaza la fusión mientras otra operación de cuentas conserva el lock', async () => {
    seed([bank, cc1, cc2, dest]);
    M.userStore.set(UID, {
      accountOperationLock: {
        id: 'delete-account:other-tab',
        kind: 'delete-account',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const acc = renderHook(() => useAccounts(UID, [], vi.fn())).result;
    await expect(
      acc.current.mergeCreditCards({
        sourceAccountIds: ['cc1', 'cc2'],
        destination: { id: 'dest', name: 'Visa Unificada' },
      })
    ).rejects.toThrow(/otra operación de cuentas/i);

    expect(M.log).toHaveLength(0);
    expect(M.acctStore.has('cc1')).toBe(true);
    expect(M.userStore.get(UID)?.accountOperationLock)
      .toEqual(expect.objectContaining({ id: 'delete-account:other-tab' }));
  });
});

describe('useAccounts.setDefaultAccount — caracterización', () => {
  it('deja isDefault solo en la cuenta elegida (batch atómico)', async () => {
    seed([{ ...bank, isDefault: true }, { ...cc1, isDefault: false }, { ...cc2, isDefault: false }]);
    const acc = renderHook(() => useAccounts(UID, [], vi.fn())).result;
    await acc.current.setDefaultAccount('cc1');

    const batchUpdates = opsByType('update');
    expect(batchUpdates.find(u => u.id === 'cc1')?.data?.isDefault).toBe(true);
    expect(batchUpdates.find(u => u.id === 'bank')?.data?.isDefault).toBe(false);
    expect(batchUpdates.find(u => u.id === 'cc2')?.data?.isDefault).toBe(false);
    expectReleasedLock('set-default-account');
  });

  it('salta cuentas del array que ya no existen en Firestore (no aborta por NOT_FOUND) (#accounts-6)', async () => {
    // 'ghost' está en el array en memoria (firestoreData) pero NO en el store
    // (borrada/fusionada, snapshot rezagado).
    M.acctStore.set('bank', { ...bank, isDefault: false });
    M.acctStore.set('cc1', { ...cc1, isDefault: true });
    M.firestoreData = {
      accounts: [{ ...bank, isDefault: false }, { ...cc1, isDefault: true }, { ...cc2, id: 'ghost' }],
      recurringPayments: [], debts: [], loading: false,
      addAccount: vi.fn(), deleteAccount: vi.fn(), updateAccount: vi.fn(),
    };
    const acc = renderHook(() => useAccounts(UID, [], vi.fn())).result;

    await acc.current.setDefaultAccount('bank');

    const batchUpdates = opsByType('update');
    // Solo se actualizan las existentes; 'ghost' se salta sin abortar.
    expect(batchUpdates.find(u => u.id === 'bank')?.data?.isDefault).toBe(true);
    expect(batchUpdates.find(u => u.id === 'cc1')?.data?.isDefault).toBe(false);
    expect(batchUpdates.some(u => u.id === 'ghost')).toBe(false);
  });

  it('actualiza cuentas remotas aunque no esten en el array de React', async () => {
    seed([{ ...bank, isDefault: true }, { ...cc1, isDefault: false }]);
    const acc = renderHook(() => useAccounts(UID, [], vi.fn())).result;

    M.acctStore.set('remote', {
      ...cc2,
      id: 'remote',
      name: 'Cuenta creada en otro dispositivo',
      isDefault: true,
    });

    await acc.current.setDefaultAccount('cc1');

    const batchUpdates = opsByType('update');
    expect(batchUpdates.find(update => update.id === 'cc1')?.data?.isDefault).toBe(true);
    expect(batchUpdates.find(update => update.id === 'bank')?.data?.isDefault).toBe(false);
    expect(batchUpdates.find(update => update.id === 'remote')?.data?.isDefault).toBe(false);
    expect(M.acctStore.get('remote')?.isDefault).toBe(false);
    expectReleasedLock('set-default-account');
  });

  it('rechaza si otra operacion conserva el lock y no escribe cuentas', async () => {
    seed([{ ...bank, isDefault: true }, { ...cc1, isDefault: false }]);
    M.userStore.set(UID, {
      accountOperationLock: {
        id: 'merge-credit-cards:other-tab',
        kind: 'merge-credit-cards',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const acc = renderHook(() => useAccounts(UID, [], vi.fn())).result;
    await expect(acc.current.setDefaultAccount('cc1'))
      .rejects.toThrow(/otra operaci[oó]n de cuentas/i);

    expect(M.log).toHaveLength(0);
    expect(M.acctStore.get('bank')?.isDefault).toBe(true);
    expect(M.acctStore.get('cc1')?.isDefault).toBe(false);
    expect(M.userStore.get(UID)?.accountOperationLock)
      .toEqual(expect.objectContaining({ id: 'merge-credit-cards:other-tab' }));
  });

  it('no aplica cambios parciales si falla el commit atomico', async () => {
    seed([
      { ...bank, isDefault: true },
      { ...cc1, isDefault: false },
      { ...cc2, isDefault: false },
    ]);
    M.commitError = new Error('permission denied');

    const acc = renderHook(() => useAccounts(UID, [], vi.fn())).result;
    await expect(acc.current.setDefaultAccount('cc1'))
      .rejects.toThrow(/permission denied/i);

    expect(M.log).toHaveLength(0);
    expect(M.acctStore.get('bank')?.isDefault).toBe(true);
    expect(M.acctStore.get('cc1')?.isDefault).toBe(false);
    expect(M.acctStore.get('cc2')?.isDefault).toBe(false);
    expectReleasedLock('set-default-account');
  });
});
