'use client';

import React from 'react';
import type { Transaction, Account } from '../../../types/finance';
import { useFinance } from '../../../contexts/FinanceContext';
import { CashFlowChart } from './components/CashFlowChart';
import { MonthlyComparisonChart } from './components/MonthlyComparisonChart';
import { CategoryPieChart } from './components/CategoryPieChart';
import { YearlyTrendChart } from './components/YearlyTrendChart';
import { CreditCardInterestsCard } from './components/CreditCardInterestsCard';
import { PeriodSummaryCard } from './components/PeriodSummaryCard';
import { useCreditCardInterests } from './hooks/useCreditCardInterests';
import { useStatsData } from './hooks/useStatsData';

/**
 * Vista Principal de Estadísticas
 * 
 * Componente orquestador que:
 * - Procesa datos a través de custom hooks
 * - Compone los diferentes gráficos de estadísticas
 * - Mantiene un diseño responsive con grid
 * 
 * @author Refactored following Clean Code principles
 */
export const StatsView: React.FC = () => {
  const { transactions, accounts, formatCurrency } = useFinance();
  // Custom hooks para procesamiento de datos
  const { monthlyData, yearlyData, categoryData } = useStatsData(transactions);
  const { creditCardInterests, totals } = useCreditCardInterests(accounts, transactions);

  return (
    <div className="space-y-6">
      {/* Fila 1: Flujo de caja a ancho completo */}
      <CashFlowChart
        data={monthlyData}
        formatCurrency={formatCurrency}
      />

      {/* Fila 2: Comparación mensual y distribución por categoría */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MonthlyComparisonChart
          data={monthlyData}
          formatCurrency={formatCurrency}
        />
        <CategoryPieChart
          data={categoryData}
          formatCurrency={formatCurrency}
        />
      </div>

      {/* Fila 3: Tendencia anual */}
      <YearlyTrendChart
        data={yearlyData}
        formatCurrency={formatCurrency}
      />

      {/* Fila 4: Intereses de tarjetas de crédito */}
      <CreditCardInterestsCard
        creditCardInterests={creditCardInterests}
        totals={totals}
        formatCurrency={formatCurrency}
      />

      {/* Fila 5: Consulta por periodo personalizado */}
      <PeriodSummaryCard
        transactions={transactions}
        accounts={accounts}
      />
    </div>
  );
};
