/**
 * Hook CENTRALIZADO para TODAS las subscripciones en tiempo real de Firestore.
 *
 * Consolida 7 colecciones en un solo useEffect:
 * - transactions, accounts, categories (originales)
 * - recurringPayments, debts, budgets, savingsGoals (antes eran listeners separados)
 *
 * Esto reduce de 7 onSnapshot independientes a 1 bloque coordinado,
 * con un solo ciclo de vida y cleanup.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  doc as firestoreDoc,
  startAfter,
  getDocs,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore';
import { db } from '../../lib/firebaseDb';
import { logger } from '../../utils/logger';
import type { Transaction, Account, Category, RecurringPayment, Debt, Budget, SavingsGoal, Notification, NotificationPreferences } from '../../types/finance';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../types/finance';
import {
  applyTransactionCacheMutation,
  mergePaginatedTransactions,
  mergeRealtimeAndCachedTransactions,
  reconcileRealtimeHeadCache,
  subscribeTransactionCacheMutations,
  TRANSACTION_PAGE_SIZE,
} from './transactionPaginationCache';

const PAGE_SIZE = TRANSACTION_PAGE_SIZE;
const MAX_NOTIFICATIONS = 100;
const LOADING_TIMEOUT_MS = 10000;

// Runtime type guards
function isValidTransaction(data: DocumentData): boolean {
  return (
    typeof data.type === 'string' &&
    typeof data.amount === 'number' &&
    typeof data.category === 'string' &&
    typeof data.accountId === 'string'
  );
}

function isValidAccount(data: DocumentData): boolean {
  return (
    typeof data.name === 'string' &&
    typeof data.type === 'string' &&
    typeof data.initialBalance === 'number'
  );
}

function isValidCategory(data: DocumentData): boolean {
  return typeof data.type === 'string' && typeof data.name === 'string';
}

function transactionFromSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): Transaction {
  return {
    id: snapshot.id,
    ...snapshot.data(),
    date: snapshot.data().date?.toDate() || new Date(),
  } as Transaction;
}

export interface FirestoreData {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  transactionBeneficiaries: string[];
  recurringPayments: RecurringPayment[];
  debts: Debt[];
  budgets: Budget[];
  savingsGoals: SavingsGoal[];
  notifications: Notification[];
  notificationPreferences: NotificationPreferences;
  loading: boolean;
  error: Error | null;
  hasMoreTransactions: boolean;
  loadingMoreTransactions: boolean;
  loadMoreTransactions: () => Promise<void>;
  transactionsServerSettled: boolean;
  transactionsUnresolvedReason: 'cache' | 'pending-writes' | 'error' | null;
  transactionsRetrying: boolean;
  retryLoad: () => void;
}

const COLLECTION_NAMES = ['transactions', 'accounts', 'categories', 'recurringPayments', 'debts', 'budgets', 'savingsGoals', 'notifications', 'notificationPreferences'] as const;

export function useFirestoreSubscriptions(userId: string | null): FirestoreData {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactionBeneficiaries, setTransactionBeneficiaries] = useState<string[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);

  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);
  const loadedCollections = useRef<Record<string, boolean>>(
    Object.fromEntries(COLLECTION_NAMES.map(n => [n, false]))
  );

  // Pagination state for transactions
  const [olderTransactions, setOlderTransactions] = useState<Transaction[]>([]);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const hasMoreTransactionsRef = useRef(false);
  const [loadingMoreTransactions, setLoadingMoreTransactions] = useState(false);
  const realtimeTransactionsRef = useRef<Transaction[]>([]);
  const nextPageCursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const paginationStartedRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const paginationGenerationRef = useRef(0);
  const deletedTransactionIdsRef = useRef<Set<string>>(new Set());
  const updatedTransactionsByIdRef = useRef<Map<string, Transaction>>(new Map());
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [transactionsServerSettledForUserId, setTransactionsServerSettledForUserId] = useState<string | null>(null);
  const [transactionsReadiness, setTransactionsReadiness] = useState<{
    userId: string | null;
    reason: 'cache' | 'pending-writes' | 'error' | null;
    retrying: boolean;
  }>({ userId: null, reason: null, retrying: false });

  const transactionsServerSettled = !userId || transactionsServerSettledForUserId === userId;
  const transactionsUnresolvedReason = userId && transactionsReadiness.userId === userId
    ? transactionsReadiness.reason
    : userId ? 'cache' : null;
  const transactionsRetrying = userId !== null
    && transactionsReadiness.userId === userId
    && transactionsReadiness.retrying;

  const retryLoad = useCallback(() => {
    setError(null);
    setLoadedForUserId(null);
    setTransactionsServerSettledForUserId(null);
    setTransactionsReadiness({ userId, reason: 'cache', retrying: true });
    setRetryTrigger(prev => prev + 1);
  }, [userId]);

  useEffect(() => {
    const generation = paginationGenerationRef.current + 1;
    paginationGenerationRef.current = generation;
    isMountedRef.current = true;
    setError(null);
    setOlderTransactions([]);
    setHasMoreTransactions(false);
    hasMoreTransactionsRef.current = false;
    setLoadingMoreTransactions(false);
    realtimeTransactionsRef.current = [];
    nextPageCursorRef.current = null;
    paginationStartedRef.current = false;
    loadingMoreRef.current = false;
    deletedTransactionIdsRef.current.clear();
    updatedTransactionsByIdRef.current.clear();
    setTransactionsServerSettledForUserId(null);
    setTransactionsReadiness({ userId, reason: userId ? 'cache' : null, retrying: false });

    const isActive = () => (
      isMountedRef.current && paginationGenerationRef.current === generation
    );

    const checkAllLoaded = () => {
      // Unblock UI when core collections are ready (transactions, accounts, categories)
      // Secondary collections (debts, budgets, goals, recurring, notifications) load in background
      const { transactions, accounts, categories } = loadedCollections.current;
      if (transactions && accounts && categories) {
        setLoadedForUserId(userId);
      }
    };

    const handleError = (name: string) => (err: Error) => {
      logger.error(`Error en ${name}`, err);
      if (!isActive()) return;
      setError(new Error(`Error al cargar ${name}: ${err.message}`));
      if (name === 'transacciones') {
        setTransactionsServerSettledForUserId(null);
        setTransactionsReadiness({ userId, reason: 'error', retrying: false });
      }
      setLoadedForUserId(userId);
    };

    if (!userId) {
      setTransactions([]);
      setAccounts([]);
      setCategories([]);
      setTransactionBeneficiaries([]);
      setRecurringPayments([]);
      setDebts([]);
      setBudgets([]);
      setSavingsGoals([]);
      setNotifications([]);
      setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
      setLoadedForUserId(null);
      loadedCollections.current = Object.fromEntries(COLLECTION_NAMES.map(n => [n, false]));
      return;
    }

    loadedCollections.current = Object.fromEntries(COLLECTION_NAMES.map(n => [n, false]));
    const unsubscribes: (() => void)[] = [];

    const subscribeQuery = (
      source: Query<DocumentData>,
      name: string,
      onNext: (snapshot: QuerySnapshot<DocumentData>) => void
    ) => {
      unsubscribes.push(onSnapshot(
        source,
        snapshot => {
          if (isActive()) onNext(snapshot);
        },
        handleError(name)
      ));
    };

    const subscribeDocument = (
      source: DocumentReference<DocumentData>,
      name: string,
      onNext: (snapshot: DocumentSnapshot<DocumentData>) => void
    ) => {
      unsubscribes.push(onSnapshot(
        source,
        snapshot => {
          if (isActive()) onNext(snapshot);
        },
        handleError(name)
      ));
    };

    const timeoutId = setTimeout(() => {
      if (!isActive()) return;
      const { transactions, accounts, categories } = loadedCollections.current;
      if (!transactions || !accounts || !categories) {
        logger.warn('Timeout: No se pudieron cargar los datos principales');
        setError(new Error('Tiempo de espera agotado. Verifica tu conexión.'));
        setLoadedForUserId(userId);
      }
    }, LOADING_TIMEOUT_MS);

    const base = `users/${userId}`;

    // 1. Transactions (limited, ordered by date)
    unsubscribes.push(onSnapshot(
      query(collection(db, `${base}/transactions`), orderBy('date', 'desc'), limit(PAGE_SIZE)),
      { includeMetadataChanges: true },
      (snap) => {
        if (!isActive()) return;
        const settledFromServer = !snap.metadata.fromCache && !snap.metadata.hasPendingWrites;
        setTransactionsServerSettledForUserId(settledFromServer ? userId : null);
        setTransactionsReadiness({
          userId,
          reason: settledFromServer
            ? null
            : snap.metadata.fromCache ? 'cache' : 'pending-writes',
          retrying: false,
        });
        const nextTransactions = snap.docs
          .filter(d => isValidTransaction(d.data()))
          .map(transactionFromSnapshot);

        if (paginationStartedRef.current) {
          const previousRealtimeTransactions = realtimeTransactionsRef.current;
          setOlderTransactions(previous => reconcileRealtimeHeadCache(
            previous,
            previousRealtimeTransactions,
            nextTransactions,
            {
              deletedIds: deletedTransactionIdsRef.current,
              updatedById: updatedTransactionsByIdRef.current,
            }
          ));
        }
        realtimeTransactionsRef.current = nextTransactions;
        setTransactions(nextTransactions);

        if (!paginationStartedRef.current) {
          nextPageCursorRef.current = snap.docs.length > 0
            ? snap.docs[snap.docs.length - 1]
            : null;
          const hasMore = snap.docs.length >= PAGE_SIZE;
          hasMoreTransactionsRef.current = hasMore;
          setHasMoreTransactions(hasMore);
        }
        loadedCollections.current.transactions = true;
        checkAllLoaded();
      },
      handleError('transacciones')
    ));

    // 2. Accounts
    subscribeQuery(
      collection(db, `${base}/accounts`),
      'cuentas',
      (snap) => {
        setAccounts(snap.docs
          .filter(d => isValidAccount(d.data()))
          .map(d => ({ id: d.id, ...d.data() })) as Account[]);
        loadedCollections.current.accounts = true;
        checkAllLoaded();
      }
    );

    // 3. Categories
    subscribeQuery(
      collection(db, `${base}/categories`),
      'categorías',
      (snap) => {
        setCategories(snap.docs
          .filter(d => isValidCategory(d.data()))
          .map(d => ({ id: d.id, ...d.data() })) as Category[]);
        loadedCollections.current.categories = true;
        checkAllLoaded();
      }
    );

    // 4. Recurring Payments (ordered by dueDay)
    subscribeDocument(
      firestoreDoc(db, `${base}/settings/beneficiaries`),
      'personas',
      (snap) => {
        const items = snap.exists() && Array.isArray(snap.data().items)
          ? snap.data().items.filter((item: unknown): item is string => typeof item === 'string')
          : [];
        setTransactionBeneficiaries(items);
      }
    );

    // 4. Recurring Payments (ordered by dueDay)
    subscribeQuery(
      query(collection(db, `${base}/recurringPayments`), orderBy('dueDay', 'asc')),
      'pagos recurrentes',
      (snap) => {
        setRecurringPayments(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          lastPaidDate: d.data().lastPaidDate?.toDate() || null,
          createdAt: d.data().createdAt?.toDate() || new Date(),
        })) as RecurringPayment[]);
        loadedCollections.current.recurringPayments = true;
        checkAllLoaded();
      }
    );

    // 5. Debts (ordered by createdAt)
    subscribeQuery(
      query(collection(db, `${base}/debts`), orderBy('createdAt', 'desc')),
      'deudas',
      (snap) => {
        setDebts(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          createdAt: d.data().createdAt?.toDate() || new Date(),
          settledAt: d.data().settledAt?.toDate() || null,
          lentDate: d.data().lentDate?.toDate() || undefined,
          dueDate: d.data().dueDate?.toDate() || undefined,
          nextPaymentDate: d.data().nextPaymentDate?.toDate() || undefined,
        })) as Debt[]);
        loadedCollections.current.debts = true;
        checkAllLoaded();
      }
    );

    // 6. Budgets
    subscribeQuery(
      collection(db, `${base}/budgets`),
      'presupuestos',
      (snap) => {
        setBudgets(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          createdAt: d.data().createdAt?.toDate() || new Date(),
        })) as Budget[]);
        loadedCollections.current.budgets = true;
        checkAllLoaded();
      }
    );

    // 7. Savings Goals (ordered by createdAt)
    subscribeQuery(
      query(collection(db, `${base}/savingsGoals`), orderBy('createdAt', 'desc')),
      'metas de ahorro',
      (snap) => {
        setSavingsGoals(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          targetDate: d.data().targetDate?.toDate() || null,
          createdAt: d.data().createdAt?.toDate() || new Date(),
          completedAt: d.data().completedAt?.toDate() || null,
        })) as SavingsGoal[]);
        loadedCollections.current.savingsGoals = true;
        checkAllLoaded();
      }
    );

    // 8. Notifications (limited, ordered by createdAt)
    subscribeQuery(
      query(collection(db, `${base}/notifications`), orderBy('createdAt', 'desc'), limit(MAX_NOTIFICATIONS)),
      'notificaciones',
      (snap) => {
        setNotifications(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          createdAt: d.data().createdAt?.toDate() || new Date(),
        })) as Notification[]);
        loadedCollections.current.notifications = true;
        checkAllLoaded();
      }
    );

    // 9. Notification Preferences (single document)
    subscribeDocument(
      firestoreDoc(db, `${base}/notificationPreferences/settings`),
      'preferencias de notificaciones',
      (snap) => {
        if (snap.exists()) {
          setNotificationPreferences(snap.data() as NotificationPreferences);
        }
        loadedCollections.current.notificationPreferences = true;
        checkAllLoaded();
      }
    );

    return () => {
      isMountedRef.current = false;
      clearTimeout(timeoutId);
      unsubscribes.forEach(unsub => unsub());
    };
  }, [userId, retryTrigger]);

  const loading = useMemo(() => {
    if (!userId) return false;
    return loadedForUserId !== userId;
  }, [userId, loadedForUserId]);

  useEffect(() => {
    if (!userId) return;

    return subscribeTransactionCacheMutations(mutation => {
      if (mutation.userId !== userId) return;

      if (mutation.type === 'delete') {
        mutation.transactionIds.forEach(id => {
          deletedTransactionIdsRef.current.add(id);
          updatedTransactionsByIdRef.current.delete(id);
        });
      } else {
        mutation.transactions.forEach(transaction => {
          if (!transaction.id) return;
          deletedTransactionIdsRef.current.delete(transaction.id);
          updatedTransactionsByIdRef.current.set(transaction.id, transaction);
        });
      }

      setOlderTransactions(previous => (
        applyTransactionCacheMutation(previous, mutation, {
          // Cuando el usuario ya llegó al final, una alta remota con fecha
          // histórica debe incorporarse aunque su id no estuviera en caché.
          insertMissingUpdates:
            paginationStartedRef.current && !hasMoreTransactionsRef.current,
        })
      ));
    });
  }, [userId]);

  // Load more transactions from Firestore (pagination)
  const loadMoreTransactions = useCallback(async () => {
    const cursor = nextPageCursorRef.current;
    if (!userId || !cursor || loadingMoreRef.current || !hasMoreTransactions) return;

    const generation = paginationGenerationRef.current;
    paginationStartedRef.current = true;
    loadingMoreRef.current = true;
    setLoadingMoreTransactions(true);
    try {
      const base = `users/${userId}`;
      const q = query(
        collection(db, `${base}/transactions`),
        orderBy('date', 'desc'),
        startAfter(cursor),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      if (
        !isMountedRef.current ||
        paginationGenerationRef.current !== generation
      ) return;

      const newTxs = snap.docs
        .filter(d => isValidTransaction(d.data()))
        .map(transactionFromSnapshot);
      const hasMore = snap.docs.length >= PAGE_SIZE;
      setOlderTransactions(previous => {
        const merged = mergePaginatedTransactions(previous, newTxs, {
          deletedIds: deletedTransactionIdsRef.current,
          updatedById: updatedTransactionsByIdRef.current,
        });
        if (hasMore) return merged;

        // Una alta remota puede llegar después de que el cursor ya atravesó su
        // fecha. Al descubrir el final, materializar los updates pendientes que
        // no están en el head evita que esa fila quede omitida hasta recargar.
        const realtimeIds = new Set(
          realtimeTransactionsRef.current
            .map(transaction => transaction.id)
            .filter((id): id is string => Boolean(id))
        );
        const missingHistoricalUpdates = Array.from(
          updatedTransactionsByIdRef.current.values()
        ).filter(transaction => (
          transaction.id ? !realtimeIds.has(transaction.id) : false
        ));
        if (missingHistoricalUpdates.length === 0) return merged;

        return applyTransactionCacheMutation(
          merged,
          {
            userId,
            type: 'update',
            transactions: missingHistoricalUpdates,
          },
          { insertMissingUpdates: true }
        );
      });
      nextPageCursorRef.current = snap.docs.length > 0
        ? snap.docs[snap.docs.length - 1]
        : null;
      hasMoreTransactionsRef.current = hasMore;
      setHasMoreTransactions(hasMore);
    } catch (err) {
      logger.error('Error loading more transactions', err);
      throw err;
    } finally {
      if (
        isMountedRef.current &&
        paginationGenerationRef.current === generation
      ) {
        loadingMoreRef.current = false;
        setLoadingMoreTransactions(false);
      }
    }
  }, [userId, hasMoreTransactions]);

  // Merge real-time transactions with older paginated ones
  const allTransactions = useMemo(
    () => mergeRealtimeAndCachedTransactions(transactions, olderTransactions),
    [transactions, olderTransactions]
  );

  return {
    transactions: allTransactions,
    accounts,
    categories,
    transactionBeneficiaries,
    recurringPayments,
    debts,
    budgets,
    savingsGoals,
    notifications,
    notificationPreferences,
    loading,
    error,
    hasMoreTransactions,
    loadingMoreTransactions,
    loadMoreTransactions,
    transactionsServerSettled,
    transactionsUnresolvedReason,
    transactionsRetrying,
    retryLoad,
  };
}
