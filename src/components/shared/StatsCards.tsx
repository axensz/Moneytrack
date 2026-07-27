import React, { memo } from 'react';
import { TrendingUp, TrendingDown, Wallet, Calendar, Eye, EyeOff, Info } from 'lucide-react';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import { BalanceSettling } from './BalanceSettling';
import { AnimateDigits } from '@/components/unlumen-ui/animate-digits';

interface StatsCardsProps {
  totalBalance: number;
  totalIncome: number;
  totalExpenses: number;
  pendingExpenses: number;
  formatCurrency: (amount: number) => string;
  /** Cuando no hay cuentas creadas, muestra un mensaje orientativo bajo las tarjetas */
  hasAccounts?: boolean;
  /**
   * true mientras el historial completo del saldo todavía se carga: muestra
   * "Calculando…" en vez de un
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
  hasAccounts = true,
  balanceSettling = false,
}) => {
  const { hideBalances, setHideBalances } = useUIPreferences();

  const displayValue = (value: number) => hideBalances ? '••••••' : formatCurrency(value);
  const animatedValue = (value: number) => {
    const display = displayValue(value);
    return hideBalances ? display : <AnimateDigits value={display} />;
  };

  return (
    <section data-testid="ledger-overview" className="mb-4 sm:mb-5 md:mb-6" aria-labelledby="ledger-overview-title">
      <h2 id="ledger-overview-title" className="text-base font-bold text-foreground mb-2 sm:mb-3">Resumen general</h2>
      {/* Botón de ocultar valores */}
      <div className="flex justify-end mb-2 sm:mb-3">
        <button
          onClick={() => setHideBalances(!hideBalances)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          title={hideBalances ? 'Mostrar valores' : 'Ocultar valores'}
          aria-pressed={hideBalances}
          aria-label={hideBalances ? 'Mostrar valores' : 'Ocultar valores'}
        >
          {hideBalances ? <Eye size={16} /> : <EyeOff size={16} />}
          <span className="hidden sm:inline">{hideBalances ? 'Mostrar' : 'Ocultar'}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
        {/* Balance Card - Morado Premium (reusa .card-balance, no duplica el degradado) */}
        <div className="card-balance col-span-2 lg:col-span-1 hover:shadow-lg">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-xs sm:text-sm font-medium text-balance-foreground">Saldo actual</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-balance-accent">
              <Wallet size={16} className="sm:w-[18px] sm:h-[18px] text-balance-value" />
            </div>
          </div>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-balance-value break-words">
            {balanceSettling ? (
              <BalanceSettling className="text-balance-accent-foreground" />
            ) : (
              animatedValue(totalBalance)
            )}
          </div>
        </div>

        {/* Ingresos Card */}
        <div className="p-3 sm:p-4 md:p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-[box-shadow,border-color,transform]">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Ingresos · mes actual</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <TrendingUp size={16} className="sm:w-[18px] sm:h-[18px] text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
            {animatedValue(totalIncome)}
          </div>
        </div>

        {/* Gastos Card */}
        <div className="p-3 sm:p-4 md:p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-[box-shadow,border-color,transform]">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Gastos · mes actual</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-rose-100 dark:bg-rose-900/30">
              <TrendingDown size={16} className="sm:w-[18px] sm:h-[18px] text-rose-600 dark:text-rose-400" />
            </div>
          </div>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
            {animatedValue(totalExpenses)}
          </div>
        </div>

        {/* Pendientes Card */}
        <div className="col-span-2 lg:col-span-1 p-3 sm:p-4 md:p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-[box-shadow,border-color,transform]">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span
              className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 inline-flex items-center gap-1 cursor-help"
              title="Crédito usado actual en todas tus tarjetas. Las compras de tarjeta aún no pagadas se muestran aquí, no en Gastos."
            >
              Pendiente actual · tarjetas de crédito
              <Info size={12} className="text-gray-400 dark:text-gray-500" aria-hidden="true" />
            </span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Calendar size={16} className="sm:w-[18px] sm:h-[18px] text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
            {animatedValue(pendingExpenses)}
          </div>
        </div>
      </div>

      {!hasAccounts && (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Crea tu primera cuenta en{' '}
          <span className="font-medium text-purple-500 dark:text-purple-400">Cuentas</span>
          {' '}para ver tu balance real
        </p>
      )}
    </section>
  );
});

StatsCards.displayName = 'StatsCards';
