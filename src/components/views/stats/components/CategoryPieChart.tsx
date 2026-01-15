'use client';

import React from 'react';
import { PieChart as PieChartIcon } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { createChartTooltip } from './shared/ChartTooltip';
import {
  CHART_COLORS,
  PIE_CONFIG,
  CHART_HEIGHTS,
} from '../config/chartConfig';

interface CategoryDataPoint {
  name: string;
  value: number;
}

interface CategoryPieChartProps {
  data: CategoryDataPoint[];
  formatCurrency: (amount: number) => string;
}

/**
 * Gráfico de Distribución por Categoría
 * Donut chart con leyenda de las top 5 categorías
 */
export const CategoryPieChart: React.FC<CategoryPieChartProps> = ({
  data,
  formatCurrency,
}) => {
  const CustomTooltip = createChartTooltip(formatCurrency);
  const hasData = data.length > 0;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Gastos por Categoría
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Distribución actual
          </p>
        </div>
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <PieChartIcon size={20} className="text-purple-600 dark:text-purple-400" />
        </div>
      </div>

      {hasData ? (
        <>
          <div className="flex justify-center">
            <ResponsiveContainer
              width="100%"
              height={CHART_HEIGHTS.small}
              className="max-w-[300px] mx-auto"
            >
              <PieChart>
                <Pie
                  data={data as Array<{ name: string; value: number; [key: string]: unknown }>}
                  cx="50%"
                  cy="50%"
                  innerRadius={PIE_CONFIG.innerRadius}
                  outerRadius={PIE_CONFIG.outerRadius}
                  paddingAngle={PIE_CONFIG.paddingAngle}
                  dataKey="value"
                >
                  {data.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Leyenda de categorías */}
          <div className="mt-4 space-y-2">
            {data.slice(0, 5).map((item, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                  />
                  <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
                </div>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatCurrency(item.value)}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  );
};

const EmptyState: React.FC = () => (
  <div className="text-center py-12 text-gray-400 dark:text-gray-500">
    <PieChartIcon size={48} className="mx-auto mb-3 opacity-30" />
    <p className="text-sm">No hay datos de gastos</p>
  </div>
);
