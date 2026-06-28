import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Transaction } from '../../types/finance';

// ─── Mock firebase/firestore: getDocs sirve el "historial completo" ──
let getDocsCalls = 0;
let storeDocs: { id: string; data: Record<string, unknown> }[] = [];
let resolveFetch: (() => void) | null = null;
let holdFetch = false;
let throwFetch = false;

vi.mock('firebase/firestore', () => ({
  collection: () => ({ __c: true }),
  query: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => ({ __orderBy: args }),
  getDocs: vi.fn(async () => {
    getDocsCalls += 1;
    if (holdFetch) {
      await new Promise<void>((resolve) => { resolveFetch = resolve; });
    }
    if (throwFetch) throw new Error('network down');
    return { docs: storeDocs.map((d) => ({ id: d.id, data: () => d.data })) };
  }),
}));

vi.mock('../../lib/firebaseDb', () => ({ db: {} }));

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
    holdFetch = false;
    resolveFetch = null;
    throwFetch = false;
  });

  it('ventana NO saturada (hasMore=false): no fetchea, devuelve el array live, ready=true', async () => {
    const live = [tx('t1')];
    const { result } = renderHook(() => useBalanceTransactions('user1', live, false));
    await new Promise((r) => setTimeout(r, 20));
    expect(getDocsCalls).toBe(0);
    expect(result.current.transactions).toEqual(live);
    expect(result.current.ready).toBe(true);
  });

  it('modo invitado: no fetchea aunque hasMore sea true, ready=true', async () => {
    const live = [tx('t1')];
    const { result } = renderHook(() => useBalanceTransactions(null, live, true));
    await new Promise((r) => setTimeout(r, 20));
    expect(getDocsCalls).toBe(0);
    expect(result.current.ready).toBe(true);
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

    await waitFor(() => expect(result.current.transactions).toHaveLength(2));
    expect(getDocsCalls).toBe(1);
    expect(result.current.ready).toBe(true);

    const account: Account = { id: 'sav', name: 'A', type: 'savings', isDefault: true, initialBalance: 0 };
    expect(BalanceCalculator.calculateAccountBalance(account, result.current.transactions)).toBeCloseTo(338_520, 2);
  });

  it('ready=false MIENTRAS el primer fetch está en vuelo (flash de saldo de ventana), true al resolver', async () => {
    holdFetch = true;
    storeDocs = [
      { id: 'old1', data: { type: 'income', amount: 500_000, date: new Date('2025-01-01'), category: 'Otros', paid: true, accountId: 'sav' } },
    ];
    const live = [tx('t1')];
    const { result } = renderHook(() => useBalanceTransactions('user1', live, true));

    // Fetch en vuelo: NO asentado — la UI debe mostrar "Calculando…" y bloquear ajustes.
    await waitFor(() => expect(getDocsCalls).toBe(1));
    expect(result.current.ready).toBe(false);
    expect(result.current.transactions).toEqual(live); // solo ventana, incompleto

    resolveFetch!();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.transactions).toHaveLength(2);
  });

  it('fetch fallido sobre ventana saturada: ready queda FALSE (no da luz verde a saldos sobre la ventana truncada)', async () => {
    // C2 regresión: antes el fetch fallido asentaba igual (ready=true) y los
    // saldos se calculaban contra la ventana paginada de 500 → corrupción al
    // ajustar. Ahora en error NO se asienta: la UI sigue en "Calculando…" y los
    // ajustes quedan bloqueados hasta una recarga / refetch exitoso.
    throwFetch = true;
    const live = [tx('t1')];
    const { result } = renderHook(() => useBalanceTransactions('user1', live, true));

    await waitFor(() => expect(getDocsCalls).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.ready).toBe(false);
    expect(result.current.transactions).toEqual(live); // solo la ventana, incompleto
  });

  it('refetch posterior (alta/baja) NO vuelve a des-asentar: ready permanece true', async () => {
    storeDocs = [
      { id: 't1', data: { type: 'income', amount: 1000, date: new Date('2026-06-01'), category: 'Otros', paid: true, accountId: 'sav' } },
    ];
    const { result, rerender } = renderHook(
      ({ live }) => useBalanceTransactions('user1', live, true),
      { initialProps: { live: [tx('t1')] } },
    );
    await waitFor(() => expect(result.current.ready).toBe(true));

    // Alta de una tx → cambia la firma de ids → refetch; ready no debe parpadear.
    holdFetch = true;
    rerender({ live: [tx('t1'), tx('t2')] });
    await waitFor(() => expect(getDocsCalls).toBe(2));
    expect(result.current.ready).toBe(true);
    resolveFetch!();
  });
});
