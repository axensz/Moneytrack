export interface Transaction {
  id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: 'income' | 'expense';
  paid: boolean;
  accountId: string;
}

export interface Account {
  id: string;
  name: string;
  type: 'savings' | 'credit' | 'cash';
  isDefault: boolean;
  initialBalance: number;
  creditLimit?: number;
  cutoffDay?: number;
  paymentDay?: number;
  createdAt: string;
}

export interface Category {
  expense: string[];
  income: string[];
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AccountType {
  value: 'savings' | 'credit' | 'cash';
  label: string;
  icon: any;
}