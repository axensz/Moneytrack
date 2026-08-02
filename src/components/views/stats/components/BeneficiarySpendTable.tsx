'use client';

import React, { useMemo, useState } from 'react';
import { UserRound } from 'lucide-react';
import { ChartCard } from './shared/ChartCard';
import { SPECIAL_CATEGORIES } from '../../../../config/constants';
import type { Transaction } from '../../../../types/finance';

interface BeneficiaryDataPoint {
  name: string;
  value: number;
  count: number;
}

interface BeneficiarySpendTableProps {
  transactions: Transaction[];
  formatCurrency: (amount: number) => string;
}

const MAX_ROWS = 6;

type SpendInterval = 'this-month' | 'last-month' | 'last-3-months' | 'this-year' | 'all';

const INTERVAL_OPTIONS: Array<{ value: SpendInterval; label: string }> = [
  { value: 'this-month', label: 'Mes actual' },
  { value: 'last-month', label: 'Mes anterior' },
  { value: 'last-3-months', label: 'Últimos 3 meses' },
  { value: 'this-year', label: 'Este año' },
  { value: 'all', label: 'Todo' },
];

export const BeneficiarySpendTable: React.FC<BeneficiarySpendTableProps> = ({
  transactions,
  formatCurrency,
}) => {
  const [interval, setInterval] = useState<SpendInterval>('this-month');

  const data = useMemo(
    () => computeBeneficiaryData(transactions, interval),
    [interval, transactions]
  );
  const topRows = useMemo(() => data.slice(0, MAX_ROWS), [data]);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const maxValue = topRows[0]?.value || 0;

  return (
    <ChartCard title="Gastos por Persona" subtitle={`Periodo: ${INTERVAL_OPTIONS.find((option) => option.value === interval)!.label}`} icon={UserRound}>
      <div className="mb-4 flex justify-end">
        <label htmlFor="beneficiary-spend-interval" className="sr-only">
          Intervalo de gastos por persona
        </label>
        <select
          id="beneficiary-spend-interval"
          value={interval}
          onChange={(event) => setInterval(event.target.value as SpendInterval)}
          className="input-base max-w-[180px] text-sm"
        >
          {INTERVAL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {topRows.length > 0 ? (
        <div className="space-y-3">
          <div className="space-y-2">
            {topRows.map((item) => {
              const percentage = total > 0 ? (item.value / total) * 100 : 0;
              const width = maxValue > 0 ? Math.max((item.value / maxValue) * 100, 4) : 0;

              return (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {item.count} movimiento{item.count !== 1 ? 's' : ''} - {percentage.toFixed(1)}%
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(item.value)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-rose-500 dark:bg-rose-400"
                      style={{ width: `${width}%` }}
                      aria-hidden="true"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <table className="sr-only">
            <caption>Gastos por persona o beneficiario</caption>
            <thead>
              <tr>
                <th scope="col">Persona</th>
                <th scope="col">Monto</th>
                <th scope="col">Movimientos</th>
                <th scope="col">Porcentaje</th>
              </tr>
            </thead>
            <tbody>
              {topRows.map((item) => (
                <tr key={item.name}>
                  <th scope="row">{item.name}</th>
                  <td>{formatCurrency(item.value)}</td>
                  <td>{item.count}</td>
                  <td>{total > 0 ? `${((item.value / total) * 100).toFixed(1)}%` : '0%'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState />
      )}
    </ChartCard>
  );
};

const EmptyState: React.FC = () => (
  <div className="text-center py-12 text-gray-400 dark:text-gray-500">
    <UserRound size={48} className="mx-auto mb-3 opacity-30" aria-hidden="true" />
    <p className="text-sm">No hay gastos por persona</p>
  </div>
);

function computeBeneficiaryData(
  transactions: Transaction[],
  interval: SpendInterval
): BeneficiaryDataPoint[] {
  const range = getIntervalRange(interval);
  const beneficiaryMap = new Map<string, { value: number; count: number }>();

  transactions
    .filter((transaction) => {
      if (!transaction.paid || transaction.type !== 'expense') return false;
      if (SPECIAL_CATEGORIES.adjustmentCategories.includes(transaction.category)) return false;
      if (!range) return true;
      const date = new Date(transaction.date);
      return date >= range.start && date < range.end;
    })
    .forEach((transaction) => {
      const name = transaction.beneficiary?.trim();
      if (!name || name.toLocaleLowerCase('es-CO') === 'yo') return;
      const current = beneficiaryMap.get(name) || { value: 0, count: 0 };
      beneficiaryMap.set(name, {
        value: current.value + transaction.amount,
        count: current.count + 1,
      });
    });

  return Array.from(beneficiaryMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.value - a.value);
}

function getIntervalRange(interval: SpendInterval): { start: Date; end: Date } | null {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  switch (interval) {
    case 'this-month':
      return {
        start: new Date(year, month, 1),
        end: new Date(year, month + 1, 1),
      };
    case 'last-month':
      return {
        start: new Date(year, month - 1, 1),
        end: new Date(year, month, 1),
      };
    case 'last-3-months':
      return {
        start: new Date(year, month - 2, 1),
        end: new Date(year, month + 1, 1),
      };
    case 'this-year':
      return {
        start: new Date(year, 0, 1),
        end: new Date(year + 1, 0, 1),
      };
    case 'all':
      return null;
  }
}
