'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface ChartCardProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  children: React.ReactNode;
}

/**
 * Cabecera compartida de las tarjetas de gráfico (título + subtítulo + icono de
 * marca). Centraliza el header repetido entre CashFlow / Monthly / Yearly /
 * Pie. El color del icono es de MARCA (violet), no de estado.
 */
export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  icon: Icon,
  children,
}) => (
  <div className="card">
    <div className="flex items-center justify-between mb-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {subtitle}
        </p>
      </div>
      <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
        <Icon size={20} className="text-purple-600 dark:text-purple-400" aria-hidden="true" />
      </div>
    </div>
    {children}
  </div>
);

interface SeriesDatum {
  label: string;
  ingresos: number;
  gastos: number;
}

/**
 * Tabla de datos solo para lectores de pantalla. Da acceso a las cifras exactas
 * que el SVG del gráfico no expone. El gráfico debe ir con role="img" +
 * aria-label de resumen y esta tabla al lado.
 */
export const ChartDataTable: React.FC<{
  caption: string;
  periodLabel: string;
  rows: SeriesDatum[];
  formatCurrency: (amount: number) => string;
}> = ({ caption, periodLabel, rows, formatCurrency }) => (
  <table className="sr-only">
    <caption>{caption}</caption>
    <thead>
      <tr>
        <th scope="col">{periodLabel}</th>
        <th scope="col">Ingresos</th>
        <th scope="col">Gastos</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r) => (
        <tr key={r.label}>
          <th scope="row">{r.label}</th>
          <td>{formatCurrency(r.ingresos)}</td>
          <td>{formatCurrency(r.gastos)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
