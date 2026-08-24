/**
 * useTransactions.addCreditPaymentAtomic en modo INVITADO (#tx-1).
 *
 * Antes, esta función siempre apuntaba a la versión Firestore, que hace no-op
 * para invitados (if(!userId)return): el invitado "pagaba" la TC, salía el toast
 * de éxito, pero NO se escribía nada y la deuda no bajaba (pérdida silenciosa).
 * Ahora crea ambas transacciones del par atómico en localStorage.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Account, Transaction } from '../../types/finance';

const M = vi.hoisted(() => ({
  restoreTransaction: vi.fn(),
}));

vi.mock('../../contexts/FirestoreContext', () => ({
  useFirestoreData: () => ({
    transactions: [], loading: false,
    addTransaction: vi.fn(), addCreditPaymentAtomic: vi.fn(),
    addRecurringTransactionAtomic: vi.fn(), linkRecurringTransactionAtomic: vi.fn(),
    restoreTransaction: M.restoreTransaction,
    deleteTransaction: vi.fn(), updateTransaction: vi.fn(),
  }),
}));

import { useTransactions } from '../../hooks/useTransactions';
import {
  GUEST_LEDGER_STORAGE_KEY,
  readGuestLedgerEnvelope,
} from '../../utils/guestLedger';

const base = { category: 'Pago', description: '', date: new Date('2026-06-15'), paid: true } as const;
const creditTx = { ...base, type: 'income' as const, amount: 50_000, accountId: 'tc' };
const sourceTx = { ...base, type: 'expense' as const, amount: 50_000, accountId: 'sav' };
const paymentAccounts: Account[] = [
  { id: 'tc', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0, usedCredit: 50_000 },
  { id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 100_000 },
];

beforeEach(() => {
  localStorage.clear();
  M.restoreTransaction.mockReset().mockResolvedValue(undefined);
});

describe('useTransactions.addCreditPaymentAtomic — modo invitado (#tx-1)', () => {
  it('crea AMBAS transacciones del par (ingreso a TC + gasto en origen) en localStorage', async () => {
    localStorage.setItem('accounts', JSON.stringify(paymentAccounts));
    const { result } = renderHook(() => useTransactions(null));

    await act(async () => {
      await result.current.addCreditPaymentAtomic(creditTx, sourceTx);
    });

    const txs = readGuestLedgerEnvelope().data.transactions;
    expect(txs).toHaveLength(2);
    expect(txs.some(t => t.accountId === 'tc' && t.type === 'income' && t.amount === 50_000)).toBe(true);
    expect(txs.some(t => t.accountId === 'sav' && t.type === 'expense' && t.amount === 50_000)).toBe(true);
    // Ambas con id + createdAt asignados.
    expect(txs.every(t => t.id && t.createdAt)).toBe(true);
    expect(txs[0].linkedTransactionId).toBe(txs[1].id);
    expect(txs[1].linkedTransactionId).toBe(txs[0].id);
  });

  it('editar o borrar una mitad mantiene el par consistente', async () => {
    localStorage.setItem('accounts', JSON.stringify(paymentAccounts));
    const { result } = renderHook(() => useTransactions(null));
    await act(async () => { await result.current.addCreditPaymentAtomic(creditTx, sourceTx); });
    const card = result.current.transactions.find(transaction => transaction.accountId === 'tc')!;
    const bank = result.current.transactions.find(transaction => transaction.accountId === 'sav')!;

    await act(async () => {
      await result.current.updateTransaction(bank.id!, { amount: 75_000, category: 'Comida' });
    });
    expect(result.current.transactions.find(transaction => transaction.id === bank.id)?.amount).toBe(75_000);
    expect(result.current.transactions.find(transaction => transaction.id === card.id)?.amount).toBe(75_000);
    expect(result.current.transactions.find(transaction => transaction.id === bank.id)?.category).toBe('Pago');

    await act(async () => { await result.current.deleteTransaction(card.id!); });
    expect(result.current.transactions).toHaveLength(0);
  });

  it('no publishes either half when the durable card-payment commit fails', async () => {
    localStorage.setItem('accounts', JSON.stringify(paymentAccounts));
    const { result } = renderHook(() => useTransactions(null));
    await waitFor(() => expect(localStorage.getItem(GUEST_LEDGER_STORAGE_KEY)).not.toBeNull());
    const rawBefore = localStorage.getItem(GUEST_LEDGER_STORAGE_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    await expect(act(async () => {
      await result.current.addCreditPaymentAtomic(creditTx, sourceTx);
    })).rejects.toThrow();

    expect(result.current.transactions).toEqual([]);
    expect(localStorage.getItem(GUEST_LEDGER_STORAGE_KEY)).toBe(rawBefore);
  });

  it('reconcilia usedCredit local incluyendo intereses financiados', async () => {
    localStorage.setItem('accounts', JSON.stringify([{
      id: 'tc', name: 'Visa', type: 'credit', isDefault: true, initialBalance: 0,
      creditLimit: 500_000, usedCredit: 0,
    }] as Account[]));
    const { result } = renderHook(() => useTransactions(null));

    await act(async () => {
      await result.current.addTransaction({
        type: 'expense', amount: 120_000, totalInterestAmount: 3_265.49,
        category: 'Compras', description: 'Cuotas', date: new Date(), paid: true, accountId: 'tc',
      });
    });

    await waitFor(() => {
      const accounts = readGuestLedgerEnvelope().data.accounts;
      expect(accounts[0].usedCredit).toBe(123_265.49);
    });
  });

  it('enlaza una sola vez los pares históricos inequívocos del invitado', async () => {
    const date = new Date('2026-06-15T14:30:00.000Z');
    localStorage.setItem('accounts', JSON.stringify([{
      id: 'tc', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0, usedCredit: 50_000,
    }, {
      id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 100_000,
    }] as Account[]));
    localStorage.setItem('transactions', JSON.stringify([
      { id: 'credit-old', type: 'income', amount: 50_000, category: 'Pago Crédito', description: 'Junio', date, paid: true, accountId: 'tc' },
      { id: 'bank-old', type: 'expense', amount: 50_000, category: 'Pago Crédito', description: 'Pago a Visa: Junio', date, paid: true, accountId: 'sav' },
    ] as Transaction[]));

    renderHook(() => useTransactions(null));

    await waitFor(() => {
      const ledger = readGuestLedgerEnvelope().data;
      const transactions = ledger.transactions;
      expect(transactions.find(item => item.id === 'credit-old')?.linkedTransactionId).toBe('bank-old');
      expect(transactions.find(item => item.id === 'bank-old')?.linkedTransactionId).toBe('credit-old');
      const accounts = ledger.accounts;
      expect(accounts[0].paymentPairModelVersion).toBe(1);
    });
  });
});

describe('useTransactions.restoreTransaction — modo invitado', () => {
  const savings: Account = {
    id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 100_000,
  };
  const snapshot: Transaction = {
    id: 'tx-restored',
    type: 'expense',
    amount: 42_000,
    category: 'Mercado',
    description: 'Compra eliminada',
    date: new Date('2026-08-24T12:00:00.000Z'),
    createdAt: new Date('2026-08-24T12:01:00.000Z'),
    paid: true,
    accountId: 'sav',
  };

  it('restaura el ID original una sola vez aunque se repita la orden', async () => {
    localStorage.setItem('accounts', JSON.stringify([savings]));
    const { result } = renderHook(() => useTransactions(null));

    await act(async () => {
      await result.current.restoreTransaction(snapshot);
      await result.current.restoreTransaction(snapshot);
    });

    const restored = result.current.transactions.filter(item => item.id === snapshot.id);
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      id: snapshot.id,
      amount: snapshot.amount,
      mutationKind: 'restore',
      mutationSource: 'undo',
    });
  });

  it('permite borrar de nuevo una fila después de restaurarla', async () => {
    localStorage.setItem('accounts', JSON.stringify([savings]));
    localStorage.setItem('transactions', JSON.stringify([snapshot]));
    const { result } = renderHook(() => useTransactions(null));
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    let deleted: Transaction | null = null;
    await act(async () => {
      deleted = await result.current.deleteTransaction(snapshot.id!);
    });
    await act(async () => {
      await result.current.restoreTransaction(deleted!);
      await result.current.deleteTransaction(snapshot.id!);
    });

    expect(readGuestLedgerEnvelope().data.transactions).toEqual([]);
  });

  it('delega la restauración autenticada a la autoridad Firestore', async () => {
    const { result } = renderHook(() => useTransactions('user-1'));

    await act(async () => {
      await result.current.restoreTransaction(snapshot);
    });

    expect(M.restoreTransaction).toHaveBeenCalledOnce();
    expect(M.restoreTransaction).toHaveBeenCalledWith(snapshot);
  });

  it('rechaza agregados incompletos y colisiones del ID original', async () => {
    localStorage.setItem('accounts', JSON.stringify([
      savings,
      { id: 'tc', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0 },
    ] as Account[]));
    localStorage.setItem('transactions', JSON.stringify([{
      ...snapshot,
      amount: 99_000,
    }]));
    const { result } = renderHook(() => useTransactions(null));

    await expect(result.current.restoreTransaction(snapshot)).rejects.toThrow(/identidad original/i);
    await expect(result.current.restoreTransaction({
      ...snapshot,
      id: 'linked',
      linkedTransactionId: 'counterpart',
    })).rejects.toThrow(/movimiento financiero|vinculado/i);
    await expect(result.current.restoreTransaction({
      ...snapshot,
      id: 'card',
      accountId: 'tc',
    })).rejects.toThrow(/tarjeta|movimiento financiero/i);
  });
});
