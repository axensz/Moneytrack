import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '../../hooks/useLocalStorage';

// Helper: dispatch a StorageEvent como lo haría otro tab
function fireStorageEvent(key: string, newValue: string | null) {
  const event = new StorageEvent('storage', {
    key,
    newValue,
    storageArea: localStorage,
  });
  window.dispatchEvent(event);
}

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns initialValue when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 42));
    // After hydration the value may still be 42 since nothing is stored
    expect(result.current[0]).toBe(42);
  });

  it('persists a value to localStorage on set', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 0));
    act(() => {
      result.current[1](99);
    });
    expect(result.current[0]).toBe(99);
    expect(JSON.parse(localStorage.getItem('test-key')!)).toBe(99);
  });

  it('supports functional updates', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 10));
    act(() => {
      result.current[1](prev => prev + 5);
    });
    expect(result.current[0]).toBe(15);
  });

  // S11 — cross-tab sync
  describe('cross-tab sync (S11)', () => {
    it('updates state when another tab writes the same key', () => {
      const { result } = renderHook(() => useLocalStorage('shared-key', 'initial'));

      act(() => {
        fireStorageEvent('shared-key', JSON.stringify('from-other-tab'));
      });

      expect(result.current[0]).toBe('from-other-tab');
    });

    it('resets to initialValue when another tab removes the key', () => {
      const { result } = renderHook(() => useLocalStorage('shared-key', 'fallback'));
      // First set a value
      act(() => { result.current[1]('something'); });

      // Other tab deletes the key (newValue === null)
      act(() => {
        fireStorageEvent('shared-key', null);
      });

      expect(result.current[0]).toBe('fallback');
    });

    it('ignores storage events for different keys', () => {
      const { result } = renderHook(() => useLocalStorage('my-key', 'original'));

      act(() => {
        fireStorageEvent('other-key', JSON.stringify('should-not-apply'));
      });

      expect(result.current[0]).toBe('original');
    });

    it('ignores malformed JSON from other tabs', () => {
      const { result } = renderHook(() => useLocalStorage('my-key', 'safe'));
      act(() => result.current[1]('safe'));

      // Malformed JSON — should not throw or corrupt state
      act(() => {
        fireStorageEvent('my-key', '{not valid json');
      });

      expect(result.current[0]).toBe('safe');
    });
  });
});
