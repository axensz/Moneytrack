import React from 'react';

export type CardVariant = 'default' | 'stat' | 'balance' | 'flat';

/**
 * The base surface for everything in MoneyTrack — rounded-lg, 20px padding,
 * soft shadow. Use `stat` for hover-lift metric cards and `balance` for the
 * violet-gradient hero money figure.
 *
 * @startingPoint section="Core" subtitle="Surface card — default, stat, balance, flat" viewport="700x200"
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Surface style. @default 'default' */
  variant?: CardVariant;
  children?: React.ReactNode;
}

export function Card(props: CardProps): React.JSX.Element;
