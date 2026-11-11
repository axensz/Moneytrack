/**
 * Servicio de IA con Google Gemini (Free Tier)
 * Usa @google/genai SDK con modelos centralizados por tarea.
 */

import { getGeminiClient, isAiEnabled } from './geminiClient';
import { getGeminiModel } from './geminiConfig';
import type { Content, FunctionCall, FunctionCallingConfigMode, GenerateContentResponse } from '@google/genai';
import type {
  Transaction,
  Account,
  Categories,
  Budget,
  RecurringPayment,
  Debt,
  SavingsGoal,
} from '../types/finance';
import { formatCurrency } from '../utils/formatters';
import { ensureDate } from '../utils/dateUtils';
import { BalanceCalculator } from '../utils/balanceCalculator';
import { getCreditCardUsedCredit } from '../utils/accountStrategies';
import { findAccountForTransaction } from '../utils/accountTransactions';
import { detectHiddenSubscriptions } from '../utils/financialPlanIntelligence';
import { logger } from '../utils/logger';
import { SPECIAL_CATEGORIES } from '../config/constants';

// ============ TIPOS DE ACCIONES ============

export type ChatAction =
  | {
      type: 'add_transaction';
      data: {
        txType: 'income' | 'expense';
        amount: number;
        category: string;
        description: string;
        accountId: string;
        accountName: string;
        paid: boolean;
        date?: string; // ISO string, defaults to today
      };
    }
  | {
      type: 'add_transfer';
      data: {
        fromAccountId: string;
        fromAccountName: string;
        toAccountId: string;
        toAccountName: string;
        amount: number;
        description: string;
        date?: string;
      };
    }
  | {
      type: 'upsert_budget';
      data: {
        category: string;
        amount: number;
      };
    }
  | {
      type: 'add_recurring_payment';
      data: {
        name: string;
        amount: number;
        category: string;
        dueDay: number;
        frequency: 'monthly' | 'yearly';
        accountId?: string;
        accountName?: string;
      };
    }
  | {
      type: 'update_category';
      data: {
        transactionId: string;
        oldCategory: string;
        newCategory: string;
        description: string;
      };
    }
  | {
      type: 'bulk_update_category';
      data: {
        updates: Array<{
          transactionId: string;
          oldCategory: string;
          newCategory: string;
          description: string;
        }>;
      };
    }
  | {
      type: 'add_category';
      data: {
        categoryType: 'expense' | 'income';
        name: string;
      };
    };

export interface TokenUsage {
  promptTokens: number;
  responseTokens: number;
  totalTokens: number;
  thinkingTokens?: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  action?: ChatAction;
  actionExecuted?: boolean;
  tokenUsage?: TokenUsage;
}

export interface FinancialContextOptions {
  includeRecentTransactions?: boolean;
  budgets?: Budget[];
  recurringPayments?: RecurringPayment[];
  debts?: Debt[];
  savingsGoals?: SavingsGoal[];
}

export function isGeminiConfigured(): boolean {
  return isAiEnabled();
}

/**
 * Genera el contexto financiero del usuario para el prompt del sistema
 */
export function buildFinancialContext(
  transactions: Transaction[],
  accounts: Account[],
  categories: Categories,
  options: FinancialContextOptions = {},
): string {
  const includeRecentTransactions = options.includeRecentTransactions ?? true;
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Categorías que son ajustes internos, NO gastos reales del usuario
  const ADJUSTMENT_CATEGORIES = SPECIAL_CATEGORIES.adjustmentCategories;

  // Filtrar ajustes de todas las transacciones para análisis
  const realTransactions = transactions.filter(t => !ADJUSTMENT_CATEGORIES.includes(t.category));

  // Transacciones del mes actual
  const monthlyTransactions = realTransactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  // Transacciones del mes anterior (para comparación)
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const prevMonthTransactions = realTransactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  });

  // --- ESTADÍSTICAS DEL MES ACTUAL ---
  const monthlyIncome = monthlyTransactions
    .filter(t => t.type === 'income' && t.paid)
    .reduce((s, t) => s + t.amount, 0);

  const monthlyExpensesPaid = monthlyTransactions
    .filter(t => t.type === 'expense' && t.paid)
    .reduce((s, t) => s + t.amount, 0);

  const monthlyExpensesPending = monthlyTransactions
    .filter(t => t.type === 'expense' && !t.paid)
    .reduce((s, t) => s + t.amount, 0);

  const totalMonthlyExpenses = monthlyExpensesPaid + monthlyExpensesPending;

  // --- ESTADÍSTICAS DEL MES ANTERIOR ---
  const prevMonthIncome = prevMonthTransactions
    .filter(t => t.type === 'income' && t.paid)
    .reduce((s, t) => s + t.amount, 0);

  const prevMonthExpenses = prevMonthTransactions
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  // --- GASTOS POR CATEGORÍA (mes actual, top 10) ---
  const expensesByCategory: Record<string, { paid: number; pending: number; count: number }> = {};
  monthlyTransactions
    .filter(t => t.type === 'expense')
    .forEach(t => {
      if (!expensesByCategory[t.category]) {
        expensesByCategory[t.category] = { paid: 0, pending: 0, count: 0 };
      }
      if (t.paid) expensesByCategory[t.category].paid += t.amount;
      else expensesByCategory[t.category].pending += t.amount;
      expensesByCategory[t.category].count++;
    });

  const categoryBreakdown = Object.entries(expensesByCategory)
    .sort(([, a], [, b]) => (b.paid + b.pending) - (a.paid + a.pending))
    .slice(0, 10)
    .map(([cat, data]) => {
      const total = data.paid + data.pending;
      const pct = totalMonthlyExpenses > 0 ? Math.round((total / totalMonthlyExpenses) * 100) : 0;
      const pendingNote = data.pending > 0 ? ` (${formatCurrency(data.pending)} pendiente)` : '';
      return `  - ${cat}: ${formatCurrency(total)} (${pct}%, ${data.count} transacciones)${pendingNote}`;
    })
    .join('\n');

  // --- INGRESOS POR CATEGORÍA (mes actual) ---
  const incomeByCategory: Record<string, number> = {};
  monthlyTransactions
    .filter(t => t.type === 'income' && t.paid)
    .forEach(t => {
      incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + t.amount;
    });

  const incomeBreakdown = Object.entries(incomeByCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, amount]) => `  - ${cat}: ${formatCurrency(amount)}`)
    .join('\n');

  // --- CUENTAS CON BALANCES ---
  const accountsSummary = accounts
    .map(a => {
      const balance = BalanceCalculator.calculateAccountBalance(a, transactions);
      if (a.type === 'credit') {
        const used = getCreditCardUsedCredit(a, transactions);
        return `  - [ID:${a.id}] ${a.name} (Crédito): Usado ${formatCurrency(used)} de ${formatCurrency(a.creditLimit || 0)} (Disponible: ${formatCurrency(balance)})`;
      }
      const type = a.type === 'savings' ? 'Ahorro' : 'Efectivo';
      return `  - [ID:${a.id}] ${a.name} (${type}): ${formatCurrency(balance)}`;
    })
    .join('\n');

  // Balance total (solo cuentas no-crédito)
  const totalBalance = accounts
    .filter(a => a.type !== 'credit')
    .reduce((sum, a) => sum + BalanceCalculator.calculateAccountBalance(a, transactions), 0);

  // Deuda total en TCs
  const totalCreditDebt = accounts
    .filter(a => a.type === 'credit')
    .reduce((sum, a) => sum + getCreditCardUsedCredit(a, transactions), 0);

  // --- ÚLTIMAS 20 TRANSACCIONES (con IDs para acciones) ---
  const recentTx = includeRecentTransactions
    ? realTransactions
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20)
    .map(t => {
      const tipo = t.type === 'income' ? '📈 Ingreso' : t.type === 'expense' ? '📉 Gasto' : '🔄 Transferencia';
      const fecha = new Date(t.date).toLocaleDateString('es-CO');
      const account = findAccountForTransaction(accounts, t.accountId);
      const estado = t.paid ? '' : ' [PENDIENTE]';
      return `  - [ID:${t.id}] ${fecha} | ${tipo} | ${formatCurrency(t.amount)} | ${t.category} | ${t.description} | ${account?.name || 'N/A'} [ACC:${t.accountId}]${estado}`;
    }).join('\n')
    : '  (Omitidas para minimizar datos; pide detalle o recategorizacion para incluirlas)';

  // --- GASTOS PENDIENTES TOTALES ---
  const allPending = realTransactions
    .filter(t => t.type === 'expense' && !t.paid)
    .reduce((s, t) => s + t.amount, 0);

  const pendingCount = realTransactions.filter(t => t.type === 'expense' && !t.paid).length;

  // --- PROMEDIO DIARIO DE GASTO ---
  const dayOfMonth = now.getDate();
  const avgDailyExpense = dayOfMonth > 0 ? totalMonthlyExpenses / dayOfMonth : 0;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const projectedMonthlyExpense = avgDailyExpense * daysInMonth;

  // --- COMPARACIÓN CON MES ANTERIOR ---
  const expenseDiff = prevMonthExpenses > 0
    ? Math.round(((totalMonthlyExpenses - prevMonthExpenses) / prevMonthExpenses) * 100)
    : 0;
  const incomeDiff = prevMonthIncome > 0
    ? Math.round(((monthlyIncome - prevMonthIncome) / prevMonthIncome) * 100)
    : 0;

  const prevMonthName = new Date(prevYear, prevMonth).toLocaleDateString('es-CO', { month: 'long' });

  // --- CATEGORÍAS DISPONIBLES ---
  const cats = `Gastos: ${categories.expense.join(', ')}\nIngresos: ${categories.income.join(', ')}`;

  // --- 🎯 PRESUPUESTOS MENSUALES ---
  const activeBudgets = (options.budgets ?? []).filter(b => b.isActive);
  const budgetsSummary = activeBudgets
    .map(b => {
      const catData = expensesByCategory[b.category];
      const spent = catData ? catData.paid + catData.pending : 0;
      const pct = b.monthlyLimit > 0 ? Math.round((spent / b.monthlyLimit) * 100) : 0;
      const alert = pct >= 100 ? ' [⚠️ EXCEDIDO]' : pct >= 85 ? ' [⚡ CERCA DEL LÍMITE]' : '';
      return `  - ${b.category}: ${formatCurrency(spent)} / ${formatCurrency(b.monthlyLimit)} (${pct}%)${alert}`;
    })
    .join('\n');

  // --- 🔄 PAGOS PERIÓDICOS Y SUSCRIPCIONES ---
  const activeRecurring = (options.recurringPayments ?? []).filter(r => r.isActive);
  const recurringSummary = activeRecurring
    .map(r => {
      const account = r.accountId ? findAccountForTransaction(accounts, r.accountId) : undefined;
      const paidThisMonth = monthlyTransactions.some(
        t => t.recurringPaymentId === r.id || (t.category === r.category && t.description.toLowerCase().includes(r.name.toLowerCase()))
      );
      const status = paidThisMonth ? '✓ Pagado este mes' : `⏳ Vence día ${r.dueDay}`;
      const freqLabel = r.frequency === 'yearly' ? 'Anual' : 'Mensual';
      return `  - ${r.name}: ${formatCurrency(r.amount)} (${freqLabel}, ${r.category}${account ? `, ${account.name}` : ''}) — ${status}`;
    })
    .join('\n');

  // --- 🤝 PRÉSTAMOS Y DEUDAS PERSONALES ---
  const activeDebts = (options.debts ?? []).filter(d => !d.isSettled && d.remainingAmount > 0);
  const debtsSummary = activeDebts
    .map(d => {
      const kind = d.type === 'lent' ? 'Me deben' : 'Yo debo';
      const dueNote = d.dueDate
        ? ` | Vence: ${ensureDate(d.dueDate).toLocaleDateString('es-CO')}`
        : d.expectedPaymentDay
          ? ` | Pago esperado: día ${d.expectedPaymentDay}`
          : '';
      return `  - [${kind}] ${d.personName}: ${formatCurrency(d.remainingAmount)} pendiente de ${formatCurrency(d.originalAmount)}${d.description ? ` (${d.description})` : ''}${dueNote}`;
    })
    .join('\n');

  // --- 🏆 METAS DE AHORRO ---
  const activeGoals = (options.savingsGoals ?? []).filter(g => !g.isCompleted);
  const goalsSummary = activeGoals
    .map(g => {
      const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
      return `  - ${g.name}: ${formatCurrency(g.currentAmount)} / ${formatCurrency(g.targetAmount)} (${pct}%)`;
    })
    .join('\n');

  // --- 🧠 DETECCIÓN DE CARGOS REPETIDOS / SUSCRIPCIONES OCULTAS ---
  const hiddenSubs = detectHiddenSubscriptions({
    transactions: realTransactions,
    recurringPayments: options.recurringPayments ?? [],
  });
  const hiddenSubsSummary = hiddenSubs
    .slice(0, 5)
    .map(s => `  - ${s.merchant}: ~${formatCurrency(s.estimatedAmount)}/mes (${s.monthsDetected} meses en ${s.category})`)
    .join('\n');

  return `
CONTEXTO FINANCIERO DEL USUARIO (${now.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}):
Fecha actual: ${now.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
Día ${dayOfMonth} de ${daysInMonth} del mes (${Math.round((dayOfMonth / daysInMonth) * 100)}% del mes transcurrido)

💰 BALANCE GENERAL:
- Dinero disponible (cuentas y efectivo): ${formatCurrency(totalBalance)}
- Deuda en créditos: ${formatCurrency(totalCreditDebt)}
- Patrimonio neto: ${formatCurrency(totalBalance - totalCreditDebt)}
- Gastos pendientes de pago: ${formatCurrency(allPending)} (${pendingCount} transacciones)

📊 RESUMEN DEL MES ACTUAL:
- Ingresos recibidos: ${formatCurrency(monthlyIncome)}
- Gastos pagados: ${formatCurrency(monthlyExpensesPaid)}
- Gastos pendientes: ${formatCurrency(monthlyExpensesPending)}
- Total gastos: ${formatCurrency(totalMonthlyExpenses)}
- Balance del mes: ${formatCurrency(monthlyIncome - totalMonthlyExpenses)}
- Promedio diario de gasto: ${formatCurrency(avgDailyExpense)}
- Proyección de gasto a fin de mes: ${formatCurrency(projectedMonthlyExpense)}
${monthlyIncome > 0 ? `- Tasa de ahorro: ${Math.round(((monthlyIncome - totalMonthlyExpenses) / monthlyIncome) * 100)}%` : ''}

📈 INGRESOS POR FUENTE ESTE MES:
${incomeBreakdown || '  (Sin ingresos registrados)'}

📉 GASTOS POR CATEGORÍA ESTE MES (de mayor a menor):
${categoryBreakdown || '  (Sin gastos este mes)'}

📅 COMPARACIÓN CON ${prevMonthName.toUpperCase()}:
- Ingresos mes anterior: ${formatCurrency(prevMonthIncome)} (${incomeDiff >= 0 ? '+' : ''}${incomeDiff}% vs actual)
- Gastos mes anterior: ${formatCurrency(prevMonthExpenses)} (${expenseDiff >= 0 ? '+' : ''}${expenseDiff}% vs actual)

🏦 CUENTAS:
${accountsSummary || '  (Sin cuentas)'}

🎯 PRESUPUESTOS ACTIVOS ESTE MES:
${budgetsSummary || '  (Sin presupuestos configurados)'}

🔄 PAGOS PERIÓDICOS Y SUSCRIPCIONES:
${recurringSummary || '  (Sin pagos periódicos registrados)'}
${hiddenSubsSummary ? `\n🔍 CARGOS REPETIDOS DETECTADOS (posibles suscripciones sin registrar):\n${hiddenSubsSummary}` : ''}

🤝 PRÉSTAMOS Y DEUDAS ACTIVAS:
${debtsSummary || '  (Sin préstamos ni deudas pendientes)'}

🏆 METAS DE AHORRO ACTIVAS:
${goalsSummary || '  (Sin metas de ahorro activas)'}

📋 ÚLTIMAS 20 TRANSACCIONES:
${recentTx || '  (Sin transacciones)'}

🏷️ CATEGORÍAS DISPONIBLES:
${cats}

Total de transacciones históricas: ${transactions.length} (reales: ${realTransactions.length})
`.trim();
}

const ACTION_FUNCTION_NAMES = [
  'add_transaction',
  'add_transfer',
  'upsert_budget',
  'add_recurring_payment',
  'update_category',
  'bulk_update_category',
  'add_category',
] as const;

type BulkCategoryUpdate = Extract<ChatAction, { type: 'bulk_update_category' }>['data']['updates'][number];

type ChatActionFunctionDefinition = {
  name: (typeof ACTION_FUNCTION_NAMES)[number];
  description: string;
  parameters: Record<string, unknown>;
};

const CHAT_ACTION_FUNCTION_DEFINITIONS = [
  {
    name: 'add_transaction',
    description: 'Prepare a new income or expense transaction for the user to confirm in MoneyTrack.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        txType: { type: 'string', enum: ['income', 'expense'] },
        amount: { type: 'number', minimum: 1 },
        category: { type: 'string', minLength: 1, maxLength: 100 },
        description: { type: 'string', minLength: 1, maxLength: 500 },
        accountId: { type: 'string', minLength: 1 },
        accountName: { type: 'string', minLength: 1 },
        paid: { type: 'boolean' },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      },
      required: ['txType', 'amount', 'category', 'description', 'accountId', 'accountName', 'paid'],
    },
  },
  {
    name: 'add_transfer',
    description: 'Prepare a transfer between two user accounts for the user to confirm in MoneyTrack.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        fromAccountId: { type: 'string', minLength: 1 },
        fromAccountName: { type: 'string', minLength: 1 },
        toAccountId: { type: 'string', minLength: 1 },
        toAccountName: { type: 'string', minLength: 1 },
        amount: { type: 'number', minimum: 1 },
        description: { type: 'string', minLength: 1, maxLength: 500 },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      },
      required: ['fromAccountId', 'fromAccountName', 'toAccountId', 'toAccountName', 'amount', 'description'],
    },
  },
  {
    name: 'upsert_budget',
    description: 'Prepare creating or updating a monthly spending budget for a specific expense category.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        category: { type: 'string', minLength: 1, maxLength: 100 },
        amount: { type: 'number', minimum: 1 },
      },
      required: ['category', 'amount'],
    },
  },
  {
    name: 'add_recurring_payment',
    description: 'Prepare a new recurring payment or subscription (monthly or yearly) for the user to confirm.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 120 },
        amount: { type: 'number', minimum: 1 },
        category: { type: 'string', minLength: 1, maxLength: 100 },
        dueDay: { type: 'number', minimum: 1, maximum: 31 },
        frequency: { type: 'string', enum: ['monthly', 'yearly'] },
        accountId: { type: 'string', minLength: 1 },
        accountName: { type: 'string', minLength: 1 },
      },
      required: ['name', 'amount', 'category', 'dueDay', 'frequency'],
    },
  },
  {
    name: 'update_category',
    description: 'Prepare a category change for one existing transaction ID shown in the context.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        transactionId: { type: 'string', minLength: 1 },
        oldCategory: { type: 'string', minLength: 1, maxLength: 100 },
        newCategory: { type: 'string', minLength: 1, maxLength: 100 },
        description: { type: 'string', minLength: 1, maxLength: 500 },
      },
      required: ['transactionId', 'oldCategory', 'newCategory', 'description'],
    },
  },
  {
    name: 'bulk_update_category',
    description: 'Prepare category changes for multiple existing transaction IDs shown in the context.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        updates: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              transactionId: { type: 'string', minLength: 1 },
              oldCategory: { type: 'string', minLength: 1, maxLength: 100 },
              newCategory: { type: 'string', minLength: 1, maxLength: 100 },
              description: { type: 'string', minLength: 1, maxLength: 500 },
            },
            required: ['transactionId', 'oldCategory', 'newCategory', 'description'],
          },
        },
      },
      required: ['updates'],
    },
  },
  {
    name: 'add_category',
    description: 'Prepare a new income or expense category for the user to confirm.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        categoryType: { type: 'string', enum: ['expense', 'income'] },
        name: { type: 'string', minLength: 1, maxLength: 100 },
      },
      required: ['categoryType', 'name'],
    },
  },
] as const satisfies readonly ChatActionFunctionDefinition[];

// Function declarations para la API generateContent (models.generateContent).
// Usamos parametersJsonSchema para reutilizar los mismos JSON Schemas de las
// acciones sin traducirlos al tipo Schema del SDK.
const CHAT_ACTION_FUNCTION_DECLARATIONS = CHAT_ACTION_FUNCTION_DEFINITIONS.map((definition) => ({
  name: definition.name,
  description: definition.description,
  parametersJsonSchema: definition.parameters,
}));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseActionFromFunctionCall(call: FunctionCall): ChatAction | undefined {
  const args = call.args;
  if (!isRecord(args)) return undefined;

  switch (call.name) {
    case 'add_transaction': {
      const txType = args.txType === 'income' || args.txType === 'expense' ? args.txType : null;
      const amount = numberValue(args.amount);
      const category = stringValue(args.category);
      const description = stringValue(args.description);
      const accountId = stringValue(args.accountId);
      const accountName = stringValue(args.accountName);
      const paid = booleanValue(args.paid);
      const date = stringValue(args.date);
      if (!txType || !amount || amount <= 0 || !category || !description || !accountId || !accountName || paid === null) return undefined;
      return {
        type: 'add_transaction',
        data: {
          txType,
          amount,
          category,
          description,
          accountId,
          accountName,
          paid,
          ...(date ? { date } : {}),
        },
      };
    }
    case 'add_transfer': {
      const fromAccountId = stringValue(args.fromAccountId);
      const fromAccountName = stringValue(args.fromAccountName);
      const toAccountId = stringValue(args.toAccountId);
      const toAccountName = stringValue(args.toAccountName);
      const amount = numberValue(args.amount);
      const description = stringValue(args.description);
      const date = stringValue(args.date);
      if (
        !fromAccountId ||
        !fromAccountName ||
        !toAccountId ||
        !toAccountName ||
        fromAccountId === toAccountId ||
        !amount ||
        amount <= 0 ||
        !description
      ) {
        return undefined;
      }
      return {
        type: 'add_transfer',
        data: {
          fromAccountId,
          fromAccountName,
          toAccountId,
          toAccountName,
          amount,
          description,
          ...(date ? { date } : {}),
        },
      };
    }
    case 'upsert_budget': {
      const category = stringValue(args.category);
      const amount = numberValue(args.amount);
      if (!category || !amount || amount <= 0) return undefined;
      return {
        type: 'upsert_budget',
        data: { category, amount },
      };
    }
    case 'add_recurring_payment': {
      const name = stringValue(args.name);
      const amount = numberValue(args.amount);
      const category = stringValue(args.category);
      const dueDay = numberValue(args.dueDay);
      const frequency = args.frequency === 'monthly' || args.frequency === 'yearly' ? args.frequency : null;
      const accountId = stringValue(args.accountId);
      const accountName = stringValue(args.accountName);
      if (
        !name ||
        !amount ||
        amount <= 0 ||
        !category ||
        !dueDay ||
        !Number.isInteger(dueDay) ||
        dueDay < 1 ||
        dueDay > 31 ||
        !frequency
      ) {
        return undefined;
      }
      return {
        type: 'add_recurring_payment',
        data: {
          name,
          amount,
          category,
          dueDay,
          frequency,
          ...(accountId ? { accountId } : {}),
          ...(accountName ? { accountName } : {}),
        },
      };
    }
    case 'update_category': {
      const transactionId = stringValue(args.transactionId);
      const oldCategory = stringValue(args.oldCategory);
      const newCategory = stringValue(args.newCategory);
      const description = stringValue(args.description);
      if (!transactionId || !oldCategory || !newCategory || !description) return undefined;
      return { type: 'update_category', data: { transactionId, oldCategory, newCategory, description } };
    }
    case 'bulk_update_category': {
      if (!Array.isArray(args.updates)) return undefined;
      const updates = args.updates
        .map((item): BulkCategoryUpdate | null => {
          if (!isRecord(item)) return null;
          const transactionId = stringValue(item.transactionId);
          const oldCategory = stringValue(item.oldCategory);
          const newCategory = stringValue(item.newCategory);
          const description = stringValue(item.description);
          return transactionId && oldCategory && newCategory && description
            ? { transactionId, oldCategory, newCategory, description }
            : null;
        })
        .filter((item): item is BulkCategoryUpdate => item !== null);
      if (updates.length === 0) return undefined;
      return { type: 'bulk_update_category', data: { updates } };
    }
    case 'add_category': {
      const categoryType = args.categoryType === 'expense' || args.categoryType === 'income' ? args.categoryType : null;
      const name = stringValue(args.name);
      if (!categoryType || !name) return undefined;
      return { type: 'add_category', data: { categoryType, name } };
    }
    default:
      return undefined;
  }
}

function parseActionFromInteractionItems(items: unknown): ChatAction | undefined {
  if (!Array.isArray(items)) return undefined;

  for (const item of items) {
    if (!isRecord(item) || item.type !== 'function_call') continue;

    const name = stringValue(item.name);
    const args = recordValue(item.arguments ?? item.args);
    if (!name || !args) continue;

    const action = parseActionFromFunctionCall({ name, args } as FunctionCall);
    if (action) return action;
  }

  return undefined;
}

export function parseActionFromInteractionPayload(payload: unknown): ChatAction | undefined {
  if (!isRecord(payload)) return undefined;

  return (
    parseActionFromInteractionItems(payload.outputs) ??
    parseActionFromInteractionItems(payload.steps)
  );
}

function shouldIncludeRecentTransactions(message: string): boolean {
  return /\b(transacci|movimiento|recategori|categoria|categoría|agrega|agregar|gaste|gast[eé]|ingreso|cuenta|ultimo|último|detalle|editar|cambiar)\b/i.test(message);
}

function buildChatContents(message: string, history: ChatMessage[]): Content[] {
  const contents: Content[] = history
    .filter((item) => item.content.trim().length > 0)
    .map((item) => ({
      role: item.role === 'user' ? 'user' : 'model',
      parts: [{ text: item.content }],
    }));

  contents.push({ role: 'user', parts: [{ text: message }] });
  return contents;
}

function extractGenerateContentTokenUsage(response: GenerateContentResponse): TokenUsage | undefined {
  const usage = response.usageMetadata;
  if (!usage) return undefined;

  const promptTokens = usage.promptTokenCount ?? 0;
  const responseTokens = usage.candidatesTokenCount ?? 0;
  const totalTokens = usage.totalTokenCount ?? promptTokens + responseTokens;
  const thinkingTokens = usage.thoughtsTokenCount ?? undefined;

  return { promptTokens, responseTokens, totalTokens, thinkingTokens };
}

const SYSTEM_PROMPT = `Eres el asistente financiero de MoneyTrack, una app de finanzas personales colombiana.

TU PERSONALIDAD:
- Amigable, directo y práctico
- Respondes en español colombiano
- Usas formato de moneda colombiana ($ con separador de miles punto, ej: $ 1.500.000)
- Eres CONCISO pero con datos concretos

TUS CAPACIDADES:
1. ANALIZAR las finanzas 360° del usuario (transacciones, cuentas, presupuestos, pagos periódicos, préstamos/deudas y metas de ahorro)
2. COMPARAR meses, detectar patrones de gasto y alertar sobre cargos repetidos o suscripciones ocultas
3. DAR CONSEJOS financieros personalizados basados en los datos reales
4. CALCULAR proyecciones, promedios y métricas útiles
5. ALERTAR sobre presupuestos cerca del límite, vencimientos próximos o préstamos por cobrar/pagar
6. PREPARAR ACCIONES interactivas para agregar gastos/ingresos, transferencias entre cuentas, presupuestos, pagos periódicos y recategorizar movimientos

CÓMO RESPONDER:
- MÁXIMO 2-3 párrafos cortos por respuesta. Sé directo y ve al grano.
- Si hay más para decir, cierra con algo como "¿Quieres que profundice en algún punto?" o "¿Te cuento más sobre X?"
- Usa **negritas** para resaltar montos importantes
- Puedes usar listas cortas (máximo 4-5 items) o tablas pequeñas si comparas varias categorías
- Incluye porcentajes y comparaciones cuando sea relevante
- No seas genérico, usa los datos reales del usuario
- NO hagas análisis extenso a menos que el usuario pida "más detalle" o "profundiza"

REGLAS:
- Nunca inventes datos que no tengas
- Si no tienes suficiente información, pídela
- No des consejos de inversión específicos (acciones, cripto, etc.)
- Sé empático con situaciones financieras difíciles
- Usa emojis moderadamente para ser amigable
- Los "Ajustes de saldo" y "Pago Crédito" son movimientos internos de la app, NO son gastos reales. Ignóralos completamente.
- Si ves transacciones en "Otros" cuya descripción claramente pertenece a otra categoría, sugiérele al usuario recategorizarlas (ej: "Transporte" en Otros → debería estar en Transporte). Sé breve: solo menciona las más obvias.

ACCIONES EN LA APP:
Cuando el usuario pida agregar una transacción, hacer una transferencia, crear/ajustar un presupuesto, registrar un pago periódico, recategorizar o crear categorías, usa una llamada de herramienta disponible. No escribas JSON ni bloques <<<ACTION>>> en el texto.

REGLAS DE ACCIONES:
- Explica brevemente que prepararás la acción y que el usuario puede editar cualquier campo o confirmarla en la tarjeta de MoneyTrack.
- Si el usuario no especifica cuenta, usa la cuenta por defecto si aparece en el contexto; si no, pregunta.
- Si el usuario no especifica categoría, infiere la más lógica por la descripción.
- Si el monto usa "mil", "k" o "millón", conviértelo (35mil = 35000, 150k = 150000, 1.5M = 1500000).
- Para recategorización, usa solo transactionId exactos de las ÚLTIMAS TRANSACCIONES incluidas en el contexto.
- No inventes IDs. Si las últimas transacciones fueron omitidas o no tienes el ID, pide al usuario que solicite detalle.
- Solo prepara UNA acción por mensaje.
- Si necesitas datos que no tienes, pregunta en vez de adivinar`;

/**
 * Parsea la respuesta de Gemini para extraer acciones y texto limpio
 */
export function parseActionFromResponse(response: string): { text: string; action?: ChatAction } {
  const actionMatch = response.match(/<<<ACTION>>>\s*([\s\S]*?)\s*<<<END_ACTION>>>/);
  if (!actionMatch) {
    return { text: response };
  }

  const text = response.replace(/<<<ACTION>>>[\s\S]*<<<END_ACTION>>>/, '').trim();
  try {
    const action = JSON.parse(actionMatch[1]) as ChatAction;
    return { text, action };
  } catch {
    logger.warn('Failed to parse action JSON from Gemini response', { raw: actionMatch[1] });
    return { text: response };
  }
}

/**
 * Envía un mensaje al chatbot con contexto financiero.
 *
 * Usa models.generateContent con function calling confirmable. NO usa la
 * Interactions API (next-gen): ese endpoint (/v1beta/interactions) no devuelve
 * cabeceras CORS para orígenes web como GitHub Pages, así que el navegador
 * bloquea la llamada con "failed to fetch". generateContent sí soporta CORS y
 * es la misma superficie que usa el plan financiero.
 */
export interface ChatFinancialData {
  transactions: Transaction[];
  accounts: Account[];
  categories: Categories;
  budgets?: Budget[];
  recurringPayments?: RecurringPayment[];
  debts?: Debt[];
  savingsGoals?: SavingsGoal[];
}

type GenerateChatRequest = Parameters<
  Awaited<ReturnType<typeof getGeminiClient>>['models']['generateContent']
>[0];

/**
 * Construye el objeto de petición compartido por la llamada no-streaming
 * (generateContent) y la de streaming (generateContentStream). Ambas usan la
 * MISMA forma de parámetros (model, contents, config con tools/toolConfig), así
 * que extraerlo aquí garantiza que las dos rutas queden siempre sincronizadas.
 */
function buildChatRequest(
  message: string,
  history: ChatMessage[],
  financialData: ChatFinancialData,
): GenerateChatRequest {
  const financialContext = buildFinancialContext(
    financialData.transactions,
    financialData.accounts,
    financialData.categories,
    {
      includeRecentTransactions: shouldIncludeRecentTransactions(message),
      budgets: financialData.budgets,
      recurringPayments: financialData.recurringPayments,
      debts: financialData.debts,
      savingsGoals: financialData.savingsGoals,
    },
  );

  // System instruction + contexto financiero, y el historial como contents.
  const systemInstruction = `${SYSTEM_PROMPT}\n\n${financialContext}`;
  const contents = buildChatContents(message, history);

  return {
    model: getGeminiModel(),
    contents,
    config: {
      systemInstruction,
      temperature: 0.7,
      maxOutputTokens: 8192,
      tools: [{ functionDeclarations: CHAT_ACTION_FUNCTION_DECLARATIONS }],
      toolConfig: {
        functionCallingConfig: {
          // mode AUTO: el modelo decide libremente si responde texto o llama
          // una función. NO se pasa `allowedFunctionNames`: la API de Gemini
          // solo lo acepta con mode ANY (que forzaría SIEMPRE una llamada de
          // función, rompiendo preguntas de texto como "¿cómo voy este mes?").
          // Las funciones permitidas ya quedan acotadas por functionDeclarations
          // en `tools`, así que la restricción era redundante y causaba un 400
          // "Please set allowed_function_names only when ... mode is ANY".
          mode: 'AUTO' as FunctionCallingConfigMode,
        },
      },
    },
  };
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
  financialData: ChatFinancialData
): Promise<{ text: string; action?: ChatAction; tokenUsage?: TokenUsage }> {
  const client = await getGeminiClient();

  const request = buildChatRequest(message, history, financialData);

  // Retry con espera progresiva: 10s, 30s, 60s
  const RETRY_DELAYS = [10_000, 30_000, 60_000];

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const response = await client.models.generateContent(request);

      const call = response.functionCalls?.[0];
      const action = call ? parseActionFromFunctionCall(call) : undefined;
      const text = (response.text ?? '').trim()
        || (action ? 'Perfecto. Revisa y confirma la accion propuesta.' : '');

      const tokenUsage = extractGenerateContentTokenUsage(response);

      return { text: text || 'No pude generar una respuesta. Intenta de nuevo.', action, tokenUsage };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const is429 = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RATE_LIMIT');
      // 503/500/UNAVAILABLE/overloaded = el modelo está saturado (transitorio),
      // igual de reintentable que un 429. Antes solo se reintentaba el 429 y un
      // 503 se propagaba al instante como "error" (la UI lo mostraba como "API
      // key inválida"). Backoff más corto: la sobrecarga suele ceder en segundos.
      const isOverloaded = /\b50[0-9]\b/.test(errMsg)
        || /unavailable|overloaded|high demand/i.test(errMsg);

      if ((is429 || isOverloaded) && attempt < RETRY_DELAYS.length) {
        const retryMatch = errMsg.match(/retryDelay[":]+(\d+)/);
        const suggestedDelay = retryMatch ? parseInt(retryMatch[1]) * 1000 : RETRY_DELAYS[attempt];
        // Para sobrecarga usamos un backoff corto fijo (2s, 4s, 8s); para 429
        // respetamos el retryDelay sugerido por Google o la tabla progresiva.
        const overloadDelays = [2_000, 4_000, 8_000];
        const waitMs = isOverloaded && !is429
          ? overloadDelays[Math.min(attempt, overloadDelays.length - 1)]
          : Math.max(suggestedDelay, RETRY_DELAYS[attempt]);

        logger.warn(
          `Gemini ${isOverloaded && !is429 ? 'sobrecargado (503)' : 'rate limit (429)'}. Esperando ${Math.round(waitMs / 1000)}s...`,
          { attempt: attempt + 1, maxRetries: RETRY_DELAYS.length },
        );
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      throw error;
    }
  }

  throw new Error('No se pudo obtener respuesta después de varios intentos');
}

/**
 * Variante en streaming de sendChatMessage: usa models.generateContentStream
 * (misma superficie CORS que generateContent; NO la Interactions API) para
 * renderizar la respuesta token a token. El callback onTextDelta recibe el
 * texto ACUMULADO (no el delta suelto) en cada chunk de texto, de modo que la
 * UI solo tiene que reemplazar el contenido del mensaje en vivo.
 *
 * - Function calling se preserva intacto: las functionCall llegan completas en
 *   un chunk (el modelo no las parte), así que tomamos el primer
 *   functionCalls[0] visto y lo pasamos al mismo parseActionFromFunctionCall.
 * - Token usage: usageMetadata llega (de forma acumulada) en el último chunk;
 *   conservamos el último no nulo y lo pasamos por extractGenerateContentTokenUsage.
 *   Si ningún chunk lo trae, tokenUsage queda undefined (la UI ya lo trata como
 *   opcional).
 * - Fallback fail-closed: si el stream lanza, o termina sin texto y sin
 *   functionCall, caemos a sendChatMessage (ruta no-streaming probada, con sus
 *   reintentos 429/503). El streaming hace un solo intento para no sacrificar el
 *   feedback rápido que motiva esta mejora.
 */
export async function sendChatMessageStream(
  message: string,
  history: ChatMessage[],
  financialData: ChatFinancialData,
  onTextDelta: (fullText: string) => void,
): Promise<{ text: string; action?: ChatAction; tokenUsage?: TokenUsage }> {
  try {
    const client = await getGeminiClient();
    const request = buildChatRequest(message, history, financialData);

    const stream = await client.models.generateContentStream(request);

    let fullText = '';
    let firstCall: FunctionCall | undefined;
    let lastUsage: GenerateContentResponse['usageMetadata'] | undefined;

    for await (const chunk of stream) {
      const chunkText = chunk.text ?? '';
      if (chunkText) {
        fullText += chunkText;
        onTextDelta(fullText);
      }

      if (!firstCall) {
        const call = chunk.functionCalls?.[0];
        if (call) firstCall = call;
      }

      if (chunk.usageMetadata) {
        lastUsage = chunk.usageMetadata;
      }
    }

    const action = firstCall ? parseActionFromFunctionCall(firstCall) : undefined;
    const trimmed = fullText.trim();

    // Stream vacío (ni texto ni función): no es una respuesta útil, caer al
    // camino no-streaming que además reintenta ante sobrecarga transitoria.
    if (!trimmed && !firstCall) {
      return sendChatMessage(message, history, financialData);
    }

    const text = trimmed || (action ? 'Perfecto. Revisa y confirma la accion propuesta.' : '');
    const tokenUsage = lastUsage
      ? extractGenerateContentTokenUsage({ usageMetadata: lastUsage } as GenerateContentResponse)
      : undefined;

    return { text: text || 'No pude generar una respuesta. Intenta de nuevo.', action, tokenUsage };
  } catch (error) {
    logger.warn('[gemini] streaming falló, usando generateContent (fallback)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return sendChatMessage(message, history, financialData);
  }
}
