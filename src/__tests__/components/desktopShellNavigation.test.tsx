import React, { useCallback } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FinanceViewRouter } from '../../components/layout/FinanceViewRouter';
import { TabNavigation } from '../../components/layout/TabNavigation';
import { navTabLabel, sectionTitle } from '../../config/ui';
import { navigateToActionUrl, useViewRouting } from '../../hooks/useViewRouting';
import { useViewTransitionFocus } from '../../hooks/useViewTransitionFocus';
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
  const { focusMainContent, handleViewChange, handleViewMounted, scrollContainerRef } = useViewTransitionFocus();
  const routedViewChange = useCallback((nextView: ViewType) => {
    handleViewChange(nextView);
    onViewChange(nextView);
  }, [handleViewChange, onViewChange]);
  const { view: routedView, setView: setRoutedView } = useViewRouting({ onViewChange: routedViewChange });

  return (
    <>
      <a href="#main-content" onClick={(event) => { event.preventDefault(); focusMainContent(); }}>
        Saltar al contenido principal
      </a>
      <main id="main-content" ref={scrollContainerRef} tabIndex={-1}>
        <button type="button" onClick={() => setRoutedView('stats')}>Ir a Estadísticas</button>
        <button type="button" onClick={() => setRoutedView('accounts')}>Ir a Cuentas</button>
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
          view={routedView}
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

function ControlledTabNavigation({ initialView }: { initialView: ViewType }) {
  const [view, setView] = React.useState(initialView);
  return <TabNavigation view={view} setView={setView} />;
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
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
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

  it('wires the actual app skip link and main landmark to the shared controller', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/AuthenticatedApp.tsx'), 'utf8');
    const componentStyles = readFileSync(resolve(process.cwd(), 'app/styles/components.css'), 'utf8');
    expect(source).toContain('useViewTransitionFocus');
    expect(source).toMatch(/<a\s+className="skip-link"\s+href="#main-content"[\s\S]*?focusMainContent\(\)/);
    expect(source).toMatch(/<main id="main-content" ref=\{scrollContainerRef\} tabIndex=\{-1\} className="flex-1 min-h-0 overflow-auto">/);
    expect(componentStyles).toMatch(/\.skip-link\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?transform:\s*translateY\(calc\(-100% - 2rem\)\);[\s\S]*?\}/);
    expect(componentStyles).toMatch(/\.skip-link:focus-visible\s*\{[\s\S]*?transform:\s*translateY\(0\);[\s\S]*?\}/);
  });

  it.each([
    ['ArrowRight', 'transactions', 'accounts'],
    ['ArrowLeft', 'transactions', 'financial-plan'],
    ['Home', 'goals', 'transactions'],
    ['End', 'transactions', 'financial-plan'],
  ])('moves %s from %s to %s with roving tabindex', async (key, from, to) => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    render(<ControlledTabNavigation initialView={from as ViewType} />);
    const current = screen.getByRole('tab', { name: new RegExp(navTabLabel(from as ViewType)), selected: true });
    current.focus();
    fireEvent.keyDown(current, { key });
    const target = screen.getByRole('tab', { name: new RegExp(navTabLabel(to as ViewType)) });
    await waitFor(() => {
      expect(target).toHaveAttribute('aria-selected', 'true');
      expect(target).toHaveAttribute('tabindex', '0');
      expect(current).toHaveAttribute('tabindex', '-1');
      expect(target).toHaveFocus();
    });
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'nearest', inline: 'nearest' });
  });

  it('ignores keys outside the primary tab keyboard model', () => {
    const setView = vi.fn();
    render(<TabNavigation view="transactions" setView={setView} />);
    const current = screen.getByRole('tab', { selected: true });
    expect(current).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByRole('tab').filter(tab => tab.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(fireEvent.keyDown(current, { key: 'Enter' })).toBe(true);
    expect(setView).not.toHaveBeenCalled();
  });

  it('keeps desktop overflow inside the navigation surface', () => {
    const { container } = render(<TabNavigation view="transactions" setView={vi.fn()} />);
    expect(container.querySelector('[role="tablist"]')).toHaveClass('min-w-max');
    expect(container.querySelector('[data-desktop-tab-scroll]')).toHaveClass('overflow-x-auto');
    expect(container.querySelector('nav')).toHaveClass('max-w-full');
  });
});
