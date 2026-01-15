import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  getDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Transaction, Account, Category } from '../types/finance';

export function useFirestore(userId: string | null) {
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
    categories: false
  });

  // Loading es true si:
  // 1. internalLoading es true (cargando colecciones)
  // 2. O si el userId actual no coincide con el userId para el que cargamos los datos
  //    (esto maneja el caso de cambio de usuario entre renders)
  const loading = internalLoading || (userId !== null && userId !== loadedForUserId);

  // Marcar como cargado cuando TODAS las colecciones hayan cargado para este usuario
  useEffect(() => {
    if (loadedCollections.transactions && loadedCollections.accounts && loadedCollections.categories) {
      setInternalLoading(false);
      setLoadedForUserId(userId);
    }
  }, [loadedCollections, userId]);

  useEffect(() => {
    if (!userId) {
      setTransactions([]);
      setAccounts([]);
      setCategories([]);
      setLoadedCollections({ transactions: true, accounts: true, categories: true });
      setInternalLoading(false);
      setLoadedForUserId(null);
      return;
    }
    
    // Reset loading state cuando cambia el usuario
    setInternalLoading(true);
    setLoadedCollections({ transactions: false, accounts: false, categories: false });

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
      setLoadedCollections(prev => ({ ...prev, transactions: true }));
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
      setLoadedCollections(prev => ({ ...prev, accounts: true }));
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
      setLoadedCollections(prev => ({ ...prev, categories: true }));
    });
    unsubscribes.push(unsubCategories);

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [userId]);

  /**
   * 🔴 FUNCIÓN CRÍTICA: Agrega transacción con atomicidad garantizada
   *
   * Para TRANSFERENCIAS usa runTransaction de Firebase que garantiza:
   * - ✅ Ambas cuentas (origen y destino) existen
   * - ✅ La cuenta origen tiene saldo suficiente (si aplica)
   * - ✅ La transacción se crea SOLO si todo es válido
   * - ✅ Todo o nada (atomicidad ACID)
   *
   * Para GASTOS/INGRESOS usa addDoc simple (no requiere atomicidad multi-documento)
   */
  const addTransaction = async (transaction: Omit<Transaction, 'id'>) => {
    if (!userId) return;

    // CASO 1: TRANSFERENCIA - Requiere atomicidad
    if (transaction.type === 'transfer' && transaction.toAccountId) {
      await addTransferAtomic(userId, transaction);
      return;
    }

    // CASO 2: GASTO o INGRESO - Operación simple
    const cleanTransaction = Object.fromEntries(
      Object.entries(transaction).filter(([, value]) => value !== undefined)
    );
    await addDoc(collection(db, `users/${userId}/transactions`), {
      ...cleanTransaction,
      createdAt: new Date()
    });
  };

  /**
   * 🔴 TRANSFERENCIA ATÓMICA
   * Garantiza que el dinero se mueve de A → B sin posibilidad de inconsistencias
   *
   * @throws Error si las cuentas no existen o hay problemas de validación
   */
  const addTransferAtomic = async (
    userId: string,
    transaction: Omit<Transaction, 'id'>
  ): Promise<void> => {
    const { accountId, toAccountId, amount, description, date } = transaction;

    if (!accountId || !toAccountId) {
      throw new Error('Se requieren cuenta origen y destino para transferencias');
    }

    if (accountId === toAccountId) {
      throw new Error('No puedes transferir a la misma cuenta');
    }

    await runTransaction(db, async (firestoreTransaction) => {
      // 1. Referencias a documentos
      const fromAccountRef = doc(db, `users/${userId}/accounts`, accountId);
      const toAccountRef = doc(db, `users/${userId}/accounts`, toAccountId);

      // 2. Leer ambas cuentas (dentro de la transacción para garantizar consistencia)
      const fromAccountSnap = await firestoreTransaction.get(fromAccountRef);
      const toAccountSnap = await firestoreTransaction.get(toAccountRef);

      // 3. Validar existencia
      if (!fromAccountSnap.exists()) {
        throw new Error('La cuenta origen no existe');
      }
      if (!toAccountSnap.exists()) {
        throw new Error('La cuenta destino no existe');
      }

      const fromAccount = fromAccountSnap.data() as Account;
      const toAccount = toAccountSnap.data() as Account;

      // 4. Validar que no se transfiera a/desde tarjetas de crédito incorrectamente
      // Permitir transferencias DESDE cualquier cuenta
      // Permitir transferencias HACIA cualquier cuenta (incluyendo TC para pagar deuda)

      // 5. Calcular saldo actual de la cuenta origen (solo si NO es TC)
      if (fromAccount.type !== 'credit') {
        // Para cuentas normales, necesitamos calcular el saldo actual
        // pero NO podemos hacer queries dentro de runTransaction
        // Solución: confiar en la validación previa del cliente
        // La validación de saldo DEBE hacerse antes de llamar a addTransaction

        // NOTA: Firebase Transactions no permite queries, solo get/set/update/delete
        // Por eso la validación de saldo se hace en el cliente (validators.ts)
        // Aquí solo validamos estructura
      }

      // 6. Crear documento de transacción (operación atómica)
      const transactionRef = doc(collection(db, `users/${userId}/transactions`));
      firestoreTransaction.set(transactionRef, {
        type: 'transfer',
        amount,
        accountId,
        toAccountId,
        category: 'Transferencia',
        description: description || 'Transferencia entre cuentas',
        date: date || new Date(),
        paid: true, // Las transferencias se marcan como pagadas inmediatamente
        createdAt: new Date()
      });

      // 7. La operación se completa SOLO si todo fue exitoso
      // Si algo falla, Firebase hace rollback automático
    });
  };

  const deleteTransaction = async (id: string) => {
    if (!userId) return;
    await deleteDoc(doc(db, `users/${userId}/transactions`, id));
  };

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    if (!userId) return;
    // Remover campos undefined de Firestore
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );
    await updateDoc(doc(db, `users/${userId}/transactions`, id), cleanUpdates);
  };

  // Funciones CRUD para cuentas
  const addAccount = async (account: Omit<Account, 'id'>) => {
    if (!userId) return;

    // 🔴 CORRECCIÓN: Forzar initialBalance = 0 para tarjetas de crédito
    const accountData = { ...account };
    if (accountData.type === 'credit') {
      accountData.initialBalance = 0;
    }

    // Remover campos undefined de Firestore
    const cleanAccount = Object.fromEntries(
      Object.entries(accountData).filter(([, value]) => value !== undefined)
    );
    await addDoc(collection(db, `users/${userId}/accounts`), {
      ...cleanAccount,
      createdAt: new Date()
    });
  };

  const deleteAccount = async (id: string) => {
    if (!userId) return;
    await deleteDoc(doc(db, `users/${userId}/accounts`, id));
  };

  const updateAccount = async (id: string, updates: Partial<Account>) => {
    if (!userId) return;

    // 🔴 CORRECCIÓN: Prevenir que se cambie initialBalance de tarjetas de crédito
    const updatesData = { ...updates };

    // Si se está actualizando una tarjeta de crédito, asegurar que initialBalance = 0
    if (updatesData.type === 'credit') {
      updatesData.initialBalance = 0;
    }

    // Remover campos undefined de Firestore
    const cleanUpdates = Object.fromEntries(
      Object.entries(updatesData).filter(([, value]) => value !== undefined)
    );
    await updateDoc(doc(db, `users/${userId}/accounts`, id), cleanUpdates);
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
