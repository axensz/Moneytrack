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
    'Compras Personales',
    'Regalos',
    'Otros'
  ],
  income: [
    'Salario',
    'Freelance',
    'Inversiones',
    'Cesantías',
    'Otros'
  ]
} as const;

// Categorías protegidas que no se pueden eliminar (referencia a DEFAULT_CATEGORIES)
export const PROTECTED_CATEGORIES = DEFAULT_CATEGORIES;

// Categoría especial para transferencias
export const TRANSFER_CATEGORY = 'Transferencia' as const;

// Categoría especial para pagos de tarjeta de crédito
export const CREDIT_PAYMENT_CATEGORY = 'Pago Crédito' as const;

// Categoría especial para ajustes de saldo
export const BALANCE_ADJUSTMENT_CATEGORY = 'Ajuste de saldo' as const;

// Categoría especial para préstamos
export const LOAN_CATEGORY = 'Préstamo' as const;

// Categoría especial para cobro de deudas
export const LOAN_PAYMENT_CATEGORY = 'Cobro Préstamo' as const;

// Categorías especiales del sistema (auto-asignadas, no creadas por usuario)
export const SPECIAL_CATEGORIES = {
  transfer: TRANSFER_CATEGORY,
  creditPayment: CREDIT_PAYMENT_CATEGORY,
  balanceAdjustment: BALANCE_ADJUSTMENT_CATEGORY,
  loan: LOAN_CATEGORY,
  loanPayment: LOAN_PAYMENT_CATEGORY,
  // Categorías que representan movimientos INTERNOS (no gasto/ingreso operativo del
  // usuario). Se usan como fuente única para EXCLUIRLOS de estadísticas, gráficos,
  // presupuestos, plan financiero, análisis de servicios y contexto de IA.
  // Préstamos incluidos (#10): prestar/cobrar mueve dinero entre tu efectivo y tu
  // "por cobrar/pagar" — afecta el SALDO de la cuenta (eso NO se filtra aquí, se
  // calcula en accountStrategies por `t.paid`), pero NO es gasto/ingreso real.
  adjustmentCategories: [
    BALANCE_ADJUSTMENT_CATEGORY,
    CREDIT_PAYMENT_CATEGORY,
    'Pago TC',
    'Ajuste',
    LOAN_CATEGORY,
    LOAN_PAYMENT_CATEGORY,
  ] as readonly string[],
  // Categorías que se AGRUPAN visualmente bajo "Ajustes de saldo" en la lista de
  // transacciones. Subconjunto de adjustmentCategories: solo ajustes de saldo —
  // los pagos de crédito ('Pago Crédito'/'Pago TC') se muestran como movimientos normales.
  groupedAdjustmentCategories: [BALANCE_ADJUSTMENT_CATEGORY, 'Ajuste'] as readonly string[],
} as const;

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
    max: 1000000000,
    errorMessage: 'El monto debe estar entre $0,01 y $1.000.000.000'
  },
  description: {
    minLength: 0,
    maxLength: 500,
    errorMessage: 'La descripción no puede tener más de 500 caracteres'
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
  INVALID_CREDIT_LIMIT: 'El cupo total debe ser mayor a 0 para cuentas de crédito',
  INVALID_CUTOFF_DAY: 'El día de corte debe estar entre 1 y 31',
  INVALID_PAYMENT_DAY: 'El día de pago debe estar entre 1 y 31',
  PAYMENT_BEFORE_CUTOFF: 'El día de pago debe ser posterior al día de corte',
  INVALID_INITIAL_BALANCE: 'El saldo inicial debe ser un número válido'
} as const;

// Mensajes de éxito
export const SUCCESS_MESSAGES = {
  TRANSACTION_ADDED: 'Transacción agregada exitosamente',
  TRANSACTION_UPDATED: 'Transacción actualizada exitosamente',
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
    credit: 'Crédito',
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
  position: 'top-center' as const,
  duration: 3000,
  containerStyle: {
    top: 80, // Debajo del header para no tapar botones
  },
  style: {
    background: '#1f2937',
    color: '#fff',
    borderRadius: '12px',
    padding: '12px 16px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
    fontSize: '14px',
    maxWidth: '380px',
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

// Fecha LOCAL de hoy en formato YYYY-MM-DD (mismo cálculo que
// formatDateForInput de formatters.ts: getFullYear/Month/Date son locales).
// Se duplica aquí en vez de importar formatters para no crear un ciclo de
// módulos (formatters.ts ya importa de este archivo) que dejaría la función
// undefined al evaluar la factory en la carga del módulo.
function todayLocalDateString(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Estado inicial para nueva transacción.
//
// Es una FACTORY (no un const congelado al cargar el módulo) porque la fecha
// debe ser la fecha LOCAL del momento en que se abre el formulario. Antes se
// usaba toISOString().split('T')[0], que es UTC y en Colombia (UTC-5) podía
// devolver el día siguiente (p. ej. una transacción de las 7 p. m. salía como
// mañana). Además, al ser const a nivel de módulo, la fecha quedaba congelada
// a la carga del módulo y no avanzaba al cambiar de día sin recargar.
export const createInitialTransaction = () => ({
  type: 'expense' as const,
  amount: '',
  category: '',
  description: '',
  date: todayLocalDateString(),
  paid: true, // ✅ Por defecto las transacciones están pagadas (más intuitivo)
  accountId: '',
  toAccountId: '',
  hasInterest: false, // 🆕 Por defecto sin intereses
  installments: 1 // 🆕 Por defecto 1 cuota
});
