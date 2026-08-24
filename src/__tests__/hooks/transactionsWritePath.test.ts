/**
 * A2 — Cobertura de la RUTA DE ESCRITURA a Firestore (online).
 *
 * Hasta ahora el único test que tocaba useTransactionsCRUD iba OFFLINE y cortaba
 * antes de addDoc/runTransaction (offlineWrites.test.ts). Las operaciones de dinero
 * de mayor riesgo —pago atómico de TC con increment de usedCredit, alta/baja/edición
 * que ajustan la deuda, transferencias atómicas— no se ejercitaban en ningún test.
 *
 * Aquí mockeamos firebase/firestore con un store en memoria + un log de escrituras,
 * para aseverar:
 *   - el SIGNO y la MAGNITUD del increment(usedCredit) por cuenta,
 *   - que las dos escrituras de un pago/borrado/edición ocurren juntas (mismo runTransaction),
 *   - que un fallo de existencia o una transferencia DESDE una TC abortan sin escribir.
 *
 * Modelo de deltas (creditDeltas.ts): expense=+amount, income=-amount,
 * transfer-hacia-TC=-amount (positivo sube deuda; negativo la reduce).
 * Audit A2 (ruta de escritura sin tests).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Transaction, Account } from '../../types/finance';

// Estado compartido entre el mock (hoisted) y los tests.
const mockState = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  writeLog: [] as Array<{ op: string; key: string; data?: Record<string, unknown> }>,
  gen: 0,
  transactionCalls: 0,
  batchCommits: 0,
  failBatchCommit: false,
}));

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));

vi.mock('../../hooks/firestore/accountOrchestration', () => ({
  acquireAccountOperationLock: vi.fn(async () => undefined),
  assertAtomicBatchCapacity: vi.fn(),
  createAccountOperationId: vi.fn(() => 'ledger-mutation:test-operation'),
  createAccountOperationRelease: vi.fn((id: string, kind: string) => ({
    accountOperationLock: { id, kind, releasedAt: { __serverTimestamp: true } },
  })),
  releaseAccountOperationLock: vi.fn(async () => undefined),
  renewAccountOperationLock: vi.fn(async () => undefined),
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __collection: path }),
  doc: (first: { __collection?: string }, path?: string, id?: string) => {
    if (path === undefined) {
      // doc(collection(...)) → nueva referencia con id generado
      const col = first.__collection as string;
      mockState.gen += 1;
      const newId = `__new${mockState.gen}`;
      return { id: newId, __key: `${col}/${newId}`, __path: col, __id: newId, __isNew: true };
    }
    // doc(db, path, id)
    return { id, __key: `${path}/${id}`, __path: path, __id: id };
  },
  addDoc: async (col: { __collection: string }, data: Record<string, unknown>) => {
    mockState.writeLog.push({ op: 'addDoc', key: col.__collection, data });
    return { id: `addDoc-${(mockState.gen += 1)}` };
  },
  increment: (n: number) => ({ __increment: n }),
  deleteField: () => ({ __deleteField: true }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  where: (field: string, _operator: string, value: unknown) => ({ field, value }),
  query: (
    source: { __collection: string },
    ...filters: Array<{ field: string; value: unknown }>
  ) => ({ ...source, __filters: filters }),
  getDocsFromServer: async (reference: {
    __collection: string;
    __filters?: Array<{ field: string; value: unknown }>;
  }) => {
    const prefix = `${reference.__collection}/`;
    const filters = reference.__filters ?? [];
    const docs = [...mockState.store.entries()]
      .filter(([key, data]) => key.startsWith(prefix) &&
        filters.every(filter => data[filter.field] === filter.value))
      .map(([key, data]) => ({
        id: key.slice(prefix.length),
        data: () => data,
      }));
    return { docs };
  },
  getDocFromServer: async (ref: { id: string; __key: string }) => {
    const data = mockState.store.get(ref.__key);
    return {
      id: ref.id,
      exists: () => Boolean(data),
      data: () => data ?? {},
    };
  },
  writeBatch: () => {
    const staged: Array<{
      op: 'set' | 'update' | 'delete';
      ref: { __key: string; __path: string };
      data?: Record<string, unknown>;
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
      delete: (ref: { __key: string; __path: string }) => staged.push({ op: 'delete', ref }),
      commit: async () => {
        if (mockState.failBatchCommit) throw new Error('batch rejected');
        staged.forEach(({ op, ref, data }) => {
          if (ref.__path !== 'users') {
            mockState.writeLog.push({ op, key: ref.__key, data });
          }
          if (op === 'delete') {
            mockState.store.delete(ref.__key);
            return;
          }
          if (op === 'set') {
            mockState.store.set(ref.__key, data ?? {});
            return;
          }
          const current = { ...(mockState.store.get(ref.__key) ?? {}) };
          Object.entries(data ?? {}).forEach(([key, value]) => {
            if (value && typeof value === 'object' && '__increment' in value) {
              current[key] = Number(current[key] ?? 0) +
                Number((value as { __increment: number }).__increment);
            } else {
              current[key] = value;
            }
          });
          mockState.store.set(ref.__key, current);
        });
        mockState.batchCommits += 1;
      },
    };
  },
  runTransaction: async (
    _db: unknown,
    fn: (t: unknown) => Promise<unknown>
  ) => {
    mockState.transactionCalls += 1;
    const txn = {
      get: async (ref: { __key: string }) => ({
        exists: () => mockState.store.has(ref.__key),
        data: () => mockState.store.get(ref.__key),
      }),
      set: (ref: { __key: string }, data: Record<string, unknown>) =>
        mockState.writeLog.push({ op: 'set', key: ref.__key, data }),
      update: (ref: { __key: string }, data: Record<string, unknown>) =>
        mockState.writeLog.push({ op: 'update', key: ref.__key, data }),
      delete: (ref: { __key: string }) =>
        mockState.writeLog.push({ op: 'delete', key: ref.__key }),
    };
    return fn(txn);
  },
}));

// Import DESPUÉS de los mocks.
import { useTransactionsCRUD } from '../../hooks/firestore/useTransactionsCRUD';
import {
  subscribeTransactionCacheMutations,
  type TransactionCacheMutation,
} from '../../hooks/firestore/transactionPaginationCache';

const UID = 'u1';
const acctKey = (id: string) => `users/${UID}/accounts/${id}`;
const txKey = (id: string) => `users/${UID}/transactions/${id}`;
const debtKey = (id: string) => `users/${UID}/debts/${id}`;

const savings: Account = {
  id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 1_000_000,
};
const credit: Account = {
  id: 'cc', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0,
  creditLimit: 5_000_000, usedCredit: 1_000_000,
};

const seedAccount = (a: Account) => mockState.store.set(acctKey(a.id!), a as unknown as Record<string, unknown>);
const seedTx = (id: string, data: Partial<Transaction>) =>
  mockState.store.set(txKey(id), data as unknown as Record<string, unknown>);

const updatesOn = (key: string) => mockState.writeLog.filter(w => w.op === 'update' && w.key === key);
const sets = () => mockState.writeLog.filter(w => w.op === 'set');
const deletes = () => mockState.writeLog.filter(w => w.op === 'delete');
const addDocs = () => mockState.writeLog.filter(w => w.op === 'addDoc');
const cacheMutations: TransactionCacheMutation[] = [];
let unsubscribeCacheMutations = () => {};

const makeTx = (o: Partial<Transaction>): Omit<Transaction, 'id' | 'createdAt'> => ({
  type: 'expense',
  amount: 100_000,
  category: 'Compras Personales',
  description: 'Test',
  date: new Date('2026-06-01'),
  paid: true,
  accountId: 'sav',
  ...o,
}) as Omit<Transaction, 'id' | 'createdAt'>;

const renderCRUD = (accounts: Account[]) =>
  renderHook(() => useTransactionsCRUD(UID, accounts)).result;

beforeEach(() => {
  mockState.store.clear();
  mockState.writeLog.length = 0;
  mockState.gen = 0;
  mockState.transactionCalls = 0;
  mockState.batchCommits = 0;
  mockState.failBatchCommit = false;
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

describe('useTransactionsCRUD — ruta de escritura de dinero (A2)', () => {
  describe('addTransaction', () => {
    it('rechaza un gasto de ahorro que excede el saldo persistido sin escribir ni publicar caché', async () => {
      seedAccount({ ...savings, initialBalance: 1_000 });
      const crud = renderCRUD([]);

      await expect(crud.current.addTransaction(makeTx({
        type: 'expense', amount: 1_000.01, accountId: 'sav',
      }))).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

      expect(mockState.writeLog).toHaveLength(0);
      expect(cacheMutations).toHaveLength(0);
    });

    it('permite gastar exactamente el saldo persistido y deja la cuenta en cero', async () => {
      seedAccount({ ...savings, initialBalance: 1_000 });
      const crud = renderCRUD([]);

      await crud.current.addTransaction(makeTx({
        type: 'expense', amount: 1_000, accountId: 'sav',
      }));

      expect(sets()).toHaveLength(1);
      expect(sets()[0].data).toMatchObject({
        amount: 1_000,
        accountId: 'sav',
        operationId: 'ledger-mutation:test-operation',
        mutationKind: 'create',
        mutationSource: 'manual',
      });
      expect(mockState.batchCommits).toBe(1);
    });

    it('no publica caché ni escrituras si el batch final es rechazado', async () => {
      seedAccount(savings);
      mockState.failBatchCommit = true;
      const crud = renderCRUD([]);

      await expect(crud.current.addTransaction(makeTx({
        type: 'expense', amount: 100, accountId: 'sav',
      }))).rejects.toThrow('batch rejected');

      expect(mockState.writeLog).toHaveLength(0);
      expect(cacheMutations).toHaveLength(0);
      expect(mockState.batchCommits).toBe(0);
    });

    it('gasto en TC: crea la tx y sube usedCredit en increment(+amount) atómicamente', async () => {
      seedAccount(savings);
      seedAccount(credit);
      const crud = renderCRUD([savings, credit]);

      await crud.current.addTransaction(makeTx({ type: 'expense', amount: 300_000, accountId: 'cc' }));

      // La tx se crea (set) y la TC recibe +300_000 de deuda.
      expect(sets()).toHaveLength(1);
      const ccUpdates = updatesOn(acctKey('cc'));
      expect(ccUpdates).toHaveLength(1);
      expect(ccUpdates[0].data!.usedCredit).toEqual({ __increment: 300_000 });
    });

    it('gasto financiado suma principal más interés a usedCredit', async () => {
      seedAccount(credit);
      const crud = renderCRUD([credit]);

      await crud.current.addTransaction(makeTx({
        type: 'expense', amount: 120_000, totalInterestAmount: 3_265.49, accountId: 'cc',
      }));

      expect(updatesOn(acctKey('cc'))[0].data!.usedCredit).toEqual({ __increment: 123_265.49 });
    });

    it('gasto en cuenta de ahorro: usa el batch del ledger sin tocar usedCredit', async () => {
      seedAccount(savings);
      const crud = renderCRUD([savings]);

      await crud.current.addTransaction(makeTx({ type: 'expense', amount: 200_000, accountId: 'sav' }));

      expect(addDocs()).toHaveLength(0);
      expect(sets()).toHaveLength(1);
      expect(sets()[0].key).toMatch(new RegExp(`^users/${UID}/transactions/`));
      expect(cacheMutations).toContainEqual(expect.objectContaining({
        userId: UID,
        type: 'update',
        transactions: [expect.objectContaining({
          id: expect.any(String),
          amount: 200_000,
          accountId: 'sav',
        })],
      }));
      // Ninguna actualización de cuenta (no hay TC implicada).
      expect(mockState.writeLog.filter(w => w.op === 'update')).toHaveLength(0);
    });

    it('aborta sin escribir si la cuenta de la TC no existe', async () => {
      // accounts en memoria marca 'cc' como crédito (para calcular delta), pero el
      // store de Firestore NO la tiene → el get().exists() es false → throw.
      const crud = renderCRUD([credit]);

      await expect(
        crud.current.addTransaction(makeTx({ type: 'expense', amount: 100_000, accountId: 'cc' }))
      ).rejects.toThrow(/no existe/i);
    });
  });

  describe('addCreditPaymentAtomic', () => {
    it('crea las DOS transacciones y reduce usedCredit en increment(-amount) de la TC', async () => {
      seedAccount(savings);
      seedAccount(credit);
      const crud = renderCRUD([]);

      // Pago de TC: ingreso a la tarjeta (reduce deuda) + gasto espejo del banco.
      const creditTx = makeTx({ type: 'income', amount: 400_000, accountId: 'cc', category: 'Pago Crédito' });
      const sourceTx = makeTx({ type: 'expense', amount: 400_000, accountId: 'sav', category: 'Pago Crédito' });

      await crud.current.addCreditPaymentAtomic(creditTx, sourceTx);

      // Dos sets (ambas tx) en una sola operación atómica.
      expect(sets()).toHaveLength(2);
      expect(sets()[0].data!.linkedTransactionId).toBe('__new2');
      expect(sets()[1].data!.linkedTransactionId).toBe('__new1');
      // La deuda de la TC baja 400_000 (income → -amount).
      const ccUpdates = updatesOn(acctKey('cc'));
      expect(ccUpdates).toHaveLength(1);
      expect(ccUpdates[0].data!.usedCredit).toEqual({ __increment: -400_000 });
      expect(cacheMutations).toContainEqual(expect.objectContaining({
        userId: UID,
        type: 'update',
        transactions: expect.arrayContaining([
          expect.objectContaining({ id: '__new1', linkedTransactionId: '__new2' }),
          expect.objectContaining({ id: '__new2', linkedTransactionId: '__new1' }),
        ]),
      }));
    });

    it('aborta si la cuenta de crédito no existe', async () => {
      seedAccount(savings); // falta la TC
      const crud = renderCRUD([savings, credit]);
      const creditTx = makeTx({ type: 'income', amount: 100_000, accountId: 'cc', category: 'Pago Crédito' });
      const sourceTx = makeTx({ type: 'expense', amount: 100_000, accountId: 'sav', category: 'Pago Crédito' });

      await expect(crud.current.addCreditPaymentAtomic(creditTx, sourceTx)).rejects.toThrow(/no existe/i);
    });

    it('aborta si el pago supera la deuda persistida', async () => {
      seedAccount(savings);
      seedAccount({ ...credit, usedCredit: 100_000 });
      const crud = renderCRUD([savings, credit]);

      await expect(crud.current.addCreditPaymentAtomic(
        makeTx({ type: 'income', amount: 150_000, accountId: 'cc', category: 'Pago Crédito' }),
        makeTx({ type: 'expense', amount: 150_000, accountId: 'sav', category: 'Pago Crédito' })
      )).rejects.toThrow(/pagar más/i);
      expect(sets()).toHaveLength(0);
    });
  });

  describe('transferencias atómicas', () => {
    it('rechaza una transferencia que excede el saldo persistido sin escribir', async () => {
      seedAccount({ ...savings, initialBalance: 1_000 });
      mockState.store.set(acctKey('cash'), {
        id: 'cash', name: 'Efectivo', type: 'cash', isDefault: false, initialBalance: 0,
      });
      const crud = renderCRUD([]);

      await expect(crud.current.addTransaction(makeTx({
        type: 'transfer',
        amount: 1_000.01,
        accountId: 'sav',
        toAccountId: 'cash',
        category: 'Transferencia',
      }))).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

      expect(mockState.writeLog).toHaveLength(0);
      expect(cacheMutations).toHaveLength(0);
    });

    it('transferencia ahorro → TC: crea la tx transfer y reduce usedCredit de la TC destino', async () => {
      seedAccount(savings);
      seedAccount(credit);
      const crud = renderCRUD([savings, credit]);

      await crud.current.addTransaction(
        makeTx({ type: 'transfer', amount: 250_000, accountId: 'sav', toAccountId: 'cc', category: 'Transferencia' })
      );

      expect(sets()).toHaveLength(1);
      expect(sets()[0].data!.type).toBe('transfer');
      // El pago hacia la TC reduce su deuda: increment(-amount) en la cuenta destino.
      const ccUpdates = updatesOn(acctKey('cc'));
      expect(ccUpdates).toHaveLength(1);
      expect(ccUpdates[0].data!.usedCredit).toEqual({ __increment: -250_000 });
      expect(cacheMutations).toContainEqual(expect.objectContaining({
        userId: UID,
        type: 'update',
        transactions: [expect.objectContaining({
          id: '__new1',
          type: 'transfer',
          amount: 250_000,
        })],
      }));
    });

    it('transferencia DESDE una TC se bloquea ANTES de escribir nada', async () => {
      seedAccount(savings);
      seedAccount(credit);
      const crud = renderCRUD([]);

      await expect(
        crud.current.addTransaction(
          makeTx({ type: 'transfer', amount: 100_000, accountId: 'cc', toAccountId: 'sav', category: 'Transferencia' })
        )
      ).rejects.toThrow(/tarjeta de crédito/i);

      // Ninguna escritura se confirmó (el guard está antes del set/update).
      expect(sets()).toHaveLength(0);
      expect(mockState.writeLog.filter(w => w.op === 'update')).toHaveLength(0);
    });
  });

  describe('deleteTransaction', () => {
    it('borra una compra de TC y REVIERTE usedCredit en increment(-amount)', async () => {
      seedAccount(credit);
      seedTx('tx-del', { type: 'expense', amount: 150_000, accountId: 'cc', category: 'Compras Personales', paid: true });
      const crud = renderCRUD([credit]);

      await crud.current.deleteTransaction('tx-del');

      // La tx se borra y la deuda de la TC se reduce en lo que sumó (+150_000 → -150_000).
      expect(deletes().some(d => d.key === txKey('tx-del'))).toBe(true);
      const ccUpdates = updatesOn(acctKey('cc'));
      expect(ccUpdates).toHaveLength(1);
      expect(ccUpdates[0].data!.usedCredit).toEqual({ __increment: -150_000 });
      expect(cacheMutations).toContainEqual({
        userId: UID,
        type: 'delete',
        transactionIds: ['tx-del'],
      });
    });

    it('al borrar un pago de deuda reabre desde el saldo persistido en la misma transacción', async () => {
      seedTx('debt-payment', {
        type: 'income', amount: 200_000, accountId: 'sav', category: 'Cobro Préstamo',
        debtId: 'debt-1', paid: true,
      });
      mockState.store.set(debtKey('debt-1'), {
        remainingAmount: 700_000,
        isSettled: true,
        settledAt: new Date('2026-07-01'),
      });
      const crud = renderCRUD([savings]);

      await crud.current.deleteTransaction('debt-payment');

      expect(mockState.transactionCalls).toBe(1);
      const debtUpdates = updatesOn(debtKey('debt-1'));
      expect(debtUpdates).toHaveLength(1);
      expect(debtUpdates[0].data).toMatchObject({
        remainingAmount: 900_000,
        isSettled: false,
      });
      expect(debtUpdates[0].data!.settledAt).toEqual({ __deleteField: true });
    });

    it('si la transacción no existe es un no-op (no borra ni actualiza)', async () => {
      const crud = renderCRUD([credit]);
      await crud.current.deleteTransaction('inexistente');
      expect(deletes()).toHaveLength(0);
      expect(mockState.writeLog.filter(w => w.op === 'update')).toHaveLength(0);
    });

    it('transferencia hacia TC no puede superar la deuda', async () => {
      seedAccount(savings);
      seedAccount({ ...credit, usedCredit: 100_000 });
      const crud = renderCRUD([savings, credit]);

      await expect(crud.current.addTransaction(makeTx({
        type: 'transfer', amount: 150_000, accountId: 'sav', toAccountId: 'cc', category: 'Transferencia',
      }))).rejects.toThrow(/pagar más/i);
      expect(sets()).toHaveLength(0);
    });

    it('borra las DOS mitades de un pago vinculado y revierte la deuda una sola vez', async () => {
      seedAccount(savings);
      seedAccount(credit);
      seedTx('pay-card', {
        type: 'income', amount: 200_000, accountId: 'cc', category: 'Pago Crédito',
        paid: true, linkedTransactionId: 'pay-bank',
      });
      seedTx('pay-bank', {
        type: 'expense', amount: 200_000, accountId: 'sav', category: 'Pago Crédito',
        paid: true, linkedTransactionId: 'pay-card',
      });
      const crud = renderCRUD([savings, credit]);

      await crud.current.deleteTransaction('pay-bank');

      expect(deletes().map(entry => entry.key)).toEqual(expect.arrayContaining([
        txKey('pay-bank'), txKey('pay-card'),
      ]));
      expect(updatesOn(acctKey('cc'))[0].data!.usedCredit).toEqual({ __increment: 200_000 });
    });
  });

  describe('updateTransaction', () => {
    it('cambiar el monto de un gasto de TC aplica el DIFF de delta como increment', async () => {
      seedAccount(credit);
      seedTx('tx-upd', { type: 'expense', amount: 100_000, accountId: 'cc', category: 'Compras Personales', paid: true, date: new Date('2026-06-01') });
      const crud = renderCRUD([credit]);

      // 100_000 → 150_000: la deuda debe subir solo el DIFF (+50_000).
      await crud.current.updateTransaction('tx-upd', { amount: 150_000 });

      const txUpdates = updatesOn(txKey('tx-upd'));
      expect(txUpdates).toHaveLength(1);
      expect(txUpdates[0].data!.amount).toBe(150_000);

      const ccUpdates = updatesOn(acctKey('cc'));
      expect(ccUpdates).toHaveLength(1);
      expect(ccUpdates[0].data!.usedCredit).toEqual({ __increment: 50_000 });
      expect(cacheMutations).toHaveLength(1);
      expect(cacheMutations[0]).toEqual(expect.objectContaining({
        userId: UID,
        type: 'update',
        transactions: [expect.objectContaining({
          id: 'tx-upd',
          amount: 150_000,
        })],
      }));
    });

    it('sincroniza monto y fecha de ambas mitades sin permitir cambiar su categoría', async () => {
      seedAccount(savings);
      seedAccount(credit);
      seedTx('pay-card', {
        type: 'income', amount: 100_000, accountId: 'cc', category: 'Pago Crédito',
        paid: true, linkedTransactionId: 'pay-bank', date: new Date('2026-06-01'),
      });
      seedTx('pay-bank', {
        type: 'expense', amount: 100_000, accountId: 'sav', category: 'Pago Crédito',
        paid: true, linkedTransactionId: 'pay-card', date: new Date('2026-06-01'),
      });
      const crud = renderCRUD([savings, credit]);
      const newDate = new Date('2026-06-02');

      await crud.current.updateTransaction('pay-bank', {
        amount: 150_000, date: newDate, category: 'Comida',
      });

      expect(updatesOn(txKey('pay-bank'))[0].data).toEqual(expect.objectContaining({
        amount: 150_000, date: newDate,
      }));
      expect(updatesOn(txKey('pay-bank'))[0].data).not.toHaveProperty('category');
      expect(updatesOn(txKey('pay-card'))[0].data).toEqual(expect.objectContaining({
        amount: 150_000, date: newDate,
      }));
      expect(updatesOn(acctKey('cc'))[0].data!.usedCredit).toEqual({ __increment: -50_000 });
    });
  });
});
