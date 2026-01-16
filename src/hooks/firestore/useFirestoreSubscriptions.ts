/**
 * Hook para manejar las subscripciones en tiempo real de Firestore
 * Separa la responsabilidad de escuchar cambios de las operaciones CRUD
 * 
 * OPTIMIZACIÓN: Usa Promise.all para iniciar todas las subscripciones en paralelo
 */

import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, limit, getDocs } from 'firebase/firestore';
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
  const [loading, setLoading] = useState(true);
  
  // Ref para evitar actualizaciones de estado después de desmontar
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    
    if (!userId) {
      setTransactions([]);
      setAccounts([]);
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribes: (() => void)[] = [];

    // Configurar subscripciones en paralelo
    const setupSubscriptions = () => {
      // Transacciones - ordenadas por fecha DESC
      const transactionsRef = collection(db, `users/${userId}/transactions`);
      const transactionsQuery = query(transactionsRef, orderBy('date', 'desc'));
      
      const unsubTransactions = onSnapshot(
        transactionsQuery, 
        (snapshot) => {
          if (!isMountedRef.current) return;
          const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            date: doc.data().date?.toDate() || new Date(),
          })) as Transaction[];
          setTransactions(data);
        },
        (error) => console.error('Error en transacciones:', error)
      );
      unsubscribes.push(unsubTransactions);

      // Cuentas
      const accountsRef = collection(db, `users/${userId}/accounts`);
      const unsubAccounts = onSnapshot(
        accountsRef, 
        (snapshot) => {
          if (!isMountedRef.current) return;
          const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Account[];
          setAccounts(data);
        },
        (error) => console.error('Error en cuentas:', error)
      );
      unsubscribes.push(unsubAccounts);

      // Categorías
      const categoriesRef = collection(db, `users/${userId}/categories`);
      const unsubCategories = onSnapshot(
        categoriesRef, 
        (snapshot) => {
          if (!isMountedRef.current) return;
          const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Category[];
          setCategories(data);
          // Marcar como cargado cuando las categorías lleguen (última en configurarse)
          setLoading(false);
        },
        (error) => console.error('Error en categorías:', error)
      );
      unsubscribes.push(unsubCategories);
    };

    setupSubscriptions();

    return () => {
      isMountedRef.current = false;
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
