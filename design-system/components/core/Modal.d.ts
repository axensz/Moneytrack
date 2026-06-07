import React from 'react';

/**
 * The centered dialog used across MoneyTrack (auth, forms, confirmations).
 * Backdrop + card surface with entrance animation, ESC / backdrop-click close,
 * and focus moved to the dialog on open.
 *
 * @startingPoint section="Core" subtitle="Centered dialog with backdrop & header" viewport="520x360"
 */
export interface ModalProps {
  /** Whether the modal is shown */
  open: boolean;
  /** Called on ESC, backdrop click, or close button */
  onClose?: () => void;
  /** Dialog title (also the aria-label) */
  title?: string;
  /** Muted line under the title */
  subtitle?: string;
  /** Optional Lucide icon shown in a violet chip beside the title */
  icon?: React.ComponentType<{ size?: number }>;
  /** Dialog body */
  children?: React.ReactNode;
  /** Footer node (buttons) — right-aligned action row */
  footer?: React.ReactNode;
  /** Max width in px. @default 420 */
  width?: number;
  /** Scope the overlay to a positioned parent instead of the viewport (previews). @default false */
  contained?: boolean;
  /** Hide the top-right close button. @default false */
  hideClose?: boolean;
}

export function Modal(props: ModalProps): React.JSX.Element | null;
