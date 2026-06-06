/**
 * Categorización inteligente de transacciones usando Gemini AI.
 * Analiza descripciones crípticas de extractos bancarios y asigna categorías.
 */

import { DEFAULT_CATEGORIES } from '../config/constants';
import { logger } from './logger';
import { withTimeout } from './withTimeout';
import { getGeminiClient, isGeminiKeyConfigured } from '../lib/geminiClient';

// Confianza mínima para que una sugerencia de IA se considere aplicable.
// Por debajo de esto se ignora (la transacción queda en su categoría actual / 'Otros').
export const AI_CONFIDENCE_THRESHOLD = 0.75;

// Tiempo máximo de espera para la llamada a Gemini (evita colgar la importación).
const AI_TIMEOUT_MS = 20_000;

const ALL_CATEGORIES = [
    ...new Set([...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income]),
];

interface TransactionToCateg {
    index: number;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    currentCategory: string;
}

interface CategorizationResult {
    index: number;
    category: string;
    confidence: number;
    reason?: string;
}

function normalizeConfidence(confidence: unknown): number {
    if (typeof confidence === 'number' && Number.isFinite(confidence)) {
        return Math.max(0, Math.min(1, confidence));
    }

    const value = String(confidence ?? '').toLowerCase();
    if (value === 'high') return 0.9;
    if (value === 'medium') return 0.65;
    if (value === 'low') return 0.35;
    return 0;
}

/**
 * Parsea la respuesta cruda de Gemini de forma robusta y segura.
 *
 * - Tolera markdown (```json … ```), texto antes/después y extrae el primer array.
 * - JSON inválido → devuelve [] (no lanza).
 * - Descarta categorías que no existen en la lista oficial.
 * - Descarta sugerencias por debajo del umbral de confianza.
 *
 * Exportada para poder testearla sin llamar a la red.
 */
export function parseAICategorizationResponse(
    rawText: string,
    minConfidence: number = AI_CONFIDENCE_THRESHOLD,
): CategorizationResult[] {
    const text = (rawText ?? '').trim();
    if (!text) return [];

    // Extraer el primer array JSON aunque venga envuelto en prosa o markdown.
    const match = text.match(/\[[\s\S]*\]/);
    const jsonStr = match ? match[0] : text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');

    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonStr);
    } catch {
        logger.warn('AI categorization returned invalid JSON');
        return [];
    }
    if (!Array.isArray(parsed)) return [];

    return (parsed as Array<{ i?: number; c?: string; conf?: string; confidence?: number; reason?: string }>)
        .filter(r => typeof r?.i === 'number' && typeof r?.c === 'string' && (ALL_CATEGORIES as string[]).includes(r.c))
        .map(r => ({
            index: r.i as number,
            category: r.c as string,
            confidence: normalizeConfidence(r.confidence ?? r.conf),
            reason: r.reason,
        }))
        .filter(r => r.confidence >= minConfidence);
}

/**
 * Usa Gemini para categorizar un lote de transacciones bancarias.
 * Envía las descripciones en batch y recibe categorías sugeridas.
 * Retorna solo las que cambian respecto a la categoría actual.
 */
export async function categorizeWithAI(
    transactions: TransactionToCateg[]
): Promise<CategorizationResult[]> {
    if (!isGeminiKeyConfigured() || transactions.length === 0) return [];

    const ai = getGeminiClient();

    // Limitar a 50 transacciones por llamada para no exceder tokens
    const batch = transactions.slice(0, 50);
    if (transactions.length > batch.length) {
        logger.warn(`AI categorization truncated to ${batch.length} of ${transactions.length} items`);
    }

    const txList = batch.map(t =>
        `${t.index}|${t.type}|${t.amount}|${t.description}`
    ).join('\n');

    const prompt = `Eres un categorizador de transacciones bancarias colombianas.

CATEGORÍAS DISPONIBLES (usa EXACTAMENTE estos nombres):
${ALL_CATEGORIES.map(c => `- ${c}`).join('\n')}

TRANSACCIONES (formato: índice|tipo|monto|descripción):
${txList}

Para cada transacción, responde SOLO con JSON array. Cada elemento:
{"i": índice, "c": "categoría exacta", "conf": "high"|"medium"|"low"}

Reglas:
- Usa SOLO categorías de la lista
- "conf" indica tu confianza: high si es obvio, medium si es probable, low si es incierto
- Descripciones como "COMPRA POS" analiza el comercio para categorizar
- Nequi/Daviplata transferencias son "Otros" a menos que el contexto indique otra cosa
- Si no puedes determinar, usa "Otros" con conf "low"

Responde SOLO el JSON array, sin markdown ni explicaciones.`;

    try {
        const response = await withTimeout(
            ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            }),
            AI_TIMEOUT_MS,
            'categorización IA',
        );

        // El parser tolera JSON inválido, markdown y confianza baja sin lanzar.
        return parseAICategorizationResponse(response.text ?? '');
    } catch (err) {
        // Timeout, error de red o de la API → fallback silencioso (no bloquea la importación).
        logger.error('AI categorization failed', err);
        return [];
    }
}

/**
 * Verifica si Gemini está disponible para categorización.
 */
export function isAIAvailable(): boolean {
    return isGeminiKeyConfigured();
}
