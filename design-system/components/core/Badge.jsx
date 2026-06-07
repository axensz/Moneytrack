import React from 'react';

const TONES = ['primary', 'success', 'danger', 'warning', 'info', 'neutral'];

/**
 * Badge — small status pill for transaction states, categories and counts.
 * Styling lives in the `.mt-badge*` classes (single source of truth); this
 * component maps props to them. Rounded-full by default; `square` for the tiny
 * inline category tag.
 */
export function Badge({ tone = 'neutral', square = false, icon: Icon, children, className = '', ...props }) {
  const t = TONES.includes(tone) ? tone : 'neutral';
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
