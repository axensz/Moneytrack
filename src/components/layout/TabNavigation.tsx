'use client';

import React from 'react';
import { Activity, BarChart3, Wallet, Repeat, HandCoins, PieChart, Target } from 'lucide-react';
import type { ViewType } from '../../types/finance';

export interface NavTab {
  key: ViewType;
  /** Etiqueta ÚNICA por vista — misma palabra en desktop y móvil. */
  label: string;
  icon: typeof Activity;
}

/**
 * Fuente ÚNICA de las pestañas de navegación. La consumen tanto la barra de
 * escritorio (TabNavigation) como la barra inferior móvil (finance-tracker),
 * para que la etiqueta de cada vista sea idéntica en ambas. "Transacciones"
 * (no "Inicio": la vista es el registro de movimientos) y "Estadísticas".
 */
export const NAV_TABS: NavTab[] = [
  { key: 'transactions', label: 'Transacciones', icon: Activity },
  { key: 'accounts', label: 'Cuentas', icon: Wallet },
  { key: 'recurring', label: 'Periódicos', icon: Repeat },
  { key: 'debts', label: 'Préstamos', icon: HandCoins },
  { key: 'budgets', label: 'Presupuestos', icon: PieChart },
  { key: 'goals', label: 'Metas', icon: Target },
  { key: 'stats', label: 'Estadísticas', icon: BarChart3 },
];

/** Helper para reusar la etiqueta canónica de una vista fuera de aquí. */
export const navTabLabel = (key: ViewType): string =>
  NAV_TABS.find((tab) => tab.key === key)?.label ?? key;

interface TabNavigationProps {
  view: ViewType;
  setView: (view: ViewType) => void;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  view,
  setView,
}) => {
  return (
    <>
      {/* Desktop Navigation */}
      <nav
        className="hidden sm:flex justify-start items-center gap-4 mb-4 sm:mb-5 md:mb-6"
        aria-label="Navegación principal"
      >
        <div className="flex gap-2 border-b border-border" role="tablist">
          {NAV_TABS.map(tab => (
            <button
              key={tab.key}
              id={`tab-${tab.key}`}
              role="tab"
              aria-selected={view === tab.key}
              aria-controls={`panel-${tab.key}`}
              onClick={() => setView(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-base font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${view === tab.key
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-primary'
                }`}
            >
              <tab.icon size={18} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
};
