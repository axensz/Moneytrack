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
    <section className="mb-6 rounded-2xl border border-border bg-primary/5 p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <CreditCard size={22} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-foreground">
                Vista consolidada de tarjetas
              </h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {cards.length} tarjeta{cards.length !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Resumen informativo: agrupa cupo, deuda y disponible sin fusionar ni alterar el historial individual.
            </p>
          </div>
        </div>

        {isHighUsage && (
          <div className="flex items-start gap-2 rounded-xl bg-warning-muted px-3 py-2 text-sm text-warning">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <span>Uso consolidado alto. Revisa pagos o cupos antes de asumir más deuda.</span>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Cupo total" value={displayAmount(totalLimit)} tone="primary" />
        <SummaryMetric label="Cupo utilizado" value={displayAmount(totalUsed)} tone={isHighUsage ? 'warning' : 'foreground'} />
        <SummaryMetric label="Disponible total" value={displayAmount(totalAvailable)} tone="success" />
        <SummaryMetric label="Tarjetas con deuda" value={`${cardsWithUsage}/${cards.length}`} tone="foreground" />
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="text-muted-foreground">Uso consolidado</span>
          <span className="font-semibold text-foreground">
            {totalLimit > 0 ? `${usagePercentage.toFixed(1).replace('.', ',')}%` : 'Sin cupo definido'}
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-[width] ${isHighUsage ? 'bg-warning' : 'bg-primary'}`}
            style={{ width: `${usagePercentage}%` }}
          />
        </div>
      </div>

      {highestUsageCard && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-card px-3 py-2 text-sm text-muted-foreground ring-1 ring-border">
          <Info size={17} className="mt-0.5 flex-shrink-0 text-primary" />
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
  tone: 'primary' | 'success' | 'warning' | 'foreground';
}

const toneClasses: Record<SummaryMetricProps['tone'], string> = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  foreground: 'text-foreground',
};

const SummaryMetric: React.FC<SummaryMetricProps> = ({ label, value, tone }) => (
  <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    <p className={`mt-1 text-lg font-bold ${toneClasses[tone]}`}>
      {value}
    </p>
  </div>
);
