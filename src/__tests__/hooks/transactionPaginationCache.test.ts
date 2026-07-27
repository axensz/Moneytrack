import { describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../../types/finance';
import {
  applyTransactionCacheMutation,
  mergePaginatedTransactions,
  mergeRealtimeAndCachedTransactions,
  publishTransactionCacheMutation,
  reconcileRealtimeHeadCache,
  subscribeTransactionCacheMutations,
} from '../../hooks/firestore/transactionPaginationCache';

const transaction = (
  id: string,
  date: string,
  description = id
): Transaction => ({
  id,
  type: 'expense',
  amount: 1,
  category: 'Otros',
  accountId: 'account-1',
  paid: true,
  date: new Date(date),
  description,
});

describe('transactionPaginationCache', () => {
  it('deduplica ids entre páginas y conserva la versión más reciente', () => {
    const result = mergePaginatedTransactions(
      [
        transaction('tx-1', '2026-07-03', 'anterior'),
        transaction('tx-2', '2026-07-02'),
      ],
      [
        transaction('tx-1', '2026-07-03', 'refrescada'),
        transaction('tx-3', '2026-07-01'),
        transaction('tx-3', '2026-07-01', 'última copia'),
      ]
    );

    expect(result.map(item => item.id)).toEqual(['tx-1', 'tx-2', 'tx-3']);
    expect(result.find(item => item.id === 'tx-1')?.description).toBe('refrescada');
    expect(result.find(item => item.id === 'tx-3')?.description).toBe('última copia');
  });

  it('aplica el overlay local sobre una página stale en vuelo', () => {
    const updated = transaction('tx-edit', '2026-07-04', 'editada');
    const result = mergePaginatedTransactions(
      [transaction('tx-keep', '2026-07-03')],
      [
        transaction('tx-edit', '2026-07-02', 'stale'),
        transaction('tx-delete', '2026-07-01'),
      ],
      {
        deletedIds: new Set(['tx-delete']),
        updatedById: new Map([['tx-edit', updated]]),
      }
    );

    expect(result.map(item => item.id)).toEqual(['tx-edit', 'tx-keep']);
    expect(result[0].description).toBe('editada');
  });

  it('actualiza o elimina solo elementos ya cargados en la caché', () => {
    const cached = [
      transaction('tx-edit', '2026-07-02', 'anterior'),
      transaction('tx-delete', '2026-07-01'),
    ];

    const updated = applyTransactionCacheMutation(cached, {
      userId: 'user-1',
      type: 'update',
      transactions: [
        transaction('tx-edit', '2026-07-02', 'editada'),
        transaction('tx-not-loaded', '2026-06-01'),
      ],
    });
    expect(updated.map(item => item.id)).toEqual(['tx-edit', 'tx-delete']);
    expect(updated[0].description).toBe('editada');

    const deleted = applyTransactionCacheMutation(updated, {
      userId: 'user-1',
      type: 'delete',
      transactionIds: ['tx-delete'],
    });
    expect(deleted.map(item => item.id)).toEqual(['tx-edit']);
  });

  it('puede insertar una alta remota cuando la paginación ya llegó al final', () => {
    const remote = transaction('tx-remote', '2026-06-01');
    const result = applyTransactionCacheMutation(
      [transaction('tx-loaded', '2026-07-01')],
      {
        userId: 'user-1',
        type: 'update',
        transactions: [remote],
      },
      { insertMissingUpdates: true }
    );

    expect(result.map(item => item.id)).toEqual(['tx-loaded', 'tx-remote']);
  });

  it('da precedencia al snapshot realtime sin repetir ids', () => {
    const result = mergeRealtimeAndCachedTransactions(
      [transaction('tx-shared', '2026-07-04', 'realtime')],
      [
        transaction('tx-shared', '2026-07-03', 'cached'),
        transaction('tx-old', '2026-07-01'),
        transaction('tx-old', '2026-07-01', 'duplicada'),
      ]
    );

    expect(result.map(item => item.id)).toEqual(['tx-shared', 'tx-old']);
    expect(result[0].description).toBe('realtime');
  });

  it('transfiere al caché la fila expulsada del head y retira las que regresan', () => {
    const result = reconcileRealtimeHeadCache(
      [
        transaction('tx-old', '2026-07-01'),
        transaction('tx-back-in-head', '2026-07-03', 'cached'),
      ],
      [
        transaction('tx-head', '2026-07-05'),
        transaction('tx-evicted', '2026-07-02'),
      ],
      [
        transaction('tx-new', '2026-07-06'),
        transaction('tx-head', '2026-07-05'),
        transaction('tx-back-in-head', '2026-07-03', 'realtime'),
      ]
    );

    expect(result.map(item => item.id)).toEqual(['tx-evicted', 'tx-old']);
  });

  it('publica mutaciones normalizadas y permite cancelar la suscripción', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTransactionCacheMutations(listener);

    publishTransactionCacheMutation({
      userId: 'user-1',
      type: 'update',
      transactions: [
        {
          ...transaction('tx-1', '2026-07-01'),
          date: { toDate: () => new Date('2026-07-05') } as unknown as Date,
        },
      ],
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].transactions[0].date).toEqual(new Date('2026-07-05'));

    unsubscribe();
    publishTransactionCacheMutation({
      userId: 'user-1',
      type: 'delete',
      transactionIds: ['tx-1'],
    });
    expect(listener).toHaveBeenCalledOnce();
  });
});
