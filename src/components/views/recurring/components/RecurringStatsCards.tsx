'use client';

import React from 'react';
import { Repeat, CheckCircle2, Clock, TrendingUp } from 'lucide-react';

interface RecurringStatsProps {
  active: number;
  paidThisMonth: number;
  pendingThisMonth: number;
  totalMonthlyAmount: number;
  formatCurrency: (amount: number) => string;
}

/**
 * Tarjetas de estadísticas de pagos periódicos
 */
export const RecurringStatsCards: React.FC<RecurringStatsProps> = ({
  active,
  paidThisMonth,
  pendingThisMonth,
  totalMonthlyAmount,
  formatCurrency,
}) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <StatCard
        icon={Repeat}
        label="Activos"
        value={active.toString()}
        colorScheme="purple"
      />
      <StatCard
        icon={CheckCircle2}
        label="Pagados"
        value={paidThisMonth.toString()}
        colorScheme="emerald"
      />
      <StatCard
        icon={Clock}
        label="Pendientes"
        value={pendingThisMonth.toString()}
        colorScheme="amber"
      />
      <StatCard
        icon={TrendingUp}
        label="Total/Mes"
        value={formatCurrency(totalMonthlyAmount)}
        colorScheme="blue"
        isLargeText={false}
      />
    </div>
  );
};

// Sub-componente interno
interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  colorScheme: 'purple' | 'emerald' | 'amber' | 'blue';
  isLargeText?: boolean;
}

const colorClasses = {
  purple: {
    bg: 'bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20',
    icon: 'text-purple-600 dark:text-purple-400',
  },
  emerald: {
    bg: 'bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  amber: {
    bg: 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  blue: {
    bg: 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20',
    icon: 'text-blue-600 dark:text-blue-400',
  },
};

const StatCard: React.FC<StatCardProps> = ({
  icon: Icon,
  label,
  value,
  colorScheme,
  isLargeText = true,
}) => {
  const colors = colorClasses[colorScheme];

  return (
    <div className={`${colors.bg} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={18} className={colors.icon} />
        <span className={`text-xs font-medium ${colors.icon}`}>{label}</span>
      </div>
      <p
        className={`font-bold text-gray-900 dark:text-gray-100 ${
          isLargeText ? 'text-2xl' : 'text-lg'
        }`}
      >
        {value}
      </p>
    </div>
  );
};
