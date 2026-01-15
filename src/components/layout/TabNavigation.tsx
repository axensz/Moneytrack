'use client';

import React from 'react';
import { Activity, BarChart3, Wallet, Download, Repeat } from 'lucide-react';
import type { ViewType } from '../../types/finance';

interface TabNavigationProps {
  view: ViewType;
  setView: (view: ViewType) => void;
  exportData: () => void;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  view,
  setView,
  exportData,
}) => {
  const tabs = [
    { key: 'transactions' as const, label: 'Transacciones', icon: Activity },
    { key: 'accounts' as const, label: 'Cuentas', icon: Wallet },
    { key: 'recurring' as const, label: 'Periódicos', icon: Repeat },
    { key: 'stats' as const, label: 'Estadísticas', icon: BarChart3 }
  ];

  return (
    <>
      {/* Desktop Navigation - Hidden on mobile */}
      <div className="hidden sm:flex justify-between items-center gap-4 mb-6 sm:mb-8">
        <div className="flex gap-2 border-b border-gray-200 dark:border-purple-800">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-base font-medium transition-all whitespace-nowrap ${
                view === tab.key
                  ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-300'
              }`}
            >
              <tab.icon size={18} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={exportData}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Exportar datos"
          >
            <Download size={16} />
            <span>Exportar</span>
          </button>
        </div>
      </div>

      {/* Mobile Top Actions - Export only */}
      <div className="sm:hidden flex gap-2 justify-end mb-4">
        <button
          onClick={exportData}
          className="flex items-center gap-1.5 px-3 py-2 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
          title="Exportar datos"
        >
          <Download size={14} />
          <span>Exportar</span>
        </button>
      </div>
    </>
  );
};