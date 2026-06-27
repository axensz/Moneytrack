'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';
import {
  LineChart,
  Line,
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
  LINE_CONFIG,
  CHART_HEIGHTS,
  SEMANTIC_COLORS,
  SERIES_DASH,
} from '../config/chartConfig';

interface YearlyDataPoint {
  año: string;
  ingresos: number;
  gastos: number;
}

interface YearlyTrendChartProps {
  data: YearlyDataPoint[];
  formatCurrency: (amount: number) => string;
}

/**
 * Gráfico de Tendencia Anual
 * Líneas con puntos para visualizar la evolución año a año
 */
export const YearlyTrendChart: React.FC<YearlyTrendChartProps> = ({
  data,
  formatCurrency,
}) => {
  const CustomTooltip = useChartTooltip(formatCurrency);
  const hasData = data.some((d) => d.ingresos > 0 || d.gastos > 0);

  const totalIngresos = data.reduce((s, d) => s + d.ingresos, 0);
  const totalGastos = data.reduce((s, d) => s + d.gastos, 0);
  const chartLabel = `Tendencia anual de ingresos y gastos. Ingresos totales ${formatCurrency(totalIngresos)}, gastos totales ${formatCurrency(totalGastos)}.`;

  return (
    <ChartCard title="Tendencia Anual" subtitle="Resumen por año" icon={TrendingUp}>
      {!hasData ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500" role="status">
          <TrendingUp size={48} className="mx-auto mb-3 opacity-30" aria-hidden="true" />
          <p className="text-sm">Aún no hay datos por año</p>
        </div>
      ) : (
      <>
      <ResponsiveContainer
        width="100%"
        height={CHART_HEIGHTS.medium}
        role="img"
        aria-label={chartLabel}
      >
        <LineChart data={data} margin={CHART_MARGINS}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="año" {...AXIS_CONFIG} />
          <YAxis {...Y_AXIS_CONFIG} />
          <Tooltip content={<CustomTooltip />} />
          <Legend {...LEGEND_CONFIG} />
          <Line
            type="monotone"
            dataKey="ingresos"
            stroke={SEMANTIC_COLORS.income}
            strokeWidth={3}
            strokeDasharray={SERIES_DASH.income}
            dot={{ fill: SEMANTIC_COLORS.income, r: LINE_CONFIG.dotRadius }}
            name="Ingresos"
          />
          <Line
            type="monotone"
            dataKey="gastos"
            stroke={SEMANTIC_COLORS.expense}
            strokeWidth={3}
            strokeDasharray={SERIES_DASH.expense}
            dot={{ fill: SEMANTIC_COLORS.expense, r: LINE_CONFIG.dotRadius }}
            name="Gastos"
          />
        </LineChart>
      </ResponsiveContainer>
      <ChartDataTable
        caption="Tendencia anual: ingresos y gastos por año"
        periodLabel="Año"
        rows={data.map((d) => ({ label: d.año, ingresos: d.ingresos, gastos: d.gastos }))}
        formatCurrency={formatCurrency}
      />
      </>
      )}
    </ChartCard>
  );
};
