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

  // 🆕 Asociación con pago periódico
  recurringPaymentId?: string; // ID del pago periódico asociado
}

// 🆕 PAGOS PERIÓDICOS (Suscripciones, Servicios, etc.)
export interface RecurringPayment {
  id?: string;
  name: string; // Ej: "Netflix", "Spotify", "Arriendo"
  amount: number; // Valor esperado del pago
  category: string; // Categoría asociada (Ej: "Entretenimiento", "Hogar")
  accountId?: string; // Cuenta preferida (opcional - puede pagarse desde cualquier cuenta)
  dueDay: number; // Día del mes en que vence (1-31)
  frequency: 'monthly' | 'yearly'; // Frecuencia del pago
  isActive: boolean; // Si está activo o pausado
  notes?: string; // Notas opcionales
  createdAt?: Date;
  lastPaidDate?: Date; // Última fecha de pago registrada
  lastPaidAmount?: number; // Último monto pagado (puede variar)
}

// Rango de fechas para filtros
export type DateRangePreset = 'all' | 'today' | 'this-week' | 'this-month' | 'last-month' | 'this-year' | 'last-year' | 'custom';

export interface DateRange {
  preset: DateRangePreset;
  startDate?: Date;
  endDate?: Date;
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
  order?: number; // Orden de visualización

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
  
  // 🆕 Asociación con pago periódico
  recurringPaymentId?: string;
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
export type ViewType = 'transactions' | 'stats' | 'accounts' | 'recurring';

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