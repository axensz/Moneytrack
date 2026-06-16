/**
 * S16 / Q-context — Hooks selectores de dominio sobre el store de FinanceContext.
 *
 * Cada hook se suscribe SOLO a su slice vía `useStoreSelector` (igualdad shallow):
 * un componente que usa `useGoalsDomain()` NO se re-renderiza cuando cambian
 * `debts` o `transactions` — solo cuando cambia su propio dominio. Esto es lo que
 * el contexto monolítico previo no podía dar (todo cambio re-renderizaba a todos).
 *
 * Los selectores se definen a nivel de módulo (referencias estables). Los campos
 * de cada slice (arrays, stats y callbacks de los hooks) ya son referencias
 * estables, así que `shallowEqual` hace bail-out cuando otro dominio cambia.
 *
 * USO:
 *   const { savingsGoals, addGoal } = useGoalsDomain();
 */

import { useFinanceStore, type FinanceContextValue } from '../contexts/FinanceContext';
import { useStoreSelector } from '../contexts/financeStore';

// ── Utilidad transversal ───────────────────────────────────────────────────────

const selectFormatCurrency = (s: FinanceContextValue) => s.formatCurrency;

/** Solo el formateador de moneda (referencia estable). */
export function useFormatCurrency() {
  return useStoreSelector(useFinanceStore(), selectFormatCurrency, Object.is);
}

// ── Transacciones ─────────────────────────────────────────────────────────────

const selectTransactionDomain = (s: FinanceContextValue) => ({
  // Ventana PAGINADA (500 recientes): para listar/filtrar transacciones. NO
  // derivar saldos de aquí — usar los accesores del store (getAccountBalance,
  // getCreditUsed) o balanceTransactions (historial completo). Ver #4a/#11.
  transactions: s.transactions,
  addTransaction: s.addTransaction,
  addCreditPaymentAtomic: s.addCreditPaymentAtomic,
  deleteTransaction: s.deleteTransaction,
  updateTransaction: s.updateTransaction,
  transactionsLoading: s.transactionsLoading,
  hasMoreTransactions: s.hasMoreTransactions,
  loadingMoreTransactions: s.loadingMoreTransactions,
  loadMoreTransactions: s.loadMoreTransactions,
  balanceTransactions: s.balanceTransactions,
}) as const;

export function useTransactionDomain() {
  return useStoreSelector(useFinanceStore(), selectTransactionDomain);
}

// ── Cuentas ───────────────────────────────────────────────────────────────────

const selectAccountDomain = (s: FinanceContextValue) => ({
  accounts: s.accounts,
  addAccount: s.addAccount,
  updateAccount: s.updateAccount,
  deleteAccount: s.deleteAccount,
  mergeCreditCards: s.mergeCreditCards,
  setDefaultAccount: s.setDefaultAccount,
  getAccountBalance: s.getAccountBalance,
  getCreditUsed: s.getCreditUsed,
  getTransactionCountForAccount: s.getTransactionCountForAccount,
  totalBalance: s.totalBalance,
  balancesReady: s.balancesReady,
  defaultAccount: s.defaultAccount,
  accountsLoading: s.accountsLoading,
}) as const;

export function useAccountDomain() {
  return useStoreSelector(useFinanceStore(), selectAccountDomain);
}

// ── Categorías ────────────────────────────────────────────────────────────────

const selectCategoryDomain = (s: FinanceContextValue) => ({
  categories: s.categories,
  addCategory: s.addCategory,
  deleteCategory: s.deleteCategory,
}) as const;

export function useCategoryDomain() {
  return useStoreSelector(useFinanceStore(), selectCategoryDomain);
}

// ── Pagos Recurrentes ─────────────────────────────────────────────────────────

const selectRecurringDomain = (s: FinanceContextValue) => ({
  recurringPayments: s.recurringPayments,
  addRecurringPayment: s.addRecurringPayment,
  updateRecurringPayment: s.updateRecurringPayment,
  deleteRecurringPayment: s.deleteRecurringPayment,
  isPaidForMonth: s.isPaidForMonth,
  getNextDueDate: s.getNextDueDate,
  getDaysUntilDue: s.getDaysUntilDue,
  getDaysOverdue: s.getDaysOverdue,
  getPaymentHistory: s.getPaymentHistory,
  recurringStats: s.recurringStats,
}) as const;

export function useRecurringDomain() {
  return useStoreSelector(useFinanceStore(), selectRecurringDomain);
}

// ── Deudas ────────────────────────────────────────────────────────────────────

const selectDebtsDomain = (s: FinanceContextValue) => ({
  debts: s.debts,
  addDebt: s.addDebt,
  updateDebt: s.updateDebt,
  deleteDebt: s.deleteDebt,
  registerDebtPayment: s.registerDebtPayment,
  modifyDebtBalance: s.modifyDebtBalance,
  getDebtTransactions: s.getDebtTransactions,
  debtStats: s.debtStats,
}) as const;

export function useDebtsDomain() {
  return useStoreSelector(useFinanceStore(), selectDebtsDomain);
}

// ── Presupuestos ──────────────────────────────────────────────────────────────

const selectBudgetsDomain = (s: FinanceContextValue) => ({
  budgets: s.budgets,
  addBudget: s.addBudget,
  updateBudget: s.updateBudget,
  deleteBudget: s.deleteBudget,
  budgetStatuses: s.budgetStatuses,
  budgetStats: s.budgetStats,
}) as const;

export function useBudgetsDomain() {
  return useStoreSelector(useFinanceStore(), selectBudgetsDomain);
}

// ── Metas de Ahorro ───────────────────────────────────────────────────────────

const selectGoalsDomain = (s: FinanceContextValue) => ({
  savingsGoals: s.savingsGoals,
  addGoal: s.addGoal,
  updateGoal: s.updateGoal,
  deleteGoal: s.deleteGoal,
  addSavings: s.addSavings,
  goalStatuses: s.goalStatuses,
  goalStats: s.goalStats,
}) as const;

export function useGoalsDomain() {
  return useStoreSelector(useFinanceStore(), selectGoalsDomain);
}
