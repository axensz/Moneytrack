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
    <div className="flex justify-between items-center mb-8">
      <div className="flex gap-2 border-b border-purple-200">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition-all ${
              view === tab.key
                ? 'text-purple-600 border-b-2 border-purple-600'
                : 'text-gray-500 hover:text-purple-500'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>
      
      <div className="flex gap-2">
        <button
          onClick={exportData}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Exportar
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
          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
          Importar
        </label>
      </div>
    </div>
  );
};