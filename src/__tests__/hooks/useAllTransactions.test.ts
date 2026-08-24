import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Transaction } from '../../types/finance';

type FakeDocument = {
  id: string;
  data: () => Record<string, unknown>;
};

type FakeChange = {
  type: 'added' | 'modified' | 'removed';
  doc: FakeDocument;
  oldIndex: number;
  newIndex: number;
};

type FakeSnapshot = {
  docs: FakeDocument[];
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
  docChanges: () => FakeChange[];
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

import {
  useAllTransactions,
  useAllTransactionsWithStatus,
} from '../../hooks/useAllTransactions';
import {
  subscribeTransactionCacheMutations,
  type TransactionCacheMutation,
} from '../../hooks/firestore/transactionPaginationCache';

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: 't1',
  type: 'expense',
  amount: 1000,
  category: 'Comida',
  description: 'x',
  date: new Date('2026-06-01'),
  paid: true,
  accountId: 'acc1',
  ...overrides,
});

function documentFor(transaction: Transaction): FakeDocument {
  const { id, ...data } = transaction;
  if (!id) throw new Error('La prueba requiere una transacción con id');
  return { id, data: () => data };
}

function changeFor(
  type: FakeChange['type'],
  transaction: Transaction,
  oldIndex: number,
  newIndex: number,
): FakeChange {
  return {
    type,
    doc: documentFor(transaction),
    oldIndex,
    newIndex,
  };
}

function emitSnapshot(
  transactions: Transaction[],
  changes: FakeChange[] = [],
  options: {
    fromCache?: boolean;
    hasPendingWrites?: boolean;
    listenerIndex?: number;
  } = {},
) {
  const listener = listeners[options.listenerIndex ?? listeners.length - 1];
  if (!listener) throw new Error('No hay una suscripción activa');

  act(() => {
    listener.next({
      docs: transactions.map(documentFor),
      metadata: {
        fromCache: options.fromCache ?? false,
        hasPendingWrites: options.hasPendingWrites ?? false,
      },
      docChanges: () => changes,
    });
  });
}

describe('useAllTransactions — historial realtime completo', () => {
  beforeEach(() => {
    subscriptionCount = 0;
    unsubscribeCount = 0;
    listeners = [];
  });

  it('crea una sola suscripción completa al montar un usuario autenticado', () => {
    renderHook(() => useAllTransactions('user1', [tx({ id: 't1' })]));
    expect(subscriptionCount).toBe(1);
  });

  it('conserva evidencia de filas inválidas sin exponerlas como transacciones', () => {
    const valid = tx({ id: 'valid' });
    const invalid = documentFor(tx({ id: 'invalid' }));
    const invalidData = invalid.data();
    invalid.data = () => ({ ...invalidData, paid: 'sí' });
    const { result } = renderHook(() => (
      useAllTransactionsWithStatus('user1', [valid])
    ));

    act(() => {
      listeners[0].next({
        docs: [documentFor(valid), invalid],
        metadata: { fromCache: false, hasPendingWrites: false },
        docChanges: () => [],
      });
    });

    expect(result.current.transactions.map(transaction => transaction.id)).toEqual(['valid']);
    expect(result.current.issues).toEqual([
      expect.objectContaining({
        transactionId: 'invalid',
        code: 'invalid-paid',
      }),
    ]);
  });

  it('no se resuscribe por cambios live y conserva como autoridad el snapshot completo', async () => {
    const initial = tx({ id: 't1', amount: 1000 });
    const { result, rerender } = renderHook(
      ({ live }) => useAllTransactions('user1', live),
      { initialProps: { live: [initial] } },
    );
    emitSnapshot([initial]);

    const edited = tx({ id: 't1', amount: 77_777, category: 'Otro' });
    const added = tx({ id: 't2', amount: 2000 });
    rerender({ live: [edited, added] });

    // Una versión paginada obsoleta no puede pisar ni ampliar el snapshot
    // completo ya confirmado por el servidor.
    expect(result.current.find((transaction) => transaction.id === 't1')?.amount).toBe(1000);
    expect(result.current.some((transaction) => transaction.id === 't2')).toBe(false);

    emitSnapshot(
      [edited, added],
      [
        changeFor('modified', edited, 0, 0),
        changeFor('added', added, -1, 1),
      ],
    );

    await waitFor(() => {
      expect(result.current.find((transaction) => transaction.id === 't1')?.amount)
        .toBe(77_777);
      expect(result.current.some((transaction) => transaction.id === 't2')).toBe(true);
    });
    expect(subscriptionCount).toBe(1);
    expect(unsubscribeCount).toBe(0);
  });

  it('incorpora en tiempo real una alta antigua fuera de la ventana live', async () => {
    const recent = tx({ id: 'recent', date: new Date('2026-06-01') });
    const old = tx({ id: 'old', amount: 5000, date: new Date('2024-01-01') });
    const { result } = renderHook(() => useAllTransactions('user1', [recent]));
    emitSnapshot([recent]);

    emitSnapshot(
      [recent, old],
      [changeFor('added', old, -1, 1)],
    );

    await waitFor(() => {
      expect(result.current.find((transaction) => transaction.id === 'old')?.amount)
        .toBe(5000);
    });
    expect(subscriptionCount).toBe(1);
  });

  it('propaga una eliminación remota confirmada a la caché paginada', () => {
    const recent = tx({ id: 'recent', date: new Date('2026-06-01') });
    const old = tx({ id: 'old', date: new Date('2024-01-01') });
    const mutations: TransactionCacheMutation[] = [];
    const unsubscribe = subscribeTransactionCacheMutations((mutation) => {
      mutations.push(mutation);
    });

    try {
      renderHook(() => useAllTransactions('user1', [recent]));
      emitSnapshot([recent, old]);
      emitSnapshot(
        [recent],
        [changeFor('removed', old, 1, -1)],
      );

      expect(mutations).toContainEqual({
        userId: 'user1',
        type: 'delete',
        transactionIds: ['old'],
      });
    } finally {
      unsubscribe();
    }
  });

  it('no propaga una eliminación local todavía pendiente', () => {
    const recent = tx({ id: 'recent', date: new Date('2026-06-01') });
    const old = tx({ id: 'old', date: new Date('2024-01-01') });
    const mutations: TransactionCacheMutation[] = [];
    const unsubscribe = subscribeTransactionCacheMutations((mutation) => {
      mutations.push(mutation);
    });

    try {
      renderHook(() => useAllTransactions('user1', [recent]));
      emitSnapshot([recent, old]);
      emitSnapshot(
        [recent],
        [changeFor('removed', old, 1, -1)],
        { hasPendingWrites: true },
      );

      expect(mutations).toHaveLength(0);
    } finally {
      unsubscribe();
    }
  });

  it('aplica una edición remota de una transacción histórica', async () => {
    const recent = tx({ id: 'recent', date: new Date('2026-06-01') });
    const old = tx({ id: 'old', amount: 5000, date: new Date('2024-01-01') });
    const updatedOld = tx({ ...old, amount: 7500, category: 'Casa' });
    const { result } = renderHook(() => useAllTransactions('user1', [recent]));
    emitSnapshot([recent, old]);

    emitSnapshot(
      [recent, updatedOld],
      [changeFor('modified', updatedOld, 1, 1)],
    );

    await waitFor(() => {
      expect(result.current.find((transaction) => transaction.id === 'old')?.amount)
        .toBe(7500);
    });
    expect(subscriptionCount).toBe(1);
  });

  it('aplica una eliminación remota de una transacción histórica', async () => {
    const recent = tx({ id: 'recent', date: new Date('2026-06-01') });
    const old = tx({ id: 'old', amount: 5000, date: new Date('2024-01-01') });
    const { result } = renderHook(() => useAllTransactions('user1', [recent]));
    emitSnapshot([recent, old]);
    expect(result.current.some((transaction) => transaction.id === 'old')).toBe(true);

    emitSnapshot(
      [recent],
      [changeFor('removed', old, 1, -1)],
    );

    await waitFor(() => {
      expect(result.current.some((transaction) => transaction.id === 'old')).toBe(false);
    });
    expect(subscriptionCount).toBe(1);
  });

  it('aísla el historial y cancela la suscripción al cambiar de usuario', async () => {
    const user1Recent = tx({ id: 'u1-recent' });
    const user1Old = tx({ id: 'u1-private', date: new Date('2024-01-01') });
    const user2Recent = tx({ id: 'u2-recent' });
    const { result, rerender } = renderHook(
      ({ userId, live }) => useAllTransactions(userId, live),
      { initialProps: { userId: 'user1', live: [user1Recent] } },
    );
    emitSnapshot([user1Recent, user1Old]);

    rerender({ userId: 'user2', live: [user2Recent] });
    expect(subscriptionCount).toBe(2);
    expect(unsubscribeCount).toBe(1);
    expect(result.current.map((transaction) => transaction.id)).toEqual(['u2-recent']);

    // Aunque un callback viejo llegara tarde, el guard de la suscripción lo ignora.
    emitSnapshot(
      [user1Recent, user1Old],
      [changeFor('modified', tx({ ...user1Old, amount: 99_999 }), 1, 1)],
      { listenerIndex: 0 },
    );
    emitSnapshot([user2Recent], [], { listenerIndex: 1 });

    await waitFor(() => {
      expect(result.current.map((transaction) => transaction.id)).toEqual(['u2-recent']);
    });
  });

  it('modo invitado no abre una suscripción', async () => {
    const live = [tx({ id: 't1' })];
    const { result } = renderHook(() => useAllTransactions(null, live));
    await Promise.resolve();

    expect(subscriptionCount).toBe(0);
    expect(result.current).toEqual(live);
  });
});
