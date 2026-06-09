import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, deleteField } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { setGeminiApiKey } from '../lib/geminiClient';
import { setAiConsent } from '../lib/aiConsent';
import { logger } from '../utils/logger';

/**
 * BYOK: gestiona la API key de Gemini del usuario activo.
 *
 * Persistencia:
 * - La API key NO se persiste en localStorage para evitar almacenar información
 *   sensible en texto claro en el navegador. Vive solo en memoria durante la
 *   sesión y, si hay usuario autenticado, se sincroniza desde Firestore
 *   (`users/{uid}/settings/ai`), que es la fuente de verdad entre dispositivos.
 * - El consentimiento de IA (booleano, NO sensible) sí se cachea en localStorage
 *   para no re-preguntar en cada carga.
 *
 * Seguridad: el doc solo lo lee/escribe su dueño (reglas Firestore), Firestore
 * cifra en reposo, y la key nunca se loguea. Se recomienda al usuario restringir
 * su key en Google AI Studio como defensa en profundidad.
 *
 * MODELO DE AMENAZA (S-gemini-plaintext — decisión: aceptar + endurecer, no cifrar).
 * La key se guarda en texto plano en `settings/ai` y el SDK de Firestore la
 * cachea en IndexedDB (persistentLocalCache). NO se cifra en cliente a propósito:
 * en una PWA static-export sin backend, el cifrado en reposo client-side es
 * teatro — la clave de descifrado tendría que estar disponible al mismo JS, así
 * que un XSS que lee el cifrado también lee la clave; protección real exigiría
 * una passphrase por sesión (fricción) o un backend-proxy (no existe aquí). El
 * riesgo queda acotado por diseño: (1) BYOK — es la propia key del usuario,
 * revocable al instante en Google AI Studio; (2) owner-scoped por reglas
 * Firestore (nadie más la lee); (3) la caché IndexedDB se VACÍA al cerrar sesión
 * (`clearFirestorePersistence` en el logout) para dispositivos compartidos.
 */
// Intencionalmente NO existe storage en cliente para la API key: solo memoria + Firestore.
const consentKeyFor = (userId: string | null) => `moneytrack_ai_consent_${userId ?? 'guest'}`;

export interface UseGeminiApiKeyResult {
  apiKey: string;
  isConfigured: boolean;
  saveApiKey: (key: string) => void;
  clearApiKey: () => void;
  /** Consentimiento explícito para enviar datos a la IA (S4). Off por defecto. */
  hasConsent: boolean;
  setConsent: (value: boolean) => void;
}

export function useGeminiApiKey(userId: string | null): UseGeminiApiKeyResult {
  const [apiKey, setApiKeyState] = useState('');
  const [hasConsent, setHasConsentState] = useState(false);

  // Aplica una key a estado + módulo central (solo memoria en cliente).
  const apply = useCallback((key: string) => {
    const trimmed = (key ?? '').trim();
    setApiKeyState(trimmed);
    setGeminiApiKey(trimmed);
  }, []);

  // Aplica el consentimiento a estado + módulo central + caché local.
  const applyConsent = useCallback((value: boolean) => {
    setHasConsentState(value);
    setAiConsent(value);
    try {
      localStorage.setItem(consentKeyFor(userId), value ? 'true' : 'false');
    } catch {
      // localStorage no disponible: se mantiene solo en memoria
    }
  }, [userId]);

  // Cargar: la API key arranca vacía (solo memoria) y, si hay sesión, se
  // sincroniza desde Firestore. El consentimiento sí se lee del caché local.
  useEffect(() => {
    let localConsent = false;
    try {
      localConsent = localStorage.getItem(consentKeyFor(userId)) === 'true';
    } catch {
      localConsent = false;
    }
    setApiKeyState('');
    setGeminiApiKey('');
    setHasConsentState(localConsent);
    setAiConsent(localConsent);

    if (!userId || !isFirebaseConfigured) return;

    const ref = doc(db, `users/${userId}/settings/ai`);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const remote = (snap.data()?.geminiApiKey as string | undefined)?.trim() ?? '';
        if (remote) {
          // La nube manda: sincroniza estado + módulo en memoria.
          setApiKeyState(remote);
          setGeminiApiKey(remote);
        }
        // Si la nube está vacía, mantenemos el estado actual en memoria.

        // Consentimiento: solo si el campo existe explícitamente (bool) la nube
        // manda; si está ausente (usuarios previos), conservamos el local.
        const remoteConsent = snap.data()?.aiConsent;
        if (typeof remoteConsent === 'boolean') {
          setHasConsentState(remoteConsent);
          setAiConsent(remoteConsent);
          try { localStorage.setItem(consentKeyFor(userId), remoteConsent ? 'true' : 'false'); } catch { /* noop */ }
        }
      },
      (err) => logger.error('No se pudieron leer los ajustes de IA', err),
    );
    return () => unsubscribe();
  }, [userId]);

  const saveApiKey = useCallback((key: string) => {
    const trimmed = (key ?? '').trim();
    apply(trimmed);
    if (userId && isFirebaseConfigured) {
      setDoc(doc(db, `users/${userId}/settings/ai`), { geminiApiKey: trimmed }, { merge: true })
        .catch((err) => logger.error('No se pudo guardar la API key en la nube', err));
    }
  }, [userId, apply]);

  const clearApiKey = useCallback(() => {
    apply('');
    if (userId && isFirebaseConfigured) {
      setDoc(doc(db, `users/${userId}/settings/ai`), { geminiApiKey: deleteField() }, { merge: true })
        .catch((err) => logger.error('No se pudo eliminar la API key en la nube', err));
    }
  }, [userId, apply]);

  const setConsent = useCallback((value: boolean) => {
    applyConsent(value);
    if (userId && isFirebaseConfigured) {
      setDoc(doc(db, `users/${userId}/settings/ai`), { aiConsent: value }, { merge: true })
        .catch((err) => logger.error('No se pudo guardar el consentimiento de IA en la nube', err));
    }
  }, [userId, applyConsent]);

  return {
    apiKey,
    isConfigured: apiKey.trim().length > 10,
    saveApiKey,
    clearApiKey,
    hasConsent,
    setConsent,
  };
}
