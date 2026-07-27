export const GEMINI_MODELS = {
  chat: 'gemini-3.5-flash',
  planning: 'gemini-3.5-flash',
  structured: 'gemini-3.5-flash',
} as const;

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
