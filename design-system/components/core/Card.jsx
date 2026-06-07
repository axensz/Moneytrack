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
 * rounded-lg, 20px padding, soft md shadow. The `stat` variant lifts on hover;
 * `balance` is the violet-gradient hero used for the headline money figure.
 */
export function Card({ variant = 'default', children, style = {}, className = '', ...props }) {
  const v = variants[variant] || variants.default;
  const isStat = variant === 'stat';
  return (
    <div
      className={className}
      style={{
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        color: 'var(--card-foreground)',
        transition: isStat
          ? 'box-shadow 0.3s, border-color 0.3s'
          : 'background-color 0.3s, color 0.3s',
        ...v,
        ...style,
      }}
      onMouseEnter={isStat ? (e) => {
        e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
        e.currentTarget.style.borderColor = 'var(--border-accent)';
      } : undefined}
      onMouseLeave={isStat ? (e) => {
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
        e.currentTarget.style.borderColor = 'var(--border)';
      } : undefined}
      {...props}
    >
      {children}
    </div>
  );
}
