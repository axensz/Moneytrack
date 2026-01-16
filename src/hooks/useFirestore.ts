/**
 * 🆕 REFACTORED: useFirestore
 *
 * Hook compositor que combina los módulos de Firestore especializados.
 * Mantiene la misma API pública para compatibilidad.
 *
 * ARQUITECTURA:
 * - useFirestoreSubscriptions: Listeners en tiempo real
 * - useTransactionsCRUD: CRUD de transacciones (+ atomicidad)
 * - useAccountsCRUD: CRUD de cuentas
 * - useCategoriesCRUD: CRUD de categorías
 */

import {
  useFirestoreSubscriptions,
  useTransactionsCRUD,
  useAccountsCRUD,
  useCategoriesCRUD,
} from './firestore';

export function useFirestore(userId: string | null) {
  // Datos y subscripciones
  const { transactions, accounts, categories, loading, error } =
    useFirestoreSubscriptions(userId);

  // Operaciones CRUD
  const { addTransaction, deleteTransaction, updateTransaction } =
    useTransactionsCRUD(userId);

  const { addAccount, deleteAccount, updateAccount } = useAccountsCRUD(userId);

  const { addCategory, deleteCategory } = useCategoriesCRUD(userId);

  return {
    // Data
    transactions,
    accounts,
    categories,
    loading,
    error,
    // Transactions CRUD
    addTransaction,
    deleteTransaction,
    updateTransaction,
    // Accounts CRUD
    addAccount,
    deleteAccount,
    updateAccount,
    // Categories CRUD
    addCategory,
    deleteCategory,
  };
}
