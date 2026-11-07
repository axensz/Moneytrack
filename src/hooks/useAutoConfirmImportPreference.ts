import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

/**
 * Preferencia por-dispositivo para la auto-confirmación de candidatos de
 * importación. DECISIÓN DE DISEÑO EXPLÍCITA DEL USUARIO: el DEFAULT es
 * `true` (activado), porque el objetivo es reducir el trabajo manual y que las
 * compras inequívocas entren solas al libro. El interruptor permite volver al
 * modo 100% manual ("The Confident Ledger" original) cuando el usuario quiera.
 *
 * Se persiste en localStorage con clave por usuario para no mezclar sesiones
 * (mismo estilo que `useGeminiApiKey`). Al ser una preferencia de cliente, es
 * coherente con la arquitectura estática (`next export`, GitHub Pages) donde la
 * auto-confirmación corre en el navegador.
 */
const AUTO_CONFIRM_DEFAULT = true;

export function useAutoConfirmPreference(userId: string | null): {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
} {
  const [enabled, setStoredEnabled] = useLocalStorage<boolean>(
    `autoConfirmImport:enabled:${userId ?? 'guest'}`,
    AUTO_CONFIRM_DEFAULT,
  );

  const setEnabled = useCallback(
    (value: boolean) => setStoredEnabled(value),
    [setStoredEnabled],
  );

  return { enabled, setEnabled };
}
