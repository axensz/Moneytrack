import React from 'react';

const variants = {
  default: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-md)',
  },
  stat: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-md)',
  },
  balance: {
    background: 'var(--gradient-balance)',
    border: '1px solid var(--border-accent)',
    boxShadow: 'var(--shadow-balance)',
  },
  flat: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    boxShadow: 'none',
  },
};

/**
 * Card — the base surface for everything in MoneyTrack.
 * rounded-lg, 20px padding, soft md shadow. The `stat` variant lifts on hover/focus;
 * `balance` is the violet-gradient hero used for the headline money figure.
 */
export function Card({ variant = 'default', children, style = {}, className = '', ...props }) {
  const isStat = variant === 'stat';
  // El realce hover/foco del `stat` vive en CSS (.mt-card-stat:hover/:focus-within),
  // no en handlers JS de ratón: así responde a teclado y táctil, no solo al puntero.
  if (isStat) {
    return (
      <div
        className={`mt-card-stat${className ? ' ' + className : ''}`}
        style={{ color: 'var(--card-foreground)', ...style }}
        {...props}
      >
        {children}
      </div>
    );
  }
  const v = variants[variant] || variants.default;
  return (
    <div
      className={className}
      style={{
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        color: 'var(--card-foreground)',
        transition: 'background-color 0.3s, color 0.3s',
        ...v,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
