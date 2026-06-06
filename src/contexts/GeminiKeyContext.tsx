'use client';

import React, { createContext, useContext } from 'react';
import { useGeminiApiKey, type UseGeminiApiKeyResult } from '../hooks/useGeminiApiKey';

const GeminiKeyContext = createContext<UseGeminiApiKeyResult | null>(null);

interface GeminiKeyProviderProps {
  userId: string | null;
  children: React.ReactNode;
}

/**
 * Provee la API key de Gemini del usuario (BYOK) a toda la app y mantiene
 * sincronizado el módulo central `geminiClient`.
 */
export function GeminiKeyProvider({ userId, children }: GeminiKeyProviderProps) {
  const value = useGeminiApiKey(userId);
  return <GeminiKeyContext.Provider value={value}>{children}</GeminiKeyContext.Provider>;
}

export function useGeminiKey(): UseGeminiApiKeyResult {
  const ctx = useContext(GeminiKeyContext);
  if (!ctx) {
    throw new Error('useGeminiKey debe usarse dentro de GeminiKeyProvider');
  }
  return ctx;
}
