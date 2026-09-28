export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash' as const;

/**
 * Modelos estables que soportan las tres superficies de MoneyTrack:
 * chat con herramientas, respuestas JSON y plan financiero.
 */
export const GEMINI_MODEL_OPTIONS = [
  {
    id: DEFAULT_GEMINI_MODEL,
    label: 'Gemini 3.5 Flash',
    description: 'Equilibrio recomendado entre calidad, velocidad y costo.',
    inputTokenLimit: 1_048_576,
    outputTokenLimit: 65_536,
  },
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    description: 'Más rápido y económico para consultas sencillas.',
    inputTokenLimit: 1_048_576,
    outputTokenLimit: 65_536,
  },
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    description: 'Mayor capacidad para análisis y tareas complejas.',
    inputTokenLimit: 1_048_576,
    outputTokenLimit: 65_536,
  },
] as const;

export type GeminiModelId = (typeof GEMINI_MODEL_OPTIONS)[number]['id'];

let currentModel: GeminiModelId = DEFAULT_GEMINI_MODEL;

export function isGeminiModelId(value: unknown): value is GeminiModelId {
  return typeof value === 'string'
    && GEMINI_MODEL_OPTIONS.some((option) => option.id === value);
}

export function normalizeGeminiModel(value: unknown): GeminiModelId {
  return isGeminiModelId(value) ? value : DEFAULT_GEMINI_MODEL;
}

/** Modelo único usado por chat, filtros inteligentes y plan financiero. */
export function setGeminiModel(value: unknown): void {
  currentModel = normalizeGeminiModel(value);
}

export function getGeminiModel(): GeminiModelId {
  return currentModel;
}

export function getGeminiModelOption(model: GeminiModelId) {
  return GEMINI_MODEL_OPTIONS.find((option) => option.id === model)
    ?? GEMINI_MODEL_OPTIONS[0];
}

export const GEMINI_JSON_MIME_TYPE = 'application/json';

export const geminiJsonConfig = (responseJsonSchema: unknown) => ({
  responseMimeType: GEMINI_JSON_MIME_TYPE,
  responseJsonSchema,
});

type JsonRoot = 'array' | 'object';

function stripMarkdownFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonRoot(text: string, root: JsonRoot): string {
  const cleaned = stripMarkdownFence(text);
  if (root === 'array') {
    const match = cleaned.match(/\[[\s\S]*\]/);
    return match ? match[0] : cleaned;
  }

  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? match[0] : cleaned;
}

export function parseGeminiJson<T>(rawText: string, root: JsonRoot): T | null {
  const text = (rawText ?? '').trim();
  if (!text) return null;

  try {
    return JSON.parse(extractJsonRoot(text, root)) as T;
  } catch {
    return null;
  }
}

export const dateRangeResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    startDate: {
      type: 'string',
      description: 'Fecha inicial en formato YYYY-MM-DD.',
    },
    endDate: {
      type: 'string',
      description: 'Fecha final en formato YYYY-MM-DD.',
    },
  },
  required: ['startDate', 'endDate'],
};
