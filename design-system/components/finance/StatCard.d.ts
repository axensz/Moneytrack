import React from 'react';

export type StatTone = 'balance' | 'income' | 'expense' | 'pending';

/**
 * The metric tile in the MoneyTrack dashboard grid. `balance` is the violet
 * gradient hero; income/expense/pending are white cards with a tinted icon chip.
 *
 * @startingPoint section="Finance" subtitle="Dashboard metric tile with tinted icon" viewport="320x140"
 */
export interface StatCardProps {
  /** Color treatment. @default 'income' */
  tone?: StatTone;
  /** Metric label, e.g. "Ingresos" */
  label: string;
  /** Optional muted period suffix, e.g. "este mes" */
  period?: string;
  /** Preformatted value string, e.g. "$ 1.250.000" */
  value: React.ReactNode;
  /** Lucide icon for the corner chip */
  icon?: React.ComponentType<{ size?: number }>;
}

export function StatCard(props: StatCardProps): React.JSX.Element;
