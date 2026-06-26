import React, { useState } from 'react';
import { Wallet, TrendingUp, Repeat, BarChart3, PieChart, Bot, HandCoins, Target } from 'lucide-react';
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

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'basics' | 'accounts' | 'transactions' | 'recurring' | 'debts' | 'budgets' | 'goals' | 'stats' | 'ai'>('basics');

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Manual de Usuario"
      titleIcon={<Wallet size={24} className="text-purple-600" />}
      maxWidth="max-w-3xl"
      className="h-[85vh] sm:h-[600px] flex flex-col"
    >
        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 shrink-0">
          <div className="flex gap-1 sm:gap-2 p-2 sm:p-3 overflow-x-auto no-scrollbar scroll-smooth">
            {[
              { id: 'basics', label: 'Inicio', shortLabel: 'Inicio', icon: null },
              { id: 'accounts', label: 'Cuentas', shortLabel: 'Cuentas', icon: Wallet },
              { id: 'transactions', label: 'Transacciones', shortLabel: 'Trans.', icon: TrendingUp },
              { id: 'recurring', label: 'Periódicos', shortLabel: 'Peri.', icon: Repeat },
              { id: 'debts', label: 'Préstamos', shortLabel: 'Prést.', icon: HandCoins },
              { id: 'budgets', label: 'Presupuestos', shortLabel: 'Presup.', icon: PieChart },
              { id: 'goals', label: 'Metas', shortLabel: 'Metas', icon: Target },
              { id: 'stats', label: 'Estadísticas', shortLabel: 'Stats', icon: BarChart3 },
              { id: 'ai', label: 'Asistente IA', shortLabel: 'IA', icon: Bot },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`
                  flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors duration-200 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-purple-500
                  ${activeTab === tab.id
                    ? 'bg-white dark:bg-gray-700 text-purple-700 dark:text-purple-300 shadow-sm ring-1 ring-gray-200 dark:ring-gray-600'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-200 active:scale-[0.98]'
                  }
                `}
              >
                {tab.icon && <tab.icon size={14} className="sm:w-4 sm:h-4" />}
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content - Scrollable con altura fija para evitar cambios de tamaño */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 scroll-smooth min-h-0">
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
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/80 shrink-0 flex items-center justify-center text-center">
          <p className="text-xs sm:text-sm text-gray-500 max-w-lg">
            MoneyTrack utiliza formato local colombiano: <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">1.234.567,89</span>
          </p>
        </div>
    </BaseModal>
  );
};
