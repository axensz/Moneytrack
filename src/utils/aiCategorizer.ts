/**
 * Categorización inteligente de transacciones usando Gemini AI.
 * Analiza descripciones crípticas de extractos bancarios y asigna categorías.
 */

import { GoogleGenAI } from '@google/genai';
import { DEFAULT_CATEGORIES } from '../config/constants';
import { logger } from './logger';

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

const ALL_CATEGORIES = [
    ...DEFAULT_CATEGORIES.expense,
    ...DEFAULT_CATEGORIES.income,
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
    confidence: 'high' | 'medium' | 'low';
}

/**
 * Usa Gemini para categorizar un lote de transacciones bancarias.
 * Envía las descripciones en batch y recibe categorías sugeridas.
 * Retorna solo las que cambian respecto a la categoría actual.
 */
export async function categorizeWithAI(
    transactions: TransactionToCateg[]
): Promise<CategorizationResult[]> {
    if (!API_KEY || transactions.length === 0) return [];

    const ai = new GoogleGenAI({ apiKey: API_KEY });

    // Limitar a 50 transacciones por llamada para no exceder tokens
    const batch = transactions.slice(0, 50);

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
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
        });

        const text = response.text?.trim() || '';
        // Limpiar posible markdown wrapping
        const jsonStr = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
        const parsed: Array<{ i: number; c: string; conf: string }> = JSON.parse(jsonStr);

        return parsed
            .filter(r => ALL_CATEGORIES.includes(r.c))
            .map(r => ({
                index: r.i,
                category: r.c,
                confidence: (r.conf as 'high' | 'medium' | 'low') || 'low',
            }));
    } catch (err) {
        logger.error('AI categorization failed', err);
        return [];
    }
}

/**
 * Verifica si Gemini está disponible para categorización.
 */
export function isAIAvailable(): boolean {
    return !!API_KEY;
}
