import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGeminiApiKey } from '../../hooks/useGeminiApiKey';
import { getGeminiApiKey, setGeminiApiKey } from '../../lib/geminiClient';
import { hasAiConsent, setAiConsent } from '../../lib/aiConsent';

const LONG_KEY = 'AIzaSyAFAKEKEY1234567890abcdefGHIJ';

describe('useGeminiApiKey (BYOK)', () => {
  beforeEach(() => {
    localStorage.clear();
    setGeminiApiKey('');
    setAiConsent(false);
  });

  it('starts empty and syncs the central module', () => {
    const { result } = renderHook(() => useGeminiApiKey('user-1'));
    expect(result.current.apiKey).toBe('');
    expect(result.current.isConfigured).toBe(false);
    expect(getGeminiApiKey()).toBe('');
  });

  it('saves the key to memory + central module SIN persistir en localStorage', () => {
    const { result } = renderHook(() => useGeminiApiKey('user-1'));
    act(() => result.current.saveApiKey(`  ${LONG_KEY}  `));
    expect(result.current.apiKey).toBe(LONG_KEY);
    expect(result.current.isConfigured).toBe(true);
    expect(getGeminiApiKey()).toBe(LONG_KEY);
    // Seguridad (alerta CodeQL #9): la API key NUNCA se escribe en localStorage.
    // Vive solo en memoria + Firestore. Este assert es un guardia de regresión.
    expect(localStorage.getItem('moneytrack_gemini_key_user-1')).toBeNull();
  });

  it('isolates keys per user', () => {
    const { result, rerender } = renderHook(({ uid }) => useGeminiApiKey(uid), {
      initialProps: { uid: 'user-1' as string | null },
    });
    act(() => result.current.saveApiKey(LONG_KEY));
    expect(getGeminiApiKey()).toBe(LONG_KEY);

    // Cambiar de usuario: no debe heredar la key del anterior
    rerender({ uid: 'user-2' });
    expect(result.current.apiKey).toBe('');
    expect(getGeminiApiKey()).toBe('');
  });

  it('clears the key', () => {
    const { result } = renderHook(() => useGeminiApiKey('user-1'));
    act(() => result.current.saveApiKey(LONG_KEY));
    act(() => result.current.clearApiKey());
    expect(result.current.apiKey).toBe('');
    expect(getGeminiApiKey()).toBe('');
    expect(localStorage.getItem('moneytrack_gemini_key_user-1')).toBeNull();
  });
});

describe('useGeminiApiKey — consentimiento de IA (S4)', () => {
  beforeEach(() => {
    localStorage.clear();
    setGeminiApiKey('');
    setAiConsent(false);
  });

  it('starts without consent and syncs the central module', () => {
    const { result } = renderHook(() => useGeminiApiKey('user-1'));
    expect(result.current.hasConsent).toBe(false);
    expect(hasAiConsent()).toBe(false);
  });

  it('grants consent: updates state, module and localStorage', () => {
    const { result } = renderHook(() => useGeminiApiKey('user-1'));
    act(() => result.current.setConsent(true));
    expect(result.current.hasConsent).toBe(true);
    expect(hasAiConsent()).toBe(true);
    expect(localStorage.getItem('moneytrack_ai_consent_user-1')).toBe('true');
  });

  it('revokes consent', () => {
    const { result } = renderHook(() => useGeminiApiKey('user-1'));
    act(() => result.current.setConsent(true));
    act(() => result.current.setConsent(false));
    expect(result.current.hasConsent).toBe(false);
    expect(hasAiConsent()).toBe(false);
    expect(localStorage.getItem('moneytrack_ai_consent_user-1')).toBe('false');
  });

  it('rehydrates a previously granted consent from localStorage', () => {
    localStorage.setItem('moneytrack_ai_consent_user-1', 'true');
    const { result } = renderHook(() => useGeminiApiKey('user-1'));
    expect(result.current.hasConsent).toBe(true);
    expect(hasAiConsent()).toBe(true);
  });

  it('isolates consent per user', () => {
    localStorage.setItem('moneytrack_ai_consent_user-1', 'true');
    const { result, rerender } = renderHook(({ uid }) => useGeminiApiKey(uid), {
      initialProps: { uid: 'user-1' as string | null },
    });
    expect(result.current.hasConsent).toBe(true);

    rerender({ uid: 'user-2' });
    expect(result.current.hasConsent).toBe(false);
    expect(hasAiConsent()).toBe(false);
  });
});
