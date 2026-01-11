import { useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Transaction, Account, Category } from '../types/finance';

export function useFirestore(userId: string | null) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setTransactions([]);
      setAccounts([]);
      setCategories([]);
      setLoading(false);
      return;
    }

    const unsubscribes: (() => void)[] = [];

    // Escuchar transacciones en tiempo real
    const transactionsRef = collection(db, `users/${userId}/transactions`);
    const transactionsQuery = query(transactionsRef, orderBy('date', 'desc'));
    
    const unsubTransactions = onSnapshot(transactionsQuery, (snapshot) => {
      const transactionsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate() || new Date()
      })) as Transaction[];
      setTransactions(transactionsData);
    });
    unsubscribes.push(unsubTransactions);

    // Escuchar cuentas en tiempo real
    const accountsRef = collection(db, `users/${userId}/accounts`);
    const unsubAccounts = onSnapshot(accountsRef, (snapshot) => {
      const accountsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Account[];
      setAccounts(accountsData);
    });
    unsubscribes.push(unsubAccounts);

    // Escuchar categorías en tiempo real
    const categoriesRef = collection(db, `users/${userId}/categories`);
    const unsubCategories = onSnapshot(categoriesRef, (snapshot) => {
      const categoriesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Category[];
      setCategories(categoriesData);
    });
    unsubscribes.push(unsubCategories);

    setLoading(false);

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [userId]);

  // Funciones CRUD para transacciones
  const addTransaction = async (transaction: Omit<Transaction, 'id'>) => {
    if (!userId) return;
    await addDoc(collection(db, `users/${userId}/transactions`), {
      ...transaction,
      createdAt: new Date()
    });
  };

  const deleteTransaction = async (id: string) => {
    if (!userId) return;
    await deleteDoc(doc(db, `users/${userId}/transactions`, id));
  };

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    if (!userId) return;
    await updateDoc(doc(db, `users/${userId}/transactions`, id), updates);
  };

  // Funciones CRUD para cuentas
  const addAccount = async (account: Omit<Account, 'id'>) => {
    if (!userId) return;
    await addDoc(collection(db, `users/${userId}/accounts`), {
      ...account,
      createdAt: new Date()
    });
  };

  const deleteAccount = async (id: string) => {
    if (!userId) return;
    await deleteDoc(doc(db, `users/${userId}/accounts`, id));
  };

  const updateAccount = async (id: string, updates: Partial<Account>) => {
    if (!userId) return;
    await updateDoc(doc(db, `users/${userId}/accounts`, id), updates);
  };

  // Funciones CRUD para categorías
  const addCategory = async (category: Omit<Category, 'id'>) => {
    if (!userId) return;
    await addDoc(collection(db, `users/${userId}/categories`), category);
  };

  const deleteCategory = async (id: string) => {
    if (!userId) return;
    await deleteDoc(doc(db, `users/${userId}/categories`, id));
  };

  return {
    transactions,
    accounts,
    categories,
    loading,
    addTransaction,
    deleteTransaction,
    updateTransaction,
    addAccount,
    deleteAccount,
    updateAccount,
    addCategory,
    deleteCategory
  };
}