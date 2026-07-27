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

export const VALID_VIEWS: readonly ViewType[] = [
  'transactions', 'stats', 'accounts', 'recurring', 'debts', 'budgets', 'financial-plan', 'goals',
];
export const DEFAULT_VIEW: ViewType = 'transactions';

const LEGACY_ACTION_PATHS: Readonly<Record<string, ViewType>> = {
  transactions: 'transactions',
  stats: 'stats',
  accounts: 'accounts',
  recurring: 'recurring',
  debts: 'debts',
  budgets: 'budgets',
  'financial-plan': 'financial-plan',
  goals: 'goals',
};

export function viewActionUrl(view: ViewType): string {
  return view === DEFAULT_VIEW ? '/' : `/?view=${encodeURIComponent(view)}`;
}

/**
 * Supports canonical query URLs and legacy path-style notification actions.
 */
export function actionUrlToView(actionUrl?: string): ViewType | null {
  if (!actionUrl || /^https?:\/\//i.test(actionUrl)) return null;

  const parsed = new URL(actionUrl, 'https://moneytrack.local');
  const queryView = parsed.searchParams.get('view');
  if (VALID_VIEWS.includes(queryView as ViewType)) return queryView as ViewType;

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return DEFAULT_VIEW;
  const legacyView = LEGACY_ACTION_PATHS[segments[segments.length - 1]];
  return legacyView ?? null;
}

export function canonicalizeActionUrl(actionUrl?: string): string | undefined {
  if (!actionUrl || /^https?:\/\//i.test(actionUrl)) return actionUrl;
  const view = actionUrlToView(actionUrl);
  return view ? viewActionUrl(view) : actionUrl;
}

export function navigateToActionUrl(actionUrl?: string): boolean {
  if (typeof window === 'undefined') return false;
  const view = actionUrlToView(actionUrl);
  if (!view) return false;

  const url = new URL(window.location.href);
  if (view === DEFAULT_VIEW) {
    url.searchParams.delete('view');
  } else {
    url.searchParams.set('view', view);
  }
  history.pushState({ view }, '', url.toString());
  window.dispatchEvent(new PopStateEvent('popstate', { state: { view } }));
  return true;
}

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
