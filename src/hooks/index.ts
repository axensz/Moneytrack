/**
 * Barrel exports para todos los hooks de la aplicación
 */

// Auth & User
export { useAuth } from './useAuth';

// Data Management
export { useTransactions } from './useTransactions';
export { useAccounts } from './useAccounts';
export { useCategories } from './useCategories';
export { useRecurringPayments } from './useRecurringPayments';
export { useDebts } from './useDebts';
export { useBudgets } from './useBudgets';
export { useSavingsGoals } from './useSavingsGoals';
export { useCreditCardStatement } from './useCreditCardStatement';
export { useCSVExport } from './useCSVExport';

// UI & Filtering
export { useFilteredData } from './useFilteredData';
export { useAddTransaction } from './useAddTransaction';
export { useGlobalStats } from './useGlobalStats';
export { useLocalStorage } from './useLocalStorage';

// Firebase (low-level)
export { useFirestore } from './useFirestore';
export * from './firestore';
