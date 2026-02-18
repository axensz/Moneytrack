'use client';

/**
 * FinanceContext — Contexto de datos financieros derivados
 *
 * PROBLEMA RESUELTO:
 * FinanceTrackerContent pasaba ~14 props a TransactionsView, ~13 a RecurringPaymentsView,
 * ~10 a AccountsView, etc. Esto es prop drilling excesivo que dificulta el mantenimiento.
 *
 * SOLUCIÓN:
 * Un Provider que llama los hooks de alto nivel (useAccounts, useRecurringPayments,
 * useCategories) y expone todos los datos y operaciones financieras vía Context.
 * Los componentes consumen lo que necesitan con useFinance().
 *
 * ARQUITECTURA:
 * FirestoreProvider (datos crudos + CRUD Firestore)
 *   └── FinanceProvider (datos derivados: balances, categorías, pagos recurrentes)
 *         └── Vistas (consumen vía useFinance())
 */

import React, { createContext, useContext } from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { useAccounts } from '../hooks/useAccounts';
import { useRecurringPayments } from '../hooks/useRecurringPayments';
import { useCategories } from '../hooks/useCategories';
import { useDebts } from '../hooks/useDebts';
import { useBudgets } from '../hooks/useBudgets';
import { useSavingsGoals } from '../hooks/useSavingsGoals';
import { formatCurrency } from '../utils/formatters';
import type { Transaction, Account, Categories, RecurringPayment, Debt, Budget, SavingsGoal } from '../types/finance';
import type { BudgetStatus } from '../hooks/useBudgets';
import type { GoalStatus } from '../hooks/useSavingsGoals';

// ─── Tipos ────────────────────────────────────────────────

export interface RecurringStats {
  total: number;
  active: number;
  paidThisMonth: number;
  pendingThisMonth: number;
  totalMonthlyAmount: number;
  totalYearlyAmount: number;
  upcomingPayments: RecurringPayment[];
}

export interface FinanceContextValue {
  // ── Datos ──
  transactions: Transaction[];
  accounts: Account[];
  categories: Categories;
  recurringPayments: RecurringPayment[];
  defaultAccount: Account | null;
  totalBalance: number;

  // ── UI State ──
  hideBalances: boolean;
  setHideBalances: (hide: boolean) => void;

  // ── Loading ──
  transactionsLoading: boolean;
  accountsLoading: boolean;

  // ── Transaction CRUD ──
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
  addCreditPaymentAtomic: (
    creditTx: Omit<Transaction, 'id' | 'createdAt'>,
    sourceTx: Omit<Transaction, 'id' | 'createdAt'>
  ) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;

  // ── Account CRUD ──
  addAccount: (account: Omit<Account, 'id'>) => Promise<void>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  setDefaultAccount: (id: string) => Promise<void>;
  getAccountBalance: (id: string) => number;
  getTransactionCountForAccount: (id: string) => number;

  // ── Category CRUD ──
  addCategory: (type: 'expense' | 'income', name: string) => Promise<void>;
  deleteCategory: (type: 'expense' | 'income', name: string) => Promise<void>;

  // ── Recurring CRUD + Utils ──
  addRecurringPayment: (payment: Omit<RecurringPayment, 'id' | 'createdAt'>) => Promise<void>;
  updateRecurringPayment: (id: string, updates: Partial<RecurringPayment>) => Promise<void>;
  deleteRecurringPayment: (id: string) => Promise<void>;
  isPaidForMonth: (paymentId: string, month?: Date) => boolean;
  getNextDueDate: (payment: RecurringPayment) => Date;
  getDaysUntilDue: (payment: RecurringPayment) => number;
  getPaymentHistory: (paymentId: string, limit?: number) => Transaction[];
  recurringStats: RecurringStats;

  // ── Debts CRUD ──
  debts: Debt[];
  addDebt: (debt: Omit<Debt, 'id' | 'createdAt'>) => Promise<void>;
  updateDebt: (id: string, updates: Partial<Debt>) => Promise<void>;
  deleteDebt: (id: string) => Promise<void>;
  registerDebtPayment: (debtId: string, amount: number) => Promise<void>;
  getDebtTransactions: (debtId: string) => Transaction[];
  debtStats: {
    totalLent: number;
    totalBorrowed: number;
    activeLentCount: number;
    activeBorrowedCount: number;
    settledCount: number;
    totalCount: number;
  };

  // ── Budgets CRUD ──
  budgets: Budget[];
  addBudget: (budget: Omit<Budget, 'id' | 'createdAt'>) => Promise<void>;
  updateBudget: (id: string, updates: Partial<Budget>) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;
  budgetStatuses: BudgetStatus[];
  budgetStats: {
    active: number;
    exceeded: number;
    warning: number;
    totalBudgeted: number;
    totalSpent: number;
  };

  // ── Savings Goals CRUD ──
  savingsGoals: SavingsGoal[];
  addGoal: (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => Promise<void>;
  updateGoal: (id: string, updates: Partial<SavingsGoal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  addSavings: (goalId: string, amount: number) => Promise<void>;
  goalStatuses: GoalStatus[];
  goalStats: {
    activeCount: number;
    completedCount: number;
    totalTarget: number;
    totalSaved: number;
    overallPercentage: number;
  };

  // ── Utilidades ──
  formatCurrency: (amount: number) => string;
}

// ─── Context ──────────────────────────────────────────────

const FinanceContext = createContext<FinanceContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────

interface FinanceProviderProps {
  userId: string | null;
  children: React.ReactNode;
}

export function FinanceProvider({ userId, children }: FinanceProviderProps) {
  // Estado global para ocultar saldos
  const [hideBalances, setHideBalances] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('moneytrack_hide_values');
      return saved === 'true';
    }
    return false;
  });

  // Sincronizar con localStorage
  React.useEffect(() => {
    localStorage.setItem('moneytrack_hide_values', String(hideBalances));
  }, [hideBalances]);

  // 1. Transacciones (base de todo)
  const {
    transactions,
    addTransaction,
    addCreditPaymentAtomic,
    deleteTransaction,
    updateTransaction,
    loading: transactionsLoading,
  } = useTransactions(userId);

  // 2. Cuentas (depende de transactions + deleteTransaction)
  const {
    accounts,
    addAccount,
    updateAccount,
    deleteAccount,
    setDefaultAccount,
    getAccountBalance,
    getTransactionCountForAccount,
    totalBalance,
    defaultAccount,
    loading: accountsLoading,
  } = useAccounts(userId, transactions, deleteTransaction);

  // 3. Pagos recurrentes (depende de transactions)
  const {
    recurringPayments,
    addRecurringPayment,
    updateRecurringPayment,
    deleteRecurringPayment,
    isPaidForMonth,
    getNextDueDate,
    getDaysUntilDue,
    getPaymentHistory,
    stats: recurringStats,
  } = useRecurringPayments(userId, transactions);

  // 4. Categorías (depende de transactions)
  const { categories, addCategory, deleteCategory } = useCategories(transactions, userId);

  // 5. Deudas/Préstamos (depende de transactions)
  const {
    debts,
    addDebt,
    updateDebt,
    deleteDebt,
    registerDebtPayment,
    getDebtTransactions,
    stats: debtStats,
  } = useDebts(userId, transactions);

  // 6. Presupuestos (depende de transactions)
  const {
    budgets,
    addBudget,
    updateBudget,
    deleteBudget,
    budgetStatuses,
    stats: budgetStats,
  } = useBudgets(userId, transactions);

  // 7. Metas de ahorro
  const {
    goals: savingsGoals,
    addGoal,
    updateGoal,
    deleteGoal,
    addSavings,
    goalStatuses,
    stats: goalStats,
  } = useSavingsGoals(userId);

  const value: FinanceContextValue = {
    // Datos
    transactions,
    accounts,
    categories,
    recurringPayments,
    defaultAccount: defaultAccount || null,
    totalBalance,

    // UI State
    hideBalances,
    setHideBalances,

    // Loading
    transactionsLoading,
    accountsLoading,

    // Transaction CRUD
    addTransaction,
    addCreditPaymentAtomic,
    deleteTransaction,
    updateTransaction,

    // Account CRUD
    addAccount,
    updateAccount,
    deleteAccount,
    setDefaultAccount,
    getAccountBalance,
    getTransactionCountForAccount,

    // Category CRUD
    addCategory,
    deleteCategory,

    // Recurring
    addRecurringPayment,
    updateRecurringPayment,
    deleteRecurringPayment,
    isPaidForMonth,
    getNextDueDate,
    getDaysUntilDue,
    getPaymentHistory,
    recurringStats,

    // Debts
    debts,
    addDebt,
    updateDebt,
    deleteDebt,
    registerDebtPayment,
    getDebtTransactions,
    debtStats,

    // Budgets
    budgets,
    addBudget,
    updateBudget,
    deleteBudget,
    budgetStatuses,
    budgetStats,

    // Savings Goals
    savingsGoals,
    addGoal,
    updateGoal,
    deleteGoal,
    addSavings,
    goalStatuses,
    goalStats,

    // Utilidades
    formatCurrency,
  };

  return (
    <FinanceContext.Provider value={value}>
      {children}
    </FinanceContext.Provider>
  );
}

// ─── Hook consumidor ──────────────────────────────────────

/**
 * Hook para consumir datos y operaciones financieras desde el Context.
 * Debe usarse dentro de un <FinanceProvider>.
 */
export function useFinance(): FinanceContextValue {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance debe usarse dentro de un <FinanceProvider>');
  }
  return context;
}
