import { useState, useCallback, useEffect, useRef } from 'react';
import { logger } from '../utils/logger';
import { showToast } from '../utils/toastHelpers';

/**
 * Detecta si un error corresponde a que la cuota de localStorage está llena.
 * Cubre el nombre estándar (QuotaExceededError) y el code legacy (22),
 * además del nombre específico de Firefox (NS_ERROR_DOM_QUOTA_REACHED).
 */
function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    // Algunos entornos lanzan errores con shape similar sin ser DOMException
    const e = error as { name?: string; code?: number } | null;
    return (
      e?.name === 'QuotaExceededError' ||
      e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e?.code === 22
    );
  }
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22
  );
}

const QUOTA_TOAST_MESSAGE =
  'El almacenamiento del navegador está lleno. Inicia sesión para no perder tus datos.';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const isInitialized = useRef(false);

  // Evita spamear el toast de cuota llena: solo mostramos uno por "racha"
  // de errores de cuota. Se rearma cuando un guardado vuelve a tener éxito.
  const quotaToastShown = useRef(false);

  // Espejo SÍNCRONO del valor para encadenar correctamente varios updates en el
  // mismo tick. Se reinicia al `value` ya commiteado en cada render y se avanza
  // dentro de setStoredValue ANTES de llamar a setValue, de modo que dos updates
  // funcionales sobre la misma key en el mismo tick se encadenen tanto en el
  // estado de React como en lo que se persiste. El setItem se ejecuta FUERA del
  // updater de setValue (en un try/catch real) para que un throw (p. ej. cuota
  // llena) no escape el render.
  const pendingValueRef = useRef(value);
  pendingValueRef.current = value;

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
    // Resolver contra el espejo síncrono (pendingValueRef), que ya incorpora
    // cualquier update anterior del mismo tick → así se encadenan correctamente
    // varios updates funcionales sobre la misma key (el segundo ve el resultado
    // del primero), tanto en el estado de React como en lo persistido.
    const valueToStore =
      newValue instanceof Function
        ? (newValue as (prev: T) => T)(pendingValueRef.current)
        : newValue;
    pendingValueRef.current = valueToStore;

    // Pasamos el valor ya resuelto a setValue (no un updater que vuelva a leer
    // `prev`), porque el encadenamiento ya lo garantiza pendingValueRef y así el
    // estado coincide exactamente con lo que se persiste.
    setValue(valueToStore);

    try {
      localStorage.setItem(key, JSON.stringify(valueToStore));
      // Guardado exitoso → rearmar el aviso de cuota para futuros eventos.
      quotaToastShown.current = false;
    } catch (error) {
      logger.error(`Error saving to localStorage key "${key}"`, error);

      // Cuota llena: los datos NO persistieron. Avisar al usuario para que
      // no pierda información (ej. iniciando sesión). Mostramos un solo toast
      // por racha de errores de cuota para no spamear.
      if (isQuotaExceededError(error) && !quotaToastShown.current) {
        quotaToastShown.current = true;
        showToast.error(QUOTA_TOAST_MESSAGE);
      }
    }
  }, [key]);

  return [value, setStoredValue] as const;
}