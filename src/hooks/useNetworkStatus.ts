/**
 * Hook para detectar el estado de conexión a internet
 * 
 * Escucha los eventos 'online' y 'offline' del navegador
 * y expone el estado actual + un flag de "recién reconectado"
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { showToast } from '../utils/toastHelpers';

interface NetworkStatus {
  /** true si el navegador reporta estar online */
  isOnline: boolean;
  /** true brevemente cuando se recupera la conexión */
  justReconnected: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOfflineRef = useRef(false);

  const handleOnline = useCallback(() => {
    setIsOnline(true);

    if (wasOfflineRef.current) {
      setJustReconnected(true);
      showToast.success('Conexión restaurada. Los datos se sincronizarán automáticamente.');
      // Limpiar flag después de 5 segundos
      setTimeout(() => setJustReconnected(false), 5000);
    }
    wasOfflineRef.current = false;
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    wasOfflineRef.current = true;
    showToast.error('Sin conexión a internet. Los cambios se guardarán localmente.');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return { isOnline, justReconnected };
}
