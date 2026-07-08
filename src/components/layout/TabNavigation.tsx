'use client';

import React from 'react';
import type { ViewType } from '../../types/finance';
import { NAV_TABS, UI_TEXT } from '../../config/ui';

export { NAV_TABS, navTabLabel, type NavTab } from '../../config/ui';

interface TabNavigationProps {
  view: ViewType;
  setView: (view: ViewType) => void;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  view,
  setView,
}) => {
  return (
    <>
      {/* Desktop Navigation */}
      <nav
        className="hidden sm:flex justify-start items-center gap-4 mb-4 sm:mb-5 md:mb-6"
        aria-label={UI_TEXT.aria.mainNavigation}
      >
        <div className="flex gap-2 border-b border-border" role="tablist">
          {NAV_TABS.map(tab => (
            <button
              key={tab.key}
              id={`tab-${tab.key}`}
              role="tab"
              aria-selected={view === tab.key}
              aria-controls={`panel-${tab.key}`}
              onClick={() => setView(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-base font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${view === tab.key
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-primary'
                }`}
            >
              <tab.icon size={18} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
};
