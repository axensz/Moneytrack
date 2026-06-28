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
}));

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __collection: path }),
  doc: (first: { __collection?: string }, path?: string, id?: string) => {
    if (path === undefined) {
      // doc(collection(...)) → nueva referencia con id generado
      const col = first.__collection as string;
      mockState.gen += 1;
      const newId = `__new${mockState.gen}`;
      return { __key: `${col}/${newId}`, __path: col, __id: newId, __isNew: true };
    }
    // doc(db, path, id)
    return { __key: `${path}/${id}`, __path: path, __id: id };
  },
  addDoc: async (col: { __collection: string }, data: Record<string, unknown>) => {
    mockState.writeLog.push({ op: 'addDoc', key: col.__collection, data });
    return { id: `addDoc-${(mockState.gen += 1)}` };
  },
  increment: (n: number) => ({ __increment: n }),
  runTransaction: async (
    _db: unknown,
    fn: (t: unknown) => Promise<unknown>
  ) => {
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

const UID = 'u1';
const acctKey = (id: string) => `users/${UID}/accounts/${id}`;
const txKey = (id: string) => `users/${UID}/transactions/${id}`;

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
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => vi.restoreAllMocks());

describe('useTransactionsCRUD — ruta de escritura de dinero (A2)', () => {
  describe('addTransaction', () => {
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

    it('gasto en cuenta de ahorro (sin TC): escritura simple con addDoc, sin tocar usedCredit', async () => {
      seedAccount(savings);
      const crud = renderCRUD([savings]);

      await crud.current.addTransaction(makeTx({ type: 'expense', amount: 200_000, accountId: 'sav' }));

      expect(addDocs()).toHaveLength(1);
      expect(addDocs()[0].key).toBe(`users/${UID}/transactions`);
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
      const crud = renderCRUD([savings, credit]);

      // Pago de TC: ingreso a la tarjeta (reduce deuda) + gasto espejo del banco.
      const creditTx = makeTx({ type: 'income', amount: 400_000, accountId: 'cc', category: 'Pago Crédito' });
      const sourceTx = makeTx({ type: 'expense', amount: 400_000, accountId: 'sav', category: 'Pago Crédito' });

      await crud.current.addCreditPaymentAtomic(creditTx, sourceTx);

      // Dos sets (ambas tx) en una sola operación atómica.
      expect(sets()).toHaveLength(2);
      // La deuda de la TC baja 400_000 (income → -amount).
      const ccUpdates = updatesOn(acctKey('cc'));
      expect(ccUpdates).toHaveLength(1);
      expect(ccUpdates[0].data!.usedCredit).toEqual({ __increment: -400_000 });
    });

    it('aborta si la cuenta de crédito no existe', async () => {
      seedAccount(savings); // falta la TC
      const crud = renderCRUD([savings, credit]);
      const creditTx = makeTx({ type: 'income', amount: 100_000, accountId: 'cc', category: 'Pago Crédito' });
      const sourceTx = makeTx({ type: 'expense', amount: 100_000, accountId: 'sav', category: 'Pago Crédito' });

      await expect(crud.current.addCreditPaymentAtomic(creditTx, sourceTx)).rejects.toThrow(/no existe/i);
    });
  });

  describe('transferencias atómicas', () => {
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
    });

    it('transferencia DESDE una TC se bloquea ANTES de escribir nada', async () => {
      seedAccount(savings);
      seedAccount(credit);
      const crud = renderCRUD([savings, credit]);

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
    });

    it('si la transacción no existe es un no-op (no borra ni actualiza)', async () => {
      const crud = renderCRUD([credit]);
      await crud.current.deleteTransaction('inexistente');
      expect(deletes()).toHaveLength(0);
      expect(mockState.writeLog.filter(w => w.op === 'update')).toHaveLength(0);
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
    });
  });
});
