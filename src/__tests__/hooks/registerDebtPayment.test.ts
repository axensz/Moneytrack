/**
 * A1 — Ejecuta el CÓDIGO REAL de registerDebtPayment (useDebts), no una copia.
 *
 * Antes este archivo re-implementaba `computeDebtPayment` standalone dentro del
 * propio test → la función de producción nunca corría y podía romperse en verde.
 * Ahora rendereamos el hook real en modo invitado (userId=null: todas las
 * mutaciones pasan por setLocalDebts, sin Firestore) y observamos result.current
 * tras cada operación. Además espiamos addTransaction para verificar que el dinero
 * que se mueve (tipo/monto/categoría/cuenta) es el correcto. Audit A1.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebts } from '../../hooks/useDebts';
import { LOAN_CATEGORY, LOAN_PAYMENT_CATEGORY } from '../../config/constants';
import type { Account, Debt, Transaction } from '../../types/finance';
import {
  GUEST_LEDGER_STORAGE_KEY,
  createGuestLedgerEnvelope,
  readGuestLedgerEnvelope,
} from '../../utils/guestLedger';

type AddTransactionFn = (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
type RestoreTransactionFn = (tx: Transaction) => Promise<void>;

const makeDebt = (o: Partial<Debt> = {}): Partial<Debt> => ({
  id: 'd1',
  personName: 'Juan',
  type: 'lent',
  originalAmount: 1000,
  remainingAmount: 1000,
  isSettled: false,
  accountId: 'acc-1',
  createdAt: new Date('2026-01-01').toISOString() as unknown as Date,
  ...o,
});

const DEFAULT_ACCOUNTS: Account[] = [{
  id: 'acc-1',
  name: 'Ahorros',
  type: 'savings',
  isDefault: true,
  initialBalance: 1_000_000,
}];

const seedDebts = (
  debts: Partial<Debt>[],
  accounts: Account[] = DEFAULT_ACCOUNTS,
  transactions: Transaction[] = [],
) => {
  const envelope = createGuestLedgerEnvelope({
    accounts,
    transactions,
    debts: debts as Debt[],
    recurringPayments: [],
  }, { revision: 1, commitId: 'test-seed', committedAt: '2026-08-24T12:00:00.000Z' });
  localStorage.setItem(GUEST_LEDGER_STORAGE_KEY, JSON.stringify(envelope));
};

const persistedTransactions = () => readGuestLedgerEnvelope().data.transactions;

const renderDebts = (addTransaction?: ReturnType<typeof vi.fn>) => {
  if (!localStorage.getItem(GUEST_LEDGER_STORAGE_KEY)) seedDebts([]);
  return renderHook(() =>
    useDebts(null, [], undefined, addTransaction ? {
      addTransaction: addTransaction as unknown as AddTransactionFn,
      accounts: DEFAULT_ACCOUNTS,
    } : {})
  ).result;
};

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const failNextGuestPersist = () => vi
  .spyOn(Storage.prototype, 'setItem')
  .mockImplementationOnce(() => {
    throw new Error('storage rejected');
  });

describe('registerDebtPayment (código real de useDebts) — A1', () => {
  it('pago parcial de un préstamo (lent): reduce el saldo y postea un INGRESO por el monto', async () => {
    seedDebts([makeDebt({ type: 'lent', remainingAmount: 1000, accountId: 'acc-1' })]);
    const addTransaction = vi.fn().mockResolvedValue(undefined);
    const result = renderDebts(addTransaction);

    await act(async () => {
      await result.current.registerDebtPayment('d1', 300);
    });

    expect(result.current.debts[0].remainingAmount).toBe(700);
    expect(result.current.debts[0].isSettled).toBe(false);
    expect(persistedTransactions()).toHaveLength(1);
    expect(persistedTransactions()[0]).toMatchObject({
      type: 'income', // cobrar un préstamo prestado = ingreso
      amount: 300,
      category: LOAN_PAYMENT_CATEGORY,
      accountId: 'acc-1',
      debtId: 'd1',
    });
  });

  it('sobrepago: el monto efectivo se CLAMPEA al saldo y la deuda queda saldada', async () => {
    seedDebts([makeDebt({ remainingAmount: 500 })]);
    const addTransaction = vi.fn().mockResolvedValue(undefined);
    const result = renderDebts(addTransaction);

    await act(async () => {
      await result.current.registerDebtPayment('d1', 800);
    });

    expect(result.current.debts[0].remainingAmount).toBe(0);
    expect(result.current.debts[0].isSettled).toBe(true);
    // Solo se mueve lo que la deuda respalda (500), no los 800 crudos.
    expect(persistedTransactions()[0].amount).toBe(500);
  });

  it('pagar el saldo exacto salda la deuda', async () => {
    seedDebts([makeDebt({ remainingAmount: 1000 })]);
    const addTransaction = vi.fn().mockResolvedValue(undefined);
    const result = renderDebts(addTransaction);

    await act(async () => {
      await result.current.registerDebtPayment('d1', 1000);
    });

    expect(result.current.debts[0].remainingAmount).toBe(0);
    expect(result.current.debts[0].isSettled).toBe(true);
  });

  it('préstamo recibido (borrowed): el pago postea un GASTO', async () => {
    seedDebts([makeDebt({ type: 'borrowed', remainingAmount: 1000, accountId: 'acc-1' })]);
    const addTransaction = vi.fn().mockResolvedValue(undefined);
    const result = renderDebts(addTransaction);

    await act(async () => {
      await result.current.registerDebtPayment('d1', 400);
    });

    expect(result.current.debts[0].remainingAmount).toBe(600);
    expect(persistedTransactions()[0]).toMatchObject({ type: 'expense', amount: 400 });
  });

  it('sin cuenta asociada: reduce el saldo pero NO mueve dinero', async () => {
    seedDebts([makeDebt({ accountId: undefined, remainingAmount: 1000 })]);
    const addTransaction = vi.fn().mockResolvedValue(undefined);
    const result = renderDebts(addTransaction);

    await act(async () => {
      await result.current.registerDebtPayment('d1', 300);
    });

    expect(result.current.debts[0].remainingAmount).toBe(700);
    expect(addTransaction).not.toHaveBeenCalled();
  });

  it('deuda ya saldada: el monto efectivo es 0 y no se mueve dinero', async () => {
    seedDebts([makeDebt({ remainingAmount: 0, isSettled: true })]);
    const addTransaction = vi.fn().mockResolvedValue(undefined);
    const result = renderDebts(addTransaction);

    await act(async () => {
      await result.current.registerDebtPayment('d1', 200);
    });

    expect(result.current.debts[0].remainingAmount).toBe(0);
    expect(addTransaction).not.toHaveBeenCalled();
  });

  it('debtId inexistente: no-op (no lanza, no mueve dinero)', async () => {
    seedDebts([makeDebt()]);
    const addTransaction = vi.fn().mockResolvedValue(undefined);
    const result = renderDebts(addTransaction);

    await act(async () => {
      await result.current.registerDebtPayment('no-existe', 300);
    });

    expect(result.current.debts[0].remainingAmount).toBe(1000);
    expect(addTransaction).not.toHaveBeenCalled();
  });

  it('conserva la deuda intacta si falla la transacción local del pago', async () => {
    seedDebts([makeDebt({ remainingAmount: 1000 })]);
    const addTransaction = vi.fn();
    const result = renderDebts(addTransaction);
    failNextGuestPersist();

    await expect(act(async () => {
      await result.current.registerDebtPayment('d1', 300);
    })).rejects.toThrow('storage rejected');

    expect(result.current.debts[0]).toMatchObject({
      remainingAmount: 1000,
      isSettled: false,
    });
    expect(readGuestLedgerEnvelope().data.transactions).toEqual([]);
  });

  it('no conserva una deuda local parcial si falla su movimiento original', async () => {
    const addTransaction = vi.fn();
    const result = renderDebts(addTransaction);
    failNextGuestPersist();

    await expect(act(async () => {
      await result.current.addDebt({
        personName: 'Laura',
        type: 'lent',
        originalAmount: 500,
        remainingAmount: 500,
        isSettled: false,
        accountId: 'acc-1',
      });
    })).rejects.toThrow('storage rejected');

    expect(result.current.debts).toEqual([]);
    expect(readGuestLedgerEnvelope().data.debts).toEqual([]);
  });

  it('reasigna localmente solo el principal y conserva pagos históricos', async () => {
    const accounts: Account[] = [
      { id: 'acc-1', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 },
      { id: 'acc-2', name: 'Efectivo', type: 'cash', isDefault: false, initialBalance: 0 },
    ];
    const principal: Transaction = {
      id: 'principal', type: 'expense', amount: 1000, category: LOAN_CATEGORY,
      description: 'Préstamo a Juan', date: new Date(), paid: true, accountId: 'acc-1', debtId: 'd1',
    };
    const historicalPayment: Transaction = {
      id: 'payment', type: 'income', amount: 300, category: LOAN_PAYMENT_CATEGORY,
      description: 'Cobro de Juan', date: new Date(), paid: true, accountId: 'acc-1', debtId: 'd1',
    };
    seedDebts([makeDebt({ accountId: 'acc-1' })], accounts, [principal, historicalPayment]);
    const updateTransaction = vi.fn().mockResolvedValue(undefined);
    const result = renderHook(() => useDebts(null, [principal, historicalPayment], undefined, {
      accounts,
      updateTransaction,
    })).result;

    await act(async () => {
      await result.current.reassignDebtAccount('d1', 'acc-2');
    });

    expect(result.current.debts[0].accountId).toBe('acc-2');
    expect(readGuestLedgerEnvelope().data.transactions.find(item => item.id === 'principal'))
      .toMatchObject({ accountId: 'acc-2' });
    expect(readGuestLedgerEnvelope().data.transactions.find(item => item.id === 'payment'))
      .toMatchObject({ accountId: 'acc-1' });
  });

  it('conserva la cuenta local anterior si falla la mutación del principal', async () => {
    const accounts: Account[] = [
      { id: 'acc-1', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 },
      { id: 'acc-2', name: 'Efectivo', type: 'cash', isDefault: false, initialBalance: 0 },
    ];
    const principal: Transaction = {
      id: 'principal', type: 'expense', amount: 1000, category: LOAN_CATEGORY,
      description: 'Préstamo a Juan', date: new Date(), paid: true, accountId: 'acc-1', debtId: 'd1',
    };
    seedDebts([makeDebt({ accountId: 'acc-1' })], accounts, [principal]);
    const updateTransaction = vi.fn();
    const result = renderHook(() => useDebts(null, [principal], undefined, {
      accounts,
      updateTransaction,
    })).result;
    failNextGuestPersist();

    await expect(act(async () => {
      await result.current.reassignDebtAccount('d1', 'acc-2');
    })).rejects.toThrow('storage rejected');

    expect(result.current.debts[0].accountId).toBe('acc-1');
    expect(readGuestLedgerEnvelope().data.debts[0].accountId).toBe('acc-1');
  });

  it('permite cambiar solo pagos futuros en una deuda local heredada sin principal', async () => {
    const accounts: Account[] = [
      { id: 'acc-1', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 },
      { id: 'acc-2', name: 'Efectivo', type: 'cash', isDefault: false, initialBalance: 0 },
    ];
    seedDebts([makeDebt({ accountId: 'acc-1' })], accounts);
    const updateTransaction = vi.fn();
    const result = renderHook(() => useDebts(null, [], undefined, {
      accounts,
      updateTransaction,
    })).result;

    await act(async () => {
      await result.current.reassignDebtAccount('d1', 'acc-2');
    });

    expect(result.current.debts[0].accountId).toBe('acc-2');
    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it('retira la operación local al elegir Sin cuenta y conserva la deuda si el borrado falla', async () => {
    const accounts: Account[] = [
      { id: 'acc-1', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 },
    ];
    const principal: Transaction = {
      id: 'principal', type: 'expense', amount: 1000, category: LOAN_CATEGORY,
      description: 'Préstamo a Juan', date: new Date(), paid: true, accountId: 'acc-1', debtId: 'd1',
    };
    seedDebts([makeDebt({ accountId: 'acc-1' })], accounts, [principal]);
    const deleteTransaction = vi.fn();
    const result = renderHook(() => useDebts(null, [principal], undefined, {
      accounts,
      deleteTransaction,
    })).result;
    failNextGuestPersist();

    await expect(act(async () => {
      await result.current.reassignDebtAccount('d1', undefined);
    })).rejects.toThrow('storage rejected');
    expect(result.current.debts[0].accountId).toBe('acc-1');

    await act(async () => {
      await result.current.reassignDebtAccount('d1', undefined);
    });
    expect(result.current.debts[0].accountId).toBeUndefined();
    expect(readGuestLedgerEnvelope().data.transactions).toEqual([]);
  });
});

describe('restoreDebtPayment — modo invitado', () => {
  const deletedPayment: Transaction = {
    id: 'payment-1',
    type: 'income',
    amount: 300,
    category: LOAN_PAYMENT_CATEGORY,
    description: 'Cobro de Juan',
    date: new Date('2026-08-24T12:00:00.000Z'),
    createdAt: new Date('2026-08-24T12:01:00.000Z'),
    paid: true,
    accountId: 'acc-1',
    debtId: 'd1',
  };

  const renderRestore = (restoreTransaction: ReturnType<typeof vi.fn>) =>
    renderHook(() => useDebts(null, [], undefined, {
      restoreTransaction: restoreTransaction as unknown as RestoreTransactionFn,
      accounts: DEFAULT_ACCOUNTS,
    })).result;

  it('restaura la fila y vuelve a aplicar el pago al saldo pendiente', async () => {
    seedDebts([makeDebt({ remainingAmount: 1000, isSettled: false })]);
    const restoreTransaction = vi.fn().mockResolvedValue(undefined);
    const result = renderRestore(restoreTransaction);

    await act(async () => {
      await result.current.restoreDebtPayment(deletedPayment);
      await result.current.restoreDebtPayment(deletedPayment);
    });

    expect(persistedTransactions().filter(item => item.id === deletedPayment.id)).toHaveLength(1);
    expect(result.current.debts[0]).toMatchObject({
      remainingAmount: 700,
      isSettled: false,
    });
  });

  it('no cambia la deuda si falla la restauración y rechaza sobre-restaurar', async () => {
    seedDebts([makeDebt({ remainingAmount: 1000, isSettled: false })]);
    const failedRestore = vi.fn().mockRejectedValue(new Error('storage rejected'));
    const failed = renderRestore(failedRestore);
    failNextGuestPersist();

    await expect(act(async () => {
      await failed.current.restoreDebtPayment(deletedPayment);
    })).rejects.toThrow('storage rejected');
    expect(failed.current.debts[0].remainingAmount).toBe(1000);

    localStorage.clear();
    seedDebts([makeDebt({ remainingAmount: 200, isSettled: false })]);
    const overRestore = vi.fn().mockResolvedValue(undefined);
    const over = renderRestore(overRestore);
    await expect(over.current.restoreDebtPayment(deletedPayment)).rejects.toThrow(/saldo pendiente/i);
    expect(overRestore).not.toHaveBeenCalled();
    expect(over.current.debts[0].remainingAmount).toBe(200);
  });

  it('trata como éxito un retry tras remount cuando la fila restaurada ya existe', async () => {
    const alreadyRestored: Transaction = {
      ...deletedPayment,
      mutationKind: 'restore',
      mutationSource: 'undo',
    };
    seedDebts(
      [makeDebt({ remainingAmount: 700, isSettled: false })],
      DEFAULT_ACCOUNTS,
      [alreadyRestored],
    );
    const restoreTransaction = vi.fn().mockResolvedValue(undefined);
    const result = renderHook(() => useDebts(null, [alreadyRestored], undefined, {
      restoreTransaction: restoreTransaction as unknown as RestoreTransactionFn,
      accounts: DEFAULT_ACCOUNTS,
    })).result;

    await act(async () => {
      await result.current.restoreDebtPayment(deletedPayment);
    });

    expect(restoreTransaction).not.toHaveBeenCalled();
    expect(result.current.debts[0].remainingAmount).toBe(700);
  });
});
