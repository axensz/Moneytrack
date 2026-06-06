import { useCallback, useEffect, useState } from 'react';
import { setGeminiApiKey } from '../lib/geminiClient';

/**
 * BYOK: gestiona la API key de Gemini del usuario activo.
 * - Se guarda en localStorage por usuario (clave distinta por uid / invitado).
 * - Sincroniza el módulo central `geminiClient` para que las utilidades de IA
 *   usen siempre la key del usuario logueado.
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

  // Cargar la key del usuario activo y sincronizar el módulo central.
  useEffect(() => {
    let stored = '';
    try {
      stored = localStorage.getItem(storageKeyFor(userId)) ?? '';
    } catch {
      stored = '';
    }
    setApiKeyState(stored);
    setGeminiApiKey(stored);
  }, [userId]);

  const saveApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    try {
      if (trimmed) localStorage.setItem(storageKeyFor(userId), trimmed);
      else localStorage.removeItem(storageKeyFor(userId));
    } catch {
      // localStorage no disponible (modo privado): se mantiene solo en memoria
    }
    setApiKeyState(trimmed);
    setGeminiApiKey(trimmed);
  }, [userId]);

  const clearApiKey = useCallback(() => {
    try {
      localStorage.removeItem(storageKeyFor(userId));
    } catch {
      // ignore
    }
    setApiKeyState('');
    setGeminiApiKey('');
  }, [userId]);

  return {
    apiKey,
    isConfigured: apiKey.trim().length > 10,
    saveApiKey,
    clearApiKey,
  };
}
