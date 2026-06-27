'use client';

import React from 'react';
import { BarChart3 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useChartTooltip } from './shared/ChartTooltip';
import { ChartCard, ChartDataTable } from './shared/ChartCard';
import {
  AXIS_CONFIG,
  Y_AXIS_CONFIG,
  CHART_MARGINS,
  LEGEND_CONFIG,
  BAR_CONFIG,
  CHART_HEIGHTS,
  SEMANTIC_COLORS,
} from '../config/chartConfig';

interface MonthlyDataPoint {
  month: string;
  ingresos: number;
  gastos: number;
}

interface MonthlyComparisonChartProps {
  data: MonthlyDataPoint[];
  formatCurrency: (amount: number) => string;
}

const GASTOS_PATTERN_ID = 'patternGastosBars';

/**
 * Gráfico de Comparación Mensual
 * Barras agrupadas para comparar ingresos vs gastos por mes
 */
export const MonthlyComparisonChart: React.FC<MonthlyComparisonChartProps> = ({
  data,
  formatCurrency,
}) => {
  const CustomTooltip = useChartTooltip(formatCurrency);
  const hasData = data.some((d) => d.ingresos > 0 || d.gastos > 0);

  const totalIngresos = data.reduce((s, d) => s + d.ingresos, 0);
  const totalGastos = data.reduce((s, d) => s + d.gastos, 0);
  const chartLabel = `Comparación mensual de ingresos y gastos en los últimos 6 meses. Ingresos totales ${formatCurrency(totalIngresos)}, gastos totales ${formatCurrency(totalGastos)}.`;

  return (
    <ChartCard title="Comparación Mensual" subtitle="Últimos 6 meses" icon={BarChart3}>
      {!hasData ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500" role="status">
          <BarChart3 size={48} className="mx-auto mb-3 opacity-30" aria-hidden="true" />
          <p className="text-sm">No hay movimientos en los últimos 6 meses</p>
        </div>
      ) : (
      <>
      <div role="img" aria-label={chartLabel}>
      <ResponsiveContainer
        width="100%"
        height={CHART_HEIGHTS.medium}
      >
        <BarChart data={data} margin={CHART_MARGINS}>
          <defs>
            {/* Trama diagonal para reforzar "gastos" por forma, no solo color. */}
            <pattern
              id={GASTOS_PATTERN_ID}
              patternUnits="userSpaceOnUse"
              width="6"
              height="6"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill={SEMANTIC_COLORS.expense} />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--card)" strokeWidth="2" strokeOpacity="0.45" />
            </pattern>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="month" {...AXIS_CONFIG} />
          <YAxis {...Y_AXIS_CONFIG} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }} />
          <Legend {...LEGEND_CONFIG} />
          <Bar
            dataKey="ingresos"
            fill={SEMANTIC_COLORS.income}
            name="Ingresos"
            radius={BAR_CONFIG.radius}
          />
          <Bar
            dataKey="gastos"
            fill={`url(#${GASTOS_PATTERN_ID})`}
            name="Gastos"
            radius={BAR_CONFIG.radius}
          />
        </BarChart>
      </ResponsiveContainer>
      </div>
      <ChartDataTable
        caption="Comparación mensual: ingresos y gastos por mes (últimos 6 meses)"
        periodLabel="Mes"
        rows={data.map((d) => ({ label: d.month, ingresos: d.ingresos, gastos: d.gastos }))}
        formatCurrency={formatCurrency}
      />
      </>
      )}
    </ChartCard>
  );
};
