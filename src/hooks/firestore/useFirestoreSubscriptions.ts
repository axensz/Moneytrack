/**
 * Hook para manejar las subscripciones en tiempo real de Firestore
 * Separa la responsabilidad de escuchar cambios de las operaciones CRUD
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, DocumentData } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { logger } from '../../utils/logger';
import type { Transaction, Account, Category } from '../../types/finance';

// Timeout para la carga inicial (10 segundos)
const LOADING_TIMEOUT_MS = 10000;

// -- Runtime type guards para datos de Firestore --
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
  return (
    typeof data.type === 'string' &&
    typeof data.name === 'string'
  );
}

interface FirestoreData {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  loading: boolean;
  error: Error | null;
}

/**
 * Maneja las subscripciones en tiempo real a las colecciones de Firestore
 */
export function useFirestoreSubscriptions(userId: string | null): FirestoreData {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Guardar el userId para el cual tenemos datos cargados
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);

  // Estado de error
  const [error, setError] = useState<Error | null>(null);

  // Ref para evitar actualizaciones de estado después de desmontar
  const isMountedRef = useRef(true);

  // Ref para trackear qué colecciones ya recibieron su primera respuesta
  const loadedCollections = useRef({ transactions: false, accounts: false, categories: false });

  useEffect(() => {
    isMountedRef.current = true;
    setError(null);

    // Helper para verificar si todas las colecciones cargaron
    const checkAllLoaded = () => {
      const { transactions, accounts, categories } = loadedCollections.current;
      if (transactions && accounts && categories) {
        setLoadedForUserId(userId);
      }
    };

    // Helper para manejar errores de Firestore
    const handleError = (collectionName: string) => (err: Error) => {
      logger.error(`Error en ${collectionName}`, err);
      if (!isMountedRef.current) return;
      setError(new Error(`Error al cargar ${collectionName}: ${err.message}`));
      // Marcar como cargado para evitar loading infinito
      setLoadedForUserId(userId);
    };

    if (!userId) {
      setTransactions([]);
      setAccounts([]);
      setCategories([]);
      setLoadedForUserId(null);
      loadedCollections.current = { transactions: false, accounts: false, categories: false };
      return;
    }

    // Resetear estado de carga para el nuevo usuario
    loadedCollections.current = { transactions: false, accounts: false, categories: false };

    const unsubscribes: (() => void)[] = [];

    // Timeout para evitar loading infinito
    const timeoutId = setTimeout(() => {
      if (!isMountedRef.current) return;
      const { transactions, accounts, categories } = loadedCollections.current;
      if (!transactions || !accounts || !categories) {
        logger.warn('Timeout: No se pudieron cargar todos los datos de Firestore');
        setError(new Error('Tiempo de espera agotado. Verifica tu conexión a internet.'));
        setLoadedForUserId(userId); // Terminar loading
      }
    }, LOADING_TIMEOUT_MS);

    // Configurar subscripciones en paralelo
    const setupSubscriptions = () => {
      // Transacciones - ordenadas por fecha DESC
      const transactionsRef = collection(db, `users/${userId}/transactions`);
      const transactionsQuery = query(transactionsRef, orderBy('date', 'desc'));

      const unsubTransactions = onSnapshot(
        transactionsQuery,
        (snapshot) => {
          if (!isMountedRef.current) return;
          const data = snapshot.docs
            .filter((doc) => {
              if (!isValidTransaction(doc.data())) {
                logger.warn('Skipping invalid transaction document', { id: doc.id });
                return false;
              }
              return true;
            })
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
              date: doc.data().date?.toDate() || new Date(),
            })) as Transaction[];
          setTransactions(data);
          loadedCollections.current.transactions = true;
          checkAllLoaded();
        },
        handleError('transacciones')
      );
      unsubscribes.push(unsubTransactions);

      // Cuentas
      const accountsRef = collection(db, `users/${userId}/accounts`);
      const unsubAccounts = onSnapshot(
        accountsRef,
        (snapshot) => {
          if (!isMountedRef.current) return;
          const data = snapshot.docs
            .filter((doc) => {
              if (!isValidAccount(doc.data())) {
                logger.warn('Skipping invalid account document', { id: doc.id });
                return false;
              }
              return true;
            })
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as Account[];
          setAccounts(data);
          loadedCollections.current.accounts = true;
          checkAllLoaded();
        },
        handleError('cuentas')
      );
      unsubscribes.push(unsubAccounts);

      // Categorías
      const categoriesRef = collection(db, `users/${userId}/categories`);
      const unsubCategories = onSnapshot(
        categoriesRef,
        (snapshot) => {
          if (!isMountedRef.current) return;
          const data = snapshot.docs
            .filter((doc) => {
              if (!isValidCategory(doc.data())) {
                logger.warn('Skipping invalid category document', { id: doc.id });
                return false;
              }
              return true;
            })
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as Category[];
          setCategories(data);
          loadedCollections.current.categories = true;
          checkAllLoaded();
        },
        handleError('categorías')
      );
      unsubscribes.push(unsubCategories);
    };

    setupSubscriptions();

    return () => {
      isMountedRef.current = false;
      clearTimeout(timeoutId);
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [userId]);

  // Loading es true si:
  // 1. Hay un userId (usuario autenticado) Y
  // 2. Los datos cargados no corresponden al userId actual
  const loading = useMemo(() => {
    if (!userId) return false; // Sin usuario = sin carga
    return loadedForUserId !== userId; // Cargando si no coincide
  }, [userId, loadedForUserId]);

  return {
    transactions,
    accounts,
    categories,
    loading,
    error,
  };
}
