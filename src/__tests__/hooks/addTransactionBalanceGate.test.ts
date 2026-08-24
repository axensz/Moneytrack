/**
 * useAddTransaction — gate de balancesReady (#3).
 *
 * El alta validaba el saldo contra `balanceTransactions`, pero NO estaba gateada
 * por balancesReady. Mientras el historial completo asienta, el array puede
 * ser una ventana paginada incompleta: las mutaciones que reducen saldo deben
 * bloquearse antes del writer y conservar el formulario.
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
const credit: Account = {
  id: 'tc',
  name: 'Visa',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  creditLimit: 1_000_000,
  usedCredit: 0,
};

const makeParams = (overrides: Record<string, unknown> = {}): Params =>
  ({
    accounts: [savings],
    transactions: [] as Transaction[], // saldo 0 → un gasto de 150k se rechaza al validar
    recurringPayments: [],
    defaultAccount: savings,
    addTransaction: vi.fn(async () => {}),
    addCreditPaymentAtomic: vi.fn(async () => {}),
    addRecurringTransactionAtomic: vi.fn(async () => {}),
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

describe('useAddTransaction - gastos USD en TC', () => {
  const usdExpense: NewTransaction = {
    type: 'expense',
    amount: '100',
    category: 'Compras',
    description: 'Compra exterior',
    date: '2026-06-15',
    paid: true,
    accountId: 'tc',
    toAccountId: '',
    hasInterest: false,
    installments: 1,
    currency: 'USD',
    exchangeRate: '4000',
  };

  it('convierte USD a COP y guarda metadatos originales', async () => {
    const params = makeParams({ accounts: [credit], defaultAccount: credit });
    const { result } = renderHook(() => useAddTransaction(params));
    await act(async () => { await result.current.handleAddTransaction(usdExpense); });

    expect(params.addTransaction).toHaveBeenCalledTimes(1);
    expect(params.addTransaction).toHaveBeenCalledWith(expect.objectContaining({
      amount: 400_000,
      currency: 'COP',
      originalAmount: 100,
      originalCurrency: 'USD',
      exchangeRate: 4000,
    }));
  });

  it('rechaza USD sin TRM valida', async () => {
    const params = makeParams({ accounts: [credit], defaultAccount: credit });
    const { result } = renderHook(() => useAddTransaction(params));
    await act(async () => {
      await result.current.handleAddTransaction({ ...usdExpense, exchangeRate: '' });
    });

    expect(params.addTransaction).not.toHaveBeenCalled();
    expect(M.toastErrors.join(' ')).toMatch(/TRM/i);
  });
});

describe('useAddTransaction - beneficiario', () => {
  it('guarda la persona seleccionada en la transacción', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAddTransaction(params));
    await act(async () => {
      await result.current.handleAddTransaction({
        type: 'income',
        amount: '50000',
        category: 'Sueldo',
        description: 'pago',
        date: '2026-06-15',
        paid: true,
        accountId: 'sav',
        toAccountId: '',
        hasInterest: false,
        installments: 1,
        beneficiary: 'Madre',
      });
    });

    expect(params.addTransaction).toHaveBeenCalledWith(expect.objectContaining({
      beneficiary: 'Madre',
    }));
  });
});

describe('useAddTransaction — gate de balancesReady (#3)', () => {
  it('con saldos asentados (ready=true) valida y RECHAZA un gasto que sobregira', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAddTransaction(params));
    await act(async () => { await result.current.handleAddTransaction(expense150k); });

    expect(params.addTransaction).not.toHaveBeenCalled();
    expect(M.toastErrors.join(' ')).toMatch(/insuficiente/i);
  });

  it('con saldos sin asentar bloquea el gasto antes del writer y conserva el formulario', async () => {
    const params = makeParams({ balancesReady: false });
    const { result } = renderHook(() => useAddTransaction(params));
    await act(async () => { await result.current.handleAddTransaction(expense150k); });

    expect(params.addTransaction).not.toHaveBeenCalled();
    expect(params.addCreditPaymentAtomic).not.toHaveBeenCalled();
    expect(params.setNewTransaction).not.toHaveBeenCalled();
    expect(params.setShowForm).not.toHaveBeenCalled();
    expect(M.toastErrors.join(' ')).toMatch(/conciliando.*historial/i);
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

describe('useAddTransaction — pago periódico autenticable', () => {
  it('routes a paid recurring expense through the aggregate writer without a prior template write', async () => {
    const recurringPayment = {
      id: 'rent', name: 'Arriendo', amount: 100_000, category: 'Vivienda',
      dueDay: 5, frequency: 'monthly' as const, isActive: true,
    };
    const account = { ...savings, initialBalance: 500_000 };
    const legacyTemplateWrite = vi.fn(async () => undefined);
    const params = makeParams({
      accounts: [account],
      defaultAccount: account,
      recurringPayments: [recurringPayment],
      updateRecurringPayment: legacyTemplateWrite,
    });
    const { result } = renderHook(() => useAddTransaction(params));

    await act(async () => {
      await result.current.handleAddTransaction({
        ...expense150k,
        amount: '120000',
        category: 'Vivienda',
        recurringPaymentId: 'rent',
      });
    });

    expect(params.addRecurringTransactionAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 120_000,
        recurringPaymentId: 'rent',
        recurringCycle: expect.any(String),
      })
    );
    expect(params.addTransaction).not.toHaveBeenCalled();
    expect(legacyTemplateWrite).not.toHaveBeenCalled();
  });
});

describe('useAddTransaction — pagos y deuda contractual de TC', () => {
  it('rechaza pagar la TC desde una cuenta sin saldo suficiente', async () => {
    const bank = { ...savings, initialBalance: 50_000 };
    const card = { ...credit, usedCredit: 200_000 };
    const params = makeParams({ accounts: [bank, card], defaultAccount: bank });
    const { result } = renderHook(() => useAddTransaction(params));

    await act(async () => {
      await result.current.handleAddTransaction({
        type: 'income', amount: '100000', category: '', description: 'Pago',
        date: '2026-06-15', paid: true, accountId: 'tc', toAccountId: 'sav',
        hasInterest: false, installments: 0,
      });
    });

    expect(params.addCreditPaymentAtomic).not.toHaveBeenCalled();
    expect(M.toastErrors.join(' ')).toMatch(/saldo insuficiente/i);
  });

  it('incluye los intereses financiados al validar cupo y al guardar la compra', async () => {
    const card = { ...credit, creditLimit: 124_000, interestRate: 24 };
    const params = makeParams({ accounts: [card], defaultAccount: card });
    const { result } = renderHook(() => useAddTransaction(params));

    await act(async () => {
      await result.current.handleAddTransaction({
        type: 'expense', amount: '120000', category: 'Compras', description: 'Cuotas',
        date: '2026-06-15', paid: true, accountId: 'tc', toAccountId: '',
        hasInterest: true, installments: 2,
      });
    });

    expect(params.addTransaction).toHaveBeenCalledWith(expect.objectContaining({
      amount: 120_000,
      monthlyInstallmentAmount: 61_632.75,
      totalInterestAmount: 3_265.49,
    }));
  });

  it('rechaza la compra si principal más intereses supera el cupo', async () => {
    const card = { ...credit, creditLimit: 123_000, interestRate: 24 };
    const params = makeParams({ accounts: [card], defaultAccount: card });
    const { result } = renderHook(() => useAddTransaction(params));

    await act(async () => {
      await result.current.handleAddTransaction({
        type: 'expense', amount: '120000', category: 'Compras', description: 'Cuotas',
        date: '2026-06-15', paid: true, accountId: 'tc', toAccountId: '',
        hasInterest: true, installments: 2,
      });
    });

    expect(params.addTransaction).not.toHaveBeenCalled();
    expect(M.toastErrors.join(' ')).toMatch(/cupo insuficiente/i);
  });
});
