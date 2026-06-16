import React from 'react';

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
 * Tooltip reutilizable para todos los gráficos de Recharts
 * Estilo consistente con glassmorphism y bordes morados
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
    <div className="bg-white/95 backdrop-blur-sm border border-purple-200 rounded-lg p-3 shadow-lg">
      {label && <p className="text-sm font-semibold text-gray-900 mb-2">{label}</p>}
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
 * Evita pasar formatCurrency como prop en cada gráfico
 */
export const createChartTooltip = (formatCurrency: (amount: number) => string) => {
  const TooltipWithFormat: React.FC<Omit<ChartTooltipProps, 'formatCurrency'>> = (props) => (
    <ChartTooltip {...props} formatCurrency={formatCurrency} />
  );
  TooltipWithFormat.displayName = 'ChartTooltipWithFormat';
  return TooltipWithFormat;
};
