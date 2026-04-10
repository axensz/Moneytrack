/**
 * Parser de extractos bancarios en formato PDF usando Gemini AI.
 * Envía el PDF directamente a la API (inlineData) — no requiere extracción de texto.
 * Funciona con cualquier banco colombiano o internacional.
 */

import { GoogleGenAI } from '@google/genai';
import type { ParseResult, ParsedRow } from './csvParser';
import { suggestCategory } from './csvParser';

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

export function isPDFParsingAvailable(): boolean {
  return !!API_KEY && API_KEY.length > 10;
}

// ── Prompt del sistema ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un extractor experto de transacciones bancarias.
Se te entrega un extracto bancario en PDF. Tu única tarea es extraer TODAS las transacciones y devolverlas como JSON puro (sin markdown, sin explicaciones, sin texto extra).

Formato de respuesta requerido (array JSON):
[
  {"date":"YYYY-MM-DD","description":"DESCRIPCION EXACTA","amount":12345.67,"type":"income"},
  ...
]

Reglas estrictas:
1. "date": formato ISO YYYY-MM-DD. Usa el período DESDE/HASTA del encabezado para inferir el año.
2. "amount": siempre número positivo (sin signo).
3. "type": "income" si el valor es positivo/abono/crédito, "expense" si es negativo/cargo/débito.
4. "description": texto exacto de la columna descripción, sin truncar.
5. Incluye ABSOLUTAMENTE TODAS las transacciones, incluso los abonos de intereses pequeños (.60, .92, etc.).
6. Ignora: filas de encabezado, tabla de resumen (saldo anterior, total abonos, etc.) y "FIN ESTADO DE CUENTA".
7. Para montos sin cero inicial como ".60" o ".04", el amount es 0.60 y 0.04 respectivamente.
8. Devuelve SOLO el JSON, sin ningún texto antes ni después.`;

// ── Función principal ─────────────────────────────────────────────────────────

export async function parsePDF(buffer: ArrayBuffer): Promise<ParseResult> {
  if (!isPDFParsingAvailable()) {
    return {
      rows: [],
      errors: [
        'Para importar PDFs necesitas configurar la IA (Gemini API Key). ' +
        'Descarga el extracto en formato Excel (.xlsx) para importar sin IA.',
      ],
      totalRows: 0,
      skippedRows: 0,
    };
  }

  // ── Convertir ArrayBuffer a base64 ────────────────────────────────────────
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Procesar en chunks para evitar stack overflow en archivos grandes
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const base64 = btoa(binary);

  // ── Llamar a Gemini con el PDF inline ─────────────────────────────────────
  let rawText = '';
  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64,
              },
            },
            { text: SYSTEM_PROMPT },
          ],
        },
      ],
      config: {
        temperature: 0.05,
        maxOutputTokens: 16384,
      },
    });
    rawText = (response.text || '').trim();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isQuotaError = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('free_tier');
    const userMessage = isQuotaError
      ? 'Cuota de Gemini AI agotada. La capa gratuita tiene un límite diario de solicitudes. Espera unas horas e intenta de nuevo, o revisa tu plan en ai.google.dev.'
      : `Error al procesar el PDF con IA: ${msg}`;
    return {
      rows: [],
      errors: [userMessage],
      totalRows: 0,
      skippedRows: 0,
    };
  }

  // ── Limpiar posible markdown del response ─────────────────────────────────
  const jsonStr = rawText
    .replace(/^```json?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // ── Parsear JSON ─────────────────────────────────────────────────────────
  let parsed: Array<{
    date: string;
    description: string;
    amount: number;
    type: string;
  }>;

  try {
    parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) throw new Error('La respuesta no es un array');
  } catch {
    return {
      rows: [],
      errors: [
        'La IA no pudo extraer transacciones del PDF. ' +
        'Intenta con formato Excel (.xlsx) o CSV.',
      ],
      totalRows: 0,
      skippedRows: 0,
    };
  }

  // ── Convertir a ParsedRow ─────────────────────────────────────────────────
  const rows: ParsedRow[] = [];
  let skippedRows = 0;

  for (const item of parsed) {
    // Validar fecha ISO
    const dateObj = new Date(item.date);
    if (isNaN(dateObj.getTime())) {
      skippedRows++;
      continue;
    }

    // Validar monto
    const amount = typeof item.amount === 'number'
      ? Math.abs(item.amount)
      : parseFloat(String(item.amount));
    if (isNaN(amount) || amount === 0) {
      skippedRows++;
      continue;
    }

    const description = String(item.description || '').trim();
    if (!description) {
      skippedRows++;
      continue;
    }

    const type: 'income' | 'expense' =
      item.type === 'income' ? 'income' : 'expense';

    rows.push({
      date: dateObj,
      description,
      amount,
      type,
      suggestedCategory: suggestCategory(description, type),
      rawLine: `${item.date}|${description}|${item.amount}`,
    });
  }

  const errors: string[] = [];
  if (rows.length === 0) {
    errors.push('No se encontraron transacciones en el PDF. Verifica que sea un extracto bancario válido.');
  }

  return {
    rows,
    errors,
    totalRows: parsed.length,
    skippedRows,
  };
}
