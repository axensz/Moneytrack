import React, { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useViewRouting } from '../../hooks/useViewRouting';
import type { ViewType } from '../../types/finance';

const LazyStatsHeading = lazy(async () => ({
  default: () => <h2 id="view-heading-stats" tabIndex={-1}>Estadísticas</h2>,
}));

function FocusedPanel({ view, onViewMounted }: { view: ViewType; onViewMounted: (view: ViewType) => void }) {
  useEffect(() => onViewMounted(view), [onViewMounted, view]);
  return <LazyStatsHeading />;
}

function DesktopShellHarness() {
  const scrollContainerRef = useRef<HTMLElement>(null);
  const pendingFocusViewRef = useRef<ViewType | null>(null);
  const handleViewChange = useCallback((nextView: ViewType) => {
    pendingFocusViewRef.current = nextView;
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, []);
  const { view, setView } = useViewRouting({ onViewChange: handleViewChange });
  const handleViewMounted = useCallback((mountedView: ViewType) => {
    if (pendingFocusViewRef.current !== mountedView) return;
    document.getElementById(`view-heading-${mountedView}`)?.focus();
    pendingFocusViewRef.current = null;
  }, []);

  return (
    <>
      <a
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          scrollContainerRef.current?.focus();
        }}
      >
        Saltar al contenido principal
      </a>
      <main id="main-content" ref={scrollContainerRef} tabIndex={-1}>
        <button type="button" onClick={() => setView('stats')}>Ir a Estadísticas</button>
        <Suspense fallback={null}>
          {view === 'stats' && <FocusedPanel view={view} onViewMounted={handleViewMounted} />}
        </Suspense>
      </main>
    </>
  );
}

describe('desktop shell navigation', () => {
  it('provides a skip link, resets the app scroller, and focuses the lazy view heading after mount', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
    render(<DesktopShellHarness />);

    const skipLink = screen.getByRole('link', { name: 'Saltar al contenido principal' });
    skipLink.focus();
    fireEvent.click(skipLink);
    expect(document.activeElement).toBe(screen.getByRole('main'));

    fireEvent.click(screen.getByRole('button', { name: 'Ir a Estadísticas' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    expect(screen.queryByRole('heading', { name: 'Estadísticas' })).toBeNull();
    await screen.findByRole('heading', { name: 'Estadísticas' });
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Estadísticas' }));
  });
});
