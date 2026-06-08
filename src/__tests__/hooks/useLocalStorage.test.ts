import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock del helper de toast para verificar el aviso de cuota llena (#29)
vi.mock('../../utils/toastHelpers', () => ({
  showToast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { useLocalStorage } from '../../hooks/useLocalStorage';
import { showToast } from '../../utils/toastHelpers';

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
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
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

  // #29 regression: dos updates funcionales sobre la MISMA key en el mismo tick
  // deben encadenarse (el segundo ve el resultado del primero). Antes de la
  // corrección esto perdía el primer update porque se resolvía contra un ref que
  // iba por detrás en vez de contra el `prev` de la cola de React.
  it('chains functional updates queued in the same tick', () => {
    const { result } = renderHook(() => useLocalStorage<number[]>('chain-key', []));
    act(() => {
      result.current[1](prev => [...prev, 1]);
      result.current[1](prev => [...prev, 2]);
    });
    expect(result.current[0]).toEqual([1, 2]);
    expect(JSON.parse(localStorage.getItem('chain-key')!)).toEqual([1, 2]);
  });

  // S11 — cross-tab sync
  // #29 — QuotaExceededError no debe tragarse silenciosamente
  describe('QuotaExceededError (#29)', () => {
    function mockQuotaError() {
      return new DOMException('quota', 'QuotaExceededError');
    }

    it('shows an error toast when localStorage quota is exceeded', () => {
      const spy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw mockQuotaError();
        });

      const { result } = renderHook(() => useLocalStorage('quota-key', 'x'));
      act(() => {
        result.current[1]('new-value');
      });

      expect(showToast.error).toHaveBeenCalledTimes(1);
      expect((showToast.error as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(
        /lleno/i,
      );

      spy.mockRestore();
    });

    it('detects legacy quota errors by code 22', () => {
      const spy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          const err = new Error('quota') as Error & { code: number };
          err.code = 22;
          throw err;
        });

      const { result } = renderHook(() => useLocalStorage('quota-key2', 'x'));
      act(() => result.current[1]('v'));

      expect(showToast.error).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('does not spam the toast on repeated quota errors', () => {
      const spy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw mockQuotaError();
        });

      const { result } = renderHook(() => useLocalStorage('quota-key3', 'x'));
      act(() => result.current[1]('a'));
      act(() => result.current[1]('b'));
      act(() => result.current[1]('c'));

      expect(showToast.error).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('re-arms the toast after a successful save', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem');

      // First: quota error → toast
      spy.mockImplementationOnce(() => {
        throw mockQuotaError();
      });
      const { result } = renderHook(() => useLocalStorage('quota-key4', 'x'));
      act(() => result.current[1]('fail1'));
      expect(showToast.error).toHaveBeenCalledTimes(1);

      // Then: a successful save (default impl) re-arms the guard
      act(() => result.current[1]('ok'));

      // Then: another quota error → toast again
      spy.mockImplementationOnce(() => {
        throw mockQuotaError();
      });
      act(() => result.current[1]('fail2'));
      expect(showToast.error).toHaveBeenCalledTimes(2);

      spy.mockRestore();
    });

    it('does not toast for non-quota errors', () => {
      const spy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('some other failure');
        });

      const { result } = renderHook(() => useLocalStorage('quota-key5', 'x'));
      act(() => result.current[1]('v'));

      expect(showToast.error).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

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
