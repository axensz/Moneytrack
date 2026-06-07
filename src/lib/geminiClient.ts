/**
 * Cliente Gemini centralizado para BYOK (Bring Your Own Key).
 *
 * La API key la aporta CADA usuario (se obtiene gratis en
 * https://aistudio.google.com/apikey) y vive solo en su navegador. Este módulo
 * mantiene la key activa en memoria; `useGeminiApiKey` la sincroniza desde
 * localStorage según el usuario logueado.
 *
 * BYOK puro: no hay key de servidor ni en el bundle. Sin key del usuario, las
 * funciones de IA quedan desactivadas (el resto de la app funciona normal).
 */
import { GoogleGenAI } from '@google/genai';
import { hasAiConsent } from './aiConsent';

let currentKey = '';
let cachedClient: GoogleGenAI | null = null;
let cachedClientKey = '';

/** Define la key del usuario activo (la llama useGeminiApiKey). */
export function setGeminiApiKey(key: string | null | undefined): void {
  currentKey = (key ?? '').trim();
}

/** Key efectiva del usuario activo. */
export function getGeminiApiKey(): string {
  return currentKey;
}

/** ¿Hay una key utilizable configurada? */
export function isGeminiKeyConfigured(): boolean {
  return getGeminiApiKey().length > 10;
}

/**
 * ¿Está la IA realmente habilitada? Requiere key configurada Y consentimiento
 * explícito del usuario (S4). Es el check que deben usar las superficies de UI
 * para mostrar/activar funciones de IA.
 */
export function isAiEnabled(): boolean {
  return isGeminiKeyConfigured() && hasAiConsent();
}

/**
 * Devuelve un cliente GoogleGenAI con la key activa, cacheado y recreado solo
 * cuando la key cambia. Lanza si no hay key configurada o si el usuario no ha
 * dado consentimiento para enviar sus datos a Google (chokepoint de privacidad).
 */
export function getGeminiClient(): GoogleGenAI {
  const key = getGeminiApiKey();
  if (!key) {
    throw new Error('No hay API key de Gemini configurada. Agrégala en Ajustes.');
  }
  if (!hasAiConsent()) {
    throw new Error('Debes autorizar el uso de IA en Ajustes antes de enviar tus datos a Google.');
  }
  if (!cachedClient || cachedClientKey !== key) {
    cachedClient = new GoogleGenAI({ apiKey: key });
    cachedClientKey = key;
  }
  return cachedClient;
}
