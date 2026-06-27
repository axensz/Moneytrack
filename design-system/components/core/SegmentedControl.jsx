import React from 'react';
import { normalizeTone } from './Badge.jsx';

// Vocabulario semántico canónico (success · destructive · warning · info · primary).
// `normalizeTone` mapea alias viejos (danger/expense/income/pending) → canónico.
const T = {
  primary:     { muted: 'var(--primary-muted)', text: 'var(--primary-text)', base: 'var(--primary)' },
  success:     { muted: 'var(--success-muted)', text: 'var(--success-text)', base: 'var(--success)' },
  destructive: { muted: 'var(--destructive-muted)', text: 'var(--destructive-text)', base: 'var(--destructive)' },
  warning:     { muted: 'var(--warning-muted)', text: 'var(--warning-text)', base: 'var(--warning)' },
  info:        { muted: 'var(--info-muted)', text: 'var(--info-text)', base: 'var(--info)' },
};

/**
 * SegmentedControl — the type selector from the add-transaction form
 * (Gasto / Ingreso / Transferencia). Each option can carry its own semantic
 * `tone`, so the active segment adopts that color. Renders as an ARIA radiogroup.
 */
export function SegmentedControl({ options = [], value, onChange, tone = 'primary', fullWidth = true, ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{ display: 'flex', gap: 8, width: fullWidth ? '100%' : 'auto' }}>
      {options.map((opt) => {
        const active = opt.value === value;
        const c = T[normalizeTone(opt.tone || tone)] || T.primary;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange && onChange(opt.value)}
            style={{
              flex: fullWidth ? 1 : '0 0 auto',
              minHeight: 44,
              padding: '8px 14px',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'inherit',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-medium)',
              cursor: 'pointer',
              background: active ? c.muted : 'var(--card)',
              color: active ? c.text : 'var(--muted-foreground)',
              border: `1px solid ${active ? c.base : 'var(--border)'}`,
              boxShadow: active ? `0 0 0 1px ${c.base}` : 'none',
              transition: 'all 0.12s var(--ease-out)',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
