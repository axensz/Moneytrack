'use client';

import React, { lazy, Suspense } from 'react';
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
  <div className="space-y-4 animate-pulse">
    <div className="h-24 bg-muted rounded-xl" />
    <div className="h-16 bg-muted rounded-xl" />
    <div className="h-16 bg-muted rounded-xl" />
  </div>
);

interface FinanceViewRouterProps {
  view: ViewType;
  transactionsPanel: React.ReactNode;
  pendingBudgetDraft: BudgetDraft | null;
  onBudgetDraftApplied: () => void;
  onOpenFinancialPlan: () => void;
  onUseBudgetSuggestion: (category: string, suggestedLimit: number) => void;
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
  onOpenFinancialPlan,
  onUseBudgetSuggestion,
}: FinanceViewRouterProps) {
  switch (view) {
    case 'transactions':
      return panel(view, transactionsPanel);
    case 'recurring':
      return panel(
        view,
        <Suspense fallback={<ViewFallback />}>
          <RecurringPaymentsView />
        </Suspense>
      );
    case 'stats':
      return panel(
        view,
        <Suspense fallback={<ViewFallback />}>
          <StatsView />
        </Suspense>
      );
    case 'accounts':
      return panel(
        view,
        <Suspense fallback={<ViewFallback />}>
          <AccountsView />
        </Suspense>
      );
    case 'debts':
      return panel(
        view,
        <Suspense fallback={<ViewFallback />}>
          <DebtsView />
        </Suspense>
      );
    case 'budgets':
      return panel(
        view,
        <Suspense fallback={<ViewFallback />}>
          <BudgetsView
            initialDraft={pendingBudgetDraft}
            onInitialDraftApplied={onBudgetDraftApplied}
            onOpenFinancialPlan={onOpenFinancialPlan}
          />
        </Suspense>
      );
    case 'financial-plan':
      return panel(
        view,
        <Suspense fallback={<PlanSkeleton />}>
          <FinancialPlanView onUseBudgetSuggestion={onUseBudgetSuggestion} />
        </Suspense>
      );
    case 'goals':
      return panel(
        view,
        <Suspense fallback={<ViewFallback />}>
          <GoalsView />
        </Suspense>
      );
  }
}
