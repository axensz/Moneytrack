'use client';

import React from 'react';
import { Activity, BarChart3, Wallet, Repeat } from 'lucide-react';
import type { ViewType } from '../../types/finance';

interface TabNavigationProps {
  view: ViewType;
  setView: (view: ViewType) => void;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  view,
  setView,
}) => {
  const tabs = [
    { key: 'transactions' as const, label: 'Transacciones', icon: Activity },
    { key: 'accounts' as const, label: 'Cuentas', icon: Wallet },
    { key: 'recurring' as const, label: 'Periódicos', icon: Repeat },
    { key: 'stats' as const, label: 'Estadísticas', icon: BarChart3 }
  ];

  return (
    <>
      {/* Desktop Navigation */}
      <nav
        className="hidden sm:flex justify-start items-center gap-4 mb-6 sm:mb-8"
        aria-label="Navegación principal"
      >
        <div className="flex gap-2 border-b border-gray-200 dark:border-purple-800" role="tablist">
          {tabs.map(tab => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={view === tab.key}
              aria-controls={`panel-${tab.key}`}
              onClick={() => setView(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-base font-medium transition-all whitespace-nowrap ${
                view === tab.key
                  ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-300'
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