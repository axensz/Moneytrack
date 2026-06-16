/**
 * useCreditCardInterests — el interés "Pendiente" incluye la cuota del ciclo en
 * curso (aún no pagada). Antes restaba monthsPassed+1 (trataba la cuota que se
 * factura ESTE mes como ya pagada) → subestimaba en 1 cuota por compra. (#stats-2)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Account, Transaction } from '../../types/finance';
import { useCreditCardInterests } from '../../components/views/stats/hooks/useCreditCardInterests';

const card: Account = {
  id: 'tc', name: 'Visa', type: 'credit', isDefault: false,
  initialBalance: 0, creditLimit: 5_000_000, interestRate: 24,
};

// Compra de $1.200.000 a 12 cuotas, interés total $120.000 → $10.000/cuota.
const purchase = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'p1', type: 'expense', amount: 1_200_000, category: 'Compras', description: '',
  date: new Date(2026, 4, 10), paid: false, accountId: 'tc',
  installments: 12, hasInterest: true, totalInterestAmount: 120_000,
  ...overrides,
} as Transaction);

describe('useCreditCardInterests — interés pendiente (#stats-2)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 15)); }); // 15 jun 2026
  afterEach(() => vi.useRealTimers());

  it('pendiente incluye la cuota del ciclo en curso (compra de mayo, cuota 1 en junio)', () => {
    const { result } = renderHook(() => useCreditCardInterests([card], [purchase()]));
    expect(result.current.totals.monthly).toBe(10_000); // la cuota de este mes
    expect(result.current.totals.pending).toBe(120_000); // 12 cuotas (incluye la del ciclo en curso)
  });

  it('solo descuenta cuotas de ciclos ANTERIORES (compra de febrero → 3 pagadas, 9 pendientes)', () => {
    const { result } = renderHook(() => useCreditCardInterests([card], [purchase({ date: new Date(2026, 1, 10) })]));
    expect(result.current.totals.pending).toBe(90_000); // 9 * 10.000
  });
});
