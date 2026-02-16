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

  // 🆕 Asociación con préstamo/deuda
  debtId?: string; // ID de la deuda asociada
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

// 🆕 PRÉSTAMOS / DEUDAS
export interface Debt {
  id?: string;
  personName: string; // Nombre de la persona
  type: 'lent' | 'borrowed'; // 'lent' = yo presté, 'borrowed' = me prestaron
  originalAmount: number; // Monto original del préstamo
  remainingAmount: number; // Monto pendiente por cobrar/pagar
  description?: string; // Notas opcionales
  accountId?: string; // Cuenta desde la que se prestó
  isSettled: boolean; // Si la deuda está completamente saldada
  createdAt?: Date;
  settledAt?: Date; // Fecha en que se saldó
}

// 🆕 PRESUPUESTOS
export interface Budget {
  id?: string;
  category: string; // Categoría del presupuesto
  monthlyLimit: number; // Límite mensual en COP
  isActive: boolean; // Si está activo
  createdAt?: Date;
}

// 🆕 METAS DE AHORRO
export interface SavingsGoal {
  id?: string;
  name: string; // Nombre de la meta (ej: "Vacaciones")
  targetAmount: number; // Monto objetivo
  currentAmount: number; // Monto ahorrado hasta ahora
  targetDate?: Date; // Fecha objetivo (opcional)
  accountId?: string; // Cuenta de ahorro asociada (opcional)
  isCompleted: boolean; // Si se alcanzó la meta
  createdAt?: Date;
  completedAt?: Date; // Fecha en que se completó
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
export type ViewType = 'transactions' | 'stats' | 'accounts' | 'recurring' | 'debts' | 'budgets' | 'goals';

export interface BackupData {
  transactions: Transaction[];
  accounts: Account[];
  categories: Categories;
  debts?: Debt[];
  budgets?: Budget[];
  savingsGoals?: SavingsGoal[];
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