/**
 * S6: Sincroniza la vista activa con la URL via query params.
 *
 * - La vista se codifica como `?view=<name>` (ej: ?view=stats).
 * - La vista por defecto (`transactions`) no añade parámetro → URL limpia.
 * - `setView` hace `history.pushState` → el botón Atrás navega entre vistas.
 * - `popstate` listener → Adelante/Atrás del navegador funcionan correctamente.
 * - SSR-safe: si window no existe (build estático) devuelve la vista por defecto.
 *
 * Compatible con `output: 'export'` (GitHub Pages) porque solo usa query string,
 * sin rutas nuevas que requieran configuración de servidor.
 */

import { useState, useEffect, useCallback } from 'react';
import type { ViewType } from '../types/finance';

const VALID_VIEWS: readonly ViewType[] = [
  'transactions', 'stats', 'accounts', 'recurring', 'debts', 'budgets', 'goals',
];
const DEFAULT_VIEW: ViewType = 'transactions';

function readViewFromURL(): ViewType {
  if (typeof window === 'undefined') return DEFAULT_VIEW;
  const param = new URLSearchParams(window.location.search).get('view');
  return VALID_VIEWS.includes(param as ViewType) ? (param as ViewType) : DEFAULT_VIEW;
}

export function useViewRouting() {
  // Lazy initializer: lee la URL una sola vez en el primer render de cliente.
  const [view, setViewState] = useState<ViewType>(readViewFromURL);

  // Actualiza el estado + la URL. Estable entre renders (useCallback sin deps).
  const setView = useCallback((newView: ViewType) => {
    setViewState(newView);
    const url = new URL(window.location.href);
    if (newView === DEFAULT_VIEW) {
      url.searchParams.delete('view');
    } else {
      url.searchParams.set('view', newView);
    }
    history.pushState({ view: newView }, '', url.toString());
  }, []);

  // Navegación Atrás/Adelante del navegador
  useEffect(() => {
    const handlePopState = () => {
      setViewState(readViewFromURL());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return { view, setView } as const;
}
