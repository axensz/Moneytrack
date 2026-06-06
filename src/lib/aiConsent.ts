/**
 * Consentimiento de IA (S4) — estado central en memoria.
 *
 * Antes de enviar datos financieros (descripciones, montos, PDFs) a Google Gemini,
 * el usuario debe autorizarlo explícitamente. Por defecto está DESACTIVADO: la app
 * funciona normal sin IA y nada sale del dispositivo sin consentimiento.
 *
 * Este módulo mantiene el estado activo en memoria; `useGeminiApiKey` lo sincroniza
 * desde localStorage/Firestore según el usuario. El gate efectivo vive en
 * `geminiClient.getGeminiClient()` (chokepoint de TODA llamada a Gemini).
 */

let consentGranted = false;

/** Define el consentimiento del usuario activo (la llama useGeminiApiKey). */
export function setAiConsent(value: boolean | null | undefined): void {
  consentGranted = value === true;
}

/** ¿El usuario autorizó enviar sus datos a la IA? */
export function hasAiConsent(): boolean {
  return consentGranted;
}
