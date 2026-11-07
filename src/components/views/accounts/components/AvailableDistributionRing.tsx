'use client';

import React, { memo, useMemo } from 'react';
import { getAccountBrand } from '../utils/accountBrandColors';

export interface DistributionSegment {
  /** id de la cuenta (clave estable del segmento). */
  id: string;
  /** Nombre de la cuenta (para la leyenda y el color de marca). */
  name: string;
  /** Saldo de la cuenta (ya calculado por el dominio; aquí no se recalcula). */
  value: number;
}

interface AvailableDistributionRingProps {
  /** Segmentos: ahorro + efectivo ACTIVOS (las archivadas se excluyen aguas arriba). */
  segments: DistributionSegment[];
  /** Total disponible ya calculado (suma de los saldos). */
  total: number;
  /** Formateador de moneda del dominio. */
  formatCurrency: (amount: number) => string;
  /** Oculta cifras cuando el usuario activa "ocultar saldos". */
  hideBalances: boolean;
}

// Geometría del anillo. Un único donut SVG; el grosor del trazo hace el "anillo".
const SIZE = 168;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = SIZE / 2;

/**
 * Anillo (donut SVG) de distribución del dinero disponible — ancla visual de
 * la pantalla MÓVIL de Cuentas.
 *
 * - El total va al centro; cada cuenta de ahorro/efectivo es un segmento con su
 *   color de marca (ver `accountBrandColors`).
 * - Solo recibe saldos ya calculados: no toca `balanceCalculator` ni el modelo.
 * - Las cuentas con saldo ≤ 0 no dibujan segmento (no aportan al disponible)
 *   pero sí aparecen en la leyenda para no "desaparecer" de la vista.
 * - El color comunica identidad de cuenta, no estado; es una de las dos
 *   excepciones móviles donde se permite color fuera del violet de marca.
 */
export const AvailableDistributionRing: React.FC<AvailableDistributionRingProps> = memo(({
  segments,
  total,
  formatCurrency,
  hideBalances,
}) => {
  // Solo los saldos positivos aportan arco; el resto queda en la leyenda.
  const positiveTotal = useMemo(
    () => segments.reduce((sum, s) => sum + Math.max(0, s.value), 0),
    [segments]
  );

  // Arcos acumulados: cada segmento ocupa su fracción del total positivo.
  const arcs = useMemo(() => {
    if (positiveTotal <= 0) return [];
    let offset = 0;
    return segments
      .filter((s) => s.value > 0)
      .map((s) => {
        const fraction = s.value / positiveTotal;
        const length = fraction * CIRCUMFERENCE;
        const brand = getAccountBrand(s.name);
        const arc = {
          id: s.id,
          color: brand.accent,
          // dasharray: longitud visible + resto en blanco.
          dash: `${length} ${CIRCUMFERENCE - length}`,
          // dashoffset negativo desplaza el arco al punto de inicio acumulado.
          offset: -offset,
        };
        offset += length;
        return arc;
      });
  }, [segments, positiveTotal]);

  const displayAmount = (amount: number) =>
    hideBalances ? '••••••' : formatCurrency(amount);
  const displayPercent = (fraction: number) =>
    hideBalances ? '••' : `${Math.round(fraction * 100)}%`;

  const hasData = positiveTotal > 0;

  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`Distribución del dinero disponible, total ${displayAmount(total)}`}
          className="-rotate-90"
        >
          {/* Pista base del anillo. */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={STROKE}
          />
          {/* Segmentos por cuenta. */}
          {hasData &&
            arcs.map((arc) => (
              <circle
                key={arc.id}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={STROKE}
                strokeDasharray={arc.dash}
                strokeDashoffset={arc.offset}
                strokeLinecap="butt"
                className="transition-[stroke-dasharray,stroke-dashoffset] duration-500 motion-reduce:transition-none"
              />
            ))}
        </svg>
        {/* Cifra central: el total disponible. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs font-medium text-muted-foreground">Disponible</span>
          <span className="mt-0.5 font-mono text-xl font-bold text-success">
            {displayAmount(total)}
          </span>
        </div>
      </div>

      {/* Leyenda: color de marca + nombre + saldo + % del total. */}
      <ul className="flex w-full flex-col gap-2">
        {segments.map((segment) => {
          const brand = getAccountBrand(segment.name);
          const fraction = positiveTotal > 0 ? Math.max(0, segment.value) / positiveTotal : 0;
          return (
            <li key={segment.id} className="flex items-center gap-3">
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ backgroundColor: brand.accent }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {segment.name}
              </span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {displayAmount(segment.value)}
              </span>
              <span className="w-10 text-right font-mono text-xs text-muted-foreground">
                {displayPercent(fraction)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

AvailableDistributionRing.displayName = 'AvailableDistributionRing';
