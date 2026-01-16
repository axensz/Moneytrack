/**
 * Hook para manejar la lógica del modal de bienvenida
 * Se muestra cuando el usuario no tiene cuentas creadas
 */

import { useState, useEffect, useRef, useCallback } from 'react';

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

  // Ref para evitar mostrar el modal si ya se cerró manualmente
  const welcomeModalDismissed = useRef(false);

  // Determinar si debería mostrarse el modal
  const shouldShowWelcome = mounted && !authLoading && !accountsLoading && accountsCount === 0;

  useEffect(() => {
    // Si hay cuentas, resetear el flag de dismissal para futuras sesiones
    if (accountsCount > 0) {
      welcomeModalDismissed.current = false;
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
    setShowWelcomeModal(false);
  }, []);

  return {
    showWelcomeModal,
    handleDismissWelcomeModal,
    setShowWelcomeModal,
  };
}
