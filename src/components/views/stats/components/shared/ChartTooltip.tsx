import React, { useMemo } from 'react';

interface TooltipPayload {
  color: string;
  name: string;
  value: number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  formatCurrency: (amount: number) => string;
}

/**
 * Tooltip reutilizable para todos los gráficos de Recharts.
 * Usa los tokens del tema (--card / --foreground / --border / --shadow-lg) para
 * funcionar igual en claro y oscuro; sin glassmorphism ni hex fijos.
 */
export const ChartTooltip: React.FC<ChartTooltipProps> = ({
  active,
  payload,
  label,
  formatCurrency,
}) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: 'var(--card)',
        color: 'var(--foreground)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {label && <p className="text-sm font-semibold mb-2">{label}</p>}
      {payload.map((entry, index) => (
        <p key={entry.name ?? index} className="text-sm" style={{ color: entry.color }}>
          {/* Recharts puede pasar value undefined/NaN en un punto sin dato de una
              serie → mostrar guion en vez de "$NaN". (#stats-tooltip) */}
          {entry.name}: {typeof entry.value === 'number' && Number.isFinite(entry.value) ? formatCurrency(entry.value) : '—'}
        </p>
      ))}
    </div>
  );
};

/**
 * HOC para crear un tooltip con formatCurrency pre-configurado
 * Evita pasar formatCurrency como prop en cada gráfico.
 * Memoizar el resultado en el llamador con useChartTooltip evita recrear el
 * componente en cada render (y que Recharts lo remonte).
 */
export const createChartTooltip = (formatCurrency: (amount: number) => string) => {
  const TooltipWithFormat: React.FC<Omit<ChartTooltipProps, 'formatCurrency'>> = (props) => (
    <ChartTooltip {...props} formatCurrency={formatCurrency} />
  );
  TooltipWithFormat.displayName = 'ChartTooltipWithFormat';
  return TooltipWithFormat;
};

/**
 * Hook que memoiza createChartTooltip por formatCurrency.
 */
export const useChartTooltip = (formatCurrency: (amount: number) => string) =>
  useMemo(() => createChartTooltip(formatCurrency), [formatCurrency]);
