'use client';

import React from 'react';
import { Activity, BarChart3, PieChart as PieChartIcon, TrendingUp } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    color: string;
    name: string;
    value: number;
  }>;
  label?: string;
}

interface StatsViewProps {
  monthlyData: Array<{
    month: string;
    ingresos: number;
    gastos: number;
  }>;
  yearlyData: Array<{
    año: string;
    ingresos: number;
    gastos: number;
  }>;
  categoryData: Array<{
    name: string;
    value: number;
  }>;
  formatCurrency: (amount: number) => string;
}

export const StatsView: React.FC<StatsViewProps> = ({
  monthlyData,
  yearlyData,
  categoryData,
  formatCurrency
}) => {
  // Paleta de colores morada
  const COLORS = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#d8b4fe', '#e9d5ff', '#f3e8ff', '#7c3aed', '#6d28d9'];

  // Custom tooltip para los gráficos
  const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 backdrop-blur-sm border border-purple-200 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold text-gray-900 mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Flujo de caja */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Flujo de Caja</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Últimos 6 meses</p>
          </div>
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Activity size={20} className="text-purple-600 dark:text-purple-400" />
          </div>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={monthlyData}>
            <defs>
              <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3e8ff" />
            <XAxis
              dataKey="month"
              stroke="#9ca3af"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              stroke="#9ca3af"
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="circle"
            />
            <Area
              type="monotone"
              dataKey="ingresos"
              stroke="#8b5cf6"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#colorIngresos)"
              name="Ingresos"
            />
            <Area
              type="monotone"
              dataKey="gastos"
              stroke="#f43f5e"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#colorGastos)"
              name="Gastos"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Comparación Mensual */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Comparación Mensual</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Últimos 6 meses</p>
            </div>
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <BarChart3 size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3e8ff" />
              <XAxis
                dataKey="month"
                stroke="#9ca3af"
                style={{ fontSize: '12px' }}
              />
              <YAxis
                stroke="#9ca3af"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" />
              <Bar dataKey="ingresos" fill="#8b5cf6" name="Ingresos" radius={[6, 6, 0, 0]} />
              <Bar dataKey="gastos" fill="#f43f5e" name="Gastos" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Distribución por categoría */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Gastos por Categoría</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Distribución actual</p>
            </div>
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <PieChartIcon size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          {categoryData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {categoryData.slice(0, 5).map((item, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
                    </div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <PieChartIcon size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay datos de gastos</p>
            </div>
          )}
        </div>
      </div>

      {/* Tendencia anual */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tendencia Anual</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Resumen por año</p>
          </div>
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <TrendingUp size={20} className="text-purple-600 dark:text-purple-400" />
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={yearlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3e8ff" />
            <XAxis
              dataKey="año"
              stroke="#9ca3af"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              stroke="#9ca3af"
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" />
            <Line
              type="monotone"
              dataKey="ingresos"
              stroke="#8b5cf6"
              strokeWidth={3}
              dot={{ fill: '#8b5cf6', r: 5 }}
              name="Ingresos"
            />
            <Line
              type="monotone"
              dataKey="gastos"
              stroke="#f43f5e"
              strokeWidth={3}
              dot={{ fill: '#f43f5e', r: 5 }}
              name="Gastos"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};