import React, { memo } from 'react';
import { TrendingUp, TrendingDown, Wallet, Calendar, Eye, EyeOff, Info } from 'lucide-react';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import { BalanceSettling } from './BalanceSettling';

interface StatsCardsProps {
  totalBalance: number;
  totalIncome: number;
  totalExpenses: number;
  pendingExpenses: number;
  formatCurrency: (amount: number) => string;
  balanceLabel?: string;
  periodLabel?: string;
  /** Cuando no hay cuentas creadas, muestra un mensaje orientativo bajo las tarjetas */
  hasAccounts?: boolean;
  /**
   * true mientras el saldo aún se calcula desde la ventana paginada (el fetch
   * del historial completo está en vuelo): muestra "Calculando…" en vez de un
   * número transitorio incorrecto.
   */
  balanceSettling?: boolean;
}

export const StatsCards: React.FC<StatsCardsProps> = memo(({
  totalBalance,
  totalIncome,
  totalExpenses,
  pendingExpenses,
  formatCurrency,
  balanceLabel = 'Balance',
  periodLabel = 'este mes',
  hasAccounts = true,
  balanceSettling = false,
}) => {
  const { hideBalances, setHideBalances } = useUIPreferences();

  const displayValue = (value: number) => hideBalances ? '••••••' : formatCurrency(value);

  return (
    <div className="mb-4 sm:mb-5 md:mb-6">
      {/* Botón de ocultar valores */}
      <div className="flex justify-end mb-2 sm:mb-3">
        <button
          onClick={() => setHideBalances(!hideBalances)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          title={hideBalances ? 'Mostrar valores' : 'Ocultar valores'}
          aria-pressed={hideBalances}
          aria-label={hideBalances ? 'Mostrar valores' : 'Ocultar valores'}
        >
          {hideBalances ? <Eye size={16} /> : <EyeOff size={16} />}
          <span className="hidden sm:inline">{hideBalances ? 'Mostrar' : 'Ocultar'}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
        {/* Balance Card - Morado Premium */}
        <div className="col-span-2 lg:col-span-1 p-3 sm:p-4 md:p-5 rounded-xl border-2 border-purple-200 bg-gradient-to-br from-purple-100 to-violet-100 dark:from-purple-900/30 dark:to-violet-900/30 dark:border-purple-700 shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-xs sm:text-sm font-medium text-purple-800 dark:text-purple-200">{balanceLabel}</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-purple-200 dark:bg-purple-800">
              <Wallet size={16} className="sm:w-[18px] sm:h-[18px] text-purple-700 dark:text-purple-300" />
            </div>
          </div>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-purple-900 dark:text-purple-100 break-words">
            {balanceSettling ? (
              <BalanceSettling className="text-purple-400 dark:text-purple-500" />
            ) : (
              displayValue(totalBalance)
            )}
          </div>
        </div>

        {/* Ingresos Card */}
        <div className="p-3 sm:p-4 md:p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Ingresos <span className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 font-normal">{periodLabel}</span></span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <TrendingUp size={16} className="sm:w-[18px] sm:h-[18px] text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
            {displayValue(totalIncome)}
          </div>
        </div>

        {/* Gastos Card */}
        <div className="p-3 sm:p-4 md:p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Gastos <span className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 font-normal">{periodLabel}</span></span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-rose-100 dark:bg-rose-900/30">
              <TrendingDown size={16} className="sm:w-[18px] sm:h-[18px] text-rose-600 dark:text-rose-400" />
            </div>
          </div>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
            {displayValue(totalExpenses)}
          </div>
        </div>

        {/* Pendientes Card */}
        <div className="col-span-2 lg:col-span-1 p-3 sm:p-4 md:p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span
              className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 inline-flex items-center gap-1 cursor-help"
              title="Incluye la deuda de tus tarjetas de crédito (compras que aún no pagas al banco), no solo gastos sin marcar como pagados. Una compra de TC cuenta como gasto (ya gastaste el dinero) y como pendiente (lo debes a la tarjeta) hasta que pagas el extracto."
            >
              Pendientes
              <Info size={12} className="text-gray-400 dark:text-gray-500" aria-hidden="true" />
            </span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Calendar size={16} className="sm:w-[18px] sm:h-[18px] text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
            {displayValue(pendingExpenses)}
          </div>
        </div>
      </div>

      {!hasAccounts && (
        <p className="mt-3 text-center text-sm text-gray-400 dark:text-gray-500">
          Crea tu primera cuenta en{' '}
          <span className="font-medium text-purple-500 dark:text-purple-400">Cuentas</span>
          {' '}para ver tu balance real
        </p>
      )}
    </div>
  );
});

StatsCards.displayName = 'StatsCards';
