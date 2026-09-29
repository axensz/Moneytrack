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

  it('head corto autenticado sin confirmación del servidor conserva la lista pero no habilita saldos', async () => {
    const live = [tx('t1')];
    const { result } = renderHook(() => useBalanceTransactions('user1', live, false));
    await Promise.resolve();

    expect(subscriptionCount).toBe(0);
    expect(result.current.transactions).toEqual(live);
    expect(result.current.ready).toBe(false);
  });

  it('modo invitado: no se suscribe aunque hasMore sea true', async () => {
    const live = [tx('t1')];
    const { result } = renderHook(() => useBalanceTransactions(null, live, true));
    await Promise.resolve();

    expect(subscriptionCount).toBe(0);
    expect(result.current.transactions).toEqual(live);
    expect(result.current.ready).toBe(true);
  });

  it('head corto confirmado por servidor habilita saldos sin abrir un listener completo', () => {
    const live = [tx('t1')];
    const { result, rerender } = renderHook(
      ({ serverSettled, headExhaustive }) => useBalanceTransactions('user1', live, serverSettled, headExhaustive),
      { initialProps: { serverSettled: false, headExhaustive: false } },
    );

    expect(result.current.ready).toBe(false);
    rerender({ serverSettled: true, headExhaustive: true });

    expect(subscriptionCount).toBe(0);
    expect(result.current.ready).toBe(true);
  });

  it('usa el head exhaustivo confirmado y no el hasMore de la UI', () => {
    const live = [tx('t1')];
    const { result } = renderHook(
      () => useBalanceTransactions('user1', live, true, true),
    );

    expect(subscriptionCount).toBe(0);
    expect(result.current.ready).toBe(true);
  });

  it('un head que crece de caché corto a 500 espera el historial completo confirmado', async () => {
    const cachedHead = [tx('cached')];
    const serverHead = Array.from({ length: 500 }, (_, index) => tx(`server-${index}`));
    const { result, rerender } = renderHook(
      ({ live, serverSettled, headExhaustive }) => useBalanceTransactions('user1', live, serverSettled, headExhaustive),
      { initialProps: { live: cachedHead, serverSettled: false, headExhaustive: false } },
    );

    expect(result.current.ready).toBe(false);
    rerender({ live: serverHead, serverSettled: true, headExhaustive: false });

    expect(subscriptionCount).toBe(1);
    expect(result.current.ready).toBe(false);
    emitSnapshot(serverHead);
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it.each([
    [499, true, 0],
    [500, false, 1],
    [501, false, 1],
  ])('clasifica un head confirmado de %i filas sin usar hasMore como autoridad', (count, expectedReady, expectedSubscriptions) => {
    const live = Array.from({ length: count }, (_, index) => tx(`t${index}`));
    const { result } = renderHook(() => useBalanceTransactions('user1', live, true, count < 500));

    expect(subscriptionCount).toBe(expectedSubscriptions);
    expect(result.current.ready).toBe(expectedReady);
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

  it('reintenta un error terminal conservando filas confirmadas y cercando el listener anterior', async () => {
    const head = Array.from({ length: 500 }, (_, index) => tx(`head-${index}`));
    const row501 = tx('row-501', { date: new Date('2024-01-01') });
    const { result, rerender } = renderHook(
      ({ retryGeneration }) => useBalanceTransactions(
        'user1',
        head,
        true,
        false,
        retryGeneration,
      ),
      { initialProps: { retryGeneration: 0 } },
    );

    emitSnapshot([...head, row501], { listenerIndex: 0 });
    await waitFor(() => expect(result.current.currentServerSettled).toBe(true));

    const terminalError = new Error('permission denied');
    act(() => listeners[0].error(terminalError));

    expect(result.current.error).toBe(terminalError);
    expect(result.current.transactions.some(item => item.id === 'row-501')).toBe(true);
    expect(result.current.ready).toBe(true);
    expect(result.current.currentServerSettled).toBe(false);

    rerender({ retryGeneration: 1 });
    expect(subscriptionCount).toBe(2);
    expect(unsubscribeCount).toBe(1);
    expect(result.current.error).toBeNull();
    expect(result.current.transactions.some(item => item.id === 'row-501')).toBe(true);
    expect(result.current.currentServerSettled).toBe(false);

    // Un callback tardío de la suscripción terminal no puede restaurar autoridad.
    emitSnapshot([tx('stale-row')], { listenerIndex: 0 });
    expect(result.current.transactions.some(item => item.id === 'row-501')).toBe(true);
    expect(result.current.transactions.some(item => item.id === 'stale-row')).toBe(false);
    expect(result.current.currentServerSettled).toBe(false);

    emitSnapshot([...head, row501], { listenerIndex: 1 });
    await waitFor(() => expect(result.current.currentServerSettled).toBe(true));
    expect(result.current.error).toBeNull();
    expect(subscriptionCount).toBe(2);
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

  it('mantiene el historial suscrito mientras una escritura espera confirmación', () => {
    const recent = tx('recent');
    const old = tx('old', { date: new Date('2024-01-01') });
    const { result, rerender, unmount } = renderHook(
      ({ serverSettled }) => useBalanceTransactions('user1', [recent], serverSettled, false),
      { initialProps: { serverSettled: true } },
    );
    emitSnapshot([recent, old]);
    expect(result.current.ready).toBe(true);

    rerender({ serverSettled: false });

    expect(result.current.ready).toBe(true);
    expect(result.current.currentServerSettled).toBe(false);
    expect(unsubscribeCount).toBe(0);
    expect(result.current.transactions.map(transaction => transaction.id)).toEqual(['recent', 'old']);

    rerender({ serverSettled: true });

    expect(subscriptionCount).toBe(1);
    expect(result.current.ready).toBe(true);
    unmount();
    expect(unsubscribeCount).toBe(1);
  });

  it('no conserva la activación del historial al cambiar de usuario durante una escritura pendiente', () => {
    const privateTransaction = tx('user1-private');
    const user2Transaction = tx('user2-recent');
    const { result, rerender } = renderHook(
      ({ userId, live, serverSettled }) => useBalanceTransactions(userId, live, serverSettled, false),
      { initialProps: { userId: 'user1', live: [privateTransaction], serverSettled: true } },
    );
    emitSnapshot([privateTransaction]);
    rerender({ userId: 'user1', live: [privateTransaction], serverSettled: false });

    rerender({ userId: 'user2', live: [user2Transaction], serverSettled: false });
    emitSnapshot([privateTransaction], { listenerIndex: 0 });

    expect(unsubscribeCount).toBe(1);
    expect(subscriptionCount).toBe(1);
    expect(result.current.ready).toBe(false);
    expect(result.current.transactions).toEqual([user2Transaction]);

    rerender({ userId: 'user1', live: [], serverSettled: false });
    expect(subscriptionCount).toBe(1);
    expect(result.current.ready).toBe(false);
    expect(result.current.transactions).toEqual([]);
  });

  it('mantiene la suscripción al terminar de paginar un historial grande', async () => {
    const loadedHistory = Array.from(
      { length: 500 },
      (_, index) => tx(`t${index}`),
    );
    const { result, rerender } = renderHook(
      ({ headExhaustive }) => useBalanceTransactions('user1', loadedHistory, true, headExhaustive),
      { initialProps: { headExhaustive: false } },
    );
    emitSnapshot(loadedHistory);
    await waitFor(() => expect(result.current.ready).toBe(true));

    rerender({ headExhaustive: false });

    expect(subscriptionCount).toBe(1);
    expect(unsubscribeCount).toBe(0);
    expect(result.current.ready).toBe(true);
    expect(result.current.transactions).toHaveLength(500);
  });

  it('retiene fila 501 y listener cuando el head saturado pierde autoridad por metadata', async () => {
    const head = Array.from({ length: 500 }, (_, index) => tx(`head-${index}`));
    const row501 = tx('row-501', { date: new Date('2024-01-01') });
    const { result, rerender } = renderHook(
      ({ serverSettled }) => useBalanceTransactions(
        'user1',
        head,
        serverSettled,
        false,
      ),
      { initialProps: { serverSettled: true } },
    );
    emitSnapshot([...head, row501]);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.transactions.some(item => item.id === 'row-501')).toBe(true);
    expect(result.current.currentServerSettled).toBe(true);

    // Cache y pending writes comparten el mismo gate false del head. Ninguno
    // puede desmontar la fuente full ni truncar saldos ya confirmados.
    rerender({ serverSettled: false });
    expect(result.current.transactions.some(item => item.id === 'row-501')).toBe(true);
    expect(result.current.ready).toBe(true);
    expect(result.current.currentServerSettled).toBe(false);
    expect(subscriptionCount).toBe(1);
    expect(unsubscribeCount).toBe(0);

    rerender({ serverSettled: true });
    expect(result.current.currentServerSettled).toBe(true);
    expect(subscriptionCount).toBe(1);
    expect(unsubscribeCount).toBe(0);
  });

  it('cancela la suscripción completa cuando la ventana deja de estar saturada', async () => {
    const recent = tx('t1');
    const { result, rerender } = renderHook(
      ({ serverSettled, headExhaustive }) => useBalanceTransactions('user1', [recent], serverSettled, headExhaustive),
      { initialProps: { serverSettled: true, headExhaustive: false } },
    );
    emitSnapshot([recent]);
    await waitFor(() => expect(result.current.ready).toBe(true));

    rerender({ serverSettled: true, headExhaustive: true });

    expect(unsubscribeCount).toBe(1);
    expect(result.current.transactions).toEqual([recent]);
    expect(result.current.ready).toBe(true);
  });
});
