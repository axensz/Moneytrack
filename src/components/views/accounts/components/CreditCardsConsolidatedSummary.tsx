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
    <section className="mb-6 rounded-xl bg-primary/5 p-4 sm:p-5">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary flex-shrink-0">
            <CreditCard size={20} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">
                Vista consolidada de tarjetas
              </h3>
              <span className="text-xs text-muted-foreground">
                {cards.length} tarjeta{cards.length !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Agrupa cupo, deuda y disponible sin fusionar.
            </p>
          </div>
        </div>

        {isHighUsage && (
          <div className="flex items-start gap-2 rounded-lg bg-warning-muted px-3 py-2 text-sm text-warning">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <span>Uso alto. Revisa pagos o cupos antes de asumir más deuda.</span>
          </div>
        )}
      </div>

      {/* Cifras: fila tipográfica, sin tarjetas */}
      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
        <div>
          <dt className="text-xs text-muted-foreground">Cupo total</dt>
          <dd className="text-lg font-semibold text-foreground">{displayAmount(totalLimit)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Cupo utilizado</dt>
          <dd className={`text-lg font-semibold ${isHighUsage ? 'text-warning' : 'text-foreground'}`}>
            {displayAmount(totalUsed)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Disponible</dt>
          <dd className="text-lg font-semibold text-foreground">{displayAmount(totalAvailable)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tarjetas con deuda</dt>
          <dd className="text-lg font-semibold text-foreground">{cardsWithUsage}/{cards.length}</dd>
        </div>
      </dl>

      {/* Uso consolidado */}
      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="text-muted-foreground">Uso consolidado</span>
          <span className="font-medium text-foreground">
            {totalLimit > 0 ? `${usagePercentage.toFixed(1).replace('.', ',')}%` : 'Sin cupo definido'}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${isHighUsage ? 'bg-warning' : 'bg-primary'}`}
            style={{ width: `${usagePercentage}%` }}
          />
        </div>
      </div>

      {highestUsageCard && (
        <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
          <Info size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            Mayor uso relativo: <strong className="font-medium text-foreground">{highestUsageCard.name}</strong> con{' '}
            {highestUsageCard.usagePercentage.toFixed(1).replace('.', ',')}% de su cupo.
          </span>
        </p>
      )}
    </section>
  );
});

CreditCardsConsolidatedSummary.displayName = 'CreditCardsConsolidatedSummary';
