'use client';

import React, { useMemo } from 'react';
import { PieChart as PieChartIcon } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useChartTooltip } from './shared/ChartTooltip';
import { ChartCard } from './shared/ChartCard';
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

// Top 5 categorías + el resto agregado en "Otros". Slices y leyenda comparten
// exactamente este conjunto, de modo que cada color del pastel aparece en la
// leyenda (antes la leyenda solo mostraba 5 de 8 colores).
const MAX_PIE_SLICES = 5;

/**
 * Gráfico de Distribución por Categoría
 * Donut chart con leyenda de las top 5 categorías + "Otros"
 */
export const CategoryPieChart: React.FC<CategoryPieChartProps> = ({
  data,
  formatCurrency,
}) => {
  const CustomTooltip = useChartTooltip(formatCurrency);
  const hasData = data.length > 0;

  const chartData = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.value - a.value);
    if (sorted.length <= MAX_PIE_SLICES) return sorted;
    const top = sorted.slice(0, MAX_PIE_SLICES);
    const rest = sorted.slice(MAX_PIE_SLICES);
    const otrosValue = rest.reduce((sum, item) => sum + item.value, 0);
    return otrosValue > 0 ? [...top, { name: 'Otros', value: otrosValue }] : top;
  }, [data]);

  const total = chartData.reduce((sum, item) => sum + item.value, 0);
  const chartLabel = `Distribución de gastos por categoría. Total ${formatCurrency(total)} en ${chartData.length} grupos.`;

  return (
    <ChartCard title="Gastos por Categoría" subtitle="Distribución actual" icon={PieChartIcon}>
      {hasData ? (
        <>
          <div className="flex justify-center" role="img" aria-label={chartLabel}>
            <ResponsiveContainer
              width="100%"
              height={CHART_HEIGHTS.small}
              className="max-w-[300px] mx-auto"
            >
              <PieChart>
                <Pie
                  data={chartData as Array<{ name: string; value: number; [key: string]: unknown }>}
                  cx="50%"
                  cy="50%"
                  innerRadius={PIE_CONFIG.innerRadius}
                  outerRadius={PIE_CONFIG.outerRadius}
                  paddingAngle={PIE_CONFIG.paddingAngle}
                  dataKey="value"
                >
                  {chartData.map((item, index) => (
                    <Cell
                      key={`cell-${item.name}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Leyenda: mismo conjunto (top 5 + "Otros") y mismos colores que las porciones */}
          <ul className="mt-4 space-y-2">
            {chartData.map((item, index) => (
              <li key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    aria-hidden="true"
                  />
                  <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
                </div>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatCurrency(item.value)}
                </span>
              </li>
            ))}
          </ul>

          {/* Tabla accesible con las cifras exactas */}
          <table className="sr-only">
            <caption>Gastos por categoría</caption>
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                <th scope="col">Monto</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((item) => (
                <tr key={item.name}>
                  <th scope="row">{item.name}</th>
                  <td>{formatCurrency(item.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <EmptyState />
      )}
    </ChartCard>
  );
};

const EmptyState: React.FC = () => (
  <div className="text-center py-12 text-gray-400 dark:text-gray-500">
    <PieChartIcon size={48} className="mx-auto mb-3 opacity-30" aria-hidden="true" />
    <p className="text-sm">No hay datos de gastos</p>
  </div>
);
