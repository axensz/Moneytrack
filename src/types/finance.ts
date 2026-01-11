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
  createdAt?: Date;
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