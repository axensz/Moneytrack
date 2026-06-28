/**
 * useAccounts.deleteAccount en modo INVITADO (#accounts-1).
 *
 * Antes, borrar una cuenta en modo invitado solo la quitaba del array y dejaba
 * transacciones/deudas/recurrentes huérfanas, el bankAccountId colgante de las
 * TC asociadas y, si era la cuenta por defecto, al usuario sin default. Ahora
 * replica el cascade autenticado.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Account, Transaction, Debt, RecurringPayment } from '../../types/finance';

// Modo invitado: firebase no se usa, pero los módulos deben resolver.
vi.mock('../../lib/firebaseDb', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), collection: vi.fn(), query: vi.fn(), where: vi.fn(),
  getDocs: vi.fn(), getDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
  writeBatch: vi.fn(), runTransaction: vi.fn(), deleteField: vi.fn(),
}));
vi.mock('../../contexts/FirestoreContext', () => ({
  useFirestoreData: () => ({
    accounts: [], recurringPayments: [], debts: [], loading: false,
    addAccount: vi.fn(), updateAccount: vi.fn(),
  }),
}));

import { useAccounts } from '../../hooks/useAccounts';

const seed = () => {
  localStorage.setItem('accounts', JSON.stringify([
    { id: 'a', name: 'A', type: 'savings', isDefault: true, initialBalance: 0 },
    { id: 'b', name: 'B', type: 'savings', isDefault: false, initialBalance: 0 },
    { id: 'card', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0, creditLimit: 1_000_000, bankAccountId: 'a' },
  ] as Account[]));
  localStorage.setItem('transactions', JSON.stringify([
    { id: 't1', type: 'expense', amount: 10, category: 'x', description: '', date: new Date(), paid: true, accountId: 'a' },
    { id: 't2', type: 'transfer', amount: 20, category: 'x', description: '', date: new Date(), paid: true, accountId: 'b', toAccountId: 'a' },
    { id: 't3', type: 'expense', amount: 30, category: 'x', description: '', date: new Date(), paid: true, accountId: 'b' },
  ] as Transaction[]));
  localStorage.setItem('debts', JSON.stringify([
    { id: 'd1', accountId: 'a' }, { id: 'd2', accountId: 'b' },
  ] as Debt[]));
  localStorage.setItem('recurringPayments', JSON.stringify([
    { id: 'r1', accountId: 'a' },
  ] as RecurringPayment[]));
};

beforeEach(() => localStorage.clear());

describe('useAccounts.deleteAccount — modo invitado (#accounts-1)', () => {
  it('borra en cascada: sin huérfanos, limpia bankAccountId y reasigna la default', async () => {
    seed();
    const { result } = renderHook(() => useAccounts(null, [], vi.fn()));
    await waitFor(() => expect(result.current.accounts).toHaveLength(3));

    // allowDefaultDelete: la UI bloquea borrar la default; lo forzamos para
    // ejercitar también la reasignación de default (red de seguridad del cascade).
    await act(async () => { await result.current.deleteAccount('a', { allowDefaultDelete: true }); });

    const accounts = JSON.parse(localStorage.getItem('accounts')!) as Account[];
    const txs = JSON.parse(localStorage.getItem('transactions')!) as Transaction[];
    const debts = JSON.parse(localStorage.getItem('debts')!) as Debt[];
    const recurring = JSON.parse(localStorage.getItem('recurringPayments')!) as RecurringPayment[];

    // Cuenta borrada; no quedan referencias colgantes.
    expect(accounts.find(a => a.id === 'a')).toBeUndefined();
    expect(txs.map(t => t.id)).toEqual(['t3']); // t1 (accountId=a) y t2 (toAccountId=a) eliminadas
    expect(debts.map(d => d.id)).toEqual(['d2']);
    expect(recurring).toHaveLength(0);

    // TC asociada: bankAccountId colgante limpiado.
    expect(accounts.find(a => a.id === 'card')?.bankAccountId).toBeUndefined();

    // Invariante de default: exactamente una, ya no la borrada.
    expect(accounts.filter(a => a.isDefault)).toHaveLength(1);
    expect(accounts.find(a => a.isDefault)?.id).toBe('b');
  });
});
