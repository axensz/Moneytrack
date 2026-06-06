import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, deleteField } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { setGeminiApiKey } from '../lib/geminiClient';
import { logger } from '../utils/logger';

/**
 * BYOK: gestiona la API key de Gemini del usuario activo.
 *
 * Persistencia en dos capas:
 * - localStorage (caché instantáneo, por usuario) → funciona offline y para invitados.
 * - Firestore `users/{uid}/settings/ai` (solo autenticado) → sincroniza entre
 *   dispositivos. Es la fuente de verdad cuando hay sesión.
 *
 * Seguridad: el doc solo lo lee/escribe su dueño (reglas Firestore), Firestore
 * cifra en reposo, y la key nunca se loguea. Se recomienda al usuario restringir
 * su key en Google AI Studio como defensa en profundidad.
 */
const storageKeyFor = (userId: string | null) => `moneytrack_gemini_key_${userId ?? 'guest'}`;

export interface UseGeminiApiKeyResult {
  apiKey: string;
  isConfigured: boolean;
  saveApiKey: (key: string) => void;
  clearApiKey: () => void;
}

export function useGeminiApiKey(userId: string | null): UseGeminiApiKeyResult {
  const [apiKey, setApiKeyState] = useState('');

  // Aplica una key a estado + módulo central + caché local.
  const apply = useCallback((key: string) => {
    const trimmed = (key ?? '').trim();
    setApiKeyState(trimmed);
    setGeminiApiKey(trimmed);
    try {
      if (trimmed) localStorage.setItem(storageKeyFor(userId), trimmed);
      else localStorage.removeItem(storageKeyFor(userId));
    } catch {
      // localStorage no disponible (modo privado): se mantiene solo en memoria
    }
  }, [userId]);

  // Cargar: primero el caché local (instantáneo) y, si hay sesión, suscribirse a
  // Firestore para sincronizar entre dispositivos.
  useEffect(() => {
    let local = '';
    try {
      local = localStorage.getItem(storageKeyFor(userId)) ?? '';
    } catch {
      local = '';
    }
    setApiKeyState(local);
    setGeminiApiKey(local);

    if (!userId || !isFirebaseConfigured) return;

    const ref = doc(db, `users/${userId}/settings/ai`);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const remote = (snap.data()?.geminiApiKey as string | undefined)?.trim() ?? '';
        if (remote) {
          // La nube manda: sincroniza estado + módulo + caché local.
          setApiKeyState(remote);
          setGeminiApiKey(remote);
          try { localStorage.setItem(storageKeyFor(userId), remote); } catch { /* noop */ }
        }
        // Si la nube está vacía, conservamos lo que haya en local (no lo pisamos).
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

  return {
    apiKey,
    isConfigured: apiKey.trim().length > 10,
    saveApiKey,
    clearApiKey,
  };
}
