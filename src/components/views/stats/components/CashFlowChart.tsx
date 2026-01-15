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
import { createChartTooltip } from './shared/ChartTooltip';
import {
  AXIS_CONFIG,
  Y_AXIS_CONFIG,
  CHART_MARGINS,
  LEGEND_CONFIG,
  GRADIENT_CONFIG,
  LINE_CONFIG,
  CHART_HEIGHTS,
  SEMANTIC_COLORS,
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
  const CustomTooltip = createChartTooltip(formatCurrency);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Flujo de Caja
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Últimos 6 meses
          </p>
        </div>
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <Activity size={20} className="text-purple-600 dark:text-purple-400" />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={CHART_HEIGHTS.large}>
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
          
          <CartesianGrid strokeDasharray="3 3" stroke="#f3e8ff" />
          <XAxis dataKey="month" {...AXIS_CONFIG} />
          <YAxis {...Y_AXIS_CONFIG} />
          <Tooltip content={<CustomTooltip />} />
          <Legend {...LEGEND_CONFIG} wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
          
          <Area
            type="monotone"
            dataKey="ingresos"
            stroke={SEMANTIC_COLORS.income}
            strokeWidth={LINE_CONFIG.strokeWidth}
            fillOpacity={1}
            fill={`url(#${GRADIENT_CONFIG.income.id})`}
            name="Ingresos"
          />
          <Area
            type="monotone"
            dataKey="gastos"
            stroke={SEMANTIC_COLORS.expense}
            strokeWidth={LINE_CONFIG.strokeWidth}
            fillOpacity={1}
            fill={`url(#${GRADIENT_CONFIG.expense.id})`}
            name="Gastos"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
