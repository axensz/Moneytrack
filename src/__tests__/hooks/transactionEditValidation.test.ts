/**
 * Edición de transacciones (#7/#8 re-auditoría 2026-06-12):
 *  - #7: un error al guardar NO descarta lo editado (el form sigue abierto).
 *  - #8: la edición valida saldo/cupo EXCLUYENDO la transacción original
 *    (antes no validaba nada: se podía sobregirar editando), usando el
 *    historial completo (balanceTransactions) y solo con saldos asentados.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Account, Transaction } from '../../types/finance';

const M = vi.hoisted(() => ({
  toastErrors: [] as string[],
}));

vi.mock('../../utils/toastHelpers', () => ({
  showToast: {
    error: (msg: string) => M.toastErrors.push(msg),
    success: vi.fn(),
  },
}));

import { useTransactionsView } from '../../components/views/transactions/hooks/useTransactionsView';

const savings: Account = { id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 100_000 };
const credit: Account = { id: 'tc', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0, creditLimit: 1_000_000, usedCredit: 800_000 };

const expenseSav: Transaction = { id: 'e1', type: 'expense', amount: 90_000, category: 'Compras', description: 'super', date: new Date('2026-06-01T12:00:00'), paid: true, accountId: 'sav' };
const expenseTc: Transaction = { id: 'c1', type: 'expense', amount: 500_000, category: 'Compras', description: 'tv', date: new Date('2026-06-01T12:00:00'), paid: false, accountId: 'tc' };
const expenseTc2: Transaction = { id: 'c2', type: 'expense', amount: 300_000, category: 'Compras', description: 'mercado', date: new Date('2026-06-02T12:00:00'), paid: false, accountId: 'tc' };

type Params = Parameters<typeof useTransactionsView>[0];

const makeParams = (overrides: Record<string, unknown> = {}): Params => {
  const transactions = (overrides.transactions as Transaction[]) ?? [expenseSav];
  return {
    transactions,
    accounts: [savings, credit],
    recurringPayments: [],
    filterCategory: 'all',
    filterAccount: 'all',
    dateRangePreset: 'all',
    setDateRangePreset: vi.fn(),
    customStartDate: '',
    setCustomStartDate: vi.fn(),
    customEndDate: '',
    setCustomEndDate: vi.fn(),
    deleteTransaction: vi.fn(async () => {}),
    updateTransaction: vi.fn(async () => {}),
    balanceTransactions: transactions,
    balancesReady: true,
    ...overrides,
  } as Params;
};

const editAndSave = async (
  params: Params,
  original: Transaction,
  newAmount: string
) => {
  const { result } = renderHook(() => useTransactionsView(params));
  act(() => result.current.startEditTransaction(original));
  act(() => result.current.setEditForm({ ...result.current.editForm, amount: newAmount }));
  await act(async () => {
    await result.current.handleSaveEdit(original.id!);
  });
  return result;
};

beforeEach(() => {
  M.toastErrors.length = 0;
});

describe('#7 — error al guardar no descarta la edición', () => {
  it('si updateTransaction falla, el form sigue abierto con lo editado', async () => {
    const params = makeParams({
      updateTransaction: vi.fn(async () => { throw new Error('red caída'); }),
    });
    const result = await editAndSave(params, expenseSav, '95000');

    expect(result.current.editingTransaction).toBe('e1');
    expect(result.current.editForm.amount).toBe('95000');
    expect(M.toastErrors.length).toBeGreaterThan(0);
  });
});

describe('#8 — la edición valida saldo/cupo excluyendo la original', () => {
  it('rechaza editar un gasto a un monto que sobregira la cuenta', async () => {
    const params = makeParams();
    await editAndSave(params, expenseSav, '150000');

    expect(params.updateTransaction).not.toHaveBeenCalled();
    expect(M.toastErrors.join(' ')).toMatch(/insuficiente/i);
  });

  it('acepta editar cerca del saldo (la original se excluye del cálculo)', async () => {
    // Saldo 100k - 90k = 10k; SIN excluir la original, 95k daría falso rechazo.
    const params = makeParams();
    const result = await editAndSave(params, expenseSav, '95000');

    expect(params.updateTransaction).toHaveBeenCalledTimes(1);
    expect(result.current.editingTransaction).toBeNull();
  });

  it('TC: acepta subir una compra si el cupo ajustado alcanza (sin doble conteo)', async () => {
    // usedCredit 800k INCLUYE la original de 500k → ajustado 300k; 300k+600k ≤ 1M.
    const txs = [expenseTc, expenseTc2];
    const params = makeParams({ transactions: txs, balanceTransactions: txs });
    await editAndSave(params, expenseTc, '600000');

    expect(params.updateTransaction).toHaveBeenCalledTimes(1);
  });

  it('TC: rechaza subir una compra por encima del cupo disponible ajustado', async () => {
    const txs = [expenseTc, expenseTc2];
    const params = makeParams({ transactions: txs, balanceTransactions: txs });
    await editAndSave(params, expenseTc, '800001');

    expect(params.updateTransaction).not.toHaveBeenCalled();
    expect(M.toastErrors.join(' ')).toMatch(/cupo|insuficiente/i);
  });

  it('con saldos sin asentar (balancesReady=false) no valida saldo: guarda', async () => {
    const params = makeParams({ balancesReady: false });
    await editAndSave(params, expenseSav, '150000');

    expect(params.updateTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('#2 — editar un PAGO de TC (income) también valida la deuda', () => {
  // usedCredit 800k INCLUYE el pago de 100k → deuda sin ese pago = 900k.
  const paymentTc: Transaction = { id: 'p1', type: 'income', amount: 100_000, category: 'Pago', description: 'pago tc', date: new Date('2026-06-03T12:00:00'), paid: true, accountId: 'tc' };

  it('rechaza editar un pago por encima de la deuda (no puedes pagar más de lo que debes)', async () => {
    const txs = [paymentTc];
    const params = makeParams({ transactions: txs, balanceTransactions: txs });
    await editAndSave(params, paymentTc, '5000000');

    expect(params.updateTransaction).not.toHaveBeenCalled();
    expect(M.toastErrors.join(' ')).toMatch(/pagar más|debes|deuda/i);
  });

  it('acepta editar un pago dentro de la deuda ajustada', async () => {
    const txs = [paymentTc];
    const params = makeParams({ transactions: txs, balanceTransactions: txs });
    await editAndSave(params, paymentTc, '200000');

    expect(params.updateTransaction).toHaveBeenCalledTimes(1);
  });
});
