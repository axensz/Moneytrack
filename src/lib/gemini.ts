/**
 * Servicio de IA con Google Gemini (Free Tier)
 * Usa @google/genai SDK (nueva generación) con gemini-2.5-flash
 */

import { GoogleGenAI } from '@google/genai';
import type { Transaction, Account, Categories } from '../types/finance';
import { formatCurrency } from '../utils/formatters';
import { BalanceCalculator } from '../utils/balanceCalculator';
import { CreditCardCalculator } from '../utils/balanceCalculator';
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

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    if (!API_KEY) {
      throw new Error('NEXT_PUBLIC_GEMINI_API_KEY no está configurada');
    }
    ai = new GoogleGenAI({ apiKey: API_KEY });
  }
  return ai;
}

export function isGeminiConfigured(): boolean {
  return !!API_KEY && API_KEY.length > 10;
}

/**
 * Genera el contexto financiero del usuario para el prompt del sistema
 */
export function buildFinancialContext(
  transactions: Transaction[],
  accounts: Account[],
  categories: Categories
): string {
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
        const used = CreditCardCalculator.calculateUsedCredit(a, transactions);
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
    .reduce((sum, a) => sum + CreditCardCalculator.calculateUsedCredit(a, transactions), 0);

  // --- ÚLTIMAS 20 TRANSACCIONES (con IDs para acciones) ---
  const recentTx = realTransactions
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20)
    .map(t => {
      const tipo = t.type === 'income' ? '📈 Ingreso' : t.type === 'expense' ? '📉 Gasto' : '🔄 Transferencia';
      const fecha = new Date(t.date).toLocaleDateString('es-CO');
      const account = findAccountForTransaction(accounts, t.accountId);
      const estado = t.paid ? '' : ' [PENDIENTE]';
      return `  - [ID:${t.id}] ${fecha} | ${tipo} | ${formatCurrency(t.amount)} | ${t.category} | ${t.description} | ${account?.name || 'N/A'} [ACC:${t.accountId}]${estado}`;
    }).join('\n');

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

ACCIONES - PUEDES EJECUTAR ACCIONES EN LA APP:
Cuando el usuario te pida agregar una transacción, recategorizar, o crear categorías, incluye un bloque de acción al FINAL de tu respuesta.

FORMATO DE ACCIÓN (SIEMPRE al final del mensaje, después del texto):
<<<ACTION>>>
{JSON de la acción}
<<<END_ACTION>>>

TIPOS DE ACCIÓN DISPONIBLES:

1. AGREGAR TRANSACCIÓN:
<<<ACTION>>>
{"type":"add_transaction","data":{"txType":"expense","amount":35000,"category":"Alimentación","description":"Almuerzo","accountId":"ID_DE_CUENTA","accountName":"Bancolombia","paid":true}}
<<<END_ACTION>>>

2. RECATEGORIZAR UNA TRANSACCIÓN:
<<<ACTION>>>
{"type":"update_category","data":{"transactionId":"ID","oldCategory":"Otros","newCategory":"Transporte","description":"Descripción de la tx"}}
<<<END_ACTION>>>

3. RECATEGORIZAR VARIAS TRANSACCIONES A LA VEZ:
<<<ACTION>>>
{"type":"bulk_update_category","data":{"updates":[{"transactionId":"ID1","oldCategory":"Otros","newCategory":"Transporte","description":"Desc1"},{"transactionId":"ID2","oldCategory":"Otros","newCategory":"Compras Personales","description":"Desc2"}]}}
<<<END_ACTION>>>

4. CREAR NUEVA CATEGORÍA:
<<<ACTION>>>
{"type":"add_category","data":{"categoryType":"expense","name":"Mascotas"}}
<<<END_ACTION>>>

REGLAS DE ACCIONES:
- SIEMPRE confirma lo que vas a hacer ANTES del bloque de acción (ej: "Perfecto, voy a agregar ese gasto...")
- Si el usuario no especifica cuenta, usa la cuenta por defecto o pregunta
- Si el usuario no especifica categoría, infiere la más lógica por la descripción
- Si el monto usa "mil" o "k", conviértelo (35mil = 35000, 150k = 150000)
- Para recategorización, necesitas el transactionId exacto de los datos del contexto
- NO inventes transactionIds, solo usa los que aparecen en las ÚLTIMAS TRANSACCIONES del contexto
- Solo incluye UNA acción por mensaje
- Si necesitas datos que no tienes (ej: qué cuenta usar), PREGUNTA en vez de adivinar`;

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
 * Usa @google/genai SDK con gemini-2.0-flash.
 */
export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
  financialData: {
    transactions: Transaction[];
    accounts: Account[];
    categories: Categories;
  }
): Promise<{ text: string; tokenUsage?: TokenUsage }> {
  const client = getAI();

  const financialContext = buildFinancialContext(
    financialData.transactions,
    financialData.accounts,
    financialData.categories
  );

  // Construir el contenido completo del prompt
  const systemInstruction = `${SYSTEM_PROMPT}\n\n${financialContext}`;

  // Construir historial de mensajes para la API
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  // Agregar historial de conversación previo
  for (const msg of history) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    });
  }

  // Agregar el mensaje actual
  contents.push({
    role: 'user',
    parts: [{ text: message }],
  });

  // Retry con espera progresiva: 10s, 30s, 60s
  const RETRY_DELAYS = [10_000, 30_000, 60_000];

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      });

      const text = response.text || '';

      // Extraer token usage
      const usageMetadata = response.usageMetadata;
      const tokenUsage: TokenUsage | undefined = usageMetadata ? {
        promptTokens: usageMetadata.promptTokenCount || 0,
        responseTokens: usageMetadata.candidatesTokenCount || 0,
        totalTokens: usageMetadata.totalTokenCount || 0,
        thinkingTokens: 'thoughtsTokenCount' in usageMetadata
          ? (usageMetadata.thoughtsTokenCount as number | undefined)
          : undefined,
      } : undefined;
      
      // Si la respuesta se cortó por tokens, agregar indicador
      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason === 'MAX_TOKENS' && text) {
        return { text: text.trimEnd() + '\n\n_(Respuesta resumida por límite de longitud)_', tokenUsage };
      }

      return { text: text || 'No pude generar una respuesta. Intenta de nuevo.', tokenUsage };
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
