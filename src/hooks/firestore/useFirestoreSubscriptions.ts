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
import { collection, onSnapshot, query, orderBy, limit, doc as firestoreDoc, DocumentData, startAfter, getDocs, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { logger } from '../../utils/logger';
import type { Transaction, Account, Category, RecurringPayment, Debt, Budget, SavingsGoal, Notification, NotificationPreferences } from '../../types/finance';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../types/finance';

const PAGE_SIZE = 500;
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

export interface FirestoreData {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
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
  retryLoad: () => void;
}

const COLLECTION_NAMES = ['transactions', 'accounts', 'categories', 'recurringPayments', 'debts', 'budgets', 'savingsGoals', 'notifications', 'notificationPreferences'] as const;

export function useFirestoreSubscriptions(userId: string | null): FirestoreData {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
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
  const [loadingMoreTransactions, setLoadingMoreTransactions] = useState(false);
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const retryLoad = useCallback(() => {
    setError(null);
    setLoadedForUserId(null);
    setRetryTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    setError(null);
    setOlderTransactions([]);
    lastDocRef.current = null;

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
      if (!isMountedRef.current) return;
      setError(new Error(`Error al cargar ${name}: ${err.message}`));
      setLoadedForUserId(userId);
    };

    if (!userId) {
      setTransactions([]);
      setAccounts([]);
      setCategories([]);
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

    const timeoutId = setTimeout(() => {
      if (!isMountedRef.current) return;
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
      (snap) => {
        if (!isMountedRef.current) return;
        setTransactions(snap.docs
          .filter(d => isValidTransaction(d.data()))
          .map(d => ({ id: d.id, ...d.data(), date: d.data().date?.toDate() || new Date() })) as Transaction[]);
        // Track last doc for pagination
        lastDocRef.current = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
        setHasMoreTransactions(snap.docs.length >= PAGE_SIZE);
        loadedCollections.current.transactions = true;
        checkAllLoaded();
      },
      handleError('transacciones')
    ));

    // 2. Accounts
    unsubscribes.push(onSnapshot(
      collection(db, `${base}/accounts`),
      (snap) => {
        if (!isMountedRef.current) return;
        setAccounts(snap.docs
          .filter(d => isValidAccount(d.data()))
          .map(d => ({ id: d.id, ...d.data() })) as Account[]);
        loadedCollections.current.accounts = true;
        checkAllLoaded();
      },
      handleError('cuentas')
    ));

    // 3. Categories
    unsubscribes.push(onSnapshot(
      collection(db, `${base}/categories`),
      (snap) => {
        if (!isMountedRef.current) return;
        setCategories(snap.docs
          .filter(d => isValidCategory(d.data()))
          .map(d => ({ id: d.id, ...d.data() })) as Category[]);
        loadedCollections.current.categories = true;
        checkAllLoaded();
      },
      handleError('categorías')
    ));

    // 4. Recurring Payments (ordered by dueDay)
    unsubscribes.push(onSnapshot(
      query(collection(db, `${base}/recurringPayments`), orderBy('dueDay', 'asc')),
      (snap) => {
        if (!isMountedRef.current) return;
        setRecurringPayments(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          lastPaidDate: d.data().lastPaidDate?.toDate() || null,
          createdAt: d.data().createdAt?.toDate() || new Date(),
        })) as RecurringPayment[]);
        loadedCollections.current.recurringPayments = true;
        checkAllLoaded();
      },
      handleError('pagos recurrentes')
    ));

    // 5. Debts (ordered by createdAt)
    unsubscribes.push(onSnapshot(
      query(collection(db, `${base}/debts`), orderBy('createdAt', 'desc')),
      (snap) => {
        if (!isMountedRef.current) return;
        setDebts(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          createdAt: d.data().createdAt?.toDate() || new Date(),
          settledAt: d.data().settledAt?.toDate() || null,
        })) as Debt[]);
        loadedCollections.current.debts = true;
        checkAllLoaded();
      },
      handleError('deudas')
    ));

    // 6. Budgets
    unsubscribes.push(onSnapshot(
      collection(db, `${base}/budgets`),
      (snap) => {
        if (!isMountedRef.current) return;
        setBudgets(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          createdAt: d.data().createdAt?.toDate() || new Date(),
        })) as Budget[]);
        loadedCollections.current.budgets = true;
        checkAllLoaded();
      },
      handleError('presupuestos')
    ));

    // 7. Savings Goals (ordered by createdAt)
    unsubscribes.push(onSnapshot(
      query(collection(db, `${base}/savingsGoals`), orderBy('createdAt', 'desc')),
      (snap) => {
        if (!isMountedRef.current) return;
        setSavingsGoals(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          targetDate: d.data().targetDate?.toDate() || null,
          createdAt: d.data().createdAt?.toDate() || new Date(),
          completedAt: d.data().completedAt?.toDate() || null,
        })) as SavingsGoal[]);
        loadedCollections.current.savingsGoals = true;
        checkAllLoaded();
      },
      handleError('metas de ahorro')
    ));

    // 8. Notifications (limited, ordered by createdAt)
    unsubscribes.push(onSnapshot(
      query(collection(db, `${base}/notifications`), orderBy('createdAt', 'desc'), limit(MAX_NOTIFICATIONS)),
      (snap) => {
        if (!isMountedRef.current) return;
        setNotifications(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          createdAt: d.data().createdAt?.toDate() || new Date(),
        })) as Notification[]);
        loadedCollections.current.notifications = true;
        checkAllLoaded();
      },
      handleError('notificaciones')
    ));

    // 9. Notification Preferences (single document)
    unsubscribes.push(onSnapshot(
      firestoreDoc(db, `${base}/notificationPreferences/settings`),
      (snap) => {
        if (!isMountedRef.current) return;
        if (snap.exists()) {
          setNotificationPreferences(snap.data() as NotificationPreferences);
        }
        loadedCollections.current.notificationPreferences = true;
        checkAllLoaded();
      },
      handleError('preferencias de notificaciones')
    ));

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

  // Load more transactions from Firestore (pagination)
  const loadMoreTransactions = useCallback(async () => {
    if (!userId || !lastDocRef.current || loadingMoreTransactions || !hasMoreTransactions) return;
    setLoadingMoreTransactions(true);
    try {
      const base = `users/${userId}`;
      const q = query(
        collection(db, `${base}/transactions`),
        orderBy('date', 'desc'),
        startAfter(lastDocRef.current),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      if (!isMountedRef.current) return;
      const newTxs = snap.docs
        .filter(d => isValidTransaction(d.data()))
        .map(d => ({ id: d.id, ...d.data(), date: d.data().date?.toDate() || new Date() })) as Transaction[];
      setOlderTransactions(prev => [...prev, ...newTxs]);
      lastDocRef.current = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      setHasMoreTransactions(snap.docs.length >= PAGE_SIZE);
    } catch (err) {
      logger.error('Error loading more transactions', err);
    } finally {
      if (isMountedRef.current) setLoadingMoreTransactions(false);
    }
  }, [userId, loadingMoreTransactions, hasMoreTransactions]);

  // Merge real-time transactions with older paginated ones
  const allTransactions = useMemo(() => {
    if (olderTransactions.length === 0) return transactions;
    // Deduplicate by id (real-time listener may overlap with paginated)
    const ids = new Set(transactions.map(t => t.id));
    const unique = olderTransactions.filter(t => !ids.has(t.id));
    return [...transactions, ...unique];
  }, [transactions, olderTransactions]);

  return { transactions: allTransactions, accounts, categories, recurringPayments, debts, budgets, savingsGoals, notifications, notificationPreferences, loading, error, hasMoreTransactions, loadingMoreTransactions, loadMoreTransactions, retryLoad };
}
