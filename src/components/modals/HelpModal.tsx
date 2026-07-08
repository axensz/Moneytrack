import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Bot,
  Keyboard,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { ViewType } from '../../types/finance';
import { NAV_TABS, UI_TEXT } from '../../config/ui';
import { BaseModal } from './BaseModal';
import { HelpSectionBasics } from './help/HelpSectionBasics';
import { HelpSectionAccounts } from './help/HelpSectionAccounts';
import { HelpSectionTransactions } from './help/HelpSectionTransactions';
import { HelpSectionRecurring } from './help/HelpSectionRecurring';
import { HelpSectionDebts } from './help/HelpSectionDebts';
import { HelpSectionBudgets } from './help/HelpSectionBudgets';
import { HelpSectionGoals } from './help/HelpSectionGoals';
import { HelpSectionStats } from './help/HelpSectionStats';
import { HelpSectionAI } from './help/HelpSectionAI';
import { HelpSectionShortcuts } from './help/HelpSectionShortcuts';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type HelpViewTabId = Exclude<ViewType, 'financial-plan'>;
type HelpTabId = 'basics' | HelpViewTabId | 'ai' | 'shortcuts';

interface HelpTab {
  id: HelpTabId;
  label: string;
  Icon: LucideIcon;
}

const helpTabFromView = (view: HelpViewTabId): HelpTab => {
  const tab = NAV_TABS.find((item) => item.key === view);
  return {
    id: view,
    label: tab?.label ?? view,
    Icon: tab?.icon ?? BookOpen,
  };
};

const HELP_TABS: HelpTab[] = [
  { id: 'basics', label: 'Inicio', Icon: BookOpen },
  helpTabFromView('accounts'),
  helpTabFromView('transactions'),
  helpTabFromView('recurring'),
  helpTabFromView('debts'),
  helpTabFromView('budgets'),
  helpTabFromView('goals'),
  helpTabFromView('stats'),
  { id: 'ai', label: 'Asistente IA', Icon: Bot },
  { id: 'shortcuts', label: 'Atajos', Icon: Keyboard },
];

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<HelpTabId>('basics');
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollContentToStart = useCallback(() => {
    window.requestAnimationFrame(() => {
      contentRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }, []);

  useEffect(() => {
    scrollContentToStart();
  }, [activeTab, scrollContentToStart]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={UI_TEXT.titles.helpManual}
      titleIcon={<Wallet size={24} className="text-primary" />}
      maxWidth="max-w-[calc(100vw-1rem)] sm:max-w-[min(94vw,64rem)] xl:max-w-[min(90vw,78rem)]"
      className="h-[92dvh] max-h-[960px] flex flex-col overflow-hidden sm:h-[88dvh] lg:h-[90dvh] xl:h-[92dvh]"
      scrollAreaClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
        {/* Tabs */}
        <div className="shrink-0 border-b border-border bg-muted/50">
          <div
            role="tablist"
            aria-label="Secciones del manual"
            className="flex flex-wrap justify-center gap-1.5 p-2 scroll-smooth sm:gap-2 sm:p-3 lg:gap-3 max-sm:flex-nowrap max-sm:justify-start max-sm:overflow-x-auto max-sm:no-scrollbar max-sm:scroll-fade-x"
          >
            {HELP_TABS.map((tab) => (
              <button
                key={tab.id}
                id={`help-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`help-panel-${tab.id}`}
                aria-label={tab.label}
                title={tab.label}
                onClick={() => {
                  setActiveTab(tab.id);
                  scrollContentToStart();
                }}
                className={`
                  group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-[background-color,color,box-shadow,transform] duration-200 focus-visible:ring-2 focus-visible:ring-primary sm:h-12 sm:w-12 lg:h-14 lg:w-14
                  ${activeTab === tab.id
                    ? 'bg-card text-primary shadow-sm ring-1 ring-border'
                    : 'hover:bg-muted hover:text-foreground active:scale-[0.98]'
                  }
                `}
              >
                <tab.Icon aria-hidden="true" className="h-5 w-5 sm:h-[22px] sm:w-[22px] lg:h-6 lg:w-6" />
                <span className="sr-only">{tab.label}</span>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-[calc(100%+0.45rem)] z-30 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 sm:block"
                >
                  {tab.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          id={`help-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`help-tab-${activeTab}`}
          className="min-h-0 flex-1 overflow-y-auto p-4 scroll-smooth scrollbar-thin sm:p-6 lg:p-8"
        >
          <div className="mx-auto w-full max-w-[70ch] lg:max-w-[84ch]">
            {activeTab === 'basics' && <HelpSectionBasics />}

            {activeTab === 'accounts' && <HelpSectionAccounts />}

            {activeTab === 'transactions' && <HelpSectionTransactions />}

            {/* Pagos Periódicos */}
            {activeTab === 'recurring' && <HelpSectionRecurring />}

            {/* Préstamos / Deudas */}
            {activeTab === 'debts' && <HelpSectionDebts />}

            {/* Presupuestos */}
            {activeTab === 'budgets' && <HelpSectionBudgets />}

            {/* Metas de Ahorro */}
            {activeTab === 'goals' && <HelpSectionGoals />}

            {/* Estadísticas */}
            {activeTab === 'stats' && <HelpSectionStats />}

            {/* Asistente IA */}
            {activeTab === 'ai' && <HelpSectionAI />}

            {/* Atajos de teclado */}
            {activeTab === 'shortcuts' && <HelpSectionShortcuts />}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border bg-muted/80 p-4 text-center sm:p-5">
          <p className="mx-auto max-w-lg text-xs text-muted-foreground sm:text-sm lg:max-w-2xl">
            MoneyTrack utiliza formato local colombiano: <span className="font-mono bg-card border border-border px-1.5 py-0.5 rounded text-foreground">1.234.567,89</span>
          </p>
        </div>
    </BaseModal>
  );
};
