/**
 * Hook para manejar las subscripciones en tiempo real de Firestore
 * Separa la responsabilidad de escuchar cambios de las operaciones CRUD
 */

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Transaction, Account, Category } from '../../types/finance';

interface FirestoreData {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  loading: boolean;
}

/**
 * Maneja las subscripciones en tiempo real a las colecciones de Firestore
 */
export function useFirestoreSubscriptions(userId: string | null): FirestoreData {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [internalLoading, setInternalLoading] = useState(true);

  // Track para qué userId hemos cargado los datos
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);

  // Track si cada colección ha cargado al menos una vez
  const [loadedCollections, setLoadedCollections] = useState({
    transactions: false,
    accounts: false,
    categories: false,
  });

  // Loading es true si:
  // 1. internalLoading es true (cargando colecciones)
  // 2. O si el userId actual no coincide con el userId para el que cargamos los datos
  const loading =
    internalLoading || (userId !== null && userId !== loadedForUserId);

  // Marcar como cargado cuando TODAS las colecciones hayan cargado
  useEffect(() => {
    if (
      loadedCollections.transactions &&
      loadedCollections.accounts &&
      loadedCollections.categories
    ) {
      setInternalLoading(false);
      setLoadedForUserId(userId);
    }
  }, [loadedCollections, userId]);

  useEffect(() => {
    if (!userId) {
      setTransactions([]);
      setAccounts([]);
      setCategories([]);
      setLoadedCollections({
        transactions: true,
        accounts: true,
        categories: true,
      });
      setInternalLoading(false);
      setLoadedForUserId(null);
      return;
    }

    // Reset loading state cuando cambia el usuario
    setInternalLoading(true);
    setLoadedCollections({
      transactions: false,
      accounts: false,
      categories: false,
    });

    const unsubscribes: (() => void)[] = [];

    // Escuchar transacciones en tiempo real
    const transactionsRef = collection(db, `users/${userId}/transactions`);
    const transactionsQuery = query(transactionsRef, orderBy('date', 'desc'));

    const unsubTransactions = onSnapshot(transactionsQuery, (snapshot) => {
      const transactionsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate() || new Date(),
      })) as Transaction[];
      setTransactions(transactionsData);
      setLoadedCollections((prev) => ({ ...prev, transactions: true }));
    });
    unsubscribes.push(unsubTransactions);

    // Escuchar cuentas en tiempo real
    const accountsRef = collection(db, `users/${userId}/accounts`);
    const unsubAccounts = onSnapshot(accountsRef, (snapshot) => {
      const accountsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Account[];
      setAccounts(accountsData);
      setLoadedCollections((prev) => ({ ...prev, accounts: true }));
    });
    unsubscribes.push(unsubAccounts);

    // Escuchar categorías en tiempo real
    const categoriesRef = collection(db, `users/${userId}/categories`);
    const unsubCategories = onSnapshot(categoriesRef, (snapshot) => {
      const categoriesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Category[];
      setCategories(categoriesData);
      setLoadedCollections((prev) => ({ ...prev, categories: true }));
    });
    unsubscribes.push(unsubCategories);

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [userId]);

  return {
    transactions,
    accounts,
    categories,
    loading,
  };
}
