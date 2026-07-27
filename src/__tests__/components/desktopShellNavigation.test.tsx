import React, { useCallback, useRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FinanceViewRouter } from '../../components/layout/FinanceViewRouter';
import { sectionTitle } from '../../config/ui';
import { navigateToActionUrl, useViewRouting } from '../../hooks/useViewRouting';
import type { ViewType } from '../../types/finance';

const statsGate = vi.hoisted(() => ({
  blocked: false,
  promise: Promise.resolve(),
  release: () => undefined as void,
  reset(blocked = false) {
    this.blocked = blocked;
    this.promise = new Promise<void>(resolveGate => { this.release = resolveGate; });
  },
}));

vi.mock('../../components/views/stats/StatsView', () => ({
  StatsView: () => {
    if (statsGate.blocked) throw statsGate.promise;
    return <h2 id="view-heading-stats" tabIndex={-1}>{sectionTitle('stats')}</h2>;
  },
}));

vi.mock('../../components/views/accounts/AccountsView', () => ({
  AccountsView: () => <h2 id="view-heading-accounts" tabIndex={-1}>{sectionTitle('accounts')}</h2>,
}));

function RoutedShell({ onViewChange = vi.fn() }: { onViewChange?: (view: ViewType) => void }) {
  const scrollContainerRef = useRef<HTMLElement>(null);
  const pendingFocusViewRef = useRef<ViewType | null>(null);
  const handleViewChange = useCallback((nextView: ViewType) => {
    pendingFocusViewRef.current = nextView;
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    onViewChange(nextView);
  }, [onViewChange]);
  const { view, setView } = useViewRouting({ onViewChange: handleViewChange });
  const handleViewMounted = useCallback((mountedView: ViewType) => {
    if (pendingFocusViewRef.current !== mountedView) return;
    document.getElementById(`view-heading-${mountedView}`)?.focus();
    pendingFocusViewRef.current = null;
  }, []);

  return (
    <>
      <a href="#main-content" onClick={(event) => { event.preventDefault(); scrollContainerRef.current?.focus(); }}>
        Saltar al contenido principal
      </a>
      <main id="main-content" ref={scrollContainerRef} tabIndex={-1}>
        <button type="button" onClick={() => setView('stats')}>Ir a Estadísticas</button>
        <button type="button" onClick={() => setView('accounts')}>Ir a Cuentas</button>
        <button type="button" onClick={() => navigateToActionUrl('/?view=stats')}>Abrir Estadísticas desde acción</button>
        <button
          type="button"
          onClick={() => {
            window.history.pushState({ view: 'accounts' }, '', '/?view=accounts');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
        >
          Abrir Cuentas desde historial
        </button>
        <FinanceViewRouter
          view={view}
          transactionsPanel={<h2 id="view-heading-transactions" tabIndex={-1}>{sectionTitle('transactions')}</h2>}
          pendingBudgetDraft={null}
          onBudgetDraftApplied={() => undefined}
          onOpenFinancialPlan={() => undefined}
          onUseBudgetSuggestion={() => undefined}
          onViewMounted={handleViewMounted}
        />
      </main>
    </>
  );
}

const headingContracts: Array<[ViewType, string]> = [
  ['transactions', 'src/components/views/transactions/TransactionsView.tsx'],
  ['accounts', 'src/components/views/accounts/AccountsView.tsx'],
  ['recurring', 'src/components/views/recurring/RecurringPaymentsView.tsx'],
  ['debts', 'src/components/views/debts/DebtsView.tsx'],
  ['budgets', 'src/components/views/budgets/BudgetsView.tsx'],
  ['goals', 'src/components/views/goals/GoalsView.tsx'],
  ['stats', 'src/components/views/stats/StatsView.tsx'],
  ['financial-plan', 'src/components/views/financial-plan/FinancialPlanView.tsx'],
];

describe('desktop shell navigation', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('uses the real router to reset and focus only after a delayed lazy view commits', async () => {
    statsGate.reset(true);
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
    render(<RoutedShell />);

    const skipLink = screen.getByRole('link', { name: 'Saltar al contenido principal' });
    fireEvent.click(skipLink);
    expect(document.activeElement).toBe(screen.getByRole('main'));

    fireEvent.click(screen.getByRole('button', { name: 'Ir a Estadísticas' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    expect(screen.queryByRole('heading', { name: sectionTitle('stats') })).toBeNull();

    await act(async () => {
      statsGate.blocked = false;
      statsGate.release();
    });
    await screen.findByRole('heading', { name: sectionTitle('stats') });
    await waitFor(() => expect(screen.getByRole('heading', { name: sectionTitle('stats') })).toHaveFocus());
  });

  it('routes action URLs and browser history through exactly one shell callback', async () => {
    statsGate.reset();
    const onViewChange = vi.fn();
    render(<RoutedShell onViewChange={onViewChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir Estadísticas desde acción' }));
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenLastCalledWith('stats');
    await screen.findByRole('heading', { name: sectionTitle('stats') });
    await waitFor(() => expect(screen.getByRole('heading', { name: sectionTitle('stats') })).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: 'Abrir Cuentas desde historial' }));
    expect(onViewChange).toHaveBeenCalledTimes(2);
    expect(onViewChange).toHaveBeenLastCalledWith('accounts');
    await screen.findByRole('heading', { name: sectionTitle('accounts') });
    await waitFor(() => expect(screen.getByRole('heading', { name: sectionTitle('accounts') })).toHaveFocus());
  });

  it('does not let a delayed stale view steal focus after rapid navigation', async () => {
    statsGate.reset(true);
    render(<RoutedShell />);

    fireEvent.click(screen.getByRole('button', { name: 'Ir a Estadísticas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Cuentas' }));
    expect(await screen.findByRole('heading', { name: sectionTitle('accounts') })).toHaveFocus();

    await act(async () => {
      statsGate.blocked = false;
      statsGate.release();
    });
    expect(screen.getByRole('heading', { name: sectionTitle('accounts') })).toHaveFocus();
  });

  it.each(headingContracts)('keeps exactly one canonical %s entry heading', (view, path) => {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8');
    const canonicalHeading = new RegExp(`<h2[^>]*id=["']view-heading-${view}["'][^>]*>[\\s\\S]*?sectionTitle\\(['"]${view}['"]\\)[\\s\\S]*?</h2>`, 'g');
    expect(source.match(canonicalHeading)).toHaveLength(1);
  });
});
