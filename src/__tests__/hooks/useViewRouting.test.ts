import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  actionUrlToView,
  canonicalizeActionUrl,
  navigateToActionUrl,
  useViewRouting,
  viewActionUrl,
} from '../../hooks/useViewRouting';

function setSearch(search: string) {
  // jsdom allows direct assignment of window.location properties via history API
  const url = new URL(window.location.href);
  url.search = search;
  window.history.replaceState({}, '', url.toString());
}

describe('useViewRouting (S6)', () => {
  beforeEach(() => {
    // Start with a clean URL before each test
    setSearch('');
  });

  afterEach(() => {
    setSearch('');
  });

  it('defaults to transactions when no ?view param', () => {
    const { result } = renderHook(() => useViewRouting());
    expect(result.current.view).toBe('transactions');
  });

  it('reads initial view from ?view param on mount', () => {
    setSearch('?view=stats');
    const { result } = renderHook(() => useViewRouting());
    expect(result.current.view).toBe('stats');
  });

  it('accepts the financial plan view from ?view param', () => {
    setSearch('?view=financial-plan');
    const { result } = renderHook(() => useViewRouting());
    expect(result.current.view).toBe('financial-plan');
  });

  it('falls back to transactions for unknown ?view values', () => {
    setSearch('?view=hacker');
    const { result } = renderHook(() => useViewRouting());
    expect(result.current.view).toBe('transactions');
  });

  it('updates view state and URL on setView', () => {
    const { result } = renderHook(() => useViewRouting());

    act(() => { result.current.setView('accounts'); });

    expect(result.current.view).toBe('accounts');
    expect(new URLSearchParams(window.location.search).get('view')).toBe('accounts');
  });

  it('removes ?view param when navigating to default (transactions)', () => {
    setSearch('?view=stats');
    const { result } = renderHook(() => useViewRouting());

    act(() => { result.current.setView('transactions'); });

    expect(result.current.view).toBe('transactions');
    expect(new URLSearchParams(window.location.search).get('view')).toBeNull();
  });

  it('updates view on browser popstate event', () => {
    const { result } = renderHook(() => useViewRouting());

    // Simulate browser back: change URL then fire popstate
    act(() => {
      setSearch('?view=goals');
      window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'goals' } }));
    });

    expect(result.current.view).toBe('goals');
  });

  it('genera actionUrl canonica y convierte rutas legacy', () => {
    expect(viewActionUrl('budgets')).toBe('/?view=budgets');
    expect(viewActionUrl('transactions')).toBe('/');
    expect(actionUrlToView('/debts')).toBe('debts');
    expect(canonicalizeActionUrl('/Moneytrack/accounts')).toBe('/?view=accounts');
  });

  it('navega una actionUrl y notifica al hook mediante popstate', () => {
    const { result } = renderHook(() => useViewRouting());

    act(() => {
      expect(navigateToActionUrl('/budgets')).toBe(true);
    });

    expect(result.current.view).toBe('budgets');
    expect(new URLSearchParams(window.location.search).get('view')).toBe('budgets');
  });
});
