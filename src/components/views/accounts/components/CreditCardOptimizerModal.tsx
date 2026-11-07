'use client';

import React from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, CreditCard, Sparkles } from 'lucide-react';
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

/** Salud de uso de cupo por tarjeta, derivada SOLO de la presentación
 *  (no se toca la lógica de recomendación): verde = sano, ámbar = atención,
 *  gris = analizando/sin historial suficiente. */
type CardHealth = 'healthy' | 'attention' | 'analyzing';

const HIGH_MONTHLY_USAGE_RATIO = 0.8;

/** Decide la salud visible de una tarjeta a partir de datos ya calculados. */
function getCardHealth(plan: CreditCardUsagePlan): CardHealth {
  // Sin tope mensual o sin ratio => no hay base para pintar salud real.
  if (plan.monthlyUsageRatio == null || plan.monthlyLimit <= 0) return 'analyzing';
  const hasBlockingWarning = plan.warnings.some((warning) => warning.severity !== 'info');
  if (plan.monthlyUsageRatio > HIGH_MONTHLY_USAGE_RATIO || hasBlockingWarning) return 'attention';
  return 'healthy';
}

export const CreditCardOptimizerModal: React.FC<CreditCardOptimizerModalProps> = ({
  isOpen,
  onClose,
  plans,
  formatCurrency,
}) => {
  const { hideBalances } = useUIPreferences();
  const recommended = getRecommendedCreditCardUsagePlan(plans);
  // Alertas clave: severidad distinta de 'info', máximo 2 (igual que antes).
  const priorityWarnings = plans
    .flatMap((plan) => plan.warnings.map((warning) => ({ ...warning, cardName: plan.cardName })))
    .filter((warning) => warning.severity !== 'info')
    .slice(0, 2);

  const formatDate = (date: Date) => date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  const displayAmount = (amount: number) => (hideBalances ? '••••••' : formatCurrency(amount));
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
        <div className="space-y-5">
          {/* ── Fila superior: HÉROE de recomendación + panel de ALERTAS ──
              2 columnas en escritorio (héroe 3fr / alertas 2fr), apiladas en móvil. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <RecommendationHero
              recommended={recommended}
              formatDate={formatDate}
            />
            <AlertsPanel priorityWarnings={priorityWarnings} />
          </div>

          {/* ── COMPARATIVA de tarjetas con barra de salud de cupo ── */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Comparativa de tarjetas
            </h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {plans.map((plan) => (
                <CardHealthTile
                  key={plan.cardId}
                  plan={plan}
                  health={getCardHealth(plan)}
                  displayAmount={displayAmount}
                  formatPercent={formatPercent}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </BaseModal>
  );
};

/** HÉROE: recomendación destacada en gradiente violet (excepción de diseño,
 *  ver DESIGN.md). Texto blanco con contraste AA sobre toda la rampa. */
function RecommendationHero({
  recommended,
  formatDate,
}: {
  recommended: CreditCardUsagePlan | null;
  formatDate: (date: Date) => string;
}) {
  if (!recommended) {
    // Estado equivalente cuando ninguna tarjeta es recomendable.
    return (
      <section className="card-recommend-hero lg:col-span-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white/85">
          <Sparkles size={16} aria-hidden="true" />
          Próxima compra
        </div>
        <p className="mt-2 text-2xl font-bold leading-tight">Sin tarjeta recomendada</p>
        <p className="mt-1.5 text-sm text-white/85">
          Todas están fuera de tope o siguen en observación. Revisa las alertas
          y la comparativa para elegir con criterio.
        </p>
      </section>
    );
  }

  return (
    <section className="card-recommend-hero lg:col-span-3">
      <div className="flex items-center gap-2 text-sm font-medium text-white/85">
        <Sparkles size={16} aria-hidden="true" />
        Próxima compra
      </div>
      <p className="mt-2 flex items-center gap-2 text-2xl font-bold leading-tight sm:text-3xl">
        <CreditCard size={26} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 truncate">Usa {recommended.cardName}</span>
      </p>
      <p className="mt-1.5 text-sm text-white/85">
        Mayor margen de pago y cupo sano frente a las demás.
      </p>
      <div className="mt-3 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock size={16} aria-hidden="true" />
          {recommended.daysUntilPayment} días de margen
        </span>
        <span className="text-white/70">·</span>
        <span className="text-white/90">
          Corte {formatDate(recommended.nextCutoff)} · pago {formatDate(recommended.paymentDueDate)}
        </span>
      </div>
    </section>
  );
}

/** Panel de ALERTAS clave (ámbar sólido con texto blanco) o estado "sano". */
function AlertsPanel({
  priorityWarnings,
}: {
  priorityWarnings: Array<{ severity: string; message: string; cardName: string }>;
}) {
  if (priorityWarnings.length === 0) {
    return (
      <section className="flex flex-col justify-center rounded-xl border border-success/40 bg-success/10 p-4 text-success lg:col-span-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 size={18} aria-hidden="true" />
          Uso dentro de rangos sanos
        </div>
        <p className="mt-1.5 text-xs leading-snug text-success/90">
          No hay topes ni cupos en riesgo. Puedes comprar con tranquilidad.
        </p>
      </section>
    );
  }

  return (
    // Fondo ámbar sólido (--warning-solid #b45309) con texto blanco: 5.02:1 (AA)
    // en claro y oscuro. NO usamos bg-amber-* crudo (fallaría en dark).
    <section className="rounded-xl border border-[var(--warning-solid)] bg-[var(--warning-solid)] p-4 text-white lg:col-span-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle size={18} aria-hidden="true" />
        Alertas clave
      </div>
      <ul className="mt-2 space-y-2">
        {priorityWarnings.map((warning, index) => (
          <li key={`${warning.cardName}-${index}`} className="text-xs leading-snug">
            <span className="font-semibold">{warning.cardName}: </span>
            {warning.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

const HEALTH_BAR_CLASSES: Record<CardHealth, string> = {
  healthy: 'bg-success',
  attention: 'bg-[var(--warning-solid)]',
  analyzing: 'bg-muted-foreground/40',
};

const HEALTH_LABELS: Record<CardHealth, string> = {
  healthy: 'Cupo sano',
  attention: 'Atención al tope',
  analyzing: 'Analizando historial',
};

/** Tarjeta de la comparativa con barra de salud de uso de cupo. */
function CardHealthTile({
  plan,
  health,
  displayAmount,
  formatPercent,
}: {
  plan: CreditCardUsagePlan;
  health: CardHealth;
  displayAmount: (amount: number) => string;
  formatPercent: (ratio: number | null) => string;
}) {
  const analyzing = health === 'analyzing';
  // Proporción de llenado de la barra (0–1). En "analizando" no hay base real.
  const fillRatio = analyzing ? 0 : Math.min(1, Math.max(0, plan.monthlyUsageRatio ?? 0));
  const fillPercent = Math.round(fillRatio * 100);
  const usageLabel = formatPercent(plan.monthlyUsageRatio);

  const cycleCapDetail = plan.monthlyLimit > 0
    ? displayAmount(plan.currentStatementTotal) === '••••••'
      ? '••••••'
      : `${displayAmount(plan.currentStatementTotal)} / ${displayAmount(plan.monthlyLimit)}`
    : 'Sin historial suficiente';

  return (
    <article
      className={`flex flex-col gap-3 rounded-xl border p-4 ${
        plan.isRecommended
          ? 'border-primary bg-card shadow-md'
          : 'border-border bg-card'
      }`}
    >
      {/* Cabecera: nombre + ventana de corte/pago + pill "Mejor opción" */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{plan.cardName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Corte en {plan.daysUntilCutoff} días · pago en {plan.daysUntilPayment}
          </p>
        </div>
        {plan.isRecommended && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary-on-surface">
            Mejor opción
          </span>
        )}
      </div>

      {/* Disponible como cifra destacada */}
      <div>
        <span className="block text-[11px] font-medium text-muted-foreground">Disponible</span>
        <span className="mt-0.5 block truncate text-xl font-bold text-foreground">
          {displayAmount(plan.availableCredit)}
        </span>
      </div>

      {/* Barra de salud de uso de cupo */}
      <div>
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
          <span className={`font-medium ${analyzing ? 'italic text-muted-foreground/80' : 'text-muted-foreground'}`}>
            {HEALTH_LABELS[health]}
          </span>
          <span className={`font-semibold tabular-nums ${analyzing ? 'italic text-muted-foreground/80' : 'text-foreground'}`}>
            {usageLabel}
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={analyzing ? undefined : fillPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Uso de cupo de ${plan.cardName}: ${HEALTH_LABELS[health]}`}
        >
          {analyzing ? (
            // Estado tenue: franja diagonal sutil, claramente "sin dato real".
            <div
              className="h-full w-full bg-[repeating-linear-gradient(45deg,var(--muted-foreground)_0,var(--muted-foreground)_2px,transparent_2px,transparent_6px)] opacity-25"
              aria-hidden="true"
            />
          ) : (
            <div
              className={`h-full rounded-full transition-[width] ${HEALTH_BAR_CLASSES[health]}`}
              style={{ width: `${Math.max(fillPercent, 4)}%` }}
            />
          )}
        </div>
      </div>

      {/* Pie: tope del ciclo y cuotas futuras (si las hay) */}
      <dl className="mt-auto space-y-1 border-t border-border pt-2 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Tope ciclo</dt>
          <dd className={`truncate text-right font-medium ${plan.monthlyLimit > 0 ? 'text-foreground' : 'italic text-muted-foreground/80'}`}>
            {cycleCapDetail}
          </dd>
        </div>
        {plan.futureInstallmentTotal > 0 && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Cuotas futuras</dt>
            <dd className="truncate text-right font-medium text-foreground">
              {displayAmount(plan.futureInstallmentTotal)}
              <span className="ml-1 font-normal text-muted-foreground">
                · {plan.futureInstallmentCycles} ciclo{plan.futureInstallmentCycles === 1 ? '' : 's'}
              </span>
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}
