import React from 'react';

export type SegmentTone = 'primary' | 'success' | 'danger' | 'warning' | 'info';

/**
 * The type selector from the add-transaction form (Gasto / Ingreso /
 * Transferencia). Each option can carry its own semantic tone, so the active
 * segment adopts that color. Renders as an ARIA radiogroup; 44px touch targets.
 *
 * @startingPoint section="Core" subtitle="Segmented control with per-option tones" viewport="480x80"
 */
export interface SegmentedControlProps {
  /** Options to render */
  options: SegmentOption[];
  /** Currently selected value */
  value: string;
  /** Called with the new value on selection */
  onChange?: (value: string) => void;
  /** Default tone for options without their own. @default 'primary' */
  tone?: SegmentTone;
  /** Stretch segments to fill the row. @default true */
  fullWidth?: boolean;
  /** Accessible label for the radiogroup */
  ariaLabel?: string;
}

export interface SegmentOption {
  /** Stable value passed to onChange */
  value: string;
  /** Visible label */
  label: string;
  /** Per-option semantic color when active (overrides the group `tone`) */
  tone?: SegmentTone;
}

export function SegmentedControl(props: SegmentedControlProps): React.JSX.Element;
