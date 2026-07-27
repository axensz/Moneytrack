import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../../types/finance';

type FakeDocument = {
  id: string;
  data: () => Record<string, unknown>;
};

type FakeSource = {
  path: string;
  kind: 'query' | 'document';
  constraints?: Array<Record<string, unknown>>;
};

const firestoreState = vi.hoisted(() => ({
  listeners: [] as Array<{
    source: FakeSource;
    next: (snapshot: { docs: FakeDocument[]; exists?: () => boolean; data?: () => Record<string, unknown> }) => void;
  }>,
  getDocs: vi.fn(),
}));

vi.mock('../../lib/firebaseDb', () => ({ db: { mocked: true } }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string): FakeSource => ({ path, kind: 'query' }),
  doc: (_db: unknown, path: string): FakeSource => ({ path, kind: 'document' }),
  query: (source: FakeSource, ...constraints: Array<Record<string, unknown>>): FakeSource => ({
    ...source,
    constraints,
  }),
  orderBy: (field: string, direction: string) => ({ type: 'orderBy', field, direction }),
  limit: (size: number) => ({ type: 'limit', size }),
  startAfter: (cursor: FakeDocument) => ({ type: 'startAfter', cursor }),
  onSnapshot: (
    source: FakeSource,
    next: (snapshot: { docs: FakeDocument[] }) => void
  ) => {
    firestoreState.listeners.push({ source, next });
    return () => {};
  },
  getDocs: firestoreState.getDocs,
}));

import { useFirestoreSubscriptions } from '../../hooks/firestore/useFirestoreSubscriptions';
import { publishTransactionCacheMutation } from '../../hooks/firestore/transactionPaginationCache';

const transactionDocument = (id: string, offsetDays: number): FakeDocument => ({
  id,
  data: () => ({
    type: 'expense',
    amount: 1,
    category: 'Otros',
    accountId: 'account-1',
    paid: true,
    description: id,
    date: {
      toDate: () => new Date(Date.UTC(2026, 6, 25 - offsetDays)),
    },
  }),
});

const transactionSnapshot = (docs: FakeDocument[]) => ({ docs });

const findListener = (suffix: string) => {
  const listener = firestoreState.listeners.find(item => item.source.path.endsWith(suffix));
  if (!listener) throw new Error(`No se registró listener para ${suffix}`);
  return listener;
};

const emitCoreSnapshots = (transactionDocs: FakeDocument[]) => {
  findListener('/transactions').next(transactionSnapshot(transactionDocs));
  findListener('/accounts').next(transactionSnapshot([{
    id: 'account-1',
    data: () => ({ name: 'Cuenta', type: 'savings', initialBalance: 0 }),
  }]));
  findListener('/categories').next(transactionSnapshot([{
    id: 'category-1',
    data: () => ({ name: 'Otros', type: 'expense' }),
  }]));
};

beforeEach(() => {
  firestoreState.listeners.length = 0;
  firestoreState.getDocs.mockReset();
});

describe('useFirestoreSubscriptions — paginación', () => {
  it('mantiene el cursor de páginas aunque cambie el snapshot realtime y deduplica solapamientos', async () => {
    const head = Array.from({ length: 500 }, (_, index) => (
      transactionDocument(`head-${index}`, index)
    ));
    const firstOlderPage = Array.from({ length: 500 }, (_, index) => (
      transactionDocument(`older-${index}`, 500 + index)
    ));
    const overlappedDocument = firstOlderPage[10];
    const finalDocument = transactionDocument('older-final', 1_001);

    firestoreState.getDocs
      .mockResolvedValueOnce(transactionSnapshot(firstOlderPage))
      .mockResolvedValueOnce(transactionSnapshot([overlappedDocument, finalDocument]));

    const { result } = renderHook(() => useFirestoreSubscriptions('user-1'));

    act(() => emitCoreSnapshots(head));
    expect(result.current.hasMoreTransactions).toBe(true);

    await act(async () => {
      await result.current.loadMoreTransactions();
    });

    const realtimeRefresh = [
      transactionDocument('head-new', -1),
      ...head.slice(0, 499),
    ];
    act(() => findListener('/transactions').next(transactionSnapshot(realtimeRefresh)));

    // La nueva fila expulsa head-499 del límite realtime. Debe pasar al caché
    // antiguo, no desaparecer del historial combinado.
    expect(result.current.transactions.some(item => item.id === 'head-499')).toBe(true);
    expect(result.current.transactions.filter(item => item.id === 'head-499')).toHaveLength(1);

    await act(async () => {
      await result.current.loadMoreTransactions();
    });

    const secondQuery = firestoreState.getDocs.mock.calls[1][0] as FakeSource;
    const startConstraint = secondQuery.constraints?.find(item => item.type === 'startAfter');
    expect((startConstraint?.cursor as FakeDocument).id).toBe('older-499');
    expect(result.current.transactions.filter(item => item.id === 'older-10')).toHaveLength(1);
    expect(result.current.transactions.some(item => item.id === 'older-final')).toBe(true);
  });

  it('actualiza y elimina elementos antiguos cargados sin que reaparezcan con el snapshot realtime', async () => {
    const head = Array.from({ length: 500 }, (_, index) => (
      transactionDocument(`head-${index}`, index)
    ));
    const olderPage = [
      transactionDocument('old-edit', 501),
      transactionDocument('old-delete', 502),
    ];
    firestoreState.getDocs.mockResolvedValueOnce(transactionSnapshot(olderPage));

    const { result } = renderHook(() => useFirestoreSubscriptions('user-1'));
    act(() => emitCoreSnapshots(head));

    await act(async () => {
      await result.current.loadMoreTransactions();
    });

    const edited: Transaction = {
      id: 'old-edit',
      type: 'expense',
      amount: 99,
      category: 'Otros',
      accountId: 'account-1',
      paid: true,
      description: 'editada',
      date: new Date('2025-01-01'),
    };
    act(() => {
      publishTransactionCacheMutation({
        userId: 'user-1',
        type: 'update',
        transactions: [edited],
      });
      publishTransactionCacheMutation({
        userId: 'user-1',
        type: 'delete',
        transactionIds: ['old-delete'],
      });
      findListener('/transactions').next(transactionSnapshot(head));
    });

    expect(result.current.transactions.find(item => item.id === 'old-edit')).toEqual(edited);
    expect(result.current.transactions.some(item => item.id === 'old-delete')).toBe(false);
  });

  it('incorpora un alta remota histórica cuando todas las páginas ya están cargadas', async () => {
    const head = Array.from({ length: 500 }, (_, index) => (
      transactionDocument(`head-${index}`, index)
    ));
    firestoreState.getDocs.mockResolvedValueOnce(
      transactionSnapshot([transactionDocument('old-last', 501)])
    );

    const { result } = renderHook(() => useFirestoreSubscriptions('user-1'));
    act(() => emitCoreSnapshots(head));

    await act(async () => {
      await result.current.loadMoreTransactions();
    });
    expect(result.current.hasMoreTransactions).toBe(false);

    const remoteHistorical: Transaction = {
      id: 'old-remote',
      type: 'expense',
      amount: 75,
      category: 'Otros',
      accountId: 'account-1',
      paid: true,
      description: 'creada en otro dispositivo',
      date: new Date('2024-01-01'),
    };
    act(() => {
      publishTransactionCacheMutation({
        userId: 'user-1',
        type: 'update',
        transactions: [remoteHistorical],
      });
    });

    expect(result.current.transactions.find(item => item.id === 'old-remote'))
      .toEqual(remoteHistorical);
  });

  it('materializa un alta remota que llegó antes de descubrir el final', async () => {
    const head = Array.from({ length: 500 }, (_, index) => (
      transactionDocument(`head-${index}`, index)
    ));
    const fullOlderPage = Array.from({ length: 500 }, (_, index) => (
      transactionDocument(`older-${index}`, 500 + index)
    ));
    firestoreState.getDocs
      .mockResolvedValueOnce(transactionSnapshot(fullOlderPage))
      .mockResolvedValueOnce(transactionSnapshot([]));

    const { result } = renderHook(() => useFirestoreSubscriptions('user-1'));
    act(() => emitCoreSnapshots(head));
    await act(async () => {
      await result.current.loadMoreTransactions();
    });
    expect(result.current.hasMoreTransactions).toBe(true);

    const crossedCursorAddition: Transaction = {
      id: 'old-crossed-cursor',
      type: 'expense',
      amount: 80,
      category: 'Otros',
      accountId: 'account-1',
      paid: true,
      description: 'alta remota detrás del cursor',
      date: new Date('2020-01-01'),
    };
    act(() => {
      publishTransactionCacheMutation({
        userId: 'user-1',
        type: 'update',
        transactions: [crossedCursorAddition],
      });
    });
    expect(result.current.transactions.some(
      item => item.id === 'old-crossed-cursor'
    )).toBe(false);

    await act(async () => {
      await result.current.loadMoreTransactions();
    });

    expect(result.current.hasMoreTransactions).toBe(false);
    expect(result.current.transactions.find(
      item => item.id === 'old-crossed-cursor'
    )).toEqual(crossedCursorAddition);
  });

  it('propaga el error de carga para que la vista pueda reintentar', async () => {
    const head = Array.from({ length: 500 }, (_, index) => (
      transactionDocument(`head-${index}`, index)
    ));
    firestoreState.getDocs.mockRejectedValueOnce(new Error('Firestore no disponible'));

    const { result } = renderHook(() => useFirestoreSubscriptions('user-1'));
    act(() => emitCoreSnapshots(head));

    await act(async () => {
      await expect(result.current.loadMoreTransactions()).rejects.toThrow(
        'Firestore no disponible'
      );
    });
    expect(result.current.loadingMoreTransactions).toBe(false);
  });
});
