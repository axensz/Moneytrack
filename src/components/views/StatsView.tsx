'use client';

import React, { useMemo } from 'react';
import { Activity, BarChart3, PieChart as PieChartIcon, TrendingUp, CreditCard, Percent } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import type { Transaction, Account } from '../../types/finance';

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
  transactions?: Transaction[];
  accounts?: Account[];
}

export const StatsView: React.FC<StatsViewProps> = ({
  monthlyData,
  yearlyData,
  categoryData,
  formatCurrency,
  transactions = [],
  accounts = []
}) => {
  // Paleta de colores morada
  const COLORS = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#d8b4fe', '#e9d5ff', '#f3e8ff', '#7c3aed', '#6d28d9'];

  // Calcular intereses por tarjeta de crédito (solo las que tienen tasa E.A. configurada)
  const creditCardInterests = useMemo(() => {
    const creditCards = accounts.filter(a => a.type === 'credit' && a.interestRate && a.interestRate > 0);
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return creditCards.map(card => {
      // Filtrar transacciones de esta tarjeta que tienen intereses
      const cardTransactions = transactions.filter(
        t => t.accountId === card.id && t.type === 'expense' && t.totalInterestAmount && t.totalInterestAmount > 0
      );

      // Calcular intereses del mes actual
      const monthlyTransactions = cardTransactions.filter(t => {
        const txDate = new Date(t.date);
        return txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
      });

      // Calcular intereses del año actual
      const yearlyTransactions = cardTransactions.filter(t => {
        const txDate = new Date(t.date);
        return txDate.getFullYear() === currentYear;
      });

      const monthlyInterest = monthlyTransactions.reduce((sum, t) => sum + (t.totalInterestAmount || 0), 0);
      const yearlyInterest = yearlyTransactions.reduce((sum, t) => sum + (t.totalInterestAmount || 0), 0);
      const totalInterest = cardTransactions.reduce((sum, t) => sum + (t.totalInterestAmount || 0), 0);

      // Calcular cuotas pendientes totales
      const pendingInstallments = cardTransactions.reduce((sum, t) => {
        if (t.installments && t.monthlyInstallmentAmount) {
          // Calcular cuántas cuotas han pasado
          const txDate = new Date(t.date);
          const monthsPassed = (currentYear - txDate.getFullYear()) * 12 + (currentMonth - txDate.getMonth());
          const remainingInstallments = Math.max(0, t.installments - monthsPassed);
          return sum + (remainingInstallments * t.monthlyInstallmentAmount);
        }
        return sum;
      }, 0);

      return {
        id: card.id,
        name: card.name,
        interestRate: card.interestRate || 0,
        monthlyInterest,
        yearlyInterest,
        totalInterest,
        pendingInstallments,
        transactionCount: cardTransactions.length
      };
    });
  }, [accounts, transactions]);

  // Totales de intereses
  const interestTotals = useMemo(() => {
    return {
      monthly: creditCardInterests.reduce((sum, c) => sum + c.monthlyInterest, 0),
      yearly: creditCardInterests.reduce((sum, c) => sum + c.yearlyInterest, 0),
      total: creditCardInterests.reduce((sum, c) => sum + c.totalInterest, 0),
      pending: creditCardInterests.reduce((sum, c) => sum + c.pendingInstallments, 0)
    };
  }, [creditCardInterests]);

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

      {/* Intereses de Tarjetas de Crédito */}
      {creditCardInterests.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Intereses Tarjetas de Crédito</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Resumen de intereses generados</p>
            </div>
            <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
              <Percent size={20} className="text-rose-600 dark:text-rose-400" />
            </div>
          </div>

          {/* Resumen de totales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Este Mes</p>
              <p className="text-lg font-bold text-rose-600 dark:text-rose-400">
                {formatCurrency(interestTotals.monthly)}
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Este Año</p>
              <p className="text-lg font-bold text-rose-600 dark:text-rose-400">
                {formatCurrency(interestTotals.yearly)}
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total Histórico</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(interestTotals.total)}
              </p>
            </div>
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">Cuotas Pendientes</p>
              <p className="text-lg font-bold text-amber-700 dark:text-amber-300">
                {formatCurrency(interestTotals.pending)}
              </p>
            </div>
          </div>

          {/* Tabla por tarjeta */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Tarjeta</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Tasa E.A.</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Mensual</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Anual</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Total</th>
                </tr>
              </thead>
              <tbody>
                {creditCardInterests.map((card) => (
                  <tr 
                    key={card.id} 
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <CreditCard size={16} className="text-purple-500" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">{card.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
                        {card.interestRate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-rose-600 dark:text-rose-400">
                      {formatCurrency(card.monthlyInterest)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-rose-600 dark:text-rose-400">
                      {formatCurrency(card.yearlyInterest)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(card.totalInterest)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {creditCardInterests.length > 1 && (
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 font-semibold">
                    <td className="py-3 px-4 text-gray-900 dark:text-gray-100">Total</td>
                    <td className="py-3 px-4"></td>
                    <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400">
                      {formatCurrency(interestTotals.monthly)}
                    </td>
                    <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400">
                      {formatCurrency(interestTotals.yearly)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-900 dark:text-gray-100">
                      {formatCurrency(interestTotals.total)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {interestTotals.total === 0 && (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500">
              <Percent size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No hay transacciones con intereses registradas</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};