import React, { useState, useEffect, memo } from 'react';
import { TrendingUp, TrendingDown, Wallet, Calendar, Eye, EyeOff } from 'lucide-react';

interface StatsCardsProps {
  totalBalance: number;
  totalIncome: number;
  totalExpenses: number;
  pendingExpenses: number;
  formatCurrency: (amount: number) => string;
  balanceLabel?: string;
}

const STORAGE_KEY = 'moneytrack_hide_values';

export const StatsCards: React.FC<StatsCardsProps> = memo(({
  totalBalance,
  totalIncome,
  totalExpenses,
  pendingExpenses,
  formatCurrency,
  balanceLabel = 'Balance'
}) => {
  const [isHidden, setIsHidden] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'true';
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isHidden));
  }, [isHidden]);

  const displayValue = (value: number) => isHidden ? '••••••' : formatCurrency(value);

  return (
    <div className="mb-6 sm:mb-8">
      {/* Botón de ocultar valores */}
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setIsHidden(!isHidden)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
          title={isHidden ? 'Mostrar valores' : 'Ocultar valores'}
        >
          {isHidden ? <Eye size={16} /> : <EyeOff size={16} />}
          <span className="hidden sm:inline">{isHidden ? 'Mostrar' : 'Ocultar'}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Balance Card - Morado Premium */}
        <div className="col-span-2 lg:col-span-1 p-4 sm:p-6 rounded-xl border-2 border-purple-200 bg-gradient-to-br from-purple-100 to-violet-100 dark:from-purple-900/30 dark:to-violet-900/30 dark:border-purple-700 shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-xs sm:text-sm font-medium text-purple-800 dark:text-purple-200">{balanceLabel}</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-purple-200 dark:bg-purple-800">
              <Wallet size={16} className="sm:w-[18px] sm:h-[18px] text-purple-700 dark:text-purple-300" />
            </div>
          </div>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-purple-900 dark:text-purple-100 break-words">
            {displayValue(totalBalance)}
          </div>
        </div>

        {/* Ingresos Card */}
        <div className="p-4 sm:p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Ingresos <span className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 font-normal">este mes</span></span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <TrendingUp size={16} className="sm:w-[18px] sm:h-[18px] text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
            {displayValue(totalIncome)}
          </div>
        </div>

        {/* Gastos Card */}
        <div className="p-4 sm:p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Gastos <span className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 font-normal">este mes</span></span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-rose-100 dark:bg-rose-900/30">
              <TrendingDown size={16} className="sm:w-[18px] sm:h-[18px] text-rose-600 dark:text-rose-400" />
            </div>
          </div>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
            {displayValue(totalExpenses)}
          </div>
        </div>

        {/* Pendientes Card */}
        <div className="col-span-2 lg:col-span-1 p-4 sm:p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Pendientes</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Calendar size={16} className="sm:w-[18px] sm:h-[18px] text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
            {displayValue(pendingExpenses)}
          </div>
        </div>
      </div>
    </div>
  );
});

StatsCards.displayName = 'StatsCards';