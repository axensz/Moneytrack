import type { Transaction } from '../../types/finance';
import { ensureDate } from '../../utils/dateUtils';

export const TRANSACTION_PAGE_SIZE = 500;

export type TransactionCacheMutation =
  | {
      userId: string;
      type: 'update';
      transactions: Transaction[];
    }
  | {
      userId: string;
      type: 'delete';
      transactionIds: string[];
    };

export interface TransactionCacheOverlay {
  deletedIds: ReadonlySet<string>;
  updatedById: ReadonlyMap<string, Transaction>;
}

type TransactionCacheMutationListener = (mutation: TransactionCacheMutation) => void;

const mutationListeners = new Set<TransactionCacheMutationListener>();

const normalizeTransaction = (transaction: Transaction): Transaction => ({
  ...transaction,
  date: ensureDate(transaction.date),
});

const sortByDateDescending = (transactions: Transaction[]): Transaction[] => (
  [...transactions].sort(
    (left, right) => ensureDate(right.date).getTime() - ensureDate(left.date).getTime()
  )
);

const transactionsById = (transactions: readonly Transaction[]): Map<string, Transaction> => {
  const byId = new Map<string, Transaction>();
  transactions.forEach(transaction => {
    if (transaction.id) byId.set(transaction.id, transaction);
  });
  return byId;
};

/**
 * Une páginas ya cargadas con una página nueva. La página nueva gana cuando
 * Firestore devuelve un id solapado y el overlay local evita que una respuesta
 * en vuelo reviva una transacción borrada o una versión anterior a una edición.
 */
export function mergePaginatedTransactions(
  existing: readonly Transaction[],
  incoming: readonly Transaction[],
  overlay?: TransactionCacheOverlay
): Transaction[] {
  const byId = transactionsById(existing);
  incoming.forEach(transaction => {
    if (transaction.id) byId.set(transaction.id, transaction);
  });

  overlay?.deletedIds.forEach(id => byId.delete(id));
  overlay?.updatedById.forEach((transaction, id) => {
    if (byId.has(id)) byId.set(id, transaction);
  });

  return sortByDateDescending(Array.from(byId.values()));
}

/**
 * Mantiene continua la frontera entre el head realtime y las páginas antiguas:
 * cuando una entrada nueva expulsa la última fila del límite, esa fila pasa al
 * caché. Las filas que vuelven a entrar al head se retiran del caché para que
 * cada id tenga una sola fuente activa.
 */
export function reconcileRealtimeHeadCache(
  cached: readonly Transaction[],
  previousRealtime: readonly Transaction[],
  nextRealtime: readonly Transaction[],
  overlay?: TransactionCacheOverlay
): Transaction[] {
  const nextIds = new Set(
    nextRealtime
      .map(transaction => transaction.id)
      .filter((id): id is string => Boolean(id))
  );
  const retainedCached = cached.filter(
    transaction => !transaction.id || !nextIds.has(transaction.id)
  );
  const evictedFromHead = previousRealtime.filter(
    transaction => transaction.id && !nextIds.has(transaction.id)
  );

  return mergePaginatedTransactions(retainedCached, evictedFromHead, overlay);
}

/**
 * Aplica una mutación confirmada por el CRUD únicamente sobre elementos que ya
 * estaban en la caché paginada. No adelanta al UI transacciones que el usuario
 * todavía no ha cargado.
 */
export function applyTransactionCacheMutation(
  cached: readonly Transaction[],
  mutation: TransactionCacheMutation,
  options: { insertMissingUpdates?: boolean } = {}
): Transaction[] {
  const byId = transactionsById(cached);

  if (mutation.type === 'delete') {
    mutation.transactionIds.forEach(id => byId.delete(id));
  } else {
    mutation.transactions.forEach(transaction => {
      if (
        transaction.id &&
        (byId.has(transaction.id) || options.insertMissingUpdates)
      ) {
        byId.set(transaction.id, transaction);
      }
    });
  }

  return sortByDateDescending(Array.from(byId.values()));
}

/**
 * El snapshot en tiempo real tiene precedencia sobre la caché antigua. La
 * deduplicación se hace tanto entre ambas fuentes como dentro de cada página.
 */
export function mergeRealtimeAndCachedTransactions(
  realtime: readonly Transaction[],
  cached: readonly Transaction[]
): Transaction[] {
  const byId = transactionsById(cached);
  realtime.forEach(transaction => {
    if (transaction.id) byId.set(transaction.id, transaction);
  });
  return sortByDateDescending(Array.from(byId.values()));
}

export function publishTransactionCacheMutation(mutation: TransactionCacheMutation): void {
  const normalizedMutation = mutation.type === 'update'
    ? {
        ...mutation,
        transactions: mutation.transactions.map(normalizeTransaction),
      }
    : mutation;

  mutationListeners.forEach(listener => {
    try {
      listener(normalizedMutation);
    } catch {
      // La sincronización de caché nunca debe convertir una escritura ya
      // confirmada en un error visible para el usuario.
    }
  });
}

export function subscribeTransactionCacheMutations(
  listener: TransactionCacheMutationListener
): () => void {
  mutationListeners.add(listener);
  return () => mutationListeners.delete(listener);
}
