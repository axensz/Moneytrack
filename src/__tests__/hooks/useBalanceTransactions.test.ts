import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Transaction } from '../../types/finance';

// ─── Mock firebase/firestore: getDocs sirve el "historial completo" ──
let getDocsCalls = 0;
let storeDocs: { id: string; data: Record<string, unknown> }[] = [];

vi.mock('firebase/firestore', () => ({
  collection: () => ({ __c: true }),
  query: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => ({ __orderBy: args }),
  getDocs: vi.fn(async () => {
    getDocsCalls += 1;
    return { docs: storeDocs.map((d) => ({ id: d.id, data: () => d.data })) };
  }),
}));

vi.mock('../../lib/firebase', () => ({ db: {} }));

import { useBalanceTransactions } from '../../hooks/useBalanceTransactions';
import { BalanceCalculator } from '../../utils/balanceCalculator';
import type { Account } from '../../types/finance';

const tx = (id: string, overrides: Partial<Transaction> = {}): Transaction => ({
  id,
  type: 'income',
  amount: 1000,
  category: 'Otros',
  description: 'x',
  date: new Date('2026-06-01'),
  paid: true,
  accountId: 'sav',
  ...overrides,
} as Transaction);

describe('useBalanceTransactions — fuente de saldos bajo paginación', () => {
  beforeEach(() => {
    getDocsCalls = 0;
    storeDocs = [];
  });

  it('ventana NO saturada (hasMore=false): no fetchea, devuelve el array live', async () => {
    const live = [tx('t1')];
    const { result } = renderHook(() => useBalanceTransactions('user1', live, false));
    await new Promise((r) => setTimeout(r, 20));
    expect(getDocsCalls).toBe(0);
    expect(result.current).toEqual(live);
  });

  it('modo invitado: no fetchea aunque hasMore sea true', async () => {
    const live = [tx('t1')];
    renderHook(() => useBalanceTransactions(null, live, true));
    await new Promise((r) => setTimeout(r, 20));
    expect(getDocsCalls).toBe(0);
  });

  it('ventana saturada: fusiona el historial completo y el saldo incluye txs fuera de la ventana', async () => {
    // Historial completo en Firestore: incluye un ingreso ANTIGUO de 337.520
    // que NO está en la ventana live (el mecanismo del escenario A del reporte).
    storeDocs = [
      { id: 'old1', data: { type: 'income', amount: 337_520, date: new Date('2025-01-01'), category: 'Otros', paid: true, accountId: 'sav' } },
      { id: 't1', data: { type: 'income', amount: 1000, date: new Date('2026-06-01'), category: 'Otros', paid: true, accountId: 'sav' } },
    ];
    const live = [tx('t1')];
    const { result } = renderHook(() => useBalanceTransactions('user1', live, true));

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(getDocsCalls).toBe(1);

    const account: Account = { id: 'sav', name: 'A', type: 'savings', isDefault: true, initialBalance: 0 };
    expect(BalanceCalculator.calculateAccountBalance(account, result.current)).toBeCloseTo(338_520, 2);
  });
});
