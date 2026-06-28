'use client';

import { useState, useEffect, lazy, Suspense } from 'react';
import { LoadingScreen } from './components/layout/LoadingScreen';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { useAuth } from './hooks/useAuth';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { installGlobalErrorHandlers } from './lib/errorReporter';

/**
 * Boot shell — chunk de ENTRADA. Mantiene solo lo imprescindible para el primer
 * paint: resolución de auth + splash. Todo lo que depende de Firestore/datos vive
 * en `AuthenticatedApp`, cargado de forma lazy → el SDK de Firestore (~490KB) y el
 * código de la app NO entran al bundle de arranque; bajan después del primer paint.
 */
const AuthenticatedApp = lazy(() =>
  import('./AuthenticatedApp').then(m => ({ default: m.AuthenticatedApp }))
);

const FinanceTracker = () => {
  const [mounted, setMounted] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  useEffect(() => {
    setMounted(true);
    // S8: captura errores JS globales no controlados y promesas sin .catch().
    installGlobalErrorHandlers();
    // Prefetch del subárbol autenticado EN PARALELO con la resolución de auth:
    // así su chunk (incl. Firestore) ya está descargado cuando se necesita, en
    // vez de empezar a bajarlo recién después de que auth resuelva.
    import('./AuthenticatedApp');
  }, []);

  const { user, loading: authLoading } = useAuth();
  const isOnline = useNetworkStatus();

  // UNA sola pantalla de carga que cubre auth + descarga del chunk + datos.
  // Solo se oculta cuando dataReady es true (los datos ya cargaron).
  const showLoading = !mounted || authLoading || (user && !dataReady);

  return (
    // S8: ErrorBoundary envuelve todo el árbol — captura errores de render
    // y los envía al errorReporter, mostrando una pantalla de error amigable.
    <ErrorBoundary>
      {showLoading && <LoadingScreen />}
      {mounted && !authLoading && (
        // Mientras el chunk lazy baja, el Suspense muestra el mismo splash (en
        // carga inicial ya está arriba por showLoading; importa para invitados,
        // donde showLoading es false pero el chunk aún puede estar bajando).
        <Suspense fallback={<LoadingScreen />}>
          <AuthenticatedApp
            user={user}
            isOnline={isOnline}
            onDataReady={setDataReady}
            hidden={!!showLoading}
          />
        </Suspense>
      )}
    </ErrorBoundary>
  );
};

export default FinanceTracker;
