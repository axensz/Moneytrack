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
import { LOAN_CATEGORY, LOAN_PAYMENT_CATEGORY } from '../../config/constants';

// Estado compartido entre el mock (hoisted) y los tests.
const mockState = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  writeLog: [] as Array<{ op: string; key: string; data?: Record<string, unknown> }>,
  gen: 0,
  transactionCalls: 0,
  batchCommits: 0,
  failBatchCommit: false,
  failAfterBatchCommit: false,
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
        if (mockState.failAfterBatchCommit) throw new Error('commit acknowledgement lost');
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
const recurringKey = (id: string) => `users/${UID}/recurringPayments/${id}`;

const savings: Account = {
  id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 1_000_000,
};
const credit: Account = {
  id: 'cc', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0,
  creditLimit: 5_000_000, usedCredit: 1_000_000,
};

const seedAccount = (a: Account) => mockState.store.set(acctKey(a.id!), a as unknown as Record<string, unknown>);
const seedTx = (id: string, data: Partial<Transaction>) =>
  mockState.store.set(txKey(id), {
    type: 'expense',
    amount: 100,
    category: 'Prueba',
    description: 'Seed',
    date: new Date('2026-06-01'),
    paid: true,
    accountId: 'sav',
    ...data,
  } as unknown as Record<string, unknown>);
const seedRecurring = (id = 'rent') => mockState.store.set(recurringKey(id), {
  name: 'Arriendo',
  amount: 1_200,
  category: 'Vivienda',
  dueDay: 5,
  frequency: 'monthly',
  isActive: true,
  createdAt: new Date('2026-01-01'),
});

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
  mockState.failAfterBatchCommit = false;
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
    it('rejects a non-transfer with toAccountId instead of persisting half a card payment', async () => {
      seedAccount(savings);
      seedAccount(credit);
      const crud = renderCRUD([]);

      await expect(crud.current.addTransaction(makeTx({
        type: 'income',
        amount: 100_000,
        category: 'Pago Crédito',
        accountId: 'cc',
        toAccountId: 'sav',
      }))).rejects.toThrow(/pago.*atómico|cuenta destino/i);

      expect(mockState.writeLog).toHaveLength(0);
      expect(mockState.batchCommits).toBe(0);
      expect(cacheMutations).toHaveLength(0);
    });

    it('commits a caller-supplied AI operation once and treats an exact retry as idempotent', async () => {
      seedAccount(savings);
      const crud = renderCRUD([]);
      const operationId = 'ledger-mutation:ai:message-1:create';
      const draft = makeTx({ operationId, mutationSource: 'ai' });

      await crud.current.addTransaction(draft);
      await crud.current.addTransaction(draft);

      expect(mockState.batchCommits).toBe(1);
      expect(sets()).toHaveLength(1);
      expect(sets()[0]).toMatchObject({
        key: txKey(operationId),
        data: {
          operationId,
          mutationKind: 'create',
          mutationSource: 'ai',
        },
      });
    });

    it('recovers an already-persisted AI operation when the commit acknowledgement is lost', async () => {
      seedAccount(savings);
      mockState.failAfterBatchCommit = true;
      const crud = renderCRUD([]);
      const operationId = 'ledger-mutation:ai:message-ack:create';

      await expect(crud.current.addTransaction(makeTx({
        operationId,
        mutationSource: 'ai',
      }))).resolves.toBeUndefined();

      expect(mockState.batchCommits).toBe(1);
      expect(mockState.store.get(txKey(operationId))).toMatchObject({
        operationId,
        mutationSource: 'ai',
      });
      expect(cacheMutations).toHaveLength(1);
    });

    it('rejects reuse of an AI operation ID with a different financial payload', async () => {
      seedAccount(savings);
      const crud = renderCRUD([]);
      const operationId = 'ledger-mutation:ai:message-collision:create';

      await crud.current.addTransaction(makeTx({ amount: 100, operationId, mutationSource: 'ai' }));
      await expect(crud.current.addTransaction(makeTx({
        amount: 200,
        operationId,
        mutationSource: 'ai',
      }))).rejects.toThrow(/mutación financiera diferente/i);

      expect(mockState.batchCommits).toBe(1);
    });

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
    it('rechaza el pago cuando la cuenta origen no tiene fondos y no escribe ninguna mitad', async () => {
      seedAccount({ ...savings, initialBalance: 1_000 });
      seedAccount(credit);
      const crud = renderCRUD([]);

      await expect(crud.current.addCreditPaymentAtomic(
        makeTx({ type: 'income', amount: 1_000.01, accountId: 'cc', category: 'Pago Crédito' }),
        makeTx({ type: 'expense', amount: 1_000.01, accountId: 'sav', category: 'Pago Crédito' })
      )).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

      expect(mockState.writeLog).toHaveLength(0);
      expect(cacheMutations).toHaveLength(0);
    });

    it('rechaza una tarjeta sin usedCredit persistido antes de escribir', async () => {
      seedAccount(savings);
      seedAccount({ ...credit, usedCredit: undefined });
      const crud = renderCRUD([]);

      await expect(crud.current.addCreditPaymentAtomic(
        makeTx({ type: 'income', amount: 100_000, accountId: 'cc', category: 'Pago Crédito' }),
        makeTx({ type: 'expense', amount: 100_000, accountId: 'sav', category: 'Pago Crédito' })
      )).rejects.toMatchObject({ code: 'INVALID_ACCOUNT_AUTHORITY' });

      expect(mockState.writeLog).toHaveLength(0);
      expect(cacheMutations).toHaveLength(0);
    });

    it('no publica ni conserva una mitad si el batch final falla', async () => {
      seedAccount(savings);
      seedAccount(credit);
      mockState.failBatchCommit = true;
      const crud = renderCRUD([]);

      await expect(crud.current.addCreditPaymentAtomic(
        makeTx({ type: 'income', amount: 100_000, accountId: 'cc', category: 'Pago Crédito' }),
        makeTx({ type: 'expense', amount: 100_000, accountId: 'sav', category: 'Pago Crédito' })
      )).rejects.toThrow('batch rejected');

      expect(mockState.writeLog).toHaveLength(0);
      expect(cacheMutations).toHaveLength(0);
    });

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
      expect(sets().map(entry => entry.data)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          operationId: 'ledger-mutation:test-operation',
          mutationKind: 'credit-payment',
          mutationSource: 'manual',
        }),
        expect.objectContaining({
          operationId: 'ledger-mutation:test-operation',
          mutationKind: 'credit-payment',
          mutationSource: 'manual',
        }),
      ]));
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

  describe('recurring cycle aggregate', () => {
    const recurringDraft = (overrides: Partial<Transaction> = {}) => makeTx({
      amount: 1_200,
      category: 'Vivienda',
      description: 'Arriendo',
      date: new Date('2026-06-06T12:00:00'),
      paid: true,
      accountId: 'sav',
      recurringPaymentId: 'rent',
      recurringCycle: '2026-5-5',
      ...overrides,
    });

    it('materializes one deterministic transaction and metadata across exact retries', async () => {
      seedAccount(savings);
      seedRecurring();
      const crud = renderCRUD([]);

      await crud.current.addRecurringTransactionAtomic(recurringDraft());
      await crud.current.addRecurringTransactionAtomic(recurringDraft({
        date: new Date('2026-06-06T12:00:01'),
      }));

      const operationId = 'ledger-mutation:recurring:rent:2026-5-5';
      expect(mockState.batchCommits).toBe(1);
      expect(mockState.store.get(txKey(operationId))).toMatchObject({
        recurringPaymentId: 'rent',
        recurringCycle: '2026-5-5',
        mutationKind: 'recurring-post',
        mutationSource: 'recurring',
      });
      expect(mockState.store.get(recurringKey('rent'))).toMatchObject({
        amount: 1_200,
        lastPaidAmount: 1_200,
        lastPaidDate: new Date('2026-06-06T12:00:00'),
      });
      expect(cacheMutations).toHaveLength(2);
    });

    it('does not duplicate a paid legacy row outside the head', async () => {
      seedAccount(savings);
      seedRecurring();
      seedTx('legacy-paid', {
        amount: 1_150,
        date: new Date('2026-06-06T08:00:00'),
        recurringPaymentId: 'rent',
        recurringCycle: undefined,
      });
      const crud = renderCRUD([]);

      await crud.current.addRecurringTransactionAtomic(recurringDraft());

      expect(sets().filter((entry) => entry.key.startsWith(`users/${UID}/transactions/`)))
        .toHaveLength(0);
      expect(mockState.store.get(recurringKey('rent'))).toMatchObject({
        lastPaidAmount: 1_150,
        lastPaidDate: new Date('2026-06-06T08:00:00'),
      });
    });

    it('rejects a pending link target with zero writes', async () => {
      seedAccount(savings);
      seedRecurring();
      seedTx('pending', { paid: false, recurringPaymentId: undefined });
      const crud = renderCRUD([]);

      await expect(crud.current.linkRecurringTransactionAtomic(
        'pending',
        'rent',
        '2026-5-5',
      )).rejects.toThrow(/pagad[ao]/i);

      expect(mockState.writeLog).toHaveLength(0);
    });

    it('rejects a cycle key that does not match the recurring due day', async () => {
      seedAccount(savings);
      seedRecurring();
      const crud = renderCRUD([]);

      await expect(crud.current.addRecurringTransactionAtomic(recurringDraft({
        recurringCycle: '2026-5-6',
      }))).rejects.toThrow(/no corresponde/i);

      expect(mockState.writeLog).toHaveLength(0);
      expect(cacheMutations).toHaveLength(0);
    });

    it('links a paid expense and updates last-paid metadata in the same commit', async () => {
      seedAccount(savings);
      seedRecurring();
      seedTx('existing', {
        amount: 1_350,
        date: new Date('2026-06-07T08:00:00'),
        recurringPaymentId: undefined,
      });
      const crud = renderCRUD([]);

      await crud.current.linkRecurringTransactionAtomic('existing', 'rent', '2026-5-5');

      expect(mockState.batchCommits).toBe(1);
      expect(mockState.store.get(txKey('existing'))).toMatchObject({
        recurringPaymentId: 'rent',
        recurringCycle: '2026-5-5',
        mutationKind: 'recurring-post',
      });
      expect(mockState.store.get(recurringKey('rent'))).toMatchObject({
        amount: 1_350,
        lastPaidAmount: 1_350,
        lastPaidDate: new Date('2026-06-07T08:00:00'),
      });
    });

    it('keeps both transaction and recurring metadata unchanged when the batch fails', async () => {
      seedAccount(savings);
      seedRecurring();
      mockState.failBatchCommit = true;
      const crud = renderCRUD([]);

      await expect(crud.current.addRecurringTransactionAtomic(recurringDraft()))
        .rejects.toThrow('batch rejected');

      expect(mockState.store.has(txKey('ledger-mutation:recurring:rent:2026-5-5'))).toBe(false);
      expect(mockState.store.get(recurringKey('rent'))).not.toHaveProperty('lastPaidDate');
      expect(cacheMutations).toHaveLength(0);
    });

    it('recovers after a committed batch loses its acknowledgement', async () => {
      seedAccount(savings);
      seedRecurring();
      mockState.failAfterBatchCommit = true;
      const crud = renderCRUD([]);

      await expect(crud.current.addRecurringTransactionAtomic(recurringDraft()))
        .resolves.toBeUndefined();

      expect(mockState.batchCommits).toBe(1);
      expect(mockState.store.has(txKey('ledger-mutation:recurring:rent:2026-5-5'))).toBe(true);
      expect(cacheMutations).toHaveLength(1);
    });

    it('recovers a linked transaction after the commit acknowledgement is lost', async () => {
      seedAccount(savings);
      seedRecurring();
      seedTx('existing-ack', { recurringPaymentId: undefined });
      mockState.failAfterBatchCommit = true;
      const crud = renderCRUD([]);

      await expect(crud.current.linkRecurringTransactionAtomic(
        'existing-ack',
        'rent',
        '2026-5-5',
      )).resolves.toBeUndefined();

      expect(mockState.store.get(txKey('existing-ack'))).toMatchObject({
        recurringPaymentId: 'rent',
        recurringCycle: '2026-5-5',
      });
      expect(cacheMutations).toHaveLength(1);
    });

    it('can unlink and relink the same paid row without creating money', async () => {
      seedAccount(savings);
      seedRecurring();
      seedTx('relink', { recurringPaymentId: undefined });
      const crud = renderCRUD([]);

      await crud.current.linkRecurringTransactionAtomic('relink', 'rent', '2026-5-5');
      await crud.current.updateTransaction('relink', {
        recurringPaymentId: null,
        recurringCycle: null,
      } as unknown as Partial<Transaction>);
      await crud.current.linkRecurringTransactionAtomic('relink', 'rent', '2026-5-5');

      expect(mockState.store.get(txKey('relink'))).toMatchObject({
        recurringPaymentId: 'rent',
        recurringCycle: '2026-5-5',
      });
      expect(sets().filter((entry) => entry.key.startsWith(`users/${UID}/transactions/`)))
        .toHaveLength(0);
      expect([...mockState.store.keys()].filter((key) => key.startsWith(`users/${UID}/transactions/`)))
        .toEqual([txKey('relink')]);
    });
  });

  describe('restoreTransaction', () => {
    const deleted = (overrides: Partial<Transaction> = {}): Transaction => ({
      ...makeTx({ amount: 200, accountId: 'sav' }),
      id: 'original-row',
      createdAt: new Date('2026-06-01T12:00:00'),
      ...overrides,
    });

    it.each(['expense', 'income'] as const)(
      'restores a standalone %s under its original identity exactly once',
      async (type) => {
        seedAccount({ ...savings, initialBalance: 1_000 });
        const crud = renderCRUD([]);
        const snapshot = deleted({ type });
        const { id, ...persisted } = snapshot;
        seedTx(id!, persisted);

        await crud.current.deleteTransaction(id!);
        expect(mockState.store.has(txKey(id!))).toBe(false);
        await crud.current.restoreTransaction(snapshot);
        await crud.current.restoreTransaction(snapshot);

        expect(mockState.batchCommits).toBe(2);
        expect(mockState.store.get(txKey('original-row'))).toMatchObject({
          type,
          operationId: 'ledger-mutation:undo:original-row:restore',
          mutationKind: 'restore',
          mutationSource: 'undo',
        });
        expect(cacheMutations).toHaveLength(3);
      }
    );

    it('rejects an occupied original ID with a different payload', async () => {
      seedAccount(savings);
      seedTx('original-row', { amount: 999, description: 'another row' });
      const crud = renderCRUD([]);

      await expect(crud.current.restoreTransaction(deleted()))
        .rejects.toThrow(/identidad original|otra transacción/i);

      expect(mockState.batchCommits).toBe(0);
    });

    it.each([
      ['card purchase', deleted({ accountId: 'cc' })],
      ['linked payment', deleted({ linkedTransactionId: 'pair-2' })],
      ['debt principal', deleted({ debtId: 'debt-1', category: LOAN_CATEGORY })],
      ['recurring payment', deleted({ recurringPaymentId: 'rent', recurringCycle: '2026-5-5' })],
      ['transfer', deleted({ type: 'transfer', toAccountId: 'cash' })],
      ['migration row', deleted({ mutationKind: 'migration', mutationSource: 'migration' })],
      ['incomplete debt aggregate', deleted({ mutationSource: 'debt' })],
    ])('rejects unsupported %s snapshots with zero writes', async (_label, snapshot) => {
      seedAccount(savings);
      seedAccount(credit);
      const crud = renderCRUD([]);

      await expect(crud.current.restoreTransaction(snapshot as Transaction))
        .rejects.toThrow(/restaurar|deshacer/i);

      expect(mockState.writeLog).toHaveLength(0);
      expect(cacheMutations).toHaveLength(0);
    });

    it('restores a debt payment and debt state atomically', async () => {
      seedAccount(savings);
      mockState.store.set(debtKey('debt-1'), {
        personName: 'Ana', type: 'lent', originalAmount: 1_000,
        remainingAmount: 500, isSettled: false, accountId: 'sav',
        createdAt: new Date('2026-01-01'),
      });
      const crud = renderCRUD([]);
      const payment = deleted({
        type: 'income', amount: 200, category: LOAN_PAYMENT_CATEGORY,
        debtId: 'debt-1', accountId: 'sav',
      });
      const { id, ...persisted } = payment;
      seedTx(id!, persisted);

      await crud.current.deleteTransaction(id!);
      expect(mockState.store.get(debtKey('debt-1'))).toMatchObject({
        remainingAmount: 700,
        isSettled: false,
      });
      await crud.current.restoreTransaction(payment);

      expect(mockState.store.get(txKey('original-row'))).toMatchObject({
        debtId: 'debt-1', mutationKind: 'restore', mutationSource: 'undo',
      });
      expect(mockState.store.get(debtKey('debt-1'))).toMatchObject({
        remainingAmount: 500,
        isSettled: false,
      });
      expect(mockState.batchCommits).toBe(2);
    });

    it('never recreates only half of a deleted card aggregate', async () => {
      seedAccount(savings);
      seedAccount(credit);
      const crud = renderCRUD([]);
      const cardPurchase = deleted({ id: 'card-purchase', accountId: 'cc' });
      const { id: cardId, ...persistedCard } = cardPurchase;
      seedTx(cardId!, persistedCard);

      await crud.current.deleteTransaction(cardId!);
      const writesAfterCardDelete = mockState.writeLog.length;
      await expect(crud.current.restoreTransaction(cardPurchase)).rejects.toThrow(/tarjeta/i);
      expect(mockState.store.has(txKey(cardId!))).toBe(false);
      expect(mockState.writeLog).toHaveLength(writesAfterCardDelete);

      const bank = deleted({
        id: 'pay-bank',
        type: 'expense',
        accountId: 'sav',
        category: 'Pago Crédito',
        linkedTransactionId: 'pay-card',
      });
      seedTx('pay-bank', bank);
      seedTx('pay-card', {
        ...bank,
        id: undefined,
        type: 'income',
        accountId: 'cc',
        linkedTransactionId: 'pay-bank',
      });

      await crud.current.deleteTransaction('pay-bank');
      const writesAfterPairDelete = mockState.writeLog.length;
      await expect(crud.current.restoreTransaction(bank)).rejects.toThrow(/vinculado/i);
      expect(mockState.store.has(txKey('pay-bank'))).toBe(false);
      expect(mockState.store.has(txKey('pay-card'))).toBe(false);
      expect(mockState.writeLog).toHaveLength(writesAfterPairDelete);
    });

    it('rejects debt-payment restoration that would make remainingAmount negative', async () => {
      seedAccount(savings);
      mockState.store.set(debtKey('debt-1'), {
        personName: 'Ana', type: 'lent', originalAmount: 1_000,
        remainingAmount: 100, isSettled: false, accountId: 'sav',
        createdAt: new Date('2026-01-01'),
      });
      const crud = renderCRUD([]);

      await expect(crud.current.restoreTransaction(deleted({
        type: 'income', amount: 200, category: LOAN_PAYMENT_CATEGORY,
        debtId: 'debt-1', accountId: 'sav',
      }))).rejects.toThrow(/saldo pendiente|restaurar/i);

      expect(mockState.writeLog).toHaveLength(0);
    });

    it('restores settlement and the credit delta in the same debt-payment batch', async () => {
      seedAccount(credit);
      mockState.store.set(debtKey('debt-1'), {
        personName: 'Banco', type: 'borrowed', originalAmount: 1_000,
        remainingAmount: 200, isSettled: false, accountId: 'cc',
        createdAt: new Date('2026-01-01'),
      });
      const crud = renderCRUD([]);
      const payment = deleted({
        type: 'expense', amount: 200, category: LOAN_PAYMENT_CATEGORY,
        debtId: 'debt-1', accountId: 'cc',
      });

      await crud.current.restoreTransaction(payment);

      expect(mockState.batchCommits).toBe(1);
      expect(mockState.store.get(debtKey('debt-1'))).toMatchObject({
        remainingAmount: 0,
        isSettled: true,
        settledAt: payment.date,
      });
      expect(mockState.store.get(acctKey('cc'))).toMatchObject({
        usedCredit: 1_000_200,
      });
    });

    it('recovers an exact restore after a lost commit acknowledgement', async () => {
      seedAccount(savings);
      mockState.failAfterBatchCommit = true;
      const crud = renderCRUD([]);

      await expect(crud.current.restoreTransaction(deleted())).resolves.toBeUndefined();

      expect(mockState.batchCommits).toBe(1);
      expect(mockState.store.has(txKey('original-row'))).toBe(true);
      expect(cacheMutations).toHaveLength(1);
    });
  });

  describe('caller-supplied edit authority', () => {
    it('preserves stable AI audit metadata and treats an already-applied retry as success', async () => {
      seedAccount(savings);
      seedTx('tx-ai-edit', { category: 'Otros' });
      const crud = renderCRUD([]);
      const operationId = 'ledger-mutation:ai:message-2:edit';
      const updates = { category: 'Mascotas', operationId, mutationSource: 'ai' as const };

      await crud.current.updateTransaction('tx-ai-edit', updates);
      await crud.current.updateTransaction('tx-ai-edit', updates);

      expect(mockState.batchCommits).toBe(1);
      expect(updatesOn(txKey('tx-ai-edit'))).toHaveLength(1);
      expect(updatesOn(txKey('tx-ai-edit'))[0].data).toMatchObject({
        category: 'Mascotas',
        operationId,
        mutationKind: 'edit',
        mutationSource: 'ai',
      });
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
    it('returns the authoritative server snapshot that was actually deleted', async () => {
      seedAccount(savings);
      seedTx('server-current', {
        type: 'expense', amount: 321, description: 'Servidor', accountId: 'sav',
      });
      const crud = renderCRUD([]);

      const deleted = await crud.current.deleteTransaction('server-current');

      expect(deleted).toMatchObject({
        id: 'server-current',
        amount: 321,
        description: 'Servidor',
      });
      expect(mockState.store.has(txKey('server-current'))).toBe(false);
    });

    it('rechaza borrar un ingreso si el saldo persistido quedaría negativo', async () => {
      seedAccount({ ...savings, initialBalance: 0 });
      seedTx('income-delete', makeTx({
        type: 'income', amount: 100, accountId: 'sav',
      }));
      seedTx('existing-expense', makeTx({
        type: 'expense', amount: 50, accountId: 'sav',
      }));
      const crud = renderCRUD([]);

      await expect(crud.current.deleteTransaction('income-delete'))
        .rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

      expect(mockState.writeLog).toHaveLength(0);
      expect(cacheMutations).toHaveLength(0);
    });

    it('rechaza borrar una transferencia entrante si sobregira el destino', async () => {
      seedAccount({ ...savings, initialBalance: 1_000 });
      mockState.store.set(acctKey('cash'), {
        id: 'cash', name: 'Efectivo', type: 'cash', isDefault: false, initialBalance: 0,
      });
      seedTx('incoming-transfer', makeTx({
        type: 'transfer', amount: 100, accountId: 'sav', toAccountId: 'cash',
      }));
      seedTx('cash-expense', makeTx({
        type: 'expense', amount: 50, accountId: 'cash',
      }));
      const crud = renderCRUD([]);

      await expect(crud.current.deleteTransaction('incoming-transfer'))
        .rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

      expect(mockState.writeLog).toHaveLength(0);
      expect(cacheMutations).toHaveLength(0);
    });

    it('rechaza un puntero enlazado no recíproco sin borrar la fila ajena', async () => {
      seedAccount(savings);
      seedAccount(credit);
      seedTx('pay-card', makeTx({
        type: 'income', amount: 100, accountId: 'cc', category: 'Pago Crédito',
        linkedTransactionId: 'unrelated',
      }));
      seedTx('unrelated', makeTx({
        type: 'expense', amount: 100, accountId: 'sav', category: 'Pago Crédito',
      }));
      const crud = renderCRUD([]);

      await expect(crud.current.deleteTransaction('pay-card'))
        .rejects.toThrow(/reconcili|enlace|par/i);

      expect(mockState.writeLog).toHaveLength(0);
      expect(mockState.store.has(txKey('unrelated'))).toBe(true);
    });

    it('rechaza un enlace cuya contraparte ya no existe', async () => {
      seedAccount(credit);
      seedTx('pay-card', makeTx({
        type: 'income', amount: 100, accountId: 'cc', category: 'Pago Crédito',
        linkedTransactionId: 'missing-bank-row',
      }));
      const crud = renderCRUD([]);

      await expect(crud.current.deleteTransaction('pay-card'))
        .rejects.toThrow(/reconcili|contraparte/i);

      expect(mockState.writeLog).toHaveLength(0);
      expect(mockState.store.has(txKey('pay-card'))).toBe(true);
    });

    it('rechaza un enlace recíproco con roles financieros incorrectos', async () => {
      seedAccount(savings);
      seedAccount(credit);
      seedTx('wrong-card-role', makeTx({
        type: 'expense', amount: 100, accountId: 'cc', category: 'Pago Crédito',
        linkedTransactionId: 'wrong-bank-role',
      }));
      seedTx('wrong-bank-role', makeTx({
        type: 'expense', amount: 100, accountId: 'sav', category: 'Pago Crédito',
        linkedTransactionId: 'wrong-card-role',
      }));
      const crud = renderCRUD([]);

      await expect(crud.current.deleteTransaction('wrong-card-role'))
        .rejects.toThrow(/reconcili|tarjeta|mitad/i);

      expect(mockState.writeLog).toHaveLength(0);
      expect(mockState.store.has(txKey('wrong-bank-role'))).toBe(true);
    });

    it('rechaza un enlace recíproco que no pertenece a una tarjeta', async () => {
      seedAccount(savings);
      mockState.store.set(acctKey('cash'), {
        id: 'cash', name: 'Efectivo', type: 'cash', isDefault: false, initialBalance: 1_000,
      });
      seedTx('wrong-account-income', makeTx({
        type: 'income', amount: 100, accountId: 'sav', category: 'Pago Crédito',
        linkedTransactionId: 'wrong-account-expense',
      }));
      seedTx('wrong-account-expense', makeTx({
        type: 'expense', amount: 100, accountId: 'cash', category: 'Pago Crédito',
        linkedTransactionId: 'wrong-account-income',
      }));
      const crud = renderCRUD([]);

      await expect(crud.current.deleteTransaction('wrong-account-income'))
        .rejects.toThrow(/reconcili|tarjeta|mitad/i);

      expect(mockState.writeLog).toHaveLength(0);
      expect(mockState.store.has(txKey('wrong-account-expense'))).toBe(true);
    });

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
      seedAccount(savings);
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

      expect(mockState.batchCommits).toBe(1);
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
    it('rechaza aumentar un gasto por encima del saldo persistido sin actualizar', async () => {
      seedAccount({ ...savings, initialBalance: 1_000 });
      seedTx('expense-up', makeTx({
        type: 'expense', amount: 500, accountId: 'sav',
      }));
      const crud = renderCRUD([]);

      await expect(crud.current.updateTransaction('expense-up', { amount: 1_000.01 }))
        .rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

      expect(mockState.writeLog).toHaveLength(0);
      expect(cacheMutations).toHaveLength(0);
    });

    it('rechaza editar un par con enlace no recíproco y conserva ambas filas', async () => {
      seedAccount(savings);
      seedAccount(credit);
      seedTx('pay-bank', makeTx({
        type: 'expense', amount: 100, accountId: 'sav', category: 'Pago Crédito',
        linkedTransactionId: 'pay-card',
      }));
      seedTx('pay-card', makeTx({
        type: 'income', amount: 100, accountId: 'cc', category: 'Pago Crédito',
        linkedTransactionId: 'someone-else',
      }));
      const crud = renderCRUD([]);

      await expect(crud.current.updateTransaction('pay-bank', { amount: 150 }))
        .rejects.toThrow(/reconcili|enlace|par/i);

      expect(mockState.writeLog).toHaveLength(0);
      expect(cacheMutations).toHaveLength(0);
    });

    it('rechaza reasignar un gasto a una cuenta origen sin fondos', async () => {
      seedAccount({ ...savings, initialBalance: 1_000 });
      mockState.store.set(acctKey('cash'), {
        id: 'cash', name: 'Efectivo', type: 'cash', isDefault: false, initialBalance: 0,
      });
      seedTx('expense-reassign', makeTx({
        type: 'expense', amount: 500, accountId: 'sav',
      }));
      const crud = renderCRUD([]);

      await expect(crud.current.updateTransaction('expense-reassign', { accountId: 'cash' }))
        .rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

      expect(mockState.writeLog).toHaveLength(0);
      expect(cacheMutations).toHaveLength(0);
    });

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
        amount: 150_000,
        date: newDate,
        operationId: 'ledger-mutation:test-operation',
        mutationKind: 'edit',
        mutationSource: 'manual',
      }));
      expect(updatesOn(txKey('pay-bank'))[0].data).not.toHaveProperty('category');
      expect(updatesOn(txKey('pay-card'))[0].data).toEqual(expect.objectContaining({
        amount: 150_000,
        date: newDate,
        operationId: 'ledger-mutation:test-operation',
        mutationKind: 'edit',
        mutationSource: 'manual',
      }));
      expect(updatesOn(acctKey('cc'))[0].data!.usedCredit).toEqual({ __increment: -50_000 });
    });
  });
});
