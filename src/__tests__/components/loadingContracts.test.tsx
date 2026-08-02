import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FinanceViewRouter } from '../../components/layout/FinanceViewRouter';
import { PlanSkeleton } from '../../components/views/financial-plan/PlanSkeleton';
import { TransactionsListSkeleton } from '../../components/views/transactions/components/TransactionsListSkeleton';

describe('contratos accesibles de carga', () => {
  it('anuncia la carga del plan y oculta sus bloques decorativos', () => {
    render(<PlanSkeleton />);
    const status = screen.getByRole('status', { name: 'Cargando plan financiero' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('anuncia la carga de movimientos y oculta sus bloques decorativos', () => {
    render(<TransactionsListSkeleton />);
    const status = screen.getByRole('status', { name: 'Cargando movimientos' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('anuncia el fallback mientras resuelve una vista lazy', () => {
    render(
      <FinanceViewRouter
        view="accounts"
        transactionsPanel={null}
        pendingBudgetDraft={null}
        onBudgetDraftApplied={vi.fn()}
        onOpenFinancialPlan={vi.fn()}
        onUseBudgetSuggestion={vi.fn()}
        onViewMounted={vi.fn()}
      />
    );

    const status = screen.getByRole('status', { name: 'Cargando vista' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});
