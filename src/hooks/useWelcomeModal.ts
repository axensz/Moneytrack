/**
 * Hook para manejar la lógica del modal de bienvenida
 * Se muestra cuando el usuario no tiene cuentas creadas
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// P-welcome-dup: la decisión de cerrar el welcome se persiste en localStorage.
// Antes vivía solo en un useRef en memoria, así que el modal reaparecía en CADA
// recarga mientras el usuario no tuviera cuentas. Se limpia al crear la primera
// cuenta (para que reaparezca si en el futuro se queda sin cuentas).
const WELCOME_DISMISSED_KEY = 'moneytrack_welcome_dismissed';

const readDismissed = (): boolean =>
  typeof window !== 'undefined' && localStorage.getItem(WELCOME_DISMISSED_KEY) === 'true';

interface UseWelcomeModalProps {
  mounted: boolean;
  authLoading: boolean;
  accountsLoading: boolean;
  accountsCount: number;
}

interface UseWelcomeModalReturn {
  showWelcomeModal: boolean;
  handleDismissWelcomeModal: () => void;
  setShowWelcomeModal: (show: boolean) => void;
}

export function useWelcomeModal({
  mounted,
  authLoading,
  accountsLoading,
  accountsCount,
}: UseWelcomeModalProps): UseWelcomeModalReturn {
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  // Ref para evitar mostrar el modal si ya se cerró manualmente.
  // Inicializa desde localStorage → no reaparece en cada recarga (P-welcome-dup).
  const welcomeModalDismissed = useRef(readDismissed());

  // Determinar si debería mostrarse el modal
  const shouldShowWelcome = mounted && !authLoading && !accountsLoading && accountsCount === 0;

  useEffect(() => {
    // Si hay cuentas, resetear el flag de dismissal para futuras sesiones
    if (accountsCount > 0) {
      welcomeModalDismissed.current = false;
      if (typeof window !== 'undefined') localStorage.removeItem(WELCOME_DISMISSED_KEY);
    }

    // Solo mostrar si debería mostrarse Y no fue cerrado manualmente
    if (shouldShowWelcome && !welcomeModalDismissed.current) {
      setShowWelcomeModal(true);
    } else if (!shouldShowWelcome) {
      // Si ya no debería mostrarse (ej: cuentas cargaron), cerrar
      setShowWelcomeModal(false);
    }
  }, [shouldShowWelcome, accountsCount]);

  // Handler para cerrar el modal manualmente
  const handleDismissWelcomeModal = useCallback(() => {
    welcomeModalDismissed.current = true;
    if (typeof window !== 'undefined') localStorage.setItem(WELCOME_DISMISSED_KEY, 'true');
    setShowWelcomeModal(false);
  }, []);

  return {
    showWelcomeModal,
    handleDismissWelcomeModal,
    setShowWelcomeModal,
  };
}
