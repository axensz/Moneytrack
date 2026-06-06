/**
 * Barrel exports para todos los hooks de la aplicación
 */

// Auth & User
export { useAuth } from './useAuth';
export { useGuestMigration } from './useGuestMigration';

// Data Management
export { useTransactions } from './useTransactions';
export { useAccounts } from './useAccounts';
export { useCategories } from './useCategories';
export { useRecurringPayments } from './useRecurringPayments';
export { useDebts } from './useDebts';
export { useBudgets } from './useBudgets';
export { useSavingsGoals } from './useSavingsGoals';
export { useCreditCardStatement } from './useCreditCardStatement';
export { useCreditCardTransactions, mergeCreditTransactions } from './useCreditCardTransactions';
export { useCSVExport } from './useCSVExport';

// UI & Filtering
export { useConfirmDiscard } from './useConfirmDiscard';
export { useViewRouting } from './useViewRouting';
export {
  useTransactionDomain,
  useAccountDomain,
  useCategoryDomain,
  useRecurringDomain,
  useDebtsDomain,
  useBudgetsDomain,
  useGoalsDomain,
} from './useFinanceSelectors';
export { useFilteredData } from './useFilteredData';
export { useAddTransaction } from './useAddTransaction';
export { useGlobalStats } from './useGlobalStats';
export { useLocalStorage } from './useLocalStorage';

// Notifications
export { useNotifications } from './useNotifications';
export { useNotificationStore } from './useNotificationStore';
export { useNotificationPreferences } from './useNotificationPreferences';
export { useNotificationMonitoring } from './useNotificationMonitoring';

// Firebase (low-level)
export { useFirestore } from './useFirestore';
export * from './firestore';
