import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebts } from '../../hooks/useDebts';
import type { Debt } from '../../types/finance';
import { GUEST_LEDGER_STORAGE_KEY, createGuestLedgerEnvelope, readGuestLedgerEnvelope } from '../../utils/guestLedger';

const monthly = (): Omit<Debt, 'id' | 'createdAt'> => ({ personName: 'Ana', type: 'lent', originalAmount: 1000, remainingAmount: 1000, isSettled: false, interestMode: 'percentage', interestRate: 10, interestAccrual: 'monthly', interestCutoffDay: 10, lentDate: new Date('2026-11-01T05:00:00Z') });
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('interés mensual de préstamos', () => {
  it('no cobra todo al registrar: conserva el próximo corte sin interés anticipado', async () => {
    const { result } = renderHook(() => useDebts(null, []));
    await act(async () => { await result.current.addDebt(monthly()); });
    expect(result.current.debts[0]).toMatchObject({ originalAmount: 1000, remainingAmount: 1000, totalInterestAmount: 0 });
    expect(new Date(result.current.debts[0].nextInterestDate!).toISOString()).toBe('2026-11-10T05:00:00.000Z');
  });

  it('aplica el corte antes de cobrar y conserva la base original después de un abono', async () => {
    const { result } = renderHook(() => useDebts(null, []));
    await act(async () => { await result.current.addDebt(monthly()); });
    const id = result.current.debts[0].id!;
    vi.setSystemTime(new Date('2026-11-10T05:00:00Z'));
    await act(async () => { await result.current.registerDebtPayment(id, 500); });
    expect(result.current.debts[0]).toMatchObject({ remainingAmount: 600, totalInterestAmount: 100 });
    vi.setSystemTime(new Date('2026-12-10T05:00:00Z'));
    await act(async () => { await result.current.registerDebtPayment(id, 100); });
    expect(result.current.debts[0]).toMatchObject({ originalAmount: 1000, remainingAmount: 600, totalInterestAmount: 200 });
  });

  it('recupera cortes al abrir sin crear movimientos de dinero ni duplicarlos', async () => {
    const debt: Debt = { ...monthly(), id: 'monthly', nextInterestDate: new Date('2026-10-10T05:00:00Z'), totalInterestAmount: 0 };
    localStorage.setItem(GUEST_LEDGER_STORAGE_KEY, JSON.stringify(createGuestLedgerEnvelope({ accounts: [], debts: [debt], transactions: [], recurringPayments: [] })));
    const { result, rerender } = renderHook(() => useDebts(null, []));
    await waitFor(() => expect(result.current.debts[0].remainingAmount).toBe(1100));
    rerender();
    expect(readGuestLedgerEnvelope().data.transactions).toHaveLength(0);
    expect(result.current.debts[0].totalInterestAmount).toBe(100);
  });

  it('deja de generar interés cuando ya está saldado', async () => {
    const { result } = renderHook(() => useDebts(null, []));
    await act(async () => { await result.current.addDebt(monthly()); });
    await act(async () => { await result.current.registerDebtPayment(result.current.debts[0].id!, 1000); });
    vi.setSystemTime(new Date('2027-02-10T05:00:00Z'));
    expect(result.current.debts[0]).toMatchObject({ remainingAmount: 0, isSettled: true, totalInterestAmount: 0 });
  });
});
