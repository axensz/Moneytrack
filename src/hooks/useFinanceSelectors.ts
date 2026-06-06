/**
 * S16 — Hooks selectores de dominio sobre FinanceContext.
 *
 * MOTIVACIÓN:
 * useFinance() expone ~50 props. Los componentes que solo necesitan un dominio
 * (Goals, Debts, Budgets) deberían declararlo explícitamente para:
 *   1. Documentar dependencias reales → facilita auditorías y refactors
 *   2. Reducir el API surface visible por componente → menos acoplamiento
 *   3. Preparar migración futura a contextos separados sin romper consumidores:
 *      basta con cambiar el import de useFinance() a un Provider propio
 *      manteniendo el mismo contrato tipado.
 *
 * RENDIMIENTO:
 * Estos hooks comparten el mismo contexto subyacente. El re-render se evita
 * completamente solo si se migra a contextos separados (paso futuro). La
 * ganancia actual es el useMemo del value en FinanceProvider, que elimina
 * re-renders causados por el padre.
 *
 * USO:
 *   // En GoalsView — antes
 *   const { savingsGoals, addGoal, ... } = useFinance();
 *
 *   // Después
 *   const { savingsGoals, addGoal, ... } = useGoalsDomain();
 */

import { useFinance } from '../contexts/FinanceContext';

// ── Transacciones ─────────────────────────────────────────────────────────────

export function useTransactionDomain() {
  const {
    transactions,
    addTransaction,
    addCreditPaymentAtomic,
    deleteTransaction,
    updateTransaction,
    transactionsLoading,
    hasMoreTransactions,
    loadingMoreTransactions,
    loadMoreTransactions,
  } = useFinance();

  return {
    transactions,
    addTransaction,
    addCreditPaymentAtomic,
    deleteTransaction,
    updateTransaction,
    transactionsLoading,
    hasMoreTransactions,
    loadingMoreTransactions,
    loadMoreTransactions,
  } as const;
}

// ── Cuentas ───────────────────────────────────────────────────────────────────

export function useAccountDomain() {
  const {
    accounts,
    addAccount,
    updateAccount,
    deleteAccount,
    mergeCreditCards,
    setDefaultAccount,
    getAccountBalance,
    getTransactionCountForAccount,
    totalBalance,
    defaultAccount,
    accountsLoading,
  } = useFinance();

  return {
    accounts,
    addAccount,
    updateAccount,
    deleteAccount,
    mergeCreditCards,
    setDefaultAccount,
    getAccountBalance,
    getTransactionCountForAccount,
    totalBalance,
    defaultAccount,
    accountsLoading,
  } as const;
}

// ── Categorías ────────────────────────────────────────────────────────────────

export function useCategoryDomain() {
  const { categories, addCategory, deleteCategory } = useFinance();
  return { categories, addCategory, deleteCategory } as const;
}

// ── Pagos Recurrentes ─────────────────────────────────────────────────────────

export function useRecurringDomain() {
  const {
    recurringPayments,
    addRecurringPayment,
    updateRecurringPayment,
    deleteRecurringPayment,
    isPaidForMonth,
    getNextDueDate,
    getDaysUntilDue,
    getPaymentHistory,
    recurringStats,
  } = useFinance();

  return {
    recurringPayments,
    addRecurringPayment,
    updateRecurringPayment,
    deleteRecurringPayment,
    isPaidForMonth,
    getNextDueDate,
    getDaysUntilDue,
    getPaymentHistory,
    recurringStats,
  } as const;
}

// ── Deudas ────────────────────────────────────────────────────────────────────

export function useDebtsDomain() {
  const {
    debts,
    addDebt,
    updateDebt,
    deleteDebt,
    registerDebtPayment,
    modifyDebtBalance,
    getDebtTransactions,
    debtStats,
  } = useFinance();

  return {
    debts,
    addDebt,
    updateDebt,
    deleteDebt,
    registerDebtPayment,
    modifyDebtBalance,
    getDebtTransactions,
    debtStats,
  } as const;
}

// ── Presupuestos ──────────────────────────────────────────────────────────────

export function useBudgetsDomain() {
  const {
    budgets,
    addBudget,
    updateBudget,
    deleteBudget,
    budgetStatuses,
    budgetStats,
  } = useFinance();

  return {
    budgets,
    addBudget,
    updateBudget,
    deleteBudget,
    budgetStatuses,
    budgetStats,
  } as const;
}

// ── Metas de Ahorro ───────────────────────────────────────────────────────────

export function useGoalsDomain() {
  const {
    savingsGoals,
    addGoal,
    updateGoal,
    deleteGoal,
    addSavings,
    goalStatuses,
    goalStats,
  } = useFinance();

  return {
    savingsGoals,
    addGoal,
    updateGoal,
    deleteGoal,
    addSavings,
    goalStatuses,
    goalStats,
  } as const;
}
