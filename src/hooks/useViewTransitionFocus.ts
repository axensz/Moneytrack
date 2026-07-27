import { useCallback, useRef } from 'react';
import type { ViewType } from '../types/finance';

export function useViewTransitionFocus() {
  const scrollContainerRef = useRef<HTMLElement>(null);
  const pendingFocusViewRef = useRef<ViewType | null>(null);

  const handleViewChange = useCallback((nextView: ViewType) => {
    pendingFocusViewRef.current = nextView;
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const handleViewMounted = useCallback((mountedView: ViewType) => {
    if (pendingFocusViewRef.current !== mountedView) return;
    document.getElementById(`view-heading-${mountedView}`)?.focus();
    pendingFocusViewRef.current = null;
  }, []);

  const focusMainContent = useCallback(() => {
    scrollContainerRef.current?.focus();
  }, []);

  return { scrollContainerRef, handleViewChange, handleViewMounted, focusMainContent } as const;
}
