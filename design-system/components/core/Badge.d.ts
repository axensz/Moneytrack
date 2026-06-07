import React from 'react';

export type BadgeTone = 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';

/**
 * Small status pill used for transaction states (Pendiente, cuotas), category
 * tags and counts. Rounded-full by default; pass `square` for the tiny inline tag.
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Color tone. @default 'neutral' */
  tone?: BadgeTone;
  /** Use the small square radius instead of a full pill */
  square?: boolean;
  /** Optional Lucide icon before the label */
  icon?: React.ComponentType<{ size?: number }>;
  children?: React.ReactNode;
}

export function Badge(props: BadgeProps): React.JSX.Element;
