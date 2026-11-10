import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDebts } from '../../hooks/useDebts';
import type { Account, Debt, Transaction } from '../../types/finance';
import { GUEST_LEDGER_STORAGE_KEY, createGuestLedgerEnvelope, readGuestLedgerEnvelope } from '../../utils/guestLedger';

const card: Account = {
  id: 'card', name: 'Nu', type: 'credit', isDefault: false, initialBalance: 0,
  creditLimit: 5_000_000, usedCredit: 0, creditDebtModelVersion: 2, interestRate: 24,
};
const loan = (overrides = {}): Omit<Debt, 'id' | 'createdAt'> => ({
  personName: 'Ana', type: 'lent', originalAmount: 1000, remainingAmount: 1200,
  totalInterestAmount: 200, interestMode: 'fixed', isSettled: false, ...overrides,
});
const purchase = (overrides = {}): Transaction => ({
  id: 'purchase', type: 'expense', amount: 1000, category: 'Otros', description: 'Compra para Ana',
  date: new Date('2026-11-01T12:00:00Z'), paid: true, accountId: 'card',
  hasInterest: true, installments: 3, interestRate: 24, totalInterestAmount: 36.25,
  monthlyInstallmentAmount: 345.42, ...overrides,
});
function seed(transactions: Transaction[] = []) {
  localStorage.setItem(GUEST_LEDGER_STORAGE_KEY, JSON.stringify(createGuestLedgerEnvelope({
    accounts: [card, { id: 'bank', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 10000 }], transactions, debts: transactions.some(t => t.debtId === 'another') ? [{ ...loan(), id: 'another' }] : [], recurringPayments: [],
  })));
}

describe('préstamos con intereses', () => {
  beforeEach(() => { localStorage.clear(); seed(); });

  it.each(['lent', 'borrowed'] as const)('conserva capital e interés y solo salda al cubrir el total (%s)', async type => {
    const { result } = renderHook(() => useDebts(null, []));
    await act(async () => { await result.current.addDebt(loan({ type })); });
    const id = result.current.debts[0].id!;
    await act(async () => { await result.current.registerDebtPayment(id, 1000); });
    expect(result.current.debts[0]).toMatchObject({ originalAmount: 1000, totalInterestAmount: 200, remainingAmount: 200, isSettled: false });
    await act(async () => { await result.current.registerDebtPayment(id, 200); });
    expect(result.current.debts[0]).toMatchObject({ remainingAmount: 0, isSettled: true });
  });

  it('asocia una compra con su tarjeta, cuotas e interés sin crear otro movimiento ni cargar cupo', async () => {
    seed([purchase()]);
    const { result } = renderHook(() => useDebts(null, []));
    await act(async () => { await result.current.addDebt(loan({ originalAmount: 9999 }), 'purchase'); });
    const stored = readGuestLedgerEnvelope().data;
    expect(stored.transactions).toHaveLength(1);
    expect(stored.transactions[0]).toMatchObject({ id: 'purchase', debtId: stored.debts[0].id, category: 'Préstamo', installments: 3 });
    expect(stored.accounts[0].usedCredit).toBe(0);
    expect(stored.debts[0]).toMatchObject({ accountId: 'card', originalAmount: 1000, remainingAmount: 1036.25, totalInterestAmount: 36.25, installments: 3, interestRate: 24 });
  });

  it.each([
    { debtId: 'another' }, { paid: false }, { type: 'income' }, { recurringPaymentId: 'subscription' },
  ])('rechaza una transacción incompatible sin crear la deuda: %j', async invalid => {
    seed([purchase(invalid)]);
    const { result } = renderHook(() => useDebts(null, []));
    await act(async () => { await expect(result.current.addDebt(loan(), 'purchase')).rejects.toThrow(); });
    expect(readGuestLedgerEnvelope().data.debts).toHaveLength(invalid.debtId ? 1 : 0);
    expect(readGuestLedgerEnvelope().data.transactions[0].category).toBe('Otros');
  });

  it('rechaza intereses negativos sin guardar la deuda', async () => {
    const { result } = renderHook(() => useDebts(null, []));
    await act(async () => { await expect(result.current.addDebt(loan({ totalInterestAmount: -200 }))).rejects.toThrow(); });
    expect(readGuestLedgerEnvelope().data.debts).toHaveLength(0);
  });

  it('cobra capital e interés en una cuenta distinta a la tarjeta usada', async () => {
    const { result } = renderHook(() => useDebts(null, []));
    await act(async () => { await result.current.addDebt(loan({ accountId: 'card' })); });
    const id = result.current.debts[0].id!;
    await act(async () => { await result.current.registerDebtPayment(id, 1200, 'bank'); });
    const stored = readGuestLedgerEnvelope().data;
    expect(stored.debts[0]).toMatchObject({ remainingAmount: 0, isSettled: true });
    expect(stored.transactions.find(t => t.type === 'income')).toMatchObject({ amount: 1200, accountId: 'bank' });
  });

  it('no permite reducir el capital por debajo de cero usando el saldo que incluye interés', async () => {
    const { result } = renderHook(() => useDebts(null, []));
    await act(async () => { await result.current.addDebt(loan()); });
    await act(async () => { await expect(result.current.modifyDebtBalance(result.current.debts[0].id!, 1100, 'subtract')).rejects.toThrow(); });
    expect(result.current.debts[0].originalAmount).toBe(1000);
  });

  it('protege el capital financiado para conservar cuotas e interés coherentes', async () => {
    seed([purchase()]);
    const { result } = renderHook(() => useDebts(null, []));
    await act(async () => { await result.current.addDebt(loan(), 'purchase'); });
    await act(async () => { await expect(result.current.modifyDebtBalance(result.current.debts[0].id!, 1000, 'add')).rejects.toThrow(/cuotas/i); });
    expect(result.current.debts[0].originalAmount).toBe(1000);
  });
});
