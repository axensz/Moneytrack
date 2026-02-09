import { useState, useCallback, useEffect, useRef } from 'react';
import { logger } from '../utils/logger';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const isInitialized = useRef(false);

  // Hidratar desde localStorage después del mount (SSR-safe)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        setValue(JSON.parse(stored));
      }
    } catch {
      // Si falla, mantener initialValue
    }
    isInitialized.current = true;
  }, [key]);

  const setStoredValue = useCallback((newValue: T | ((prev: T) => T)) => {
    try {
      setValue(prev => {
        const valueToStore = newValue instanceof Function ? newValue(prev) : newValue;
        localStorage.setItem(key, JSON.stringify(valueToStore));
        return valueToStore;
      });
    } catch (error) {
      logger.error(`Error saving to localStorage key "${key}"`, error);
    }
  }, [key]);

  return [value, setStoredValue] as const;
}