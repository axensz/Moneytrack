export interface Transaction {
  id?: string; // Firestore usa string IDs
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category: string;
  description: string;
  date: Date;
  paid: boolean;
  accountId: string; // Cambio a string
  toAccountId?: string; // Cambio a string
  createdAt?: Date;

  // 🆕 Campos para manejo de intereses en TC
  hasInterest?: boolean; // Si la compra genera intereses
  installments?: number; // Número de cuotas (1, 3, 6, 12, 24, 36)
  monthlyInstallmentAmount?: number; // Cuota mensual calculada (guardada)
  totalInterestAmount?: number; // Total de intereses calculados (guardada)
  interestRate?: number; // Tasa E.A. usada en el momento de la compra (snapshot)
}

export interface Account {
  id?: string; // Firestore usa string IDs
  name: string;
  type: 'savings' | 'credit' | 'cash';
  isDefault: boolean;
  initialBalance: number;
  creditLimit?: number;
  cutoffDay?: number;
  paymentDay?: number;
  bankAccountId?: string; // ID de cuenta bancaria asociada (para tarjetas de crédito)
  createdAt?: Date;

  // 🆕 Tasa de interés para TC
  interestRate?: number; // Tasa de Interés Efectiva Anual (E.A.) en porcentaje (ej: 23.99)
}

export interface Category {
  id?: string; // Firestore usa string IDs
  type: 'expense' | 'income';
  name: string;
}

export interface Categories {
  expense: string[];
  income: string[];
}

export interface NewTransaction {
  type: 'income' | 'expense' | 'transfer';
  amount: string;
  category: string;
  description: string;
  date: string;
  paid: boolean;
  accountId: string;
  toAccountId: string;

  // 🆕 Campos para intereses (usado en formulario)
  hasInterest: boolean;
  installments: number;
}

export interface NewAccount {
  name: string;
  type: 'savings' | 'credit' | 'cash';
  initialBalance: number;
  creditLimit: number;
  cutoffDay: number;
  paymentDay: number;
  bankAccountId?: string;
  interestRate: number; // 🆕 Tasa E.A. para TC
}

export type FilterValue = 'all' | string;
export type ViewType = 'transactions' | 'stats' | 'accounts';

export interface BackupData {
  transactions: Transaction[];
  accounts: Account[];
  categories: Categories;
  exportDate: string;
  version: string;
}

// Tipos para estadísticas
export interface MonthlyStats {
  month: string;
  ingresos: number;
  gastos: number;
  neto: number;
}

export interface YearlyStats {
  año: string;
  ingresos: number;
  gastos: number;
}

export interface CategoryStats {
  name: string;
  value: number;
}

export interface TransactionStats {
  totalIncome: number;
  totalExpenses: number;
  pendingExpenses: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}