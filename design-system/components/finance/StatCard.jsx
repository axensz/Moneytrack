import React from 'react';

const tones = {
  balance: { iconBg: 'var(--primary)', iconColor: 'var(--primary-foreground)', valueColor: 'var(--balance-foreground)' },
  income:  { iconBg: 'var(--surface-income)', iconColor: 'var(--success)', valueColor: 'var(--foreground)' },
  expense: { iconBg: 'var(--surface-expense)', iconColor: 'var(--destructive)', valueColor: 'var(--foreground)' },
  pending: { iconBg: 'var(--surface-pending)', iconColor: 'var(--warning)', valueColor: 'var(--foreground)' },
};

/**
 * StatCard — the metric tile in the dashboard grid.
 * `balance` is the violet hero; income/expense/pending are white cards with a
 * tinted icon chip. Renders the figure with tabular numerals.
 */
export function StatCard({ tone = 'income', label, period, value, icon: Icon }) {
  const t = tones[tone] || tones.income;
  const isBalance = tone === 'balance';
  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        border: isBalance ? '2px solid var(--border-accent)' : '1px solid var(--border)',
        background: isBalance ? 'var(--gradient-balance)' : 'var(--card)',
        boxShadow: isBalance ? 'var(--shadow-balance)' : 'var(--shadow-md)',
        transition: 'all 0.3s cubic-bezier(0,0,0.2,1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: isBalance ? 'var(--balance-foreground)' : 'var(--muted-foreground)' }}>
          {label}
          {period && <span style={{ fontSize: 'var(--text-xs)', fontWeight: 400, color: 'var(--muted-foreground)', marginLeft: 4 }}>{period}</span>}
        </span>
        {Icon && (
          <span style={{ display: 'inline-flex', padding: 7, borderRadius: 'var(--radius-md)', background: t.iconBg, color: t.iconColor }}>
            <Icon size={18} aria-hidden="true" />
          </span>
        )}
      </div>
      <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-bold)', color: t.valueColor, fontVariantNumeric: 'tabular-nums', wordBreak: 'break-word' }}>
        {value}
      </div>
    </div>
  );
}
