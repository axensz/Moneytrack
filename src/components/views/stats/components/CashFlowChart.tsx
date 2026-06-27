'use client';

import React from 'react';
import { Activity } from 'lucide-react';
import {
  AreaChart,
  Area,
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
  GRADIENT_CONFIG,
  LINE_CONFIG,
  CHART_HEIGHTS,
  SEMANTIC_COLORS,
  SERIES_DASH,
} from '../config/chartConfig';

interface MonthlyDataPoint {
  month: string;
  ingresos: number;
  gastos: number;
}

interface CashFlowChartProps {
  data: MonthlyDataPoint[];
  formatCurrency: (amount: number) => string;
}

/**
 * Gráfico de Flujo de Caja
 * Muestra la evolución de ingresos vs gastos en los últimos 6 meses
 * Usa gradientes para visualización atractiva
 */
export const CashFlowChart: React.FC<CashFlowChartProps> = ({
  data,
  formatCurrency,
}) => {
  const CustomTooltip = useChartTooltip(formatCurrency);
  const hasData = data.some((d) => d.ingresos > 0 || d.gastos > 0);

  const totalIngresos = data.reduce((s, d) => s + d.ingresos, 0);
  const totalGastos = data.reduce((s, d) => s + d.gastos, 0);
  const chartLabel = `Flujo de caja de los últimos 6 meses. Ingresos totales ${formatCurrency(totalIngresos)}, gastos totales ${formatCurrency(totalGastos)}.`;

  return (
    <ChartCard title="Flujo de Caja" subtitle="Últimos 6 meses" icon={Activity}>
      {!hasData ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500" role="status">
          <Activity size={48} className="mx-auto mb-3 opacity-30" aria-hidden="true" />
          <p className="text-sm">No hay movimientos en los últimos 6 meses</p>
        </div>
      ) : (
      <>
      <div role="img" aria-label={chartLabel}>
      <ResponsiveContainer
        width="100%"
        height={CHART_HEIGHTS.large}
      >
        <AreaChart data={data} margin={CHART_MARGINS}>
          <defs>
            <linearGradient id={GRADIENT_CONFIG.income.id} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={GRADIENT_CONFIG.income.color}
                stopOpacity={GRADIENT_CONFIG.income.startOpacity}
              />
              <stop
                offset="95%"
                stopColor={GRADIENT_CONFIG.income.color}
                stopOpacity={GRADIENT_CONFIG.income.endOpacity}
              />
            </linearGradient>
            <linearGradient id={GRADIENT_CONFIG.expense.id} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={GRADIENT_CONFIG.expense.color}
                stopOpacity={GRADIENT_CONFIG.expense.startOpacity}
              />
              <stop
                offset="95%"
                stopColor={GRADIENT_CONFIG.expense.color}
                stopOpacity={GRADIENT_CONFIG.expense.endOpacity}
              />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="month" {...AXIS_CONFIG} />
          <YAxis {...Y_AXIS_CONFIG} />
          <Tooltip content={<CustomTooltip />} />
          <Legend {...LEGEND_CONFIG} wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />

          <Area
            type="monotone"
            dataKey="ingresos"
            stroke={SEMANTIC_COLORS.income}
            strokeWidth={LINE_CONFIG.strokeWidth}
            strokeDasharray={SERIES_DASH.income}
            fillOpacity={1}
            fill={`url(#${GRADIENT_CONFIG.income.id})`}
            name="Ingresos"
          />
          <Area
            type="monotone"
            dataKey="gastos"
            stroke={SEMANTIC_COLORS.expense}
            strokeWidth={LINE_CONFIG.strokeWidth}
            strokeDasharray={SERIES_DASH.expense}
            fillOpacity={1}
            fill={`url(#${GRADIENT_CONFIG.expense.id})`}
            name="Gastos"
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
      <ChartDataTable
        caption="Flujo de caja: ingresos y gastos por mes (últimos 6 meses)"
        periodLabel="Mes"
        rows={data.map((d) => ({ label: d.month, ingresos: d.ingresos, gastos: d.gastos }))}
        formatCurrency={formatCurrency}
      />
      </>
      )}
    </ChartCard>
  );
};
