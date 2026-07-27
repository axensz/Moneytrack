'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { NAV_TABS, UI_TEXT } from '../../config/ui';
import { useDismissable } from '../../hooks/useDismissable';
import type { ViewType } from '../../types/finance';

const MOBILE_PRIMARY_KEYS: ViewType[] = ['transactions', 'accounts', 'goals', 'stats'];
const MOBILE_MORE_KEYS: ViewType[] = ['recurring', 'debts', 'budgets', 'financial-plan'];
const tabsFor = (keys: ViewType[]) =>
  keys.map(key => NAV_TABS.find(tab => tab.key === key)!).filter(Boolean);
const MOBILE_PRIMARY_TABS = tabsFor(MOBILE_PRIMARY_KEYS);
const MOBILE_MORE_TABS = tabsFor(MOBILE_MORE_KEYS);

interface MobileNavigationProps {
  view: ViewType;
  setView: (view: ViewType) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function MobileNavigation({
  view,
  setView,
  scrollContainerRef,
}: MobileNavigationProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const closeMoreMenu = useCallback(() => setShowMoreMenu(false), []);

  useDismissable({
    isOpen: showMoreMenu,
    onClose: closeMoreMenu,
    ref: moreMenuRef,
    triggerRef: moreButtonRef,
  });

  useEffect(() => {
    if (!showMoreMenu) return;
    moreMenuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
  }, [showMoreMenu]);

  const navigate = useCallback(
    (targetView: ViewType, smoothWhenActive = false) => {
      scrollContainerRef.current?.scrollTo({
        top: 0,
        behavior: smoothWhenActive && view === targetView ? 'smooth' : 'auto',
      });
      if (view !== targetView) setView(targetView);
      setShowMoreMenu(false);
    },
    [scrollContainerRef, setView, view]
  );

  return (
    <>
      {showMoreMenu && (
        <div
          className="sm:hidden fixed inset-0 z-[60]"
          aria-hidden="true"
          onClick={closeMoreMenu}
          onTouchStart={closeMoreMenu}
        />
      )}

      {showMoreMenu && (
        <div
          ref={moreMenuRef}
          role="menu"
          aria-label={UI_TEXT.aria.moreSections}
          className="sm:hidden fixed right-3 z-[70] bg-card text-card-foreground rounded-xl shadow-xl border border-border overflow-hidden min-w-[var(--shell-more-menu-w,170px)] animate-in slide-in-from-bottom-2 duration-150 fade-in [bottom:var(--shell-nav-h,72px)]"
        >
          {MOBILE_MORE_TABS.map(tab => (
            <button
              key={tab.key}
              role="menuitem"
              onClick={() => {
                navigate(tab.key);
                moreButtonRef.current?.focus();
              }}
              className={`flex items-center gap-3 w-full px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                view === tab.key
                  ? 'text-primary bg-muted'
                  : 'text-foreground hover:bg-muted active:bg-muted'
              }`}
            >
              <tab.icon size={18} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      )}

      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-[100] bg-card/95 backdrop-blur-md border-t border-border shadow-lg safe-area-bottom"
        aria-label={UI_TEXT.aria.mainNavigation}
        role="navigation"
      >
        <div className="flex justify-around items-center px-2 py-1.5 pb-2" role="tablist">
          {MOBILE_PRIMARY_TABS.map(tab => (
            <button
              key={tab.key}
              id={`tab-${tab.key}-mobile`}
              role="tab"
              aria-selected={view === tab.key}
              aria-controls={`panel-${tab.key}`}
              onClick={() => navigate(tab.key, true)}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 min-w-[56px] rounded-xl transition-[background-color,color,transform] ${
                view === tab.key
                  ? 'text-primary bg-muted scale-105'
                  : 'text-muted-foreground active:scale-95 active:bg-muted'
              }`}
            >
              <tab.icon
                size={20}
                strokeWidth={view === tab.key ? 2.5 : 2}
                aria-hidden="true"
              />
              <span className="text-[10px] font-semibold leading-tight">{tab.label}</span>
            </button>
          ))}

          <div className="relative">
            <button
              ref={moreButtonRef}
              onClick={() => setShowMoreMenu(open => !open)}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 min-w-[56px] rounded-xl transition-[background-color,color,transform] ${
                MOBILE_MORE_KEYS.includes(view)
                  ? 'text-primary bg-muted scale-105'
                  : showMoreMenu
                    ? 'text-primary'
                    : 'text-muted-foreground active:scale-95 active:bg-muted'
              }`}
              aria-haspopup="menu"
              aria-expanded={showMoreMenu}
              aria-label={UI_TEXT.aria.moreSections}
            >
              <MoreHorizontal
                size={20}
                strokeWidth={MOBILE_MORE_KEYS.includes(view) ? 2.5 : 2}
                aria-hidden="true"
              />
              <span className="text-[10px] font-semibold leading-tight">Más</span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
