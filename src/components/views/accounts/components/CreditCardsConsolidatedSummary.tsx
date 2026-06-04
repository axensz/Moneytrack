'use client';

import React, { memo } from 'react';
import { AlertTriangle, CreditCard, Info } from 'lucide-react';
import { useUIPreferences } from '../../../../contexts/UIPreferencesContext';

export interface CreditCardSummaryItem {
  id: string;
  name: string;
  creditLimit: number;
  used: number;
  available: number;
  usagePercentage: number;
}

interface CreditCardsConsolidatedSummaryProps {
  cards: CreditCardSummaryItem[];
  totalLimit: number;
  totalUsed: number;
  totalAvailable: number;
  usagePercentage: number;
  formatCurrency: (amount: number) => string;
}

/**
 * Vista consolidada e informativa de tarjetas de crédito.
 * No fusiona ni modifica cuentas: conserva trazabilidad por tarjeta y solo agrega totales.
 */
export const CreditCardsConsolidatedSummary: React.FC<CreditCardsConsolidatedSummaryProps> = memo(({
  cards,
  totalLimit,
  totalUsed,
  totalAvailable,
  usagePercentage,
  formatCurrency,
}) => {
  const { hideBalances } = useUIPreferences();

  if (cards.length === 0) return null;

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);
  const isHighUsage = totalLimit > 0 && totalUsed > totalLimit * 0.8;
  const cardsWithUsage = cards.filter((card) => card.used > 0).length;
  const highestUsageCard = [...cards]
    .filter((card) => card.creditLimit > 0 && card.used > 0)
    .sort((a, b) => b.usagePercentage - a.usagePercentage)[0];

  return (
    <section className="mb-6 rounded-2xl border border-purple-100 dark:border-purple-800/60 bg-gradient-to-br from-purple-50 via-white to-violet-50 dark:from-purple-950/30 dark:via-gray-900 dark:to-violet-950/20 p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-purple-100 dark:bg-purple-900/50 p-2.5 text-purple-700 dark:text-purple-300">
            <CreditCard size={22} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Vista consolidada de tarjetas
              </h3>
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                {cards.length} tarjeta{cards.length !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
              Resumen informativo: agrupa cupo, deuda y disponible sin fusionar ni alterar el historial individual.
            </p>
          </div>
        </div>

        {isHighUsage && (
          <div className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800 dark:border-orange-800/60 dark:bg-orange-950/30 dark:text-orange-200">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <span>Uso consolidado alto. Revisa pagos o cupos antes de asumir más deuda.</span>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Cupo total" value={displayAmount(totalLimit)} tone="purple" />
        <SummaryMetric label="Cupo utilizado" value={displayAmount(totalUsed)} tone={isHighUsage ? 'orange' : 'gray'} />
        <SummaryMetric label="Disponible total" value={displayAmount(totalAvailable)} tone="emerald" />
        <SummaryMetric label="Tarjetas con deuda" value={`${cardsWithUsage}/${cards.length}`} tone="gray" />
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Uso consolidado</span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {totalLimit > 0 ? `${usagePercentage.toFixed(1).replace('.', ',')}%` : 'Sin cupo definido'}
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-purple-100 dark:bg-purple-900/30">
          <div
            className={`h-full transition-all ${isHighUsage
              ? 'bg-gradient-to-r from-orange-500 to-rose-500'
              : 'bg-gradient-to-r from-purple-500 to-violet-500'
              }`}
            style={{ width: `${usagePercentage}%` }}
          />
        </div>
      </div>

      {highestUsageCard && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm text-gray-600 ring-1 ring-purple-100 dark:bg-gray-900/40 dark:text-gray-300 dark:ring-purple-800/50">
          <Info size={17} className="mt-0.5 flex-shrink-0 text-purple-600 dark:text-purple-400" />
          <span>
            Mayor uso relativo: <strong>{highestUsageCard.name}</strong> con{' '}
            {highestUsageCard.usagePercentage.toFixed(1).replace('.', ',')}% de su cupo.
          </span>
        </div>
      )}
    </section>
  );
});

CreditCardsConsolidatedSummary.displayName = 'CreditCardsConsolidatedSummary';

interface SummaryMetricProps {
  label: string;
  value: string;
  tone: 'purple' | 'emerald' | 'orange' | 'gray';
}

const toneClasses: Record<SummaryMetricProps['tone'], string> = {
  purple: 'text-purple-700 dark:text-purple-300',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  orange: 'text-orange-700 dark:text-orange-300',
  gray: 'text-gray-900 dark:text-gray-100',
};

const SummaryMetric: React.FC<SummaryMetricProps> = ({ label, value, tone }) => (
  <div className="rounded-xl border border-white/80 bg-white/80 p-3 shadow-sm dark:border-gray-700/70 dark:bg-gray-800/70">
    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
      {label}
    </p>
    <p className={`mt-1 text-lg font-bold ${toneClasses[tone]}`}>
      {value}
    </p>
  </div>
);
