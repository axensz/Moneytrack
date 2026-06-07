import React from 'react';
import { Badge } from '../core/Badge.jsx';

const typeMeta = {
  income:   { sign: '+', color: 'var(--success-text)',     chipBg: 'var(--surface-income)',   chipColor: 'var(--success)' },
  expense:  { sign: '−', color: 'var(--destructive-text)', chipBg: 'var(--surface-expense)',  chipColor: 'var(--destructive)' },
  transfer: { sign: '→', color: 'var(--info-text)',        chipBg: 'var(--surface-transfer)', chipColor: 'var(--primary)' },
};

/**
 * TransactionRow — a single movement in the transactions list.
 * Tinted type icon, description + account route, signed amount, and a chip row
 * for category, date and state badges. Pass `onEdit`/`onDelete` to reveal inline
 * action buttons on hover/focus (the dense list pattern from the product).
 */
export function TransactionRow({
  type = 'expense',
  icon: Icon,
  description,
  account,
  category,
  date,
  amount,
  badges = [],
  onEdit,
  onDelete,
}) {
  const m = typeMeta[type] || typeMeta.expense;
  const [active, setActive] = React.useState(false);
  const hasActions = !!(onEdit || onDelete);

  return (
    <div
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      style={{
        border: '1px solid',
        borderColor: active && hasActions ? 'var(--border-accent)' : 'var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '0.875rem 1rem',
        background: 'var(--card)',
        boxShadow: active && hasActions ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        transition: 'all 0.2s cubic-bezier(0,0,0.2,1)',
      }}
    >
      <div
        style={{
          width: 40, height: 40, flexShrink: 0,
          borderRadius: 'var(--radius-lg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: m.chipBg, color: m.chipColor,
        }}
        aria-hidden="true"
      >
        {Icon && <Icon size={18} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 'var(--weight-semibold)', color: 'var(--foreground)', fontSize: 'var(--text-base)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {description}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {account}
            </p>
          </div>
          <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-lg)', color: m.color, whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {m.sign} {amount}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
          {category && <Badge tone="neutral" square>{category}</Badge>}
          {date && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted-foreground)' }}>{date}</span>}
          {badges.map((b, i) => (
            <Badge key={i} tone={b.tone || 'primary'} icon={b.icon}>{b.label}</Badge>
          ))}
          {hasActions && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, opacity: active ? 1 : 0, transition: 'opacity 0.15s' }}>
              {onEdit && <ActionBtn label="Editar transacción" color="var(--primary)" onClick={onEdit} onFocus={() => setActive(true)} onBlur={() => setActive(false)} glyph="edit" />}
              {onDelete && <ActionBtn label="Eliminar transacción" color="var(--destructive)" onClick={onDelete} onFocus={() => setActive(true)} onBlur={() => setActive(false)} glyph="x" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ label, color, onClick, onFocus, onBlur, glyph }) {
  const [h, setH] = React.useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onFocus={onFocus}
      onBlur={onBlur}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
        background: h ? 'var(--muted)' : 'transparent', color: h ? color : 'var(--muted-foreground)',
        transition: 'all 0.12s',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {glyph === 'edit'
          ? <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>
          : <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>}
      </svg>
    </button>
  );
}
