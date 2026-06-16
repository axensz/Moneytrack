/**
 * useAddTransaction — gate de balancesReady (#3).
 *
 * El alta validaba el saldo contra `balanceTransactions`, pero NO estaba gateada
 * por balancesReady (a diferencia de la edición y el ajuste de cuenta). Mientras
 * el historial completo asienta, el array es la ventana paginada incompleta →
 * se rechazaban gastos LEGÍTIMOS con un falso "Saldo insuficiente". Ahora, con
 * balancesReady=false, se omite la validación de saldo/cupo.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Account, NewTransaction, Transaction } from '../../types/finance';

const M = vi.hoisted(() => ({ toastErrors: [] as string[], toastSuccess: [] as string[] }));

vi.mock('../../utils/toastHelpers', () => ({
  showToast: {
    error: (m: string) => M.toastErrors.push(m),
    success: (m: string) => M.toastSuccess.push(m),
  },
}));
vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { useAddTransaction } from '../../hooks/useAddTransaction';

type Params = Parameters<typeof useAddTransaction>[0];

const savings: Account = { id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 };

const makeParams = (overrides: Record<string, unknown> = {}): Params =>
  ({
    accounts: [savings],
    transactions: [] as Transaction[], // saldo 0 → un gasto de 150k se rechaza al validar
    recurringPayments: [],
    defaultAccount: savings,
    addTransaction: vi.fn(async () => {}),
    addCreditPaymentAtomic: vi.fn(async () => {}),
    updateRecurringPayment: vi.fn(async () => {}),
    setNewTransaction: vi.fn(),
    setShowForm: vi.fn(),
    setShowWelcomeModal: vi.fn(),
    ...overrides,
  }) as Params;

const expense150k: NewTransaction = {
  type: 'expense', amount: '150000', category: 'Compras', description: 'x',
  date: '2026-06-15', paid: true, accountId: 'sav', toAccountId: '',
  hasInterest: false, installments: 0,
};

beforeEach(() => {
  M.toastErrors.length = 0;
  M.toastSuccess.length = 0;
});

describe('useAddTransaction — gate de balancesReady (#3)', () => {
  it('con saldos asentados (ready=true) valida y RECHAZA un gasto que sobregira', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAddTransaction(params));
    await act(async () => { await result.current.handleAddTransaction(expense150k); });

    expect(params.addTransaction).not.toHaveBeenCalled();
    expect(M.toastErrors.join(' ')).toMatch(/insuficiente/i);
  });

  it('con saldos sin asentar (ready=false) NO valida saldo: guarda sin falso rechazo', async () => {
    const params = makeParams({ balancesReady: false });
    const { result } = renderHook(() => useAddTransaction(params));
    await act(async () => { await result.current.handleAddTransaction(expense150k); });

    expect(params.addTransaction).toHaveBeenCalledTimes(1);
    expect(M.toastErrors).toHaveLength(0);
  });

  it('doble submit concurrente crea UNA sola transacción (#tx-3)', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAddTransaction(params));
    // income → sin chequeo de saldo, así pasa validación y aísla el guard de doble submit.
    const income: NewTransaction = {
      type: 'income', amount: '50000', category: 'Sueldo', description: 'x',
      date: '2026-06-15', paid: true, accountId: 'sav', toAccountId: '',
      hasInterest: false, installments: 0,
    };
    await act(async () => {
      const p1 = result.current.handleAddTransaction(income);
      const p2 = result.current.handleAddTransaction(income); // segundo clic, mismo tick
      await Promise.all([p1, p2]);
    });

    expect(params.addTransaction).toHaveBeenCalledTimes(1);
  });
});
