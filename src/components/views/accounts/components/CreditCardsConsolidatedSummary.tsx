'use client';

import React, { memo } from 'react';
import { CreditCard, AlertTriangle } from 'lucide-react';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';

interface CardSummary {
  id: string;
  name: string;
  creditLimit: number;
  used: number;
  available: number;
  usagePercentage: number;
}

interface CreditCardsConsolidatedSummaryProps {
  cards: CardSummary[];
  totalLimit: number;
  totalUsed: number;
  totalAvailable: number;
  usagePercentage: number;
  formatCurrency: (amount: number) => string;
}

/**
 * Resumen consolidado de tarjetas de crédito.
 * Muestra métricas globales (cupo total, usado, disponible) con barra de progreso
 * y alerta si el uso supera el 80%.
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

  const displayValue = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);
  const isHighUsage = usagePercentage >= 80;

  return (
    <div className="mb-6 rounded-xl border border-purple-100 bg-purple-50/50 p-5 dark:border-purple-900/50 dark:bg-purple-900/10">
      <div className="flex items-center gap-2 mb-4">
        <CreditCard size={18} className="text-purple-600 dark:text-purple-400" />
        <h3 className="text-sm font-semibold text-purple-800 dark:text-purple-200">
          Resumen de tarjetas de crédito
        </h3>
        <span className="text-xs text-purple-600 dark:text-purple-400 ml-auto">
          {cards.length} tarjeta{cards.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <MetricCard label="Cupo total" value={displayValue(totalLimit)} />
        <MetricCard label="Usado" value={displayValue(totalUsed)} />
        <MetricCard label="Disponible" value={displayValue(totalAvailable)} />
      </div>

      {/* Barra de progreso */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>Uso global</span>
          <span>{hideBalances ? '••%' : `${usagePercentage.toFixed(1)}%`}</span>
        </div>
        <div className="h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isHighUsage
                ? 'bg-red-500 dark:bg-red-400'
                : usagePercentage >= 50
                  ? 'bg-amber-500 dark:bg-amber-400'
                  : 'bg-purple-500 dark:bg-purple-400'
            }`}
            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Alerta de uso alto */}
      {isHighUsage && !hideBalances && (
        <div className="flex items-center gap-2 mt-3 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle size={14} className="flex-shrink-0" />
          <span>Uso de crédito elevado ({usagePercentage.toFixed(0)}%). Considera reducir el saldo.</span>
        </div>
      )}
    </div>
  );
});

CreditCardsConsolidatedSummary.displayName = 'CreditCardsConsolidatedSummary';

const MetricCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-purple-100 bg-white p-3 dark:border-purple-900/40 dark:bg-gray-800/50">
    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
  </div>
);
