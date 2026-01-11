export interface Transaction {
  id?: number; // Auto-increment en Dexie
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category: string;
  description: string;
  date: Date; // Cambio de string a Date
  paid: boolean;
  accountId: number;
  toAccountId?: number;
  createdAt?: Date; // Nuevo campo
}

export interface Account {
  id?: number; // Auto-increment en Dexie
  name: string;
  type: 'savings' | 'credit' | 'cash';
  isDefault: boolean;
  initialBalance: number;
  creditLimit?: number;
  cutoffDay?: number;
  paymentDay?: number;
  createdAt?: Date; // Cambio de string a Date
}

export interface Category {
  id?: number; // Nueva interfaz para Dexie
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
}

export interface NewAccount {
  name: string;
  type: 'savings' | 'credit' | 'cash';
  initialBalance: number;
  creditLimit: number;
  cutoffDay: number;
  paymentDay: number;
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