import React from 'react';

export type ProgressTone = 'primary' | 'success' | 'warning';

/**
 * The credit-usage / quota meter from MoneyTrack — a rounded gradient bar on a
 * tinted track, with an optional caption row and an auto-warning state for
 * credit-limit overuse.
 *
 * @startingPoint section="Finance" subtitle="Credit-usage / quota progress bar" viewport="420x80"
 */
export interface ProgressBarProps {
  /** Current value. @default 0 */
  value?: number;
  /** Maximum value. @default 100 */
  max?: number;
  /** Fill color treatment. @default 'primary' */
  tone?: ProgressTone;
  /** Caption shown on the left above the bar */
  label?: string;
  /** Caption shown on the right above the bar (e.g. "$1.3M / $4M") */
  detail?: React.ReactNode;
  /** Turn the fill orange→rose past `warnAt` (credit overuse). @default false */
  autoWarn?: boolean;
  /** Warning threshold as a fraction. @default 0.8 */
  warnAt?: number;
  /** Track height in px. @default 10 */
  height?: number;
}

export function ProgressBar(props: ProgressBarProps): React.JSX.Element;
