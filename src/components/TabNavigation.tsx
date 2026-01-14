'use client';

import React from 'react';
import { Activity, BarChart3, Wallet, Download, Upload } from 'lucide-react';
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
    <>
      {/* Desktop Navigation - Hidden on mobile */}
      <div className="hidden sm:flex justify-between items-center gap-4 mb-6 sm:mb-8">
        <div className="flex gap-2 border-b border-purple-200 dark:border-purple-800">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-base font-medium transition-all whitespace-nowrap ${
                view === tab.key
                  ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-purple-500 dark:hover:text-purple-300'
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
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Exportar datos"
          >
            <Download size={16} />
            <span>Exportar</span>
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
            title="Importar datos"
          >
            <Upload size={16} />
            <span>Importar</span>
          </label>
        </div>
      </div>

      {/* Mobile Bottom Navigation - Fixed at bottom */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 shadow-2xl">
        <div className="flex justify-around items-center px-2 py-2 pb-safe">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`flex flex-col items-center justify-center gap-1 px-4 py-2.5 min-w-[80px] rounded-xl transition-all ${
                view === tab.key
                  ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 scale-105'
                  : 'text-gray-500 dark:text-gray-400 active:scale-95 active:bg-gray-100 dark:active:bg-gray-800'
              }`}
            >
              <tab.icon size={22} strokeWidth={view === tab.key ? 2.5 : 2} />
              <span className="text-[10px] font-semibold">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Mobile Top Actions - Export/Import */}
      <div className="sm:hidden flex gap-2 justify-end mb-4">
        <button
          onClick={exportData}
          className="flex items-center gap-1.5 px-3 py-2 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
          title="Exportar datos"
        >
          <Download size={14} />
          <span>Exportar</span>
        </button>
        <label
          htmlFor="import-file-mobile"
          className="flex items-center gap-1.5 px-3 py-2 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg active:bg-gray-200 dark:active:bg-gray-700 transition-colors cursor-pointer"
          title="Importar datos"
        >
          <Upload size={14} />
          <span>Importar</span>
        </label>
        <input
          type="file"
          accept=".json"
          onChange={importData}
          className="hidden"
          id="import-file-mobile"
        />
      </div>
    </>
  );
};