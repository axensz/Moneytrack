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
import { DEFAULT_RECURRING_TIME_ZONE } from '../utils/recurringPayments';

export function useFirestore(userId: string | null) {
  const {
    transactions, accounts, categories, transactionBeneficiaries,
    recurringPayments, debts, budgets, savingsGoals,
    notifications, recurringNotificationLifecycles, recurringNotificationLifecyclesReady,
    notificationPreferences,
    loading, error,
    hasMoreTransactions, loadingMoreTransactions, loadMoreTransactions,
    transactionsServerSettled, transactionsHeadExhaustive, transactionsUnresolvedReason, transactionsRetrying,
    retryLoad,
  } = useFirestoreSubscriptions(userId);

  const {
    addTransaction,
    addCreditPaymentAtomic,
    addRecurringTransactionAtomic,
    linkRecurringTransactionAtomic,
    restoreTransaction,
    deleteTransaction,
    updateTransaction,
  } =
    useTransactionsCRUD(
      userId,
      accounts,
      notificationPreferences.timeZone ?? DEFAULT_RECURRING_TIME_ZONE,
    );

  const { addAccount, deleteAccount, updateAccount } = useAccountsCRUD(userId);

  const { addCategory, deleteCategory } = useCategoriesCRUD(userId);

  return {
    // Data (all 7 collections + notifications)
    transactions, accounts, categories, transactionBeneficiaries,
    recurringPayments, debts, budgets, savingsGoals,
    notifications, recurringNotificationLifecycles, recurringNotificationLifecyclesReady,
    notificationPreferences,
    loading, error,
    hasMoreTransactions, loadingMoreTransactions, loadMoreTransactions,
    transactionsServerSettled, transactionsHeadExhaustive, transactionsUnresolvedReason, transactionsRetrying,
    retryLoad,
    // Transactions CRUD
    addTransaction,
    addCreditPaymentAtomic,
    addRecurringTransactionAtomic,
    linkRecurringTransactionAtomic,
    restoreTransaction,
    deleteTransaction,
    updateTransaction,
    // Accounts CRUD
    addAccount, deleteAccount, updateAccount,
    // Categories CRUD
    addCategory, deleteCategory,
  };
}
