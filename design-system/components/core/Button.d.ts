import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'cancel' | 'danger' | 'ghost' | 'edit';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * MoneyTrack's primary action control. Gradient violet primary is the default;
 * use cancel/danger/ghost for secondary actions and edit for inline list actions.
 *
 * @startingPoint section="Core" subtitle="Action button with 6 variants & 3 sizes" viewport="700x160"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. @default 'primary' */
  variant?: ButtonVariant;
  /** Control size. @default 'md' */
  size?: ButtonSize;
  /** Lucide icon component rendered before the label */
  icon?: React.ComponentType<{ size?: number }>;
  /** Lucide icon component rendered after the label */
  iconRight?: React.ComponentType<{ size?: number }>;
  /** Show a spinner and disable the button */
  loading?: boolean;
  /** Stretch to the container width */
  fullWidth?: boolean;
  children?: React.ReactNode;
}

export function Button(props: ButtonProps): React.JSX.Element;
