'use client';

import React, { memo, useMemo } from 'react';
import { getRingSegmentColor } from '../utils/accountBrandColors';

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

/**
 * Tamaño de la cifra central según su longitud. El círculo interior mide
 * SIZE - 2 * STROKE = 132px y la cifra va en monoespaciada (~0.6em por
 * carácter), así que un monto largo en `text-xl` tocaba el trazo del anillo.
 */
const centerAmountSizeClass = (text: string): string => {
  if (text.length <= 9) return 'text-xl';
  if (text.length <= 12) return 'text-base';
  if (text.length <= 14) return 'text-sm';
  return 'text-xs';
};
const CENTER = SIZE / 2;

/**
 * Anillo (donut SVG) de distribución del dinero disponible — ancla visual de
 * la pantalla MÓVIL de Cuentas.
 *
 * - El total va al centro; cada cuenta de ahorro/efectivo es un segmento con un
 *   color de la rampa DEL SISTEMA (`getRingSegmentColor`, tokens `--ring-seg-*`
 *   en theme.css). No usa colores de marca (naranja/ámbar/rosa): el anillo es
 *   un gráfico del producto y se mantiene dentro del violet/azul/verde/índigo.
 * - Solo recibe saldos ya calculados: no toca `balanceCalculator` ni el modelo.
 * - Las cuentas con saldo ≤ 0 se OCULTAN por completo (ni segmento ni leyenda):
 *   no aportan al disponible y "Efectivo $0 · 0%" solo añadía ruido. Si tras
 *   filtrar queda una sola cuenta, el anillo se dibuja completo de su color.
 */
export const AvailableDistributionRing: React.FC<AvailableDistributionRingProps> = memo(({
  segments,
  total,
  formatCurrency,
  hideBalances,
}) => {
  // Solo los saldos POSITIVOS existen en el anillo: las cuentas con saldo ≤ 0
  // se ocultan tanto del donut como de la leyenda (no aportan al disponible).
  // Cada visible recibe un color POSICIONAL del sistema (índice en la lista
  // filtrada), estable entre renders mientras no cambie el orden del dominio.
  const visibleSegments = useMemo(
    () =>
      segments
        .filter((s) => s.value > 0)
        .map((s, index) => ({ ...s, color: getRingSegmentColor(index) })),
    [segments]
  );

  const positiveTotal = useMemo(
    () => visibleSegments.reduce((sum, s) => sum + s.value, 0),
    [visibleSegments]
  );

  // Arcos acumulados: cada segmento ocupa su fracción del total positivo.
  const arcs = useMemo(() => {
    if (positiveTotal <= 0) return [];
    let offset = 0;
    return visibleSegments.map((s) => {
      const fraction = s.value / positiveTotal;
      const length = fraction * CIRCUMFERENCE;
      const arc = {
        id: s.id,
        color: s.color,
        // dasharray: longitud visible + resto en blanco.
        dash: `${length} ${CIRCUMFERENCE - length}`,
        // dashoffset negativo desplaza el arco al punto de inicio acumulado.
        offset: -offset,
      };
      offset += length;
      return arc;
    });
  }, [visibleSegments, positiveTotal]);

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
          <span
            className={`mt-0.5 font-mono font-bold text-success ${centerAmountSizeClass(displayAmount(total))}`}
          >
            {displayAmount(total)}
          </span>
        </div>
      </div>

      {/* Leyenda: punto del color del sistema + nombre + saldo + % del total.
          Solo las cuentas con saldo > 0 (mismas que el donut); los ceros no
          aparecen. El texto va en --foreground (AA), el punto es decorativo. */}
      <ul className="flex w-full flex-col gap-2">
        {visibleSegments.map((segment) => {
          const fraction = positiveTotal > 0 ? segment.value / positiveTotal : 0;
          return (
            <li key={segment.id} className="flex items-center gap-3">
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ backgroundColor: segment.color }}
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
