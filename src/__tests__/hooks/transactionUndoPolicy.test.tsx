import type { ReactNode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, renderHook, act, fireEvent, waitFor } from '@testing-library/react';
import type { Account, Transaction } from '../../types/finance';
import { LOAN_CATEGORY, LOAN_PAYMENT_CATEGORY } from '../../config/constants';

const M = vi.hoisted(() => ({
  loading: vi.fn(() => 'delete-toast'),
  success: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: M,
}));

import { useTransactionsView } from '../../components/views/transactions/hooks/useTransactionsView';

const savings: Account = {
  id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0,
};
const credit: Account = {
  id: 'tc', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0,
};
const standalone: Transaction = {
  id: 'tx-1',
  type: 'expense',
  amount: 25_000,
  category: 'Mercado',
  description: 'Compra',
  date: new Date('2026-08-24T12:00:00.000Z'),
  createdAt: new Date('2026-08-24T12:01:00.000Z'),
  paid: true,
  accountId: 'sav',
};

type Params = Parameters<typeof useTransactionsView>[0];

const makeParams = (
  transaction: Transaction,
  overrides: Partial<Params> = {},
): Params => ({
  transactions: [transaction],
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
  deleteTransaction: vi.fn(async () => transaction),
  updateTransaction: vi.fn(async () => undefined),
  onRestore: vi.fn(async () => undefined),
  balanceTransactions: [transaction],
  balancesReady: true,
  ...overrides,
});

const renderDeleteToast = () => {
  const content = M.success.mock.calls[0]?.[0] as
    | ((toastState: { id: string }) => ReactNode)
    | undefined;
  if (typeof content !== 'function') throw new Error('No se publicó el toast de borrado');
  return render(content({ id: 'undo-toast' }));
};

beforeEach(() => {
  Object.values(M).forEach(mock => mock.mockClear());
});

describe('useTransactionsView — política de Deshacer', () => {
  it('entrega el snapshot completo y ejecuta una sola restauración', async () => {
    const onRestore = vi.fn(async () => undefined);
    const params = makeParams(standalone, { onRestore });
    const { result } = renderHook(() => useTransactionsView(params));

    await act(async () => {
      await result.current.handleDeleteTransaction(standalone);
    });
    const toast = renderDeleteToast();

    await act(async () => {
      fireEvent.click(toast.getByRole('button', { name: /deshacer/i }));
      fireEvent.click(toast.getByRole('button', { name: /deshacer/i }));
    });

    await waitFor(() => expect(onRestore).toHaveBeenCalledOnce());
    expect(onRestore).toHaveBeenCalledWith(standalone);
  });

  it('restaura el snapshot autoritativo que devolvió el borrado, no la fila UI obsoleta', async () => {
    const serverSnapshot: Transaction = {
      ...standalone,
      amount: 31_000,
      description: 'Versión confirmada en servidor',
    };
    const onRestore = vi.fn(async () => undefined);
    const deleteTransaction = vi.fn(async () => serverSnapshot) as unknown as Params['deleteTransaction'];
    const params = makeParams(standalone, { deleteTransaction, onRestore });
    const { result } = renderHook(() => useTransactionsView(params));

    await act(async () => {
      await result.current.handleDeleteTransaction(standalone);
    });
    const toast = renderDeleteToast();
    await act(async () => {
      fireEvent.click(toast.getByRole('button', { name: /deshacer/i }));
    });

    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(serverSnapshot));
    expect(onRestore).not.toHaveBeenCalledWith(standalone);
  });

  it.each([
    ['tarjeta', { ...standalone, id: 'card', accountId: 'tc' }],
    ['pago vinculado', { ...standalone, id: 'linked', linkedTransactionId: 'other' }],
    ['préstamo', {
      ...standalone,
      id: 'principal',
      category: LOAN_CATEGORY,
      debtId: 'debt-1',
    }],
  ])('oculta Deshacer para %s y explica por qué', async (_label, transaction) => {
    const params = makeParams(transaction as Transaction);
    const { result } = renderHook(() => useTransactionsView(params));

    await act(async () => {
      await result.current.handleDeleteTransaction(transaction as Transaction);
    });
    const toast = renderDeleteToast();

    expect(toast.queryByRole('button', { name: /deshacer/i })).not.toBeInTheDocument();
    expect(toast.getByText(/no se puede deshacer/i)).toBeInTheDocument();
  });

  it('ofrece Deshacer para un pago de deuda completo', async () => {
    const payment: Transaction = {
      ...standalone,
      id: 'payment',
      type: 'income',
      category: LOAN_PAYMENT_CATEGORY,
      debtId: 'debt-1',
    };
    const params = makeParams(payment);
    const { result } = renderHook(() => useTransactionsView(params));

    await act(async () => {
      await result.current.handleDeleteTransaction(payment);
    });

    expect(renderDeleteToast().getByRole('button', { name: /deshacer/i })).toBeInTheDocument();
  });
});
