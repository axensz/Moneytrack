import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeDocument = { id: string; data: () => Record<string, unknown> };
type FakeSource = { path: string; kind: 'query' | 'document'; constraints?: Array<Record<string, unknown>> };

const firestoreState = vi.hoisted(() => ({
  listeners: [] as Array<{
    source: FakeSource;
    next: (snapshot: {
      docs: FakeDocument[];
      metadata: { fromCache: boolean; hasPendingWrites: boolean };
      exists?: () => boolean;
      data?: () => Record<string, unknown>;
    }) => void;
    error: (error: Error) => void;
  }>,
  getDocs: vi.fn(),
}));

vi.mock('../../lib/firebaseDb', () => ({ db: { mocked: true } }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string): FakeSource => ({ path, kind: 'query' }),
  doc: (_db: unknown, path: string): FakeSource => ({ path, kind: 'document' }),
  query: (source: FakeSource, ...constraints: Array<Record<string, unknown>>): FakeSource => ({ ...source, constraints }),
  orderBy: (field: string, direction: string) => ({ type: 'orderBy', field, direction }),
  limit: (size: number) => ({ type: 'limit', size }),
  startAfter: (cursor: FakeDocument) => ({ type: 'startAfter', cursor }),
  where: (field: string, op: string, value: unknown) => ({ type: 'where', field, op, value }),
  onSnapshot: (
    source: FakeSource,
    optionsOrNext: Record<string, unknown> | ((snapshot: { docs: FakeDocument[] }) => void),
    nextOrError?: ((snapshot: { docs: FakeDocument[] }) => void) | ((error: Error) => void),
    maybeError?: (error: Error) => void,
  ) => {
    const next = typeof optionsOrNext === 'function' ? optionsOrNext : nextOrError as (snapshot: { docs: FakeDocument[] }) => void;
    const error = (typeof optionsOrNext === 'function' ? nextOrError : maybeError) as (error: Error) => void;
    firestoreState.listeners.push({ source, next, error });
    return () => {};
  },
  getDocs: firestoreState.getDocs,
}));

import { useFirestoreSubscriptions } from '../../hooks/firestore/useFirestoreSubscriptions';

const snapshot = (
  docs: FakeDocument[],
  metadata: Partial<{ fromCache: boolean; hasPendingWrites: boolean }> = {},
) => ({
  docs,
  metadata: { fromCache: metadata.fromCache ?? false, hasPendingWrites: metadata.hasPendingWrites ?? false },
});

const findAll = (suffix: string) => firestoreState.listeners.filter(l => l.source.path.endsWith(suffix));
const findFor = (suffix: string) => {
  const l = findAll(suffix)[0];
  if (!l) throw new Error(`No listener for ${suffix}`);
  return l;
};
// El listener de transacciones lleva limit; el histórico completo no.
const findHeadTransactions = () => {
  const l = firestoreState.listeners.find(item =>
    item.source.path.endsWith('/transactions')
    && item.source.constraints?.some(c => c.type === 'limit'));
  if (!l) throw new Error('No head transactions listener');
  return l;
};

const txDoc = (id: string): FakeDocument => ({
  id,
  data: () => ({ type: 'expense', amount: 1, category: 'Otros', accountId: 'a1', paid: true, description: id, date: { toDate: () => new Date('2026-07-01') } }),
});

beforeEach(() => {
  firestoreState.listeners.length = 0;
  firestoreState.getDocs.mockReset();
});

describe('useFirestoreSubscriptions — hidratación de fuentes de notificación', () => {
  it('placeholders vacíos antes de snapshots NO marcan hidratado', () => {
    const { result } = renderHook(() => useFirestoreSubscriptions('user-1'));
    expect(result.current.notificationSourcesHydrated).toBe(false);
  });

  it('arrays vacíos DESPUÉS de todos los snapshots son datos válidos hidratados', () => {
    const { result } = renderHook(() => useFirestoreSubscriptions('user-1'));
    act(() => {
      findHeadTransactions().next(snapshot([]));
      findFor('/recurringPayments').next(snapshot([]));
      findFor('/debts').next(snapshot([]));
    });
    expect(result.current.notificationSourcesHydrated).toBe(true);
  });

  it('transacciones listas pero recurring o debts pendientes permanece false', () => {
    const { result } = renderHook(() => useFirestoreSubscriptions('user-1'));
    act(() => {
      findHeadTransactions().next(snapshot([txDoc('t1')]));
      findFor('/recurringPayments').next(snapshot([]));
      // debts aún sin snapshot
    });
    expect(result.current.notificationSourcesHydrated).toBe(false);

    act(() => findFor('/debts').next(snapshot([])));
    expect(result.current.notificationSourcesHydrated).toBe(true);
  });

  it('cambio de cuenta resetea a false de inmediato', () => {
    const { result, rerender } = renderHook(
      ({ userId }) => useFirestoreSubscriptions(userId),
      { initialProps: { userId: 'user-1' as string | null } },
    );
    act(() => {
      findHeadTransactions().next(snapshot([txDoc('t1')]));
      findFor('/recurringPayments').next(snapshot([]));
      findFor('/debts').next(snapshot([]));
    });
    expect(result.current.notificationSourcesHydrated).toBe(true);

    rerender({ userId: 'user-2' });
    expect(result.current.notificationSourcesHydrated).toBe(false);
  });

  it('un snapshot tardío de la cuenta anterior no marca hidratada a la nueva', () => {
    const { result, rerender } = renderHook(
      ({ userId }) => useFirestoreSubscriptions(userId),
      { initialProps: { userId: 'user-1' as string | null } },
    );
    const staleTx = findHeadTransactions();
    const staleRecurring = findFor('/recurringPayments');
    const staleDebts = findFor('/debts');

    rerender({ userId: 'user-2' });
    // Callbacks tardíos de user-1 tras el cambio no deben hidratar user-2.
    act(() => {
      staleTx.next(snapshot([txDoc('t1')]));
      staleRecurring.next(snapshot([]));
      staleDebts.next(snapshot([]));
    });
    expect(result.current.notificationSourcesHydrated).toBe(false);
  });
});
