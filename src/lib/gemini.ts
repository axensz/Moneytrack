/**
 * Servicio de IA con Google Gemini (Free Tier)
 * Usa @google/genai SDK con modelos centralizados por tarea.
 */

import { getGeminiClient, isAiEnabled } from './geminiClient';
import { GEMINI_MODELS } from './geminiConfig';
import type { FunctionCall } from '@google/genai';
import type { Transaction, Account, Categories } from '../types/finance';
import { formatCurrency } from '../utils/formatters';
import { BalanceCalculator } from '../utils/balanceCalculator';
import { getCreditCardUsedCredit } from '../utils/accountStrategies';
import { findAccountForTransaction } from '../utils/accountTransactions';
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

interface FinancialContextOptions {
  includeRecentTransactions?: boolean;
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

📋 ÚLTIMAS 20 TRANSACCIONES:
${recentTx || '  (Sin transacciones)'}

🏷️ CATEGORÍAS DISPONIBLES:
${cats}

Total de transacciones históricas: ${transactions.length} (reales: ${realTransactions.length})
`.trim();
}

const ACTION_FUNCTION_NAMES = [
  'add_transaction',
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

const CHAT_ACTION_INTERACTION_TOOLS = CHAT_ACTION_FUNCTION_DEFINITIONS.map((definition) => ({
  type: 'function' as const,
  name: definition.name,
  description: definition.description,
  parameters: definition.parameters,
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

function extractTextFromContentBlocks(content: unknown): string[] {
  if (!Array.isArray(content)) return [];

  return content.flatMap((item) => {
    if (!isRecord(item) || item.type !== 'text') return [];
    const text = stringValue(item.text);
    return text ? [text] : [];
  });
}

function extractTextFromInteractionItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];

  return items.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (item.type === 'text') {
      const text = stringValue(item.text);
      return text ? [text] : [];
    }
    if (item.type === 'model_output') {
      return extractTextFromContentBlocks(item.content);
    }
    return [];
  });
}

function extractInteractionText(payload: unknown): string {
  if (!isRecord(payload)) return '';

  const outputText = stringValue(payload.output_text);
  if (outputText) return outputText;

  return [
    ...extractTextFromInteractionItems(payload.outputs),
    ...extractTextFromInteractionItems(payload.steps),
  ].join('\n').trim();
}

function extractInteractionTokenUsage(payload: unknown): TokenUsage | undefined {
  if (!isRecord(payload) || !isRecord(payload.usage)) return undefined;

  const promptTokens = numberValue(payload.usage.total_input_tokens) ?? 0;
  const responseTokens = numberValue(payload.usage.total_output_tokens) ?? 0;
  const totalTokens = numberValue(payload.usage.total_tokens) ?? promptTokens + responseTokens;
  const thinkingTokens = numberValue(payload.usage.total_thought_tokens) ?? undefined;

  return {
    promptTokens,
    responseTokens,
    totalTokens,
    thinkingTokens,
  };
}

function shouldIncludeRecentTransactions(message: string): boolean {
  return /\b(transacci|movimiento|recategori|categoria|categoría|agrega|agregar|gaste|gast[eé]|ingreso|cuenta|ultimo|último|detalle|editar|cambiar)\b/i.test(message);
}

function buildInteractionInput(message: string, history: ChatMessage[]): string {
  const historyText = history
    .map((item) => `${item.role === 'user' ? 'Usuario' : 'Asistente'}: ${item.content}`)
    .join('\n\n');

  return historyText ? `${historyText}\n\nUsuario: ${message}` : message;
}

const SYSTEM_PROMPT = `Eres el asistente financiero de MoneyTrack, una app de finanzas personales colombiana.

TU PERSONALIDAD:
- Amigable, directo y práctico
- Respondes en español colombiano
- Usas formato de moneda colombiana ($ con separador de miles punto, ej: $ 1.500.000)
- Eres CONCISO pero con datos concretos

TUS CAPACIDADES:
1. ANALIZAR las finanzas del usuario con datos concretos (montos, porcentajes, tendencias)
2. COMPARAR meses y detectar patrones de gasto
3. DAR CONSEJOS financieros personalizados basados en los datos reales
4. CALCULAR proyecciones, promedios y métricas útiles
5. ALERTAR sobre gastos excesivos, categorías que crecen, o riesgos financieros
6. RESPONDER preguntas específicas sobre transacciones, cuentas y categorías

CÓMO RESPONDER:
- MÁXIMO 2-3 párrafos cortos por respuesta. Sé directo y ve al grano.
- Si hay más para decir, cierra con algo como "¿Quieres que profundice en algún punto?" o "¿Te cuento más sobre X?"
- Usa **negritas** para resaltar montos importantes
- Puedes usar listas cortas (máximo 4-5 items) si es necesario
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
Cuando el usuario pida agregar una transacción, recategorizar o crear categorías, usa una llamada de herramienta disponible. No escribas JSON ni bloques <<<ACTION>>> en el texto.

REGLAS DE ACCIONES:
- Explica brevemente que prepararas la accion y que el usuario debe confirmarla en la tarjeta de MoneyTrack.
- Si el usuario no especifica cuenta, usa la cuenta por defecto si aparece en el contexto; si no, pregunta.
- Si el usuario no especifica categoría, infiere la más lógica por la descripción.
- Si el monto usa "mil" o "k", conviertelo (35mil = 35000, 150k = 150000).
- Para recategorizacion, usa solo transactionId exactos de las ULTIMAS TRANSACCIONES incluidas en el contexto.
- No inventes IDs. Si las últimas transacciones fueron omitidas o no tienes el ID, pide al usuario que solicite detalle.
- Solo prepara UNA accion por mensaje.
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
 * Usa Interactions API para chat y function calling confirmable.
 */
export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
  financialData: {
    transactions: Transaction[];
    accounts: Account[];
    categories: Categories;
  }
): Promise<{ text: string; action?: ChatAction; tokenUsage?: TokenUsage }> {
  const client = await getGeminiClient();

  const financialContext = buildFinancialContext(
    financialData.transactions,
    financialData.accounts,
    financialData.categories,
    { includeRecentTransactions: shouldIncludeRecentTransactions(message) },
  );

  // Construir el contenido completo del prompt
  const systemInstruction = `${SYSTEM_PROMPT}\n\n${financialContext}`;
  const input = buildInteractionInput(message, history);

  // Construir historial de mensajes para la API
  // Agregar historial de conversación previo
  // Agregar el mensaje actual
  // Retry con espera progresiva: 10s, 30s, 60s
  const RETRY_DELAYS = [10_000, 30_000, 60_000];

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const response = await client.interactions.create({
        model: GEMINI_MODELS.chat,
        input,
        stream: false,
        store: false,
        system_instruction: systemInstruction,
        tools: CHAT_ACTION_INTERACTION_TOOLS,
        generation_config: {
          temperature: 0.7,
          max_output_tokens: 8192,
          tool_choice: {
            allowed_tools: {
              mode: 'validated',
              tools: [...ACTION_FUNCTION_NAMES],
            },
          },
        },
      });

      const action = parseActionFromInteractionPayload(response);
      const text = extractInteractionText(response) || (action ? 'Perfecto. Revisa y confirma la accion propuesta.' : '');

      const tokenUsage = extractInteractionTokenUsage(response);

      return { text: text || 'No pude generar una respuesta. Intenta de nuevo.', action, tokenUsage };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const is429 = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RATE_LIMIT');

      if (is429 && attempt < RETRY_DELAYS.length) {
        const retryMatch = errMsg.match(/retryDelay[":]+(\d+)/);
        const suggestedDelay = retryMatch ? parseInt(retryMatch[1]) * 1000 : RETRY_DELAYS[attempt];
        const waitMs = Math.max(suggestedDelay, RETRY_DELAYS[attempt]);

        logger.warn(`Gemini rate limit (429). Waiting ${Math.round(waitMs / 1000)}s...`, { attempt: attempt + 1, maxRetries: RETRY_DELAYS.length });
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      throw error;
    }
  }

  throw new Error('No se pudo obtener respuesta después de varios intentos');
}
