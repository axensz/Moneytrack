'use client';

import React from 'react';
import { Percent, CreditCard } from 'lucide-react';

interface CreditCardInterest {
  id: string;
  name: string;
  interestRate: number;
  monthlyInterest: number;
  yearlyInterest: number;
  totalInterest: number;
  pendingInterest: number;
  transactionCount: number;
}

interface InterestTotals {
  monthly: number;
  yearly: number;
  total: number;
  pending: number;
}

interface CreditCardInterestsCardProps {
  creditCardInterests: CreditCardInterest[];
  totals: InterestTotals;
  formatCurrency: (amount: number) => string;
}

/**
 * Card de Intereses de Tarjetas de Crédito
 * Muestra resumen y tabla detallada de intereses por TC
 */
export const CreditCardInterestsCard: React.FC<CreditCardInterestsCardProps> = ({
  creditCardInterests,
  totals,
  formatCurrency,
}) => {
  const hasInterests = totals.total > 0;

  return (
    <div className="card">
      <Header />
      <SummaryGrid totals={totals} formatCurrency={formatCurrency} />
      
      {hasInterests ? (
        <InterestsTable
          interests={creditCardInterests}
          totals={totals}
          formatCurrency={formatCurrency}
        />
      ) : (
        <EmptyState />
      )}
    </div>
  );
};

// Sub-componentes internos

const Header: React.FC = () => (
  <div className="flex items-center justify-between mb-6">
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Intereses Tarjetas de Crédito
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Resumen de intereses generados
      </p>
    </div>
    <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
      <Percent size={20} className="text-rose-600 dark:text-rose-400" />
    </div>
  </div>
);

interface SummaryGridProps {
  totals: InterestTotals;
  formatCurrency: (amount: number) => string;
}

const SummaryGrid: React.FC<SummaryGridProps> = ({ totals, formatCurrency }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <SummaryCard
      label="Este Mes"
      value={formatCurrency(totals.monthly)}
      variant="rose"
    />
    <SummaryCard
      label="Este Año"
      value={formatCurrency(totals.yearly)}
      variant="rose"
    />
    <SummaryCard
      label="Total Histórico"
      value={formatCurrency(totals.total)}
      variant="default"
    />
    <SummaryCard
      label="Intereses Pendientes"
      value={formatCurrency(totals.pending)}
      variant="amber"
    />
  </div>
);

interface SummaryCardProps {
  label: string;
  value: string;
  variant: 'default' | 'rose' | 'amber';
}

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, variant }) => {
  const styles = {
    default: {
      container: 'bg-gray-50 dark:bg-gray-800/50',
      label: 'text-gray-500 dark:text-gray-400',
      value: 'text-gray-900 dark:text-gray-100',
    },
    rose: {
      container: 'bg-gray-50 dark:bg-gray-800/50',
      label: 'text-gray-500 dark:text-gray-400',
      value: 'text-rose-600 dark:text-rose-400',
    },
    amber: {
      container: 'bg-amber-50 dark:bg-amber-900/20',
      label: 'text-amber-600 dark:text-amber-400',
      value: 'text-amber-700 dark:text-amber-300',
    },
  };

  const style = styles[variant];

  return (
    <div className={`p-4 rounded-xl ${style.container}`}>
      <p className={`text-xs font-medium mb-1 ${style.label}`}>{label}</p>
      <p className={`text-lg font-bold ${style.value}`}>{value}</p>
    </div>
  );
};

interface InterestsTableProps {
  interests: CreditCardInterest[];
  totals: InterestTotals;
  formatCurrency: (amount: number) => string;
}

const InterestsTable: React.FC<InterestsTableProps> = ({
  interests,
  totals,
  formatCurrency,
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
            Tarjeta
          </th>
          <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
            Tasa E.A.
          </th>
          <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
            Mensual
          </th>
          <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
            Anual
          </th>
          <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
            Total
          </th>
        </tr>
      </thead>
      <tbody>
        {interests.map((card) => (
          <InterestRow key={card.id} card={card} formatCurrency={formatCurrency} />
        ))}
      </tbody>
      {interests.length > 1 && (
        <tfoot>
          <tr className="bg-gray-50 dark:bg-gray-800/50 font-semibold">
            <td className="py-3 px-4 text-gray-900 dark:text-gray-100">Total</td>
            <td className="py-3 px-4"></td>
            <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400">
              {formatCurrency(totals.monthly)}
            </td>
            <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400">
              {formatCurrency(totals.yearly)}
            </td>
            <td className="py-3 px-4 text-right text-gray-900 dark:text-gray-100">
              {formatCurrency(totals.total)}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  </div>
);

interface InterestRowProps {
  card: CreditCardInterest;
  formatCurrency: (amount: number) => string;
}

const InterestRow: React.FC<InterestRowProps> = ({ card, formatCurrency }) => (
  <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
    <td className="py-3 px-4">
      <div className="flex items-center gap-2">
        <CreditCard size={16} className="text-purple-500" />
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {card.name}
        </span>
      </div>
    </td>
    <td className="py-3 px-4 text-center">
      <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
        {card.interestRate}%
      </span>
    </td>
    <td className="py-3 px-4 text-right font-medium text-rose-600 dark:text-rose-400">
      {formatCurrency(card.monthlyInterest)}
    </td>
    <td className="py-3 px-4 text-right font-medium text-rose-600 dark:text-rose-400">
      {formatCurrency(card.yearlyInterest)}
    </td>
    <td className="py-3 px-4 text-right font-medium text-gray-900 dark:text-gray-100">
      {formatCurrency(card.totalInterest)}
    </td>
  </tr>
);

const EmptyState: React.FC = () => (
  <div className="text-center py-8 text-gray-400 dark:text-gray-500">
    <Percent size={32} className="mx-auto mb-2 opacity-30" />
    <p className="text-sm">No hay transacciones con intereses registradas</p>
  </div>
);
