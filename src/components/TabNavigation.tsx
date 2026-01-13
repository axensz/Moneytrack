'use client';

import React from 'react';
import { Activity, BarChart3, Wallet } from 'lucide-react';
import type { ViewType } from '../types/finance';

interface TabNavigationProps {
  view: ViewType;
  setView: (view: ViewType) => void;
  exportData: () => void;
  importData: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  view,
  setView,
  exportData,
  importData
}) => {
  const tabs = [
    { key: 'transactions' as const, label: 'Transacciones', icon: Activity },
    { key: 'stats' as const, label: 'Estadísticas', icon: BarChart3 },
    { key: 'accounts' as const, label: 'Cuentas', icon: Wallet }
  ];

  return (
    <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6 sm:mb-8">
      <div className="flex gap-1 sm:gap-2 border-b border-purple-200 dark:border-purple-800 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base font-medium transition-all whitespace-nowrap ${
              view === tab.key
                ? 'text-purple-600 border-b-2 border-purple-600'
                : 'text-gray-500 hover:text-purple-500'
            }`}
          >
            <tab.icon size={16} className="sm:w-[18px] sm:h-[18px]" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={exportData}
          className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Exportar datos"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="hidden sm:inline">Exportar</span>
        </button>
        <input
          type="file"
          accept=".json"
          onChange={importData}
          className="hidden"
          id="import-file"
        />
        <label
          htmlFor="import-file"
          className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          title="Importar datos"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
          <span className="hidden sm:inline">Importar</span>
        </label>
      </div>
    </div>
  );
};