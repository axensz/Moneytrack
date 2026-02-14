'use client';

import React, { useState, useMemo } from 'react';
import { Search, Calendar, Tag, Wallet, TrendingUp, TrendingDown, ArrowRightLeft } from 'lucide-react';
import type { Transaction, Account } from '../../../../types/finance';
import { TRANSFER_CATEGORY } from '../../../../config/constants';
import { formatCurrency } from '../../../../utils/formatters';

interface PeriodSummaryCardProps {
  transactions: Transaction[];
  accounts: Account[];
}

type SummaryType = 'all' | 'income' | 'expense';

export const PeriodSummaryCard: React.FC<PeriodSummaryCardProps> = ({
  transactions,
  accounts,
}) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<SummaryType>('all');
  const [isExpanded, setIsExpanded] = useState(false);

  // Get unique categories from transactions
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    transactions.forEach(t => {
      if (t.category && t.category !== TRANSFER_CATEGORY) cats.add(t.category);
    });
    return Array.from(cats).sort();
  }, [transactions]);

  // Filter transactions based on query
  const filteredTransactions = useMemo(() => {
    if (!startDate && !endDate) return [];

    return transactions.filter(t => {
      // Date filter
      const txDate = t.date instanceof Date ? t.date : new Date(t.date);
      if (startDate) {
        const start = new Date(startDate + 'T00:00:00');
        if (txDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate + 'T23:59:59');
        if (txDate > end) return false;
      }

      // Type filter
      if (selectedType !== 'all' && t.type !== selectedType) return false;

      // Category filter
      if (selectedCategory !== 'all' && t.category !== selectedCategory) return false;

      // Account filter
      if (selectedAccount !== 'all' && t.accountId !== selectedAccount) return false;

      return true;
    });
  }, [transactions, startDate, endDate, selectedCategory, selectedAccount, selectedType]);

  // Calculate summary stats
  const summary = useMemo(() => {
    const income = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    // Category breakdown
    const byCategory = new Map<string, number>();
    filteredTransactions
      .filter(t => t.type !== 'transfer')
      .forEach(t => {
        const current = byCategory.get(t.category) || 0;
        byCategory.set(t.category, current + t.amount);
      });
    const categoryBreakdown = Array.from(byCategory.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    return {
      count: filteredTransactions.length,
      income,
      expenses,
      net: income - expenses,
      categoryBreakdown,
    };
  }, [filteredTransactions]);

  const hasQuery = startDate || endDate;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Search size={20} className="text-purple-600 dark:text-purple-400" />
          Consulta por Periodo
        </h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 font-medium"
        >
          {isExpanded ? 'Cerrar' : 'Abrir'}
        </button>
      </div>

      {isExpanded && (
        <>
          {/* Query filters */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                <Calendar size={12} className="inline mr-1" />
                Desde
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-base text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                <Calendar size={12} className="inline mr-1" />
                Hasta
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input-base text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                <ArrowRightLeft size={12} className="inline mr-1" />
                Tipo
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as SummaryType)}
                className="input-base text-sm"
              >
                <option value="all">Todos</option>
                <option value="income">Ingresos</option>
                <option value="expense">Gastos</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                <Tag size={12} className="inline mr-1" />
                Categoría
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="input-base text-sm"
              >
                <option value="all">Todas</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                <Wallet size={12} className="inline mr-1" />
                Cuenta
              </label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="input-base text-sm"
              >
                <option value="all">Todas</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Results */}
          {hasQuery ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Transacciones</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{summary.count}</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-center">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1 flex items-center justify-center gap-1">
                    <TrendingUp size={12} /> Ingresos
                  </p>
                  <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(summary.income)}</p>
                </div>
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-center">
                  <p className="text-xs text-rose-600 dark:text-rose-400 mb-1 flex items-center justify-center gap-1">
                    <TrendingDown size={12} /> Gastos
                  </p>
                  <p className="text-lg font-bold text-rose-700 dark:text-rose-300">{formatCurrency(summary.expenses)}</p>
                </div>
                <div className={`p-3 rounded-xl text-center ${
                  summary.net >= 0 
                    ? 'bg-blue-50 dark:bg-blue-900/20' 
                    : 'bg-amber-50 dark:bg-amber-900/20'
                }`}>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Neto</p>
                  <p className={`text-lg font-bold ${
                    summary.net >= 0 
                      ? 'text-blue-700 dark:text-blue-300' 
                      : 'text-amber-700 dark:text-amber-300'
                  }`}>
                    {summary.net >= 0 ? '+' : ''}{formatCurrency(summary.net)}
                  </p>
                </div>
              </div>

              {/* Category breakdown */}
              {summary.categoryBreakdown.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Desglose por categoría
                  </h4>
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto scrollbar-thin pr-1">
                    {summary.categoryBreakdown.map((cat) => {
                      const maxAmount = summary.categoryBreakdown[0]?.amount || 1;
                      const pct = (cat.amount / maxAmount) * 100;
                      return (
                        <div key={cat.name} className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 dark:text-gray-400 w-28 truncate flex-shrink-0">
                            {cat.name}
                          </span>
                          <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500/70 dark:bg-purple-400/50 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-28 text-right flex-shrink-0">
                            {formatCurrency(cat.amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
              Selecciona un rango de fechas para consultar
            </p>
          )}
        </>
      )}
    </div>
  );
};
