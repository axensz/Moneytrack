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
  const tabRefs = React.useRef<HTMLButtonElement[]>([]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const { key } = event;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;

    event.preventDefault();
    const nextIndex = key === 'Home' ? 0 : key === 'End' ? NAV_TABS.length - 1 :
      (index + (key === 'ArrowRight' ? 1 : -1) + NAV_TABS.length) % NAV_TABS.length;
    const nextTab = NAV_TABS[nextIndex];
    setView(nextTab.key);
    requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus());
    tabRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <>
      {/* Desktop Navigation */}
      <nav
        data-testid="primary-navigation"
        className="hidden sm:flex max-w-full justify-start items-center gap-4 mb-4 sm:mb-5 md:mb-6"
        aria-label={UI_TEXT.aria.mainNavigation}
      >
        <div data-desktop-tab-scroll className="max-w-full overflow-x-auto">
          <div className="flex min-w-max gap-2 border-b border-border" role="tablist">
            {NAV_TABS.map((tab, index) => (
              <button
                key={tab.key}
                ref={element => { if (element) tabRefs.current[index] = element; }}
                id={`tab-${tab.key}`}
                role="tab"
                aria-selected={view === tab.key}
                aria-controls={`panel-${tab.key}`}
                tabIndex={view === tab.key ? 0 : -1}
                onClick={() => setView(tab.key)}
                onKeyDown={event => handleKeyDown(event, index)}
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
        </div>
      </nav>
    </>
  );
};
