import React from 'react';

/**
 * Button — MoneyTrack's primary action control.
 * All styling (variants, sizes, hover/active/focus/disabled) lives in the
 * design-system stylesheet as `.mt-btn*` classes — this component only maps
 * props to those classes, so there is one source of truth.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  fullWidth = false,
  disabled = false,
  children,
  className = '',
  style = {},
  ...props
}) {
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 20 : 16;
  const isDisabled = disabled || loading;
  const classes = [
    'mt-btn',
    `mt-btn-${variant}`,
    `mt-btn-${size}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={classes}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      style={{ width: fullWidth ? '100%' : undefined, ...style }}
      {...props}
    >
      {loading ? <Spinner size={iconSize} /> : Icon && <Icon size={iconSize} aria-hidden="true" />}
      {children}
      {IconRight && !loading && <IconRight size={iconSize} aria-hidden="true" />}
    </button>
  );
}

function Spinner({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: 'mt-spin 0.8s linear infinite' }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
      <path fill="currentColor" opacity="0.75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      <style>{`@keyframes mt-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}
