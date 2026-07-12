'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { BaseModal } from '../../../modals/BaseModal';
import { useUIPreferences } from '../../../../contexts/UIPreferencesContext';
import {
  getRecommendedCreditCardUsagePlan,
  type CreditCardUsagePlan,
} from '../../../../utils/creditCardOptimizer';

interface CreditCardOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  plans: CreditCardUsagePlan[];
  formatCurrency: (amount: number) => string;
}

interface OptimizerMetricProps {
  label: string;
  value: string;
  detail?: string;
}

export const CreditCardOptimizerModal: React.FC<CreditCardOptimizerModalProps> = ({
  isOpen,
  onClose,
  plans,
  formatCurrency,
}) => {
  const { hideBalances } = useUIPreferences();
  const recommended = getRecommendedCreditCardUsagePlan(plans);
  const priorityWarnings = plans
    .flatMap((plan) => plan.warnings.map((warning) => ({ ...warning, cardName: plan.cardName })))
    .filter((warning) => warning.severity !== 'info')
    .slice(0, 2);

  const formatDate = (date: Date) => date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);
  const formatPercent = (ratio: number | null) => {
    if (ratio == null) return 'Analizando';
    return hideBalances ? '••••••' : `${Math.round(ratio * 100)}%`;
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Optimizador de tarjetas"
      titleIcon={<Sparkles size={20} className="text-primary" />}
      maxWidth="max-w-5xl"
    >
      {plans.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="rounded-full bg-primary/10 p-3 text-primary">
            <Sparkles size={24} />
          </div>
          <div>
            <p className="font-semibold text-foreground">Aún no hay tarjetas para optimizar</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea una tarjeta de crédito para activar recomendaciones de futuras compras.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              {recommended ? (
                <>
                  <p className="text-lg font-bold text-foreground">
                    Próxima compra: usa {recommended.cardName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Corte {formatDate(recommended.nextCutoff)} - pago {formatDate(recommended.paymentDueDate)} - {recommended.daysUntilPayment} días de margen.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-foreground">Sin tarjeta recomendada</p>
                  <p className="text-sm text-muted-foreground">
                    Todas están fuera de tope o siguen en observación.
                  </p>
                </>
              )}
            </div>

            {priorityWarnings.length > 0 ? (
              <div className="w-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100 lg:max-w-md">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle size={16} aria-hidden="true" />
                  Alertas clave
                </div>
                <div className="mt-2 space-y-1.5">
                  {priorityWarnings.map((warning, index) => (
                    <p key={`${warning.cardName}-${index}`} className="text-xs leading-snug">
                      <span className="font-semibold">{warning.cardName}: </span>
                      {warning.message}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="w-full rounded-lg border border-success/30 bg-success/10 p-3 text-success lg:max-w-sm">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Uso dentro de rangos sanos
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => {
              const cycleCapDetail = plan.monthlyLimit > 0
                ? hideBalances
                  ? '••••••'
                  : `${formatCurrency(plan.currentStatementTotal)} / ${formatCurrency(plan.monthlyLimit)}`
                : 'Sin historial suficiente';

              return (
                <div
                  key={plan.cardId}
                  className={`rounded-lg border p-3 ${plan.isRecommended ? 'border-primary bg-card' : 'border-border bg-card/70'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{plan.cardName}</p>
                      <p className="text-xs text-muted-foreground">
                        Corte en {plan.daysUntilCutoff} días - pago en {plan.daysUntilPayment}
                      </p>
                    </div>
                    {plan.isRecommended && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        Mejor opción
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <OptimizerMetric
                      label="Disponible"
                      value={displayAmount(plan.availableCredit)}
                    />
                    <OptimizerMetric
                      label="Uso cupo"
                      value={formatPercent(plan.creditUsageRatio)}
                      detail={displayAmount(plan.usedCredit)}
                    />
                    <OptimizerMetric
                      label="Tope ciclo"
                      value={formatPercent(plan.monthlyUsageRatio)}
                      detail={cycleCapDetail}
                    />
                    {plan.futureInstallmentTotal > 0 && (
                      <OptimizerMetric
                        label="Cuotas futuras"
                        value={displayAmount(plan.futureInstallmentTotal)}
                        detail={`${plan.futureInstallmentCycles} ciclo${plan.futureInstallmentCycles === 1 ? '' : 's'}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </BaseModal>
  );
};

function OptimizerMetric({ label, value, detail }: OptimizerMetricProps) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">{value}</span>
      {detail && (
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{detail}</span>
      )}
    </div>
  );
}
