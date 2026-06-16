/**
 * useTransactions.addCreditPaymentAtomic en modo INVITADO (#tx-1).
 *
 * Antes, esta función siempre apuntaba a la versión Firestore, que hace no-op
 * para invitados (if(!userId)return): el invitado "pagaba" la TC, salía el toast
 * de éxito, pero NO se escribía nada y la deuda no bajaba (pérdida silenciosa).
 * Ahora crea ambas transacciones del par atómico en localStorage.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Transaction } from '../../types/finance';

vi.mock('../../contexts/FirestoreContext', () => ({
  useFirestoreData: () => ({
    transactions: [], loading: false,
    addTransaction: vi.fn(), addCreditPaymentAtomic: vi.fn(),
    deleteTransaction: vi.fn(), updateTransaction: vi.fn(),
  }),
}));

import { useTransactions } from '../../hooks/useTransactions';

const base = { category: 'Pago', description: '', date: new Date('2026-06-15'), paid: true } as const;
const creditTx = { ...base, type: 'income' as const, amount: 50_000, accountId: 'tc' };
const sourceTx = { ...base, type: 'expense' as const, amount: 50_000, accountId: 'sav' };

beforeEach(() => localStorage.clear());

describe('useTransactions.addCreditPaymentAtomic — modo invitado (#tx-1)', () => {
  it('crea AMBAS transacciones del par (ingreso a TC + gasto en origen) en localStorage', async () => {
    const { result } = renderHook(() => useTransactions(null));

    await act(async () => {
      await result.current.addCreditPaymentAtomic(creditTx, sourceTx);
    });

    const txs = JSON.parse(localStorage.getItem('transactions')!) as Transaction[];
    expect(txs).toHaveLength(2);
    expect(txs.some(t => t.accountId === 'tc' && t.type === 'income' && t.amount === 50_000)).toBe(true);
    expect(txs.some(t => t.accountId === 'sav' && t.type === 'expense' && t.amount === 50_000)).toBe(true);
    // Ambas con id + createdAt asignados.
    expect(txs.every(t => t.id && t.createdAt)).toBe(true);
  });
});
