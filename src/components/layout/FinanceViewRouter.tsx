'use client';

import React, { lazy, Suspense, useEffect } from 'react';
import { PlanSkeleton } from '../views/financial-plan/PlanSkeleton';
import type { ViewType } from '../../types/finance';
import type { BudgetDraft } from '../views/budgets/BudgetsView';

const StatsView = lazy(() =>
  import('../views/stats/StatsView').then(module => ({ default: module.StatsView }))
);
const AccountsView = lazy(() =>
  import('../views/accounts/AccountsView').then(module => ({ default: module.AccountsView }))
);
const RecurringPaymentsView = lazy(() =>
  import('../views/recurring/RecurringPaymentsView').then(module => ({
    default: module.RecurringPaymentsView,
  }))
);
const DebtsView = lazy(() =>
  import('../views/debts/DebtsView').then(module => ({ default: module.DebtsView }))
);
const BudgetsView = lazy(() =>
  import('../views/budgets/BudgetsView').then(module => ({ default: module.BudgetsView }))
);
const FinancialPlanView = lazy(() =>
  import('../views/financial-plan/FinancialPlanView').then(module => ({
    default: module.FinancialPlanView,
  }))
);
const GoalsView = lazy(() =>
  import('../views/goals/GoalsView').then(module => ({ default: module.GoalsView }))
);

const ViewFallback = () => (
  <div role="status" aria-busy="true" aria-label="Cargando vista">
    <div className="space-y-4 animate-pulse" aria-hidden="true">
      <div className="h-24 bg-muted rounded-xl" />
      <div className="h-16 bg-muted rounded-xl" />
      <div className="h-16 bg-muted rounded-xl" />
    </div>
  </div>
);

interface FinanceViewRouterProps {
  view: ViewType;
  transactionsPanel: React.ReactNode;
  pendingBudgetDraft: BudgetDraft | null;
  onBudgetDraftApplied: () => void;
  onGoToTransactions: () => void;
  onOpenFinancialPlan: () => void;
  onUseBudgetSuggestion: (category: string, suggestedLimit: number) => void;
  onViewMounted: (view: ViewType) => void;
}

function FocusedPanel({ view, onViewMounted, children }: {
  view: ViewType;
  onViewMounted: (view: ViewType) => void;
  children: React.ReactNode;
}) {
  useEffect(() => onViewMounted(view), [onViewMounted, view]);
  return <>{children}</>;
}

function panel(view: ViewType, content: React.ReactNode) {
  return (
    <div
      id={`panel-${view}`}
      role="tabpanel"
      aria-labelledby={`tab-${view}`}
    >
      {content}
    </div>
  );
}

export function FinanceViewRouter({
  view,
  transactionsPanel,
  pendingBudgetDraft,
  onBudgetDraftApplied,
  onGoToTransactions,
  onOpenFinancialPlan,
  onUseBudgetSuggestion,
  onViewMounted,
}: FinanceViewRouterProps) {
  switch (view) {
    case 'transactions':
      return panel(view, <FocusedPanel view={view} onViewMounted={onViewMounted}>{transactionsPanel}</FocusedPanel>);
    case 'recurring':
      return panel(
        view,
        <Suspense fallback={<ViewFallback />}>
          <FocusedPanel view={view} onViewMounted={onViewMounted}><RecurringPaymentsView /></FocusedPanel>
        </Suspense>
      );
    case 'stats':
      return panel(
        view,
        <Suspense fallback={<ViewFallback />}>
          <FocusedPanel view={view} onViewMounted={onViewMounted}><StatsView onGoToTransactions={onGoToTransactions} /></FocusedPanel>
        </Suspense>
      );
    case 'accounts':
      return panel(
        view,
        <Suspense fallback={<ViewFallback />}>
          <FocusedPanel view={view} onViewMounted={onViewMounted}><AccountsView /></FocusedPanel>
        </Suspense>
      );
    case 'debts':
      return panel(
        view,
        <Suspense fallback={<ViewFallback />}>
          <FocusedPanel view={view} onViewMounted={onViewMounted}><DebtsView /></FocusedPanel>
        </Suspense>
      );
    case 'budgets':
      return panel(
        view,
        <Suspense fallback={<ViewFallback />}>
          <FocusedPanel view={view} onViewMounted={onViewMounted}><BudgetsView
            initialDraft={pendingBudgetDraft}
            onInitialDraftApplied={onBudgetDraftApplied}
            onOpenFinancialPlan={onOpenFinancialPlan}
          /></FocusedPanel>
        </Suspense>
      );
    case 'financial-plan':
      return panel(
        view,
        <Suspense fallback={<PlanSkeleton />}>
          <FocusedPanel view={view} onViewMounted={onViewMounted}><FinancialPlanView onUseBudgetSuggestion={onUseBudgetSuggestion} /></FocusedPanel>
        </Suspense>
      );
    case 'goals':
      return panel(
        view,
        <Suspense fallback={<ViewFallback />}>
          <FocusedPanel view={view} onViewMounted={onViewMounted}><GoalsView /></FocusedPanel>
        </Suspense>
      );
  }
}
