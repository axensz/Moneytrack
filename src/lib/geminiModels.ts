/**
 * MODELOS DINÁMICOS de Gemini.
 *
 * En vez de mantener a mano la lista de modelos (que quedaba obsoleta cada vez
 * que Google publicaba uno nuevo), este módulo consulta en vivo el endpoint
 * ListModels con la API key del usuario y devuelve solo los modelos de TEXTO
 * aptos para las tres superficies de MoneyTrack (chat con herramientas,
 * respuestas JSON y plan financiero): los que soportan `generateContent` y no
 * pertenecen a familias no aplicables (TTS, imagen, embeddings, audio nativo,
 * live, robotics, computer-use, lyria, deep-research, nano-banana).
 *
 * PRIVACIDAD: ListModels es solo lectura de metadatos de modelos; NO envía
 * datos financieros del usuario. Por eso basta con la key configurada y NO se
 * exige el consentimiento de IA (que sí es obligatorio en `getGeminiClient`,
 * el chokepoint real de envío de datos). Aun así, por prudencia, solo se llama
 * cuando hay una key configurada.
 */
import { getGeminiApiKey } from './geminiClient';
import {
  GEMINI_MODEL_OPTIONS,
  DEFAULT_GEMINI_MODEL,
  type GeminiModelId,
} from './geminiConfig';
import { logger } from '../utils/logger';

/** Opción de modelo mostrada en el selector de ajustes de IA. */
export interface GeminiModelOption {
  id: GeminiModelId;
  label: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
}

/** Respaldo estático: la lista hardcodeada de siempre (nunca dejar la IA sin opciones). */
export const FALLBACK_GEMINI_MODELS: GeminiModelOption[] = GEMINI_MODEL_OPTIONS.map((m) => ({
  id: m.id,
  label: m.label,
  description: m.description,
  inputTokenLimit: m.inputTokenLimit,
  outputTokenLimit: m.outputTokenLimit,
}));

const LIST_MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Patrones de familias que NO sirven para este asistente (se excluyen siempre). */
const EXCLUDED_MODEL_PATTERNS: RegExp[] = [
  /-tts\b/i,
  /-transcribe\b/i,
  /-image\b/i,
  /nano-banana/i,
  /embedding/i,
  /native-audio/i,
  /-live\b/i,
  /-live-/i,
  /robotics/i,
  /computer-use/i,
  /lyria/i,
  /deep-research/i,
];

/** Forma parcial de cada modelo devuelto por ListModels (solo lo que usamos). */
interface RawGeminiModel {
  name?: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

interface ListModelsResponse {
  models?: RawGeminiModel[];
}

/** Id de modelo = `name` sin el prefijo `models/`. */
function toModelId(name: string | undefined): string {
  return (name ?? '').replace(/^models\//, '');
}

/** ¿El modelo es de TEXTO apto para `generateContent` y no de una familia excluida? */
function isUsableTextModel(model: RawGeminiModel): boolean {
  const methods = model.supportedGenerationMethods ?? [];
  if (!methods.includes('generateContent')) return false;

  const id = toModelId(model.name);
  if (!id) return false;
  return !EXCLUDED_MODEL_PATTERNS.some((pattern) => pattern.test(id));
}

/** Etiqueta legible: usa `displayName` si existe, si no deriva una del id. */
function deriveLabel(model: RawGeminiModel): string {
  const display = (model.displayName ?? '').trim();
  if (display) return display;

  const id = toModelId(model.name);
  // "gemini-3.5-flash" -> "Gemini 3.5 Flash"
  return id
    .split('-')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ')
    .trim() || id;
}

/**
 * Orden sensato: primero los "flash" y luego los "pro"/resto, y dentro de cada
 * grupo por id descendente (los más recientes arriba), con los alias "*-latest"
 * al final de su grupo. No marca ninguno como recomendado (el default sigue
 * siendo un Flash definido en `DEFAULT_GEMINI_MODEL`).
 */
function sortModels(options: GeminiModelOption[]): GeminiModelOption[] {
  const rank = (id: string): number => {
    if (id.includes('flash')) return 0;
    if (id.includes('pro')) return 1;
    return 2;
  };
  return [...options].sort((a, b) => {
    const rankDiff = rank(a.id) - rank(b.id);
    if (rankDiff !== 0) return rankDiff;

    const aLatest = a.id.includes('latest');
    const bLatest = b.id.includes('latest');
    if (aLatest !== bLatest) return aLatest ? 1 : -1;

    return b.id.localeCompare(a.id, 'en');
  });
}

function mapToOption(model: RawGeminiModel): GeminiModelOption {
  return {
    id: toModelId(model.name),
    label: deriveLabel(model),
    description: (model.description ?? '').trim(),
    inputTokenLimit: model.inputTokenLimit ?? 0,
    outputTokenLimit: model.outputTokenLimit ?? 0,
  };
}

/** Convierte una respuesta cruda de ListModels en la lista filtrada y ordenada. */
export function filterTextModels(response: ListModelsResponse | null | undefined): GeminiModelOption[] {
  const models = response?.models ?? [];
  const usable = models.filter(isUsableTextModel).map(mapToOption);
  return sortModels(usable);
}

/** Caché en memoria por key (TTL corto). Se invalida al cambiar de key. */
const CACHE_TTL_MS = 5 * 60 * 1000;
interface CacheEntry {
  key: string;
  at: number;
  models: GeminiModelOption[];
}
let cache: CacheEntry | null = null;

/** Limpia la caché (útil al cambiar de usuario/key o en tests). */
export function clearGeminiModelsCache(): void {
  cache = null;
}

/**
 * Carga la lista de modelos de texto disponibles para la key del usuario.
 *
 * FALLBACK ROBUSTO: si no hay key, la consulta falla, o devuelve vacío, cae a
 * la lista estática `FALLBACK_GEMINI_MODELS`. La IA nunca queda sin opciones.
 *
 * @param options.force Ignora la caché y vuelve a consultar.
 */
export async function loadGeminiModels(
  options: { force?: boolean } = {},
): Promise<GeminiModelOption[]> {
  const key = getGeminiApiKey();

  // Sin key: no se consulta nada; se usa el respaldo estático.
  if (!key) return FALLBACK_GEMINI_MODELS;

  // Caché válida para esta misma key.
  if (
    !options.force
    && cache
    && cache.key === key
    && Date.now() - cache.at < CACHE_TTL_MS
  ) {
    return cache.models;
  }

  try {
    const url = `${LIST_MODELS_ENDPOINT}?key=${encodeURIComponent(key)}&pageSize=1000`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`ListModels respondió ${res.status}`);
    }
    const data = (await res.json()) as ListModelsResponse;
    const models = filterTextModels(data);

    // Respuesta vacía (o todo filtrado): mantener el respaldo estático.
    if (models.length === 0) return FALLBACK_GEMINI_MODELS;

    cache = { key, at: Date.now(), models };
    return models;
  } catch (err) {
    logger.error('No se pudieron cargar los modelos de Gemini (se usa el respaldo estático)', err);
    return FALLBACK_GEMINI_MODELS;
  }
}

/**
 * Busca la opción de un modelo en una lista dada. Si el modelo guardado ya no
 * aparece (Google lo retiró), devuelve `undefined` para que la UI degrade con
 * elegancia (caer al default o marcarlo como no disponible).
 */
export function findModelOption(
  models: GeminiModelOption[],
  id: GeminiModelId,
): GeminiModelOption | undefined {
  return models.find((m) => m.id === id);
}

/** Default reexportado para conveniencia de la UI. */
export { DEFAULT_GEMINI_MODEL };
