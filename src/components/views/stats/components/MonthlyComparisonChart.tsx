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
import { createChartTooltip } from './shared/ChartTooltip';
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

/**
 * Gráfico de Comparación Mensual
 * Barras agrupadas para comparar ingresos vs gastos por mes
 */
export const MonthlyComparisonChart: React.FC<MonthlyComparisonChartProps> = ({
  data,
  formatCurrency,
}) => {
  const CustomTooltip = createChartTooltip(formatCurrency);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Comparación Mensual
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Últimos 6 meses
          </p>
        </div>
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <BarChart3 size={20} className="text-purple-600 dark:text-purple-400" />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={CHART_HEIGHTS.medium}>
        <BarChart data={data} margin={CHART_MARGINS}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3e8ff" />
          <XAxis dataKey="month" {...AXIS_CONFIG} />
          <YAxis {...Y_AXIS_CONFIG} />
          <Tooltip content={<CustomTooltip />} />
          <Legend {...LEGEND_CONFIG} />
          <Bar
            dataKey="ingresos"
            fill={SEMANTIC_COLORS.income}
            name="Ingresos"
            radius={BAR_CONFIG.radius}
          />
          <Bar
            dataKey="gastos"
            fill={SEMANTIC_COLORS.expense}
            name="Gastos"
            radius={BAR_CONFIG.radius}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
