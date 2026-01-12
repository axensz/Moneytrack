/**
 * Configuración centralizada de la aplicación
 */

// Configuración regional y de moneda
export const APP_CONFIG = {
  locale: 'es-CO',
  currency: 'COP',
  timezone: 'America/Bogota',
  appName: 'MoneyTrack',
  version: '1.0.0'
} as const;

// Categorías por defecto del sistema
export const DEFAULT_CATEGORIES = {
  expense: [
    'Alimentación',
    'Transporte',
    'Servicios',
    'Vivienda',
    'Salud',
    'Entretenimiento',
    'Educación',
    'Otros'
  ],
  income: [
    'Salario',
    'Freelance',
    'Inversiones',
    'Otros'
  ]
} as const;

// Categorías protegidas que no se pueden eliminar (referencia a DEFAULT_CATEGORIES)
export const PROTECTED_CATEGORIES = DEFAULT_CATEGORIES;

// Categoría especial para transferencias
export const TRANSFER_CATEGORY = 'Transferencia' as const;

// Validaciones para cuentas
export const ACCOUNT_VALIDATION = {
  creditLimit: {
    min: 1,
    max: 1000000000,
    errorMessage: 'El cupo total debe estar entre $1 y $1,000,000,000'
  },
  cutoffDay: {
    min: 1,
    max: 31,
    errorMessage: 'El día de corte debe estar entre 1 y 31'
  },
  paymentDay: {
    min: 1,
    max: 31,
    errorMessage: 'El día de pago debe estar entre 1 y 31'
  },
  initialBalance: {
    min: -1000000000,
    max: 1000000000,
    errorMessage: 'El saldo inicial debe estar entre -$1,000,000,000 y $1,000,000,000'
  }
} as const;

// Validaciones para transacciones
export const TRANSACTION_VALIDATION = {
  amount: {
    min: 0.01,
    max: 999999999999,
    errorMessage: 'El monto debe ser mayor a 0'
  },
  description: {
    minLength: 1,
    maxLength: 500,
    errorMessage: 'La descripción debe tener entre 1 y 500 caracteres'
  }
} as const;

// Mensajes de error comunes
export const ERROR_MESSAGES = {
  // Validación de formularios
  EMPTY_DESCRIPTION: 'La descripción no puede estar vacía',
  EMPTY_CATEGORY: 'Debes seleccionar una categoría',
  EMPTY_TO_ACCOUNT: 'Debes seleccionar una cuenta destino',
  SAME_ACCOUNT_TRANSFER: 'No puedes transferir a la misma cuenta',
  INVALID_AMOUNT: 'El monto debe ser mayor a 0',
  EMPTY_ACCOUNT_NAME: 'El nombre de la cuenta no puede estar vacío',

  // Errores de operaciones
  ADD_TRANSACTION_ERROR: 'Error al agregar transacción',
  DELETE_TRANSACTION_ERROR: 'Error al eliminar transacción',
  DUPLICATE_TRANSACTION_ERROR: 'Error al duplicar transacción',
  ADD_ACCOUNT_ERROR: 'Error al guardar cuenta',
  DELETE_ACCOUNT_ERROR: 'Error al eliminar cuenta',
  DELETE_DEFAULT_ACCOUNT: 'No puedes eliminar la cuenta por defecto',
  DELETE_ACCOUNT_WITH_TRANSACTIONS: 'No puedes eliminar una cuenta con transacciones',
  ADD_CATEGORY_ERROR: 'Error al agregar categoría',
  EMPTY_CATEGORY_NAME: 'El nombre de la categoría no puede estar vacío',
  DUPLICATE_CATEGORY: 'Esta categoría ya existe',
  DELETE_CATEGORY_WITH_TRANSACTIONS: 'No puedes eliminar una categoría con transacciones',

  // Validación de cuentas de crédito
  INVALID_CREDIT_LIMIT: 'El cupo total debe ser mayor a 0 para tarjetas de crédito',
  INVALID_CUTOFF_DAY: 'El día de corte debe estar entre 1 y 31',
  INVALID_PAYMENT_DAY: 'El día de pago debe estar entre 1 y 31',
  PAYMENT_BEFORE_CUTOFF: 'El día de pago debe ser posterior al día de corte',
  INVALID_INITIAL_BALANCE: 'El saldo inicial debe ser un número válido'
} as const;

// Mensajes de éxito
export const SUCCESS_MESSAGES = {
  TRANSACTION_ADDED: 'Transacción agregada exitosamente',
  TRANSACTION_DELETED: 'Transacción eliminada exitosamente',
  TRANSACTION_DUPLICATED: 'Transacción duplicada exitosamente',
  ACCOUNT_ADDED: 'Cuenta creada exitosamente',
  ACCOUNT_UPDATED: 'Cuenta actualizada exitosamente',
  ACCOUNT_DELETED: 'Cuenta eliminada exitosamente',
  CATEGORY_ADDED: 'Categoría agregada exitosamente',
  CATEGORY_DELETED: 'Categoría eliminada exitosamente',
  DATA_EXPORTED: 'Datos exportados exitosamente',
  DATA_IMPORTED: 'Datos importados exitosamente'
} as const;

// Configuración de tipos de cuenta
export const ACCOUNT_TYPES = [
  { value: 'savings' as const, label: 'Cuenta de Ahorros' },
  { value: 'credit' as const, label: 'Tarjeta de Crédito' },
  { value: 'cash' as const, label: 'Efectivo' }
] as const;

// Configuración de tipos de transacción
export const TRANSACTION_TYPES = [
  { value: 'expense' as const, label: 'Gasto' },
  { value: 'income' as const, label: 'Ingreso' },
  { value: 'transfer' as const, label: 'Transferencia' }
] as const;

// Límites de estadísticas
export const STATS_CONFIG = {
  monthlyDataLimit: 6, // Últimos 6 meses
  categoryTopLimit: 10 // Top 10 categorías
} as const;

// Configuración de almacenamiento local
export const STORAGE_KEYS = {
  categories: 'financeCategories',
  theme: 'theme'
} as const;

// Configuración de colecciones de Firestore
export const FIRESTORE_COLLECTIONS = {
  users: 'users',
  transactions: 'transactions',
  accounts: 'accounts',
  categories: 'categories'
} as const;

// Labels de UI (para internacionalización futura)
export const UI_LABELS = {
  // Tipos de transacción
  transactionTypes: {
    expense: 'Gasto',
    income: 'Ingreso',
    transfer: 'Transferencia'
  },
  // Tipos de cuenta
  accountTypes: {
    savings: 'Cuenta de Ahorros',
    credit: 'Tarjeta de Crédito',
    cash: 'Efectivo'
  },
  // Labels de formularios
  forms: {
    selectAccount: 'Seleccionar cuenta...',
    selectCategory: 'Seleccionar...',
    selectDestination: 'Seleccionar cuenta destino...',
    defaultAccount: '(Por defecto)'
  }
} as const;

// Configuración de Toast notifications
export const TOAST_CONFIG = {
  position: 'top-right' as const,
  duration: 3000,
  style: {
    background: '#363636',
    color: '#fff',
  },
  success: {
    duration: 2000,
    iconTheme: {
      primary: '#10b981',
      secondary: '#fff',
    },
  },
  error: {
    duration: 4000,
    iconTheme: {
      primary: '#ef4444',
      secondary: '#fff',
    },
  },
} as const;

// Constantes para formato de números grandes
export const NUMBER_FORMAT_THRESHOLDS = {
  BILLION: 1_000_000_000,
  MILLION: 1_000_000,
  THOUSAND: 1_000,
} as const;

// Estado inicial para nueva transacción
export const INITIAL_TRANSACTION = {
  type: 'expense' as const,
  amount: '',
  category: '',
  description: '',
  date: new Date().toISOString().split('T')[0],
  paid: false,
  accountId: '',
  toAccountId: ''
} as const;

// Estado inicial para nueva cuenta
export const INITIAL_ACCOUNT = {
  name: '',
  type: 'savings' as const,
  initialBalance: 0,
  isDefault: false,
  creditLimit: 0,
  cutoffDay: 1,
  paymentDay: 1
} as const;
