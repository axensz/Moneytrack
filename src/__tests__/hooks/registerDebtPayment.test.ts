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
import { LOAN_PAYMENT_CATEGORY } from '../../config/constants';
import type { Debt, Transaction } from '../../types/finance';

type AddTransactionFn = (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;

const seedDebts = (debts: Partial<Debt>[]) =>
  localStorage.setItem('debts', JSON.stringify(debts));

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

const renderDebts = (addTransaction?: ReturnType<typeof vi.fn>) =>
  renderHook(() =>
    useDebts(null, [], undefined, addTransaction ? { addTransaction: addTransaction as unknown as AddTransactionFn } : {})
  ).result;

beforeEach(() => {
  localStorage.clear();
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
    expect(addTransaction).toHaveBeenCalledTimes(1);
    expect(addTransaction.mock.calls[0][0]).toMatchObject({
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
    expect(addTransaction.mock.calls[0][0].amount).toBe(500);
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
    expect(addTransaction.mock.calls[0][0]).toMatchObject({ type: 'expense', amount: 400 });
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
});
