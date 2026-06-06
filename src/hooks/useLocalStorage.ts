import { useState, useCallback, useEffect, useRef } from 'react';
import { logger } from '../utils/logger';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const isInitialized = useRef(false);

  // S11: Captura el initialValue una sola vez para usarlo en el handler de storage
  // sin añadirlo a las dependencias del efecto (evita re-registro en cada render
  // cuando el llamador pasa objetos/arrays literales como initialValue).
  const initialValueRef = useRef(initialValue);

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

  // S11: Sincronización entre pestañas.
  // El evento 'storage' solo se dispara en las OTRAS pestañas del mismo origen,
  // nunca en la que escribió → no hay riesgo de bucle infinito.
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== key || e.storageArea !== localStorage) return;
      try {
        setValue(
          e.newValue === null
            ? initialValueRef.current
            : (JSON.parse(e.newValue) as T),
        );
      } catch {
        // Ignorar valores malformados de otras pestañas
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [key]); // initialValueRef es un ref → no provoca re-registro

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