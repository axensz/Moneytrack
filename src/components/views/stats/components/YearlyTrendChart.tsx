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
import { createChartTooltip } from './shared/ChartTooltip';
import {
  AXIS_CONFIG,
  Y_AXIS_CONFIG,
  CHART_MARGINS,
  LEGEND_CONFIG,
  LINE_CONFIG,
  CHART_HEIGHTS,
  SEMANTIC_COLORS,
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
  const CustomTooltip = createChartTooltip(formatCurrency);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Tendencia Anual
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Resumen por año
          </p>
        </div>
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <TrendingUp size={20} className="text-purple-600 dark:text-purple-400" />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={CHART_HEIGHTS.medium}>
        <LineChart data={data} margin={CHART_MARGINS}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3e8ff" />
          <XAxis dataKey="año" {...AXIS_CONFIG} />
          <YAxis {...Y_AXIS_CONFIG} />
          <Tooltip content={<CustomTooltip />} />
          <Legend {...LEGEND_CONFIG} />
          <Line
            type="monotone"
            dataKey="ingresos"
            stroke={SEMANTIC_COLORS.income}
            strokeWidth={3}
            dot={{ fill: SEMANTIC_COLORS.income, r: LINE_CONFIG.dotRadius }}
            name="Ingresos"
          />
          <Line
            type="monotone"
            dataKey="gastos"
            stroke={SEMANTIC_COLORS.expense}
            strokeWidth={3}
            dot={{ fill: SEMANTIC_COLORS.expense, r: LINE_CONFIG.dotRadius }}
            name="Gastos"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
