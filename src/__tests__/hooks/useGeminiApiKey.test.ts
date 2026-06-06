import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGeminiApiKey } from '../../hooks/useGeminiApiKey';
import { getGeminiApiKey, setGeminiApiKey } from '../../lib/geminiClient';

const LONG_KEY = 'AIzaSyAFAKEKEY1234567890abcdefGHIJ';

describe('useGeminiApiKey (BYOK)', () => {
  beforeEach(() => {
    localStorage.clear();
    setGeminiApiKey('');
  });

  it('starts empty and syncs the central module', () => {
    const { result } = renderHook(() => useGeminiApiKey('user-1'));
    expect(result.current.apiKey).toBe('');
    expect(result.current.isConfigured).toBe(false);
    expect(getGeminiApiKey()).toBe('');
  });

  it('saves the key to localStorage and syncs the module', () => {
    const { result } = renderHook(() => useGeminiApiKey('user-1'));
    act(() => result.current.saveApiKey(`  ${LONG_KEY}  `));
    expect(result.current.apiKey).toBe(LONG_KEY);
    expect(result.current.isConfigured).toBe(true);
    expect(getGeminiApiKey()).toBe(LONG_KEY);
    expect(localStorage.getItem('moneytrack_gemini_key_user-1')).toBe(LONG_KEY);
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
