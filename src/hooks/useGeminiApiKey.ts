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
// Intencionalmente no persistimos la API key en localStorage para evitar
// almacenamiento de información sensible en texto claro en el navegador.

export interface UseGeminiApiKeyResult {
  apiKey: string;
  isConfigured: boolean;
  saveApiKey: (key: string) => void;
  clearApiKey: () => void;
}

export function useGeminiApiKey(userId: string | null): UseGeminiApiKeyResult {
  const [apiKey, setApiKeyState] = useState('');

  // Aplica una key a estado + módulo central (solo memoria en cliente).
  const apply = useCallback((key: string) => {
    const trimmed = (key ?? '').trim();
    setApiKeyState(trimmed);
    setGeminiApiKey(trimmed);
  }, []);

  // Cargar en memoria y, si hay sesión, suscribirse a Firestore para sincronizar
  // entre dispositivos.
  useEffect(() => {
    setApiKeyState('');
    setGeminiApiKey('');

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
