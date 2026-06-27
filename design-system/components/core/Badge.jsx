import React from 'react';

// Vocabulario semántico canónico, compartido por Badge / SegmentedControl / StatCard:
// success · destructive · warning · info · primary · neutral.
// Alias retrocompatibles para consumidores que aún pasan los nombres viejos.
const TONE_ALIASES = {
  danger: 'destructive',
  expense: 'destructive',
  income: 'success',
  pending: 'warning',
};
// La clase CSS .mt-badge-* sigue usando "danger"; mapeamos al hablar con el CSS.
const BADGE_CLASS = {
  primary: 'primary',
  success: 'success',
  destructive: 'danger',
  warning: 'warning',
  info: 'info',
  neutral: 'neutral',
};

/** Normaliza cualquier alias de tono al nombre semántico canónico. */
export function normalizeTone(tone) {
  return TONE_ALIASES[tone] || tone;
}

/**
 * Badge — small status pill for transaction states, categories and counts.
 * Styling lives in the `.mt-badge*` classes (single source of truth); this
 * component maps props to them. Rounded-full by default; `square` for the tiny
 * inline category tag.
 */
export function Badge({ tone = 'neutral', square = false, icon: Icon, children, className = '', ...props }) {
  const canonical = normalizeTone(tone);
  const t = BADGE_CLASS[canonical] || 'neutral';
  const classes = [
    'mt-badge',
    `mt-badge-${t}`,
    square ? 'mt-badge-square' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <span className={classes} {...props}>
      {Icon && <Icon size={11} aria-hidden="true" />}
      {children}
    </span>
  );
}
