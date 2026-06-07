import React from 'react';
import type { BadgeTone } from '../core/Badge';

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface TransactionBadge {
  label: string;
  tone?: BadgeTone;
  icon?: React.ComponentType<{ size?: number }>;
}

/**
 * A single movement in the MoneyTrack transactions list: tinted type icon,
 * description + account route, signed amount, and a chip row for category,
 * date and state badges (Pendiente, cuotas, interés, recurrente).
 *
 * @startingPoint section="Finance" subtitle="Transaction list row with state chips" viewport="560x110"
 */
export interface TransactionRowProps {
  /** Movement type — drives icon tint and amount sign/color. @default 'expense' */
  type?: TransactionType;
  /** Lucide icon for the leading chip (e.g. CreditCard, ArrowRightLeft) */
  icon?: React.ComponentType<{ size?: number }>;
  /** Primary line — description or category fallback */
  description: string;
  /** Secondary line — account name or "origen → destino" for transfers */
  account?: string;
  /** Category tag shown as a square neutral badge */
  category?: string;
  /** Preformatted date string */
  date?: string;
  /** Preformatted amount (without the sign) */
  amount: React.ReactNode;
  /** Extra state badges appended to the chip row */
  badges?: TransactionBadge[];
  /** Show an inline edit button (revealed on hover/focus) */
  onEdit?: () => void;
  /** Show an inline delete button (revealed on hover/focus) */
  onDelete?: () => void;
}

export function TransactionRow(props: TransactionRowProps): React.JSX.Element;
