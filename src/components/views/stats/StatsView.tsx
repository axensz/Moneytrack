'use client';

import React from 'react';
import { useTransactionDomain, useAccountDomain, useFormatCurrency } from '../../../hooks/useFinanceSelectors';
import { useUIPreferences } from '../../../contexts/UIPreferencesContext';
import { CashFlowChart } from './components/CashFlowChart';
import { MonthlyComparisonChart } from './components/MonthlyComparisonChart';
import { CategoryPieChart } from './components/CategoryPieChart';
import { BeneficiarySpendTable } from './components/BeneficiarySpendTable';
import { YearlyTrendChart } from './components/YearlyTrendChart';
import { CreditCardInterestsCard } from './components/CreditCardInterestsCard';
import { PeriodSummaryCard } from './components/PeriodSummaryCard';
import { useCreditCardInterests } from './hooks/useCreditCardInterests';
import { useStatsData } from './hooks/useStatsData';
import { sectionTitle } from '../../../config/ui';

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
  const { balanceTransactions } = useTransactionDomain();
  const { accounts } = useAccountDomain();
  const formatCurrency = useFormatCurrency();
  const { hideBalances } = useUIPreferences();
  // El provider ya mantiene el historial completo para saldos. Reutilizarlo evita
  // una segunda lectura y una segunda copia completa exclusiva de estadísticas.
  const allTransactions = balanceTransactions;
  // Custom hooks para procesamiento de datos
  const { monthlyData, yearlyData, categoryData } = useStatsData(allTransactions);
  const { creditCardInterests, totals } = useCreditCardInterests(accounts, allTransactions);

  // Wrapper para formatCurrency que respeta hideBalances
  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h2 id="view-heading-stats" tabIndex={-1} className="sr-only">{sectionTitle('stats')}</h2>
      {/* Fila 1: Flujo de caja a ancho completo */}
      <CashFlowChart
        data={monthlyData}
        formatCurrency={displayAmount}
      />

      {/* Fila 2: Comparación mensual y distribución por categoría */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MonthlyComparisonChart
          data={monthlyData}
          formatCurrency={displayAmount}
        />
        <CategoryPieChart
          data={categoryData}
          formatCurrency={displayAmount}
        />
      </div>

      {/* Fila 3: Tendencia anual y gasto por persona */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <YearlyTrendChart
          data={yearlyData}
          formatCurrency={displayAmount}
        />
        <BeneficiarySpendTable
          transactions={allTransactions}
          formatCurrency={displayAmount}
        />
      </div>

      {/* Fila 4: Intereses de tarjetas de crédito */}
      <CreditCardInterestsCard
        creditCardInterests={creditCardInterests}
        totals={totals}
        formatCurrency={displayAmount}
      />

      {/* Fila 5: Consulta por periodo personalizado */}
      <PeriodSummaryCard
        transactions={allTransactions}
        accounts={accounts}
      />
    </div>
  );
};
