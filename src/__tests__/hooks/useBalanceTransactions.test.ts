import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Account, Transaction } from '../../types/finance';

type FakeDocument = {
  id: string;
  data: () => Record<string, unknown>;
};

type FakeSnapshot = {
  docs: FakeDocument[];
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
  docChanges: () => [];
};

type SnapshotListener = {
  next: (snapshot: FakeSnapshot) => void;
  error: (error: Error) => void;
  unsubscribed: boolean;
};

let subscriptionCount = 0;
let unsubscribeCount = 0;
let listeners: SnapshotListener[] = [];

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => ({ type: 'collection', args }),
  query: (...args: unknown[]) => ({ type: 'query', args }),
  orderBy: (...args: unknown[]) => ({ type: 'orderBy', args }),
  onSnapshot: vi.fn((...args: unknown[]) => {
    subscriptionCount += 1;
    const listener: SnapshotListener = {
      next: args[2] as SnapshotListener['next'],
      error: args[3] as SnapshotListener['error'],
      unsubscribed: false,
    };
    listeners.push(listener);

    return () => {
      if (listener.unsubscribed) return;
      listener.unsubscribed = true;
      unsubscribeCount += 1;
    };
  }),
}));

vi.mock('../../lib/firebaseDb', () => ({ db: {} }));
vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn() } }));

import { useBalanceTransactions } from '../../hooks/useBalanceTransactions';
import { BalanceCalculator } from '../../utils/balanceCalculator';

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

function documentFor(transaction: Transaction): FakeDocument {
  const { id, ...data } = transaction;
  if (!id) throw new Error('La prueba requiere una transacción con id');
  return { id, data: () => data };
}

function emitSnapshot(
  transactions: Transaction[],
  options: { fromCache?: boolean; listenerIndex?: number } = {},
) {
  const listener = listeners[options.listenerIndex ?? listeners.length - 1];
  if (!listener) throw new Error('No hay una suscripción activa');

  act(() => {
    listener.next({
      docs: transactions.map(documentFor),
      metadata: {
        fromCache: options.fromCache ?? false,
        hasPendingWrites: false,
      },
      docChanges: () => [],
    });
  });
}

describe('useBalanceTransactions — fuente de saldos bajo paginación', () => {
  beforeEach(() => {
    subscriptionCount = 0;
    unsubscribeCount = 0;
    listeners = [];
  });

  it('ventana no saturada: no se suscribe, devuelve live y ready=true', async () => {
    const live = [tx('t1')];
    const { result } = renderHook(() => useBalanceTransactions('user1', live, false));
    await Promise.resolve();

    expect(subscriptionCount).toBe(0);
    expect(result.current.transactions).toEqual(live);
    expect(result.current.ready).toBe(true);
  });

  it('modo invitado: no se suscribe aunque hasMore sea true', async () => {
    const live = [tx('t1')];
    const { result } = renderHook(() => useBalanceTransactions(null, live, true));
    await Promise.resolve();

    expect(subscriptionCount).toBe(0);
    expect(result.current.transactions).toEqual(live);
    expect(result.current.ready).toBe(true);
  });

  it('ventana saturada: el primer snapshot completo incluye movimientos antiguos', async () => {
    const old = tx('old1', {
      amount: 337_520,
      date: new Date('2025-01-01'),
    });
    const recent = tx('t1');
    const { result } = renderHook(
      () => useBalanceTransactions('user1', [recent], true),
    );

    expect(result.current.ready).toBe(false);
    emitSnapshot([recent, old]);

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(subscriptionCount).toBe(1);
    expect(result.current.transactions).toHaveLength(2);

    const account: Account = {
      id: 'sav',
      name: 'A',
      type: 'savings',
      isDefault: true,
      initialBalance: 0,
    };
    expect(
      BalanceCalculator.calculateAccountBalance(account, result.current.transactions)
    ).toBeCloseTo(338_520, 2);
  });

  it('solo marca ready tras el primer snapshot confirmado por el servidor', async () => {
    const old = tx('old1', {
      amount: 500_000,
      date: new Date('2025-01-01'),
    });
    const recent = tx('t1');
    const { result } = renderHook(
      () => useBalanceTransactions('user1', [recent], true),
    );

    expect(result.current.ready).toBe(false);

    // La caché puede no contener todo el historial: se muestra, pero no habilita saldos.
    emitSnapshot([recent, old], { fromCache: true });
    expect(result.current.transactions).toHaveLength(2);
    expect(result.current.ready).toBe(false);

    // El cambio metadata-only confirma que el mismo snapshot ya viene del servidor.
    emitSnapshot([recent, old]);
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('un error antes del primer snapshot del servidor mantiene ready=false', () => {
    const recent = tx('t1');
    const { result } = renderHook(
      () => useBalanceTransactions('user1', [recent], true),
    );

    act(() => {
      listeners[0].error(new Error('network down'));
    });

    expect(result.current.ready).toBe(false);
    expect(result.current.transactions).toEqual([recent]);
  });

  it('un cambio del array live no resuscribe ni pisa el historial autoritativo', async () => {
    const recent = tx('t1');
    const { result, rerender } = renderHook(
      ({ live }) => useBalanceTransactions('user1', live, true),
      { initialProps: { live: [recent] } },
    );
    emitSnapshot([recent]);
    await waitFor(() => expect(result.current.ready).toBe(true));

    rerender({ live: [recent, tx('t2')] });

    expect(subscriptionCount).toBe(1);
    expect(unsubscribeCount).toBe(0);
    expect(result.current.ready).toBe(true);
    expect(result.current.transactions).toEqual([recent]);
  });

  it('mantiene la suscripción al terminar de paginar un historial grande', async () => {
    const loadedHistory = Array.from(
      { length: 500 },
      (_, index) => tx(`t${index}`),
    );
    const { result, rerender } = renderHook(
      ({ hasMore }) => useBalanceTransactions('user1', loadedHistory, hasMore),
      { initialProps: { hasMore: true } },
    );
    emitSnapshot(loadedHistory);
    await waitFor(() => expect(result.current.ready).toBe(true));

    rerender({ hasMore: false });

    expect(subscriptionCount).toBe(1);
    expect(unsubscribeCount).toBe(0);
    expect(result.current.ready).toBe(true);
    expect(result.current.transactions).toHaveLength(500);
  });

  it('cancela la suscripción completa cuando la ventana deja de estar saturada', async () => {
    const recent = tx('t1');
    const { result, rerender } = renderHook(
      ({ hasMore }) => useBalanceTransactions('user1', [recent], hasMore),
      { initialProps: { hasMore: true } },
    );
    emitSnapshot([recent]);
    await waitFor(() => expect(result.current.ready).toBe(true));

    rerender({ hasMore: false });

    expect(unsubscribeCount).toBe(1);
    expect(result.current.transactions).toEqual([recent]);
    expect(result.current.ready).toBe(true);
  });
});
