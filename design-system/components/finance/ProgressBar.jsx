import React from 'react';

const fills = {
  primary: 'linear-gradient(90deg, var(--primary), var(--primary-soft))',
  success: 'linear-gradient(90deg, var(--success), #34d399)',
  warning: 'linear-gradient(90deg, #fb923c, var(--destructive))',
};

/**
 * ProgressBar — the credit-usage / quota meter from the product.
 * Rounded track on a tinted surface with a gradient fill. Pass `label`/`detail`
 * to render the caption row above; `autoWarn` turns the fill orange→rose past
 * the `warnAt` threshold (default 80%) — used for credit-limit warnings.
 */
export function ProgressBar({
  value = 0,
  max = 100,
  tone = 'primary',
  label,
  detail,
  autoWarn = false,
  warnAt = 0.8,
  height = 10,
}) {
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const warned = autoWarn && pct >= warnAt;
  const fill = warned ? fills.warning : (fills[tone] || fills.primary);

  return (
    <div style={{ width: '100%' }}>
      {(label || detail) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 'var(--text-sm)', marginBottom: 6 }}>
          {label && <span style={{ color: 'var(--muted-foreground)' }}>{label}</span>}
          {detail && <span style={{ fontWeight: 'var(--weight-medium)', color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>{detail}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progreso'}
        style={{ width: '100%', height, background: 'var(--surface-transfer)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}
      >
        <div style={{ height: '100%', width: `${pct * 100}%`, background: fill, borderRadius: 'var(--radius-full)', transition: 'width 0.3s cubic-bezier(0,0,0.2,1)' }} />
      </div>
    </div>
  );
}
