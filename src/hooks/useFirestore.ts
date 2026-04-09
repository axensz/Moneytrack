/**
 * useFirestore — Hook compositor que combina subscripciones + CRUD.
 *
 * Ahora incluye las 7 colecciones centralizadas en useFirestoreSubscriptions.
 */

import {
  useFirestoreSubscriptions,
  useTransactionsCRUD,
  useAccountsCRUD,
  useCategoriesCRUD,
} from './firestore';

export function useFirestore(userId: string | null) {
  const {
    transactions, accounts, categories,
    recurringPayments, debts, budgets, savingsGoals,
    notifications, notificationPreferences,
    loading, error,
    hasMoreTransactions, loadingMoreTransactions, loadMoreTransactions, retryLoad,
  } = useFirestoreSubscriptions(userId);

  const { addTransaction, addCreditPaymentAtomic, deleteTransaction, updateTransaction } =
    useTransactionsCRUD(userId);

  const { addAccount, deleteAccount, updateAccount } = useAccountsCRUD(userId);

  const { addCategory, deleteCategory } = useCategoriesCRUD(userId);

  return {
    // Data (all 7 collections + notifications)
    transactions, accounts, categories,
    recurringPayments, debts, budgets, savingsGoals,
    notifications, notificationPreferences,
    loading, error,
    hasMoreTransactions, loadingMoreTransactions, loadMoreTransactions, retryLoad,
    // Transactions CRUD
    addTransaction, addCreditPaymentAtomic, deleteTransaction, updateTransaction,
    // Accounts CRUD
    addAccount, deleteAccount, updateAccount,
    // Categories CRUD
    addCategory, deleteCategory,
  };
}
