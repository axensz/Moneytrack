import React from 'react';

/**
 * Modal — the centered dialog used across MoneyTrack (auth, forms, confirms).
 * Backdrop + card surface, entrance animation, ESC and backdrop-click close,
 * focus moved to the dialog on open. Pass `contained` to scope the overlay to a
 * positioned parent (for previews) instead of the full viewport.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  footer,
  width = 420,
  contained = false,
  hideClose = false,
}) {
  const dialogRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => dialogRef.current && dialogRef.current.focus(), 0);
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [open, onClose]);

  if (!open) return null;
  const titleId = title ? 'mt-modal-title' : undefined;

  return (
    <div
      onClick={onClose}
      style={{
        position: contained ? 'absolute' : 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        animation: 'mtModalFade 0.2s ease both',
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: `min(${width}px, 100%)`,
          maxHeight: '90%',
          overflow: 'auto',
          background: 'var(--card)',
          color: 'var(--card-foreground)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          padding: 24,
          outline: 'none',
          animation: 'mtModalZoom 0.2s ease both',
        }}
      >
        {(title || !hideClose) && (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: children ? 18 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              {Icon && (
                <span style={{ display: 'inline-flex', flexShrink: 0, padding: 9, borderRadius: 'var(--radius-md)', background: 'var(--surface-primary)', color: 'var(--primary)' }}>
                  <Icon size={20} />
                </span>
              )}
              <div style={{ minWidth: 0 }}>
                {title && <h2 id={titleId} style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)' }}>{title}</h2>}
                {subtitle && <p style={{ margin: '2px 0 0', fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>{subtitle}</p>}
              </div>
            </div>
            {!hideClose && (
              <button
                type="button"
                aria-label="Cerrar"
                onClick={onClose}
                style={{ flexShrink: 0, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-md)', background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            )}
          </div>
        )}
        {children}
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>{footer}</div>}
      </div>
      <style>{`@keyframes mtModalFade{from{background:rgba(0,0,0,0)}to{background:rgba(0,0,0,0.45)}}@keyframes mtModalZoom{from{transform:scale(0.96)}to{transform:scale(1)}}@media (prefers-reduced-motion: reduce){[data-mt-modal]{animation:none!important}}`}</style>
    </div>
  );
}
