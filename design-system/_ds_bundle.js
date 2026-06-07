/* @ds-bundle: {"format":3,"namespace":"MoneyTrackDesignSystem_daa395","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Select","sourcePath":"components/core/Input.jsx"},{"name":"Modal","sourcePath":"components/core/Modal.jsx"},{"name":"SegmentedControl","sourcePath":"components/core/SegmentedControl.jsx"},{"name":"ProgressBar","sourcePath":"components/finance/ProgressBar.jsx"},{"name":"StatCard","sourcePath":"components/finance/StatCard.jsx"},{"name":"TransactionRow","sourcePath":"components/finance/TransactionRow.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"f27c36a5c660","components/core/Button.jsx":"691eeb1265c8","components/core/Card.jsx":"edcd7dcc50bf","components/core/Input.jsx":"c163177cd941","components/core/Modal.jsx":"a6b661337ccb","components/core/SegmentedControl.jsx":"11ddc00b2051","components/finance/ProgressBar.jsx":"2e23ed74de65","components/finance/StatCard.jsx":"e26efa80d731","components/finance/TransactionRow.jsx":"7d20d80dda7d","ui_kits/moneytrack/app.jsx":"459d8e6f15cd","ui_kits/moneytrack/chrome.jsx":"158cb843a14c","ui_kits/moneytrack/data.js":"be19e70b0c3b","ui_kits/moneytrack/finance.jsx":"e413ba19bc59","ui_kits/moneytrack/icons.js":"ef1c0f98cc1a","ui_kits/moneytrack/stats.jsx":"2118255d7cf1","ui_kits/moneytrack/views.jsx":"cf0f3b5e3761"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.MoneyTrackDesignSystem_daa395 = window.MoneyTrackDesignSystem_daa395 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = ['primary', 'success', 'danger', 'warning', 'info', 'neutral'];

/**
 * Badge — small status pill for transaction states, categories and counts.
 * Styling lives in the `.mt-badge*` classes (single source of truth); this
 * component maps props to them. Rounded-full by default; `square` for the tiny
 * inline category tag.
 */
function Badge({
  tone = 'neutral',
  square = false,
  icon: Icon,
  children,
  className = '',
  ...props
}) {
  const t = TONES.includes(tone) ? tone : 'neutral';
  const classes = ['mt-badge', `mt-badge-${t}`, square ? 'mt-badge-square' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", _extends({
    className: classes
  }, props), Icon && /*#__PURE__*/React.createElement(Icon, {
    size: 11,
    "aria-hidden": "true"
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — MoneyTrack's primary action control.
 * All styling (variants, sizes, hover/active/focus/disabled) lives in the
 * design-system stylesheet as `.mt-btn*` classes — this component only maps
 * props to those classes, so there is one source of truth.
 */
function Button({
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
  const classes = ['mt-btn', `mt-btn-${variant}`, `mt-btn-${size}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: classes,
    disabled: isDisabled,
    "aria-busy": loading || undefined,
    style: {
      width: fullWidth ? '100%' : undefined,
      ...style
    }
  }, props), loading ? /*#__PURE__*/React.createElement(Spinner, {
    size: iconSize
  }) : Icon && /*#__PURE__*/React.createElement(Icon, {
    size: iconSize,
    "aria-hidden": "true"
  }), children, IconRight && !loading && /*#__PURE__*/React.createElement(IconRight, {
    size: iconSize,
    "aria-hidden": "true"
  }));
}
function Spinner({
  size
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    style: {
      animation: 'mt-spin 0.8s linear infinite'
    },
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10",
    stroke: "currentColor",
    strokeWidth: "4",
    opacity: "0.25"
  }), /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    opacity: "0.75",
    d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
  }), /*#__PURE__*/React.createElement("style", null, `@keyframes mt-spin { to { transform: rotate(360deg); } }`));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const variants = {
  default: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-md)'
  },
  stat: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-md)'
  },
  balance: {
    background: 'var(--gradient-balance)',
    border: '1px solid var(--border-accent)',
    boxShadow: 'var(--shadow-balance)'
  },
  flat: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    boxShadow: 'none'
  }
};

/**
 * Card — the base surface for everything in MoneyTrack.
 * rounded-lg, 20px padding, soft md shadow. The `stat` variant lifts on hover;
 * `balance` is the violet-gradient hero used for the headline money figure.
 */
function Card({
  variant = 'default',
  children,
  style = {},
  className = '',
  ...props
}) {
  const v = variants[variant] || variants.default;
  const isStat = variant === 'stat';
  return /*#__PURE__*/React.createElement("div", _extends({
    className: className,
    style: {
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-5)',
      color: 'var(--card-foreground)',
      transition: isStat ? 'box-shadow 0.3s, border-color 0.3s' : 'background-color 0.3s, color 0.3s',
      ...v,
      ...style
    },
    onMouseEnter: isStat ? e => {
      e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
      e.currentTarget.style.borderColor = 'var(--border-accent)';
    } : undefined,
    onMouseLeave: isStat ? e => {
      e.currentTarget.style.boxShadow = 'var(--shadow-md)';
      e.currentTarget.style.borderColor = 'var(--border)';
    } : undefined
  }, props), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Input — labelled text field. All states (hover, focus, disabled, error) live
 * in the `.mt-input` classes; this component maps props to them and wires
 * accessibility (label association, aria-invalid + aria-describedby).
 */
function Input({
  label,
  hint,
  error,
  id,
  className = '',
  ...props
}) {
  const auto = React.useId();
  const fieldId = id || `in-${auto}`;
  const msgId = hint || error ? `${fieldId}-msg` : undefined;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%'
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: fieldId,
    className: "mt-label"
  }, label), /*#__PURE__*/React.createElement("input", _extends({
    id: fieldId,
    className: `mt-input${error ? ' mt-input--error' : ''}${className ? ' ' + className : ''}`,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": msgId
  }, props)), (hint || error) && /*#__PURE__*/React.createElement("p", {
    id: msgId,
    className: error ? 'mt-field-error' : 'mt-field-hint'
  }, error || hint));
}
const chevron = "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")";

/**
 * Select — same shell as Input with a chevron affordance.
 */
function Select({
  label,
  id,
  children,
  className = '',
  style = {},
  ...props
}) {
  const auto = React.useId();
  const fieldId = id || `sel-${auto}`;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%'
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: fieldId,
    className: "mt-label"
  }, label), /*#__PURE__*/React.createElement("select", _extends({
    id: fieldId,
    className: `mt-input${className ? ' ' + className : ''}`,
    style: {
      cursor: 'pointer',
      paddingRight: '2.5rem',
      appearance: 'none',
      WebkitAppearance: 'none',
      backgroundImage: chevron,
      backgroundPosition: 'right 0.75rem center',
      backgroundRepeat: 'no-repeat',
      backgroundSize: '1.25em 1.25em',
      ...style
    }
  }, props), children));
}
Object.assign(__ds_scope, { Input, Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/Modal.jsx
try { (() => {
/**
 * Modal — the centered dialog used across MoneyTrack (auth, forms, confirms).
 * Backdrop + card surface, entrance animation, ESC and backdrop-click close,
 * focus moved to the dialog on open. Pass `contained` to scope the overlay to a
 * positioned parent (for previews) instead of the full viewport.
 */
function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  footer,
  width = 420,
  contained = false,
  hideClose = false
}) {
  const dialogRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => dialogRef.current && dialogRef.current.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);
  if (!open) return null;
  const titleId = title ? 'mt-modal-title' : undefined;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: contained ? 'absolute' : 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      animation: 'mtModalFade 0.2s ease both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: dialogRef,
    tabIndex: -1,
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": titleId,
    onClick: e => e.stopPropagation(),
    style: {
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
      animation: 'mtModalZoom 0.2s ease both'
    }
  }, (title || !hideClose) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: children ? 18 : 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      minWidth: 0
    }
  }, Icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      flexShrink: 0,
      padding: 9,
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-primary)',
      color: 'var(--primary)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("h2", {
    id: titleId,
    style: {
      margin: 0,
      fontSize: 'var(--text-xl)',
      fontWeight: 'var(--weight-bold)'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '2px 0 0',
      fontSize: 'var(--text-sm)',
      color: 'var(--muted-foreground)'
    }
  }, subtitle))), !hideClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Cerrar",
    onClick: onClose,
    style: {
      flexShrink: 0,
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: 'none',
      borderRadius: 'var(--radius-md)',
      background: 'transparent',
      color: 'var(--muted-foreground)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m6 6 12 12"
  })))), children, footer && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 22
    }
  }, footer)), /*#__PURE__*/React.createElement("style", null, `@keyframes mtModalFade{from{background:rgba(0,0,0,0)}to{background:rgba(0,0,0,0.45)}}@keyframes mtModalZoom{from{transform:scale(0.96)}to{transform:scale(1)}}@media (prefers-reduced-motion: reduce){[data-mt-modal]{animation:none!important}}`));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Modal.jsx", error: String((e && e.message) || e) }); }

// components/core/SegmentedControl.jsx
try { (() => {
const T = {
  primary: {
    muted: 'var(--primary-muted)',
    text: 'var(--primary-text)',
    base: 'var(--primary)'
  },
  success: {
    muted: 'var(--success-muted)',
    text: 'var(--success-text)',
    base: 'var(--success)'
  },
  danger: {
    muted: 'var(--destructive-muted)',
    text: 'var(--destructive-text)',
    base: 'var(--destructive)'
  },
  warning: {
    muted: 'var(--warning-muted)',
    text: 'var(--warning-text)',
    base: 'var(--warning)'
  },
  info: {
    muted: 'var(--info-muted)',
    text: 'var(--info-text)',
    base: 'var(--info)'
  }
};

/**
 * SegmentedControl — the type selector from the add-transaction form
 * (Gasto / Ingreso / Transferencia). Each option can carry its own semantic
 * `tone`, so the active segment adopts that color. Renders as an ARIA radiogroup.
 */
function SegmentedControl({
  options = [],
  value,
  onChange,
  tone = 'primary',
  fullWidth = true,
  ariaLabel
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "radiogroup",
    "aria-label": ariaLabel,
    style: {
      display: 'flex',
      gap: 8,
      width: fullWidth ? '100%' : 'auto'
    }
  }, options.map(opt => {
    const active = opt.value === value;
    const c = T[opt.tone || tone] || T.primary;
    return /*#__PURE__*/React.createElement("button", {
      key: opt.value,
      type: "button",
      role: "radio",
      "aria-checked": active,
      onClick: () => onChange && onChange(opt.value),
      style: {
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
        transition: 'all 0.12s var(--ease-out)'
      }
    }, opt.label);
  }));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/finance/ProgressBar.jsx
try { (() => {
const fills = {
  primary: 'linear-gradient(90deg, var(--primary), var(--primary-soft))',
  success: 'linear-gradient(90deg, var(--success), #34d399)',
  warning: 'linear-gradient(90deg, #fb923c, var(--destructive))'
};

/**
 * ProgressBar — the credit-usage / quota meter from the product.
 * Rounded track on a tinted surface with a gradient fill. Pass `label`/`detail`
 * to render the caption row above; `autoWarn` turns the fill orange→rose past
 * the `warnAt` threshold (default 80%) — used for credit-limit warnings.
 */
function ProgressBar({
  value = 0,
  max = 100,
  tone = 'primary',
  label,
  detail,
  autoWarn = false,
  warnAt = 0.8,
  height = 10
}) {
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const warned = autoWarn && pct >= warnAt;
  const fill = warned ? fills.warning : fills[tone] || fills.primary;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%'
    }
  }, (label || detail) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      fontSize: 'var(--text-sm)',
      marginBottom: 6
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--muted-foreground)'
    }
  }, label), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--weight-medium)',
      color: 'var(--foreground)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, detail)), /*#__PURE__*/React.createElement("div", {
    role: "progressbar",
    "aria-valuenow": Math.round(pct * 100),
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-label": label || 'Progreso',
    style: {
      width: '100%',
      height,
      background: 'var(--surface-transfer)',
      borderRadius: 'var(--radius-full)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      width: `${pct * 100}%`,
      background: fill,
      borderRadius: 'var(--radius-full)',
      transition: 'width 0.3s cubic-bezier(0,0,0.2,1)'
    }
  })));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/finance/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/finance/StatCard.jsx
try { (() => {
const tones = {
  balance: {
    iconBg: 'var(--primary)',
    iconColor: 'var(--primary-foreground)',
    valueColor: 'var(--balance-foreground)'
  },
  income: {
    iconBg: 'var(--surface-income)',
    iconColor: 'var(--success)',
    valueColor: 'var(--foreground)'
  },
  expense: {
    iconBg: 'var(--surface-expense)',
    iconColor: 'var(--destructive)',
    valueColor: 'var(--foreground)'
  },
  pending: {
    iconBg: 'var(--surface-pending)',
    iconColor: 'var(--warning)',
    valueColor: 'var(--foreground)'
  }
};

/**
 * StatCard — the metric tile in the dashboard grid.
 * `balance` is the violet hero; income/expense/pending are white cards with a
 * tinted icon chip. Renders the figure with tabular numerals.
 */
function StatCard({
  tone = 'income',
  label,
  period,
  value,
  icon: Icon
}) {
  const t = tones[tone] || tones.income;
  const isBalance = tone === 'balance';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-5)',
      border: isBalance ? '2px solid var(--border-accent)' : '1px solid var(--border)',
      background: isBalance ? 'var(--gradient-balance)' : 'var(--card)',
      boxShadow: isBalance ? 'var(--shadow-balance)' : 'var(--shadow-md)',
      transition: 'all 0.3s cubic-bezier(0,0,0.2,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 'var(--weight-medium)',
      color: isBalance ? 'var(--balance-foreground)' : 'var(--muted-foreground)'
    }
  }, label, period && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      fontWeight: 400,
      color: 'var(--muted-foreground)',
      marginLeft: 4
    }
  }, period)), Icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      padding: 7,
      borderRadius: 'var(--radius-md)',
      background: t.iconBg,
      color: t.iconColor
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    size: 18,
    "aria-hidden": "true"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-2xl)',
      fontWeight: 'var(--weight-bold)',
      color: t.valueColor,
      fontVariantNumeric: 'tabular-nums',
      wordBreak: 'break-word'
    }
  }, value));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/finance/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/finance/TransactionRow.jsx
try { (() => {
const typeMeta = {
  income: {
    sign: '+',
    color: 'var(--success-text)',
    chipBg: 'var(--surface-income)',
    chipColor: 'var(--success)'
  },
  expense: {
    sign: '−',
    color: 'var(--destructive-text)',
    chipBg: 'var(--surface-expense)',
    chipColor: 'var(--destructive)'
  },
  transfer: {
    sign: '→',
    color: 'var(--info-text)',
    chipBg: 'var(--surface-transfer)',
    chipColor: 'var(--primary)'
  }
};

/**
 * TransactionRow — a single movement in the transactions list.
 * Tinted type icon, description + account route, signed amount, and a chip row
 * for category, date and state badges. Pass `onEdit`/`onDelete` to reveal inline
 * action buttons on hover/focus (the dense list pattern from the product).
 */
function TransactionRow({
  type = 'expense',
  icon: Icon,
  description,
  account,
  category,
  date,
  amount,
  badges = [],
  onEdit,
  onDelete
}) {
  const m = typeMeta[type] || typeMeta.expense;
  const [active, setActive] = React.useState(false);
  const hasActions = !!(onEdit || onDelete);
  return /*#__PURE__*/React.createElement("div", {
    onMouseEnter: () => setActive(true),
    onMouseLeave: () => setActive(false),
    style: {
      border: '1px solid',
      borderColor: active && hasActions ? 'var(--border-accent)' : 'var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '0.875rem 1rem',
      background: 'var(--card)',
      boxShadow: active && hasActions ? 'var(--shadow-md)' : 'var(--shadow-sm)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      transition: 'all 0.2s cubic-bezier(0,0,0.2,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      flexShrink: 0,
      borderRadius: 'var(--radius-lg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: m.chipBg,
      color: m.chipColor
    },
    "aria-hidden": "true"
  }, Icon && /*#__PURE__*/React.createElement(Icon, {
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--foreground)',
      fontSize: 'var(--text-base)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, description), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '2px 0 0',
      fontSize: 'var(--text-xs)',
      color: 'var(--muted-foreground)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, account)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-lg)',
      color: m.color,
      whiteSpace: 'nowrap',
      flexShrink: 0,
      fontVariantNumeric: 'tabular-nums'
    }
  }, m.sign, " ", amount)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
      marginTop: 8
    }
  }, category && /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "neutral",
    square: true
  }, category), date && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--muted-foreground)'
    }
  }, date), badges.map((b, i) => /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    key: i,
    tone: b.tone || 'primary',
    icon: b.icon
  }, b.label)), hasActions && /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      gap: 2,
      opacity: active ? 1 : 0,
      transition: 'opacity 0.15s'
    }
  }, onEdit && /*#__PURE__*/React.createElement(ActionBtn, {
    label: "Editar transacci\xF3n",
    color: "var(--primary)",
    onClick: onEdit,
    onFocus: () => setActive(true),
    onBlur: () => setActive(false),
    glyph: "edit"
  }), onDelete && /*#__PURE__*/React.createElement(ActionBtn, {
    label: "Eliminar transacci\xF3n",
    color: "var(--destructive)",
    onClick: onDelete,
    onFocus: () => setActive(true),
    onBlur: () => setActive(false),
    glyph: "x"
  })))));
}
function ActionBtn({
  label,
  color,
  onClick,
  onFocus,
  onBlur,
  glyph
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": label,
    title: label,
    onClick: onClick,
    onFocus: onFocus,
    onBlur: onBlur,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      width: 32,
      height: 32,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: 'none',
      borderRadius: 'var(--radius-md)',
      cursor: 'pointer',
      background: h ? 'var(--muted)' : 'transparent',
      color: h ? color : 'var(--muted-foreground)',
      transition: 'all 0.12s'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, glyph === 'edit' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 20h9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
  })) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m6 6 12 12"
  }))));
}
Object.assign(__ds_scope, { TransactionRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/finance/TransactionRow.jsx", error: String((e && e.message) || e) }); }

// ui_kits/moneytrack/app.jsx
try { (() => {
// MoneyTrack UI kit — app wiring
(function () {
  const {
    Header,
    TabNavigation,
    AuthModal
  } = window.MTChrome;
  const {
    StatCards,
    TransactionsView,
    AccountsView,
    RecurringView,
    Placeholder
  } = window.MTFinance;
  const {
    accounts,
    seedTransactions,
    categories,
    recurring,
    formatCOP
  } = window.MTData;
  function App() {
    const [dark, setDark] = React.useState(false);
    const [user, setUser] = React.useState(null);
    const [authOpen, setAuthOpen] = React.useState(false);
    const [view, setView] = React.useState('transactions');
    const [transactions, setTransactions] = React.useState(seedTransactions);
    const [hidden, setHidden] = React.useState(false);
    const [filter, setFilter] = React.useState({
      cat: 'all',
      q: ''
    });
    const {
      isMobile
    } = window.useViewport();
    React.useEffect(() => {
      document.documentElement.classList.toggle('dark', dark);
    }, [dark]);
    const accountName = t => {
      const a = accounts.find(x => x.id === t.account);
      if (t.type === 'transfer' && t.toAccount) {
        const b = accounts.find(x => x.id === t.toAccount);
        return `${a ? a.name : '—'} → ${b ? b.name : '—'}`;
      }
      return a ? a.name : 'Cuenta';
    };
    const totals = React.useMemo(() => {
      const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const pending = transactions.filter(t => !t.paid).reduce((s, t) => s + t.amount, 0);
      const balance = accounts.reduce((s, a) => s + (a.type === 'credit' ? a.creditLimit - a.creditUsed : a.balance), 0);
      return {
        income,
        expense,
        pending,
        balance
      };
    }, [transactions]);
    const addTxn = t => setTransactions(prev => [t, ...prev]);
    const delTxn = id => setTransactions(prev => prev.filter(t => t.id !== id));
    return /*#__PURE__*/React.createElement("div", {
      style: {
        minHeight: '100vh',
        background: 'var(--background)',
        color: 'var(--foreground)'
      }
    }, /*#__PURE__*/React.createElement(Header, {
      user: user,
      dark: dark,
      onToggleTheme: () => setDark(d => !d),
      onLogin: () => setAuthOpen(true),
      onLogout: () => setUser(null)
    }), /*#__PURE__*/React.createElement("main", {
      style: {
        maxWidth: 1080,
        margin: '0 auto',
        padding: isMobile ? '16px 12px 56px' : '28px 24px 64px'
      }
    }, !user && /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        marginBottom: 20,
        flexWrap: 'wrap',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--info-muted)',
        border: '1px solid var(--border-accent)',
        color: 'var(--info-text)',
        fontSize: 14
      }
    }, /*#__PURE__*/React.createElement("b", null, "Modo invitado."), " ", /*#__PURE__*/React.createElement("span", {
      style: {
        opacity: 0.85
      }
    }, "Tus datos se guardan en este dispositivo."), /*#__PURE__*/React.createElement("button", {
      onClick: () => setAuthOpen(true),
      style: {
        marginLeft: isMobile ? 0 : 'auto',
        background: 'none',
        border: 'none',
        color: 'var(--primary-text)',
        fontWeight: 600,
        cursor: 'pointer',
        fontSize: 14,
        padding: 0
      }
    }, "Acceder para sincronizar \u2192")), /*#__PURE__*/React.createElement(StatCards, {
      totals: totals,
      hidden: hidden,
      setHidden: setHidden
    }), /*#__PURE__*/React.createElement(TabNavigation, {
      view: view,
      setView: setView
    }), view === 'transactions' && /*#__PURE__*/React.createElement(TransactionsView, {
      transactions: transactions,
      accountName: accountName,
      hidden: hidden,
      filter: filter,
      setFilter: setFilter,
      categories: categories,
      onAdd: addTxn,
      onDelete: delTxn
    }), view === 'accounts' && /*#__PURE__*/React.createElement(AccountsView, {
      accounts: accounts,
      hidden: hidden
    }), view === 'recurring' && /*#__PURE__*/React.createElement(RecurringView, {
      recurring: recurring
    }), view === 'stats' && /*#__PURE__*/React.createElement(window.MTStats.StatsView, {
      dark: dark
    }), view === 'debts' && /*#__PURE__*/React.createElement(window.MTViews.DebtsView, null), view === 'budgets' && /*#__PURE__*/React.createElement(window.MTViews.BudgetsView, null), view === 'goals' && /*#__PURE__*/React.createElement(window.MTViews.GoalsView, null)), /*#__PURE__*/React.createElement(AuthModal, {
      open: authOpen,
      onClose: () => setAuthOpen(false),
      onAuth: () => {
        setUser({
          name: 'Camila'
        });
        setAuthOpen(false);
      }
    }));
  }
  window.MTApp = App;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/moneytrack/app.jsx", error: String((e && e.message) || e) }); }

// ui_kits/moneytrack/chrome.jsx
try { (() => {
// MoneyTrack UI kit — app chrome: Header, TabNavigation, AuthModal, Logo
(function () {
  const {
    Icon
  } = window;
  const LogIn = Icon('LogIn'),
    LogOut = Icon('LogOut'),
    Settings = Icon('Settings'),
    Bell = Icon('Bell'),
    Sun = Icon('Sun'),
    Moon = Icon('Moon'),
    User = Icon('User'),
    Activity = Icon('Activity'),
    Wallet = Icon('Wallet'),
    Repeat = Icon('Repeat'),
    HandCoins = Icon('HandCoins'),
    PieChart = Icon('PieChart'),
    Target = Icon('Target'),
    BarChart = Icon('BarChart3'),
    X = Icon('X'),
    Mail = Icon('Mail'),
    Sparkles = Icon('Sparkles');
  function Logo({
    size = 30
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("img", {
      src: "../../assets/icon-512x512.png",
      alt: "",
      width: size + 8,
      height: size + 8,
      style: {
        borderRadius: 9
      }
    }), /*#__PURE__*/React.createElement("h1", {
      style: {
        fontSize: size,
        fontWeight: 700,
        margin: 0,
        letterSpacing: '-0.01em'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--primary)'
      }
    }, "Money"), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--foreground)'
      }
    }, "Track")));
  }
  function Header({
    user,
    dark,
    onToggleTheme,
    onLogin,
    onLogout
  }) {
    const {
      isMobile
    } = window.useViewport();
    return /*#__PURE__*/React.createElement("header", {
      style: {
        width: '100%',
        padding: isMobile ? '10px 14px' : '12px 24px',
        background: dark ? 'rgba(17,24,39,0.8)' : 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        position: 'sticky',
        top: 0,
        zIndex: 50
      }
    }, /*#__PURE__*/React.createElement(Logo, {
      size: isMobile ? 22 : 30
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? 2 : 8
      }
    }, user ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'var(--surface-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--primary)',
        border: '2px solid var(--border-accent)'
      }
    }, /*#__PURE__*/React.createElement(User, {
      size: 18
    })), !isMobile && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        fontWeight: 500
      }
    }, user.name)) : /*#__PURE__*/React.createElement("button", {
      onClick: onLogin,
      "aria-label": "Acceder",
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: isMobile ? '9px 11px' : '9px 16px',
        background: dark ? '#fff' : '#111827',
        color: dark ? '#111827' : '#fff',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        minHeight: 40
      }
    }, /*#__PURE__*/React.createElement(LogIn, {
      size: 16
    }), " ", !isMobile && 'Acceder'), !isMobile && /*#__PURE__*/React.createElement("div", {
      style: {
        width: 1,
        height: 24,
        background: 'var(--border)'
      }
    }), /*#__PURE__*/React.createElement(IconBtn, {
      onClick: onToggleTheme,
      title: "Tema"
    }, dark ? /*#__PURE__*/React.createElement(Sun, {
      size: 20
    }) : /*#__PURE__*/React.createElement(Moon, {
      size: 20
    })), user && !isMobile && /*#__PURE__*/React.createElement(IconBtn, {
      title: "Notificaciones",
      dot: true
    }, /*#__PURE__*/React.createElement(Bell, {
      size: 20
    })), /*#__PURE__*/React.createElement(IconBtn, {
      title: "Configuraci\xF3n"
    }, /*#__PURE__*/React.createElement(Settings, {
      size: 20
    })), user && /*#__PURE__*/React.createElement(IconBtn, {
      onClick: onLogout,
      title: "Salir"
    }, /*#__PURE__*/React.createElement(LogOut, {
      size: 18
    }))));
  }
  function IconBtn({
    children,
    onClick,
    title,
    dot
  }) {
    const [hover, setHover] = React.useState(false);
    return /*#__PURE__*/React.createElement("button", {
      onClick: onClick,
      title: title,
      "aria-label": title,
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: {
        position: 'relative',
        padding: 9,
        background: hover ? 'var(--muted)' : 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        color: hover ? 'var(--primary)' : 'var(--muted-foreground)',
        minHeight: 40,
        minWidth: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all .15s'
      }
    }, children, dot && /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        top: 7,
        right: 8,
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: 'var(--destructive)',
        border: '2px solid var(--background)'
      }
    }));
  }
  const TABS = [{
    key: 'transactions',
    label: 'Transacciones',
    icon: Activity
  }, {
    key: 'accounts',
    label: 'Cuentas',
    icon: Wallet
  }, {
    key: 'recurring',
    label: 'Periódicos',
    icon: Repeat
  }, {
    key: 'debts',
    label: 'Préstamos',
    icon: HandCoins
  }, {
    key: 'budgets',
    label: 'Presupuestos',
    icon: PieChart
  }, {
    key: 'goals',
    label: 'Metas',
    icon: Target
  }, {
    key: 'stats',
    label: 'Estadísticas',
    icon: BarChart
  }];
  function TabNavigation({
    view,
    setView
  }) {
    return /*#__PURE__*/React.createElement("nav", {
      role: "tablist",
      "aria-label": "Vistas",
      style: {
        display: 'flex',
        gap: 4,
        borderBottom: '1px solid var(--border)',
        marginBottom: 24,
        overflowX: 'auto'
      },
      className: "mt-scroll-thin"
    }, TABS.map(t => {
      const active = view === t.key;
      const TIcon = t.icon;
      return /*#__PURE__*/React.createElement("button", {
        key: t.key,
        onClick: () => setView(t.key),
        role: "tab",
        "aria-selected": active,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          fontSize: 15,
          fontWeight: 500,
          fontFamily: 'inherit',
          color: active ? 'var(--primary)' : 'var(--muted-foreground)',
          borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
          marginBottom: -1,
          transition: 'color .15s'
        }
      }, /*#__PURE__*/React.createElement(TIcon, {
        size: 18
      }), " ", t.label);
    }));
  }
  function AuthModal({
    open,
    onClose,
    onAuth
  }) {
    const {
      Modal
    } = window.MoneyTrackDesignSystem_daa395;
    return /*#__PURE__*/React.createElement(Modal, {
      open: open,
      onClose: onClose,
      title: "Bienvenido",
      subtitle: "Sincroniza tus finanzas",
      icon: Sparkles,
      width: 400
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: onAuth,
      className: "mt-btn",
      style: {
        background: 'var(--card)',
        color: 'var(--foreground)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(GoogleG, null), " Continuar con Google"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        color: 'var(--muted-foreground)',
        fontSize: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 1,
        background: 'var(--border)'
      }
    }), " o ", /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 1,
        background: 'var(--border)'
      }
    })), /*#__PURE__*/React.createElement("label", {
      className: "mt-label",
      style: {
        marginBottom: 0
      }
    }, "Correo electr\xF3nico"), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        left: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--muted-foreground)'
      }
    }, /*#__PURE__*/React.createElement(Mail, {
      size: 16
    })), /*#__PURE__*/React.createElement("input", {
      className: "mt-input",
      defaultValue: "hola@moneytrack.app",
      style: {
        paddingLeft: 38
      },
      "aria-label": "Correo electr\xF3nico"
    })), /*#__PURE__*/React.createElement("button", {
      onClick: onAuth,
      className: "mt-btn mt-btn-primary",
      style: {
        justifyContent: 'center'
      }
    }, "Acceder"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 12,
        color: 'var(--muted-foreground)',
        textAlign: 'center',
        margin: 0
      }
    }, "Tambi\xE9n puedes ", /*#__PURE__*/React.createElement("button", {
      onClick: onClose,
      style: {
        background: 'none',
        border: 'none',
        color: 'var(--primary-text)',
        cursor: 'pointer',
        fontWeight: 500,
        fontSize: 12,
        padding: 0
      }
    }, "continuar como invitado"))));
  }
  function GoogleG() {
    return /*#__PURE__*/React.createElement("svg", {
      width: "18",
      height: "18",
      viewBox: "0 0 48 48"
    }, /*#__PURE__*/React.createElement("path", {
      fill: "#EA4335",
      d: "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    }), /*#__PURE__*/React.createElement("path", {
      fill: "#4285F4",
      d: "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    }), /*#__PURE__*/React.createElement("path", {
      fill: "#FBBC05",
      d: "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    }), /*#__PURE__*/React.createElement("path", {
      fill: "#34A853",
      d: "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    }));
  }
  window.MTChrome = {
    Logo,
    Header,
    TabNavigation,
    AuthModal
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/moneytrack/chrome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/moneytrack/data.js
try { (() => {
// Fake MoneyTrack data + formatters (window-attached, no exports)
(function () {
  const formatCOP = n => {
    const sign = n < 0 ? '-' : '';
    const v = Math.abs(Math.round(n)).toLocaleString('es-CO');
    return `${sign}$ ${v}`;
  };
  const accounts = [{
    id: 'a1',
    name: 'Bancolombia Ahorros',
    type: 'savings',
    balance: 3120000,
    isDefault: true
  }, {
    id: 'a2',
    name: 'Efectivo',
    type: 'cash',
    balance: 240000
  }, {
    id: 'a3',
    name: 'Nu Crédito',
    type: 'credit',
    creditLimit: 4000000,
    creditUsed: 1310000,
    interestRate: 28.4,
    cutoff: '15 jun',
    payment: '3 jul'
  }];

  // category, type, account, paid, installments, hasInterest, recurring
  const seedTransactions = [{
    id: 't1',
    type: 'income',
    desc: 'Salario junio',
    account: 'a1',
    category: 'Salario',
    date: '2026-06-01',
    amount: 3200000,
    paid: true
  }, {
    id: 't2',
    type: 'expense',
    desc: 'Mercado Éxito',
    account: 'a3',
    category: 'Mercado',
    date: '2026-06-05',
    amount: 289900,
    paid: false,
    installments: 3
  }, {
    id: 't3',
    type: 'expense',
    desc: 'Netflix',
    account: 'a3',
    category: 'Suscripciones',
    date: '2026-06-05',
    amount: 38900,
    paid: true,
    recurring: 'Netflix'
  }, {
    id: 't4',
    type: 'transfer',
    desc: 'Pago tarjeta Nu',
    account: 'a1',
    toAccount: 'a3',
    category: 'Transferencia',
    date: '2026-06-04',
    amount: 500000,
    paid: true
  }, {
    id: 't5',
    type: 'expense',
    desc: 'Gasolina',
    account: 'a2',
    category: 'Transporte',
    date: '2026-06-04',
    amount: 120000,
    paid: true
  }, {
    id: 't6',
    type: 'expense',
    desc: 'Almuerzo trabajo',
    account: 'a2',
    category: 'Restaurantes',
    date: '2026-06-03',
    amount: 32000,
    paid: true
  }, {
    id: 't7',
    type: 'income',
    desc: 'Freelance diseño',
    account: 'a1',
    category: 'Trabajo extra',
    date: '2026-06-02',
    amount: 850000,
    paid: true
  }, {
    id: 't8',
    type: 'expense',
    desc: 'Cuota gimnasio',
    account: 'a3',
    category: 'Salud',
    date: '2026-06-02',
    amount: 95000,
    paid: false,
    hasInterest: true
  }];
  const categories = {
    expense: ['Mercado', 'Restaurantes', 'Transporte', 'Suscripciones', 'Salud', 'Hogar', 'Ocio', 'Otros'],
    income: ['Salario', 'Trabajo extra', 'Inversiones', 'Regalo', 'Otros']
  };
  const recurring = [{
    id: 'r1',
    name: 'Netflix',
    amount: 38900,
    category: 'Suscripciones',
    day: 5,
    account: 'Nu Crédito',
    status: 'soon'
  }, {
    id: 'r2',
    name: 'Arriendo',
    amount: 1450000,
    category: 'Hogar',
    day: 1,
    account: 'Bancolombia Ahorros',
    status: 'paid'
  }, {
    id: 'r3',
    name: 'Spotify',
    amount: 16900,
    category: 'Suscripciones',
    day: 12,
    account: 'Nu Crédito',
    status: 'ok'
  }, {
    id: 'r4',
    name: 'Gimnasio SmartFit',
    amount: 95000,
    category: 'Salud',
    day: 2,
    account: 'Nu Crédito',
    status: 'overdue'
  }];
  const monthLabel = iso => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };
  const dayHeader = iso => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-CO', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };
  window.MTData = {
    formatCOP,
    accounts,
    seedTransactions,
    categories,
    recurring,
    monthLabel,
    dayHeader
  };

  // ── Stats datasets (6-month cash flow, yearly trend, category split) ──
  const monthlyData = [{
    month: 'Ene',
    ingresos: 3650000,
    gastos: 2980000
  }, {
    month: 'Feb',
    ingresos: 3200000,
    gastos: 3120000
  }, {
    month: 'Mar',
    ingresos: 4100000,
    gastos: 2740000
  }, {
    month: 'Abr',
    ingresos: 3400000,
    gastos: 3360000
  }, {
    month: 'May',
    ingresos: 3900000,
    gastos: 2650000
  }, {
    month: 'Jun',
    ingresos: 4050000,
    gastos: 575800
  }];
  const yearlyData = [{
    'año': '2023',
    ingresos: 38200000,
    gastos: 33400000
  }, {
    'año': '2024',
    ingresos: 42600000,
    gastos: 36900000
  }, {
    'año': '2025',
    ingresos: 45100000,
    gastos: 35200000
  }, {
    'año': '2026',
    ingresos: 22300000,
    gastos: 15400000
  }];
  const categoryData = [{
    name: 'Hogar',
    value: 1450000
  }, {
    name: 'Mercado',
    value: 720000
  }, {
    name: 'Transporte',
    value: 410000
  }, {
    name: 'Suscripciones',
    value: 145000
  }, {
    name: 'Salud',
    value: 95000
  }, {
    name: 'Restaurantes',
    value: 78000
  }];

  // Credit-card interest summary (row 4 of the real Estadísticas view)
  const interestSummary = {
    paid: 184500,
    // interés ya pagado este año
    projected: 312000,
    // interés proyectado restante
    principal: 1310000,
    // capital en cuotas
    cards: 1
  };
  Object.assign(window.MTData, {
    monthlyData,
    yearlyData,
    categoryData,
    interestSummary
  });

  // ── Goals / Debts / Budgets datasets ───────────────────────
  const savingsGoals = [{
    id: 'g1',
    name: 'Vacaciones San Andrés',
    current: 1850000,
    target: 3000000,
    daysLeft: 84,
    suggestedMonthly: 410000
  }, {
    id: 'g2',
    name: 'Fondo de emergencia',
    current: 4200000,
    target: 6000000,
    daysLeft: 152,
    suggestedMonthly: 360000
  }, {
    id: 'g3',
    name: 'MacBook nueva',
    current: 2400000,
    target: 2500000,
    daysLeft: 12,
    suggestedMonthly: 100000
  }];
  const debts = [{
    id: 'd1',
    name: 'Préstamo a Andrés',
    type: 'lent',
    total: 1200000,
    paid: 700000,
    monthly: 250000,
    nextDate: '15 jun'
  }, {
    id: 'd2',
    name: 'Crédito de libre inversión',
    type: 'owed',
    total: 8000000,
    paid: 5200000,
    monthly: 480000,
    nextDate: '5 jul',
    rate: 22.5
  }, {
    id: 'd3',
    name: 'Le debo a Mamá',
    type: 'owed',
    total: 600000,
    paid: 200000,
    monthly: 100000,
    nextDate: '20 jun'
  }];
  const budgets = [{
    id: 'b1',
    category: 'Hogar',
    spent: 1450000,
    limit: 1600000
  }, {
    id: 'b2',
    category: 'Mercado',
    spent: 720000,
    limit: 700000
  }, {
    id: 'b3',
    category: 'Transporte',
    spent: 410000,
    limit: 600000
  }, {
    id: 'b4',
    category: 'Restaurantes',
    spent: 78000,
    limit: 250000
  }, {
    id: 'b5',
    category: 'Ocio',
    spent: 190000,
    limit: 200000
  }];
  Object.assign(window.MTData, {
    savingsGoals,
    debts,
    budgets
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/moneytrack/data.js", error: String((e && e.message) || e) }); }

// ui_kits/moneytrack/finance.jsx
try { (() => {
// MoneyTrack UI kit — finance views: StatCards, TransactionsView, AccountsView, RecurringView
(function () {
  const {
    Icon
  } = window;
  const {
    formatCOP,
    monthLabel,
    dayHeader
  } = window.MTData;
  const Wallet = Icon('Wallet'),
    Up = Icon('TrendingUp'),
    Down = Icon('TrendingDown'),
    Cal = Icon('Calendar'),
    Eye = Icon('Eye'),
    EyeOff = Icon('EyeOff'),
    Plus = Icon('Plus'),
    Upload = Icon('Upload'),
    Search = Icon('Search'),
    Card = Icon('CreditCard'),
    Swap = Icon('ArrowRightLeft'),
    Clock = Icon('Clock'),
    Edit = Icon('Edit2'),
    X = Icon('X'),
    Banknote = Icon('Banknote'),
    Grip = Icon('GripVertical'),
    Trash = Icon('Trash2'),
    Repeat = Icon('Repeat'),
    Check = Icon('Check'),
    Alert = Icon('AlertCircle'),
    Combine = Icon('Combine');

  // ── Stat cards ───────────────────────────────────────────
  function StatCards({
    totals,
    hidden,
    setHidden
  }) {
    const v = n => hidden ? '••••••' : formatCOP(n);
    const {
      isMobile
    } = window.useViewport();
    const span2 = isMobile ? {
      gridColumn: '1 / -1'
    } : undefined;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 24
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: 12
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setHidden(!hidden),
      "aria-label": hidden ? 'Mostrar valores' : 'Ocultar valores',
      "aria-pressed": hidden,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 500,
        color: 'var(--muted-foreground)',
        borderRadius: 'var(--radius-md)'
      }
    }, hidden ? /*#__PURE__*/React.createElement(Eye, {
      size: 16
    }) : /*#__PURE__*/React.createElement(EyeOff, {
      size: 16
    }), " ", hidden ? 'Mostrar' : 'Ocultar')), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: isMobile ? 10 : 16
      }
    }, /*#__PURE__*/React.createElement(Stat, {
      tone: "balance",
      label: "Balance",
      value: v(totals.balance),
      icon: Wallet,
      style: span2
    }), /*#__PURE__*/React.createElement(Stat, {
      tone: "income",
      label: "Ingresos",
      period: "este mes",
      value: v(totals.income),
      icon: Up
    }), /*#__PURE__*/React.createElement(Stat, {
      tone: "expense",
      label: "Gastos",
      period: "este mes",
      value: v(totals.expense),
      icon: Down
    }), /*#__PURE__*/React.createElement(Stat, {
      tone: "pending",
      label: "Pendientes",
      value: v(totals.pending),
      icon: Cal,
      style: span2
    })));
  }
  const TONES = {
    balance: {
      ib: 'var(--primary)',
      ic: 'var(--primary-foreground)',
      vc: 'var(--balance-foreground)'
    },
    income: {
      ib: 'var(--surface-income)',
      ic: 'var(--success)',
      vc: 'var(--foreground)'
    },
    expense: {
      ib: 'var(--surface-expense)',
      ic: 'var(--destructive)',
      vc: 'var(--foreground)'
    },
    pending: {
      ib: 'var(--surface-pending)',
      ic: 'var(--warning)',
      vc: 'var(--foreground)'
    }
  };
  function Stat({
    tone,
    label,
    period,
    value,
    icon: I,
    style
  }) {
    const t = TONES[tone];
    const isB = tone === 'balance';
    const masked = typeof value === 'string' && value.includes('•');
    return /*#__PURE__*/React.createElement("div", {
      style: {
        borderRadius: 'var(--radius-lg)',
        padding: 20,
        border: isB ? '2px solid var(--border-accent)' : '1px solid var(--border)',
        background: isB ? 'var(--gradient-balance)' : 'var(--card)',
        boxShadow: isB ? 'var(--shadow-balance)' : 'var(--shadow-md)',
        ...style
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        fontWeight: 500,
        color: isB ? 'var(--balance-foreground)' : 'var(--muted-foreground)'
      }
    }, label, period && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        fontWeight: 400,
        color: 'var(--muted-foreground)',
        marginLeft: 4
      }
    }, period)), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        padding: 7,
        borderRadius: 'var(--radius-md)',
        background: t.ib,
        color: t.ic
      }
    }, /*#__PURE__*/React.createElement(I, {
      size: 18
    }))), /*#__PURE__*/React.createElement("div", {
      "aria-label": masked ? `${label}, valor oculto` : undefined,
      style: {
        fontSize: 24,
        fontWeight: 700,
        color: t.vc,
        fontVariantNumeric: 'tabular-nums'
      }
    }, value));
  }

  // ── Transaction row ──────────────────────────────────────
  const TYPE = {
    income: {
      sign: '+',
      c: 'var(--success-text)',
      bg: 'var(--surface-income)',
      icColor: 'var(--success)',
      I: Card
    },
    expense: {
      sign: '−',
      c: 'var(--destructive-text)',
      bg: 'var(--surface-expense)',
      icColor: 'var(--destructive)',
      I: Card
    },
    transfer: {
      sign: '→',
      c: 'var(--info-text)',
      bg: 'var(--surface-transfer)',
      icColor: 'var(--primary)',
      I: Swap
    }
  };
  function TxnRow({
    t,
    accountName,
    hidden,
    onEdit,
    onDelete
  }) {
    const [hover, setHover] = React.useState(false);
    const [focus, setFocus] = React.useState(false);
    const m = TYPE[t.type];
    const TI = m.I;
    return /*#__PURE__*/React.createElement("div", {
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: {
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
        background: 'var(--card)',
        boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        borderColor: hover ? 'var(--border-accent)' : 'var(--border)',
        display: 'flex',
        gap: 12,
        transition: 'all .15s'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 40,
        height: 40,
        flexShrink: 0,
        borderRadius: 'var(--radius-lg)',
        background: m.bg,
        color: m.icColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(TI, {
      size: 18
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        margin: 0,
        fontWeight: 600,
        fontSize: 15,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, t.desc), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '2px 0 0',
        fontSize: 12,
        color: 'var(--muted-foreground)'
      }
    }, accountName)), /*#__PURE__*/React.createElement("span", {
      "aria-label": hidden ? `${t.type === 'income' ? 'Ingreso' : t.type === 'expense' ? 'Gasto' : 'Transferencia'}, valor oculto` : undefined,
      style: {
        fontWeight: 700,
        fontSize: 16,
        color: m.c,
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums'
      }
    }, m.sign, " ", hidden ? '••••' : formatCOP(t.amount))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        marginTop: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "mt-badge mt-badge-neutral mt-badge-square"
    }, t.category), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: 'var(--muted-foreground)'
      }
    }, monthLabel(t.date)), !t.paid && /*#__PURE__*/React.createElement("span", {
      className: "mt-badge mt-badge-warning"
    }, /*#__PURE__*/React.createElement(Clock, {
      size: 10
    }), " Pendiente"), t.installments > 1 && /*#__PURE__*/React.createElement("span", {
      className: "mt-badge mt-badge-primary"
    }, t.installments, " cuotas"), t.hasInterest && /*#__PURE__*/React.createElement("span", {
      className: "mt-badge mt-badge-warning"
    }, "Con inter\xE9s"), t.recurring && /*#__PURE__*/React.createElement("span", {
      className: "mt-badge mt-badge-primary"
    }, /*#__PURE__*/React.createElement(Repeat, {
      size: 10
    }), " ", t.recurring), /*#__PURE__*/React.createElement("div", {
      style: {
        marginLeft: 'auto',
        display: 'flex',
        gap: 2,
        opacity: hover || focus ? 1 : 0,
        transition: 'opacity .15s'
      }
    }, /*#__PURE__*/React.createElement(RowBtn, {
      onClick: onEdit,
      label: "Editar transacci\xF3n",
      color: "var(--primary)",
      onFocus: () => setFocus(true),
      onBlur: () => setFocus(false)
    }, /*#__PURE__*/React.createElement(Edit, {
      size: 15
    })), /*#__PURE__*/React.createElement(RowBtn, {
      onClick: onDelete,
      label: "Eliminar transacci\xF3n",
      color: "var(--destructive)",
      onFocus: () => setFocus(true),
      onBlur: () => setFocus(false)
    }, /*#__PURE__*/React.createElement(X, {
      size: 15
    }))))));
  }
  function RowBtn({
    children,
    onClick,
    label,
    color,
    onFocus,
    onBlur
  }) {
    const [h, setH] = React.useState(false);
    return /*#__PURE__*/React.createElement("button", {
      onClick: onClick,
      title: label,
      "aria-label": label,
      onMouseEnter: () => setH(true),
      onMouseLeave: () => setH(false),
      onFocus: onFocus,
      onBlur: onBlur,
      style: {
        padding: 6,
        minWidth: 36,
        minHeight: 36,
        border: 'none',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        background: h ? 'var(--muted)' : 'transparent',
        color: h ? color : 'var(--muted-foreground)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all .12s'
      }
    }, children);
  }

  // ── Transactions view ────────────────────────────────────
  function TransactionsView({
    transactions,
    accountName,
    hidden,
    filter,
    setFilter,
    categories,
    onAdd,
    onDelete
  }) {
    const [showForm, setShowForm] = React.useState(false);
    const filtered = transactions.filter(t => {
      if (filter.cat !== 'all' && t.category !== filter.cat) return false;
      if (filter.q && !t.desc.toLowerCase().includes(filter.q.toLowerCase())) return false;
      return true;
    });
    // group by day
    const groups = [];
    filtered.forEach(t => {
      const key = t.date;
      let g = groups.find(x => x.key === key);
      if (!g) {
        g = {
          key,
          items: []
        };
        groups.push(g);
      }
      g.items.push(t);
    });
    return /*#__PURE__*/React.createElement("div", {
      className: "mt-card"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
        marginBottom: 18
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative',
        flex: '1 1 220px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        left: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--muted-foreground)'
      }
    }, /*#__PURE__*/React.createElement(Search, {
      size: 16
    })), /*#__PURE__*/React.createElement("input", {
      className: "mt-input",
      placeholder: "Buscar transacci\xF3n\u2026",
      "aria-label": "Buscar transacci\xF3n",
      value: filter.q,
      onChange: e => setFilter({
        ...filter,
        q: e.target.value
      }),
      style: {
        paddingLeft: 38
      }
    })), /*#__PURE__*/React.createElement("select", {
      className: "mt-input",
      value: filter.cat,
      onChange: e => setFilter({
        ...filter,
        cat: e.target.value
      }),
      style: {
        width: 'auto',
        minWidth: 150,
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("option", {
      value: "all"
    }, "Todas las categor\xEDas"), [...new Set([...categories.expense, ...categories.income])].map(c => /*#__PURE__*/React.createElement("option", {
      key: c,
      value: c
    }, c))), /*#__PURE__*/React.createElement("button", {
      className: "mt-btn mt-btn-cancel",
      onClick: () => {}
    }, /*#__PURE__*/React.createElement(Upload, {
      size: 16
    }), " Importar"), /*#__PURE__*/React.createElement("button", {
      className: "mt-btn mt-btn-primary",
      onClick: () => setShowForm(s => !s)
    }, /*#__PURE__*/React.createElement(Plus, {
      size: 16
    }), " Nueva")), showForm && /*#__PURE__*/React.createElement(AddForm, {
      categories: categories,
      onCancel: () => setShowForm(false),
      onSave: t => {
        onAdd(t);
        setShowForm(false);
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 16
      }
    }, /*#__PURE__*/React.createElement("h3", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 18,
        fontWeight: 700,
        margin: 0
      }
    }, "Transacciones", /*#__PURE__*/React.createElement("span", {
      className: "mt-badge mt-badge-primary"
    }, filtered.length)), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '4px 0 0',
        fontSize: 12,
        color: 'var(--muted-foreground)'
      }
    }, filter.cat === 'all' && !filter.q ? 'Todo el tiempo' : 'Filtros activos', " \xB7 ", transactions.length, " cargadas")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }
    }, groups.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        padding: '40px 0',
        color: 'var(--muted-foreground)'
      }
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        margin: 0,
        fontSize: 14
      }
    }, "No hay transacciones que coincidan con el filtro.")), groups.map(g => /*#__PURE__*/React.createElement(React.Fragment, {
      key: g.key
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        paddingTop: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--muted-foreground)'
      }
    }, dayHeader(g.key))), g.items.map(t => /*#__PURE__*/React.createElement(TxnRow, {
      key: t.id,
      t: t,
      accountName: accountName(t),
      hidden: hidden,
      onEdit: () => {},
      onDelete: () => onDelete(t.id)
    }))))));
  }

  // ── Add transaction inline form ──────────────────────────
  function AddForm({
    categories,
    onSave,
    onCancel
  }) {
    const {
      isMobile
    } = window.useViewport();
    const [type, setType] = React.useState('expense');
    const [desc, setDesc] = React.useState('');
    const [amount, setAmount] = React.useState('');
    const [cat, setCat] = React.useState(categories.expense[0]);
    const cats = type === 'income' ? categories.income : categories.expense;
    React.useEffect(() => {
      setCat(cats[0]);
    }, [type]);
    const {
      SegmentedControl
    } = window.MoneyTrackDesignSystem_daa395;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 18,
        background: 'var(--muted)',
        marginBottom: 18
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement(SegmentedControl, {
      ariaLabel: "Tipo de movimiento",
      value: type,
      onChange: setType,
      options: [{
        value: 'expense',
        label: 'Gasto',
        tone: 'danger'
      }, {
        value: 'income',
        label: 'Ingreso',
        tone: 'success'
      }, {
        value: 'transfer',
        label: 'Transferencia',
        tone: 'info'
      }]
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "mt-label"
    }, "Descripci\xF3n"), /*#__PURE__*/React.createElement("input", {
      className: "mt-input",
      placeholder: "(opcional)",
      value: desc,
      onChange: e => setDesc(e.target.value)
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "mt-label"
    }, "Categor\xEDa"), /*#__PURE__*/React.createElement("select", {
      className: "mt-input",
      value: cat,
      onChange: e => setCat(e.target.value),
      style: {
        cursor: 'pointer'
      }
    }, cats.map(c => /*#__PURE__*/React.createElement("option", {
      key: c,
      value: c
    }, c)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "mt-label"
    }, "Monto"), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        left: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--muted-foreground)',
        fontSize: 14
      }
    }, "$"), /*#__PURE__*/React.createElement("input", {
      className: "mt-input",
      placeholder: "0",
      value: amount,
      onChange: e => setAmount(e.target.value.replace(/[^0-9]/g, '')),
      style: {
        paddingLeft: 26,
        fontVariantNumeric: 'tabular-nums'
      }
    }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "mt-label"
    }, "Fecha"), /*#__PURE__*/React.createElement("input", {
      className: "mt-input",
      type: "date",
      defaultValue: "2026-06-06"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 8,
        marginTop: 14
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "mt-btn mt-btn-cancel",
      onClick: onCancel
    }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
      className: "mt-btn mt-btn-primary",
      disabled: !amount,
      onClick: () => onSave({
        id: 't' + Date.now(),
        type,
        desc: desc || cat,
        category: cat,
        amount: Number(amount) || 0,
        date: '2026-06-06',
        paid: type !== 'expense',
        account: 'a1'
      })
    }, /*#__PURE__*/React.createElement(Check, {
      size: 16
    }), " Guardar")));
  }

  // ── Accounts view ────────────────────────────────────────
  const ACC_ICON = {
    savings: Wallet,
    cash: Banknote,
    credit: Card
  };
  const ACC_LABEL = {
    savings: 'Cuenta de Ahorros',
    cash: 'Efectivo',
    credit: 'Crédito'
  };
  function AccountsView({
    accounts,
    hidden
  }) {
    const {
      isMobile
    } = window.useViewport();
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
        gap: 16
      }
    }, accounts.map(a => /*#__PURE__*/React.createElement(AccountCard, {
      key: a.id,
      a: a,
      hidden: hidden
    })));
  }
  function AccountCard({
    a,
    hidden
  }) {
    const {
      isMobile
    } = window.useViewport();
    const {
      ProgressBar
    } = window.MoneyTrackDesignSystem_daa395;
    const isCredit = a.type === 'credit';
    const accent = isCredit ? 'var(--primary)' : 'var(--success)';
    const accentText = isCredit ? 'var(--primary-text)' : 'var(--success-text)';
    const surface = isCredit ? 'var(--surface-transfer)' : 'var(--surface-income)';
    const AI = ACC_ICON[a.type];
    const available = isCredit ? a.creditLimit - a.creditUsed : a.balance;
    const usage = isCredit ? Math.min(a.creditUsed / a.creditLimit * 100, 100) : 0;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius-lg)',
        padding: 20,
        background: 'var(--card)',
        boxShadow: 'var(--shadow-md)',
        border: a.isDefault ? `2px solid ${accent}` : '1px solid var(--border)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 6,
        background: accent
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        paddingLeft: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'flex-start' : 'flex-start',
        gap: isMobile ? 10 : 0
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement(Grip, {
      size: 18,
      style: {
        color: 'var(--muted-foreground)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: 6,
        borderRadius: 'var(--radius-md)',
        background: isCredit ? 'var(--surface-transfer)' : 'var(--surface-income)',
        color: accent,
        display: 'inline-flex'
      }
    }, /*#__PURE__*/React.createElement(AI, {
      size: 18
    })), /*#__PURE__*/React.createElement("h4", {
      style: {
        margin: 0,
        fontSize: 16,
        fontWeight: 600
      }
    }, a.name), a.isDefault && /*#__PURE__*/React.createElement("span", {
      className: "mt-badge",
      style: {
        background: surface,
        color: accentText
      }
    }, "Principal")), /*#__PURE__*/React.createElement("span", {
      className: "mt-badge",
      style: {
        background: surface,
        color: accentText
      }
    }, ACC_LABEL[a.type])), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: isMobile ? 'left' : 'right'
      }
    }, isCredit && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: 'var(--muted-foreground)'
      }
    }, "Disponible"), /*#__PURE__*/React.createElement("div", {
      "aria-label": hidden ? 'Saldo oculto' : undefined,
      style: {
        fontSize: 22,
        fontWeight: 700,
        color: accent,
        fontVariantNumeric: 'tabular-nums'
      }
    }, hidden ? '••••••' : formatCOP(available)))), isCredit && /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 16
      }
    }, /*#__PURE__*/React.createElement(ProgressBar, {
      value: a.creditUsed,
      max: a.creditLimit,
      autoWarn: true,
      label: "Cupo utilizado",
      detail: `${hidden ? '••••' : formatCOP(a.creditUsed)} / ${hidden ? '••••' : formatCOP(a.creditLimit)}`
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        marginTop: 12,
        fontSize: 13
      }
    }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--muted-foreground)'
      }
    }, "Corte: "), /*#__PURE__*/React.createElement("b", null, a.cutoff)), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--muted-foreground)'
      }
    }, "Pago: "), /*#__PURE__*/React.createElement("b", null, a.payment)), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--muted-foreground)'
      }
    }, "Tasa E.A.: "), /*#__PURE__*/React.createElement("b", {
      style: {
        color: 'var(--primary-text)'
      }
    }, a.interestRate.toFixed(2).replace('.', ','), "%")))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        marginTop: 16
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "mt-btn",
      style: {
        background: 'var(--info-muted)',
        color: 'var(--info-text)',
        minHeight: 38,
        padding: '6px 14px',
        fontSize: 14
      }
    }, /*#__PURE__*/React.createElement(Edit, {
      size: 14
    }), " Editar"), isCredit && /*#__PURE__*/React.createElement("button", {
      className: "mt-btn",
      style: {
        background: 'var(--surface-transfer)',
        color: 'var(--primary-text)',
        minHeight: 38,
        padding: '6px 14px',
        fontSize: 14
      }
    }, /*#__PURE__*/React.createElement(Combine, {
      size: 14
    }), " Unificar"))));
  }

  // ── Recurring view ───────────────────────────────────────
  const STATUS = {
    overdue: {
      label: 'Vencido',
      tone: 'danger',
      I: Alert
    },
    soon: {
      label: 'Próximo',
      tone: 'warning',
      I: Clock
    },
    ok: {
      label: 'Al día',
      tone: 'info',
      I: Repeat
    },
    paid: {
      label: 'Pagado',
      tone: 'success',
      I: Check
    }
  };
  function RecurringView({
    recurring
  }) {
    const {
      isMobile
    } = window.useViewport();
    return /*#__PURE__*/React.createElement("div", {
      className: "mt-card"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 18
      }
    }, /*#__PURE__*/React.createElement("h3", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 18,
        fontWeight: 700,
        margin: 0
      }
    }, "Pagos peri\xF3dicos ", /*#__PURE__*/React.createElement("span", {
      className: "mt-badge mt-badge-primary"
    }, recurring.length)), /*#__PURE__*/React.createElement("button", {
      className: "mt-btn mt-btn-primary"
    }, /*#__PURE__*/React.createElement(Plus, {
      size: 16
    }), " Nuevo")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }
    }, recurring.map(r => {
      const s = STATUS[r.status];
      const SI = s.I;
      return /*#__PURE__*/React.createElement("div", {
        key: r.id,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 16px',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-sm)'
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: 44,
          height: 44,
          borderRadius: 'var(--radius-lg)',
          background: 'var(--surface-transfer)',
          color: 'var(--primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }
      }, /*#__PURE__*/React.createElement(Repeat, {
        size: 20
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1,
          minWidth: 0
        }
      }, /*#__PURE__*/React.createElement("p", {
        style: {
          margin: 0,
          fontWeight: 600,
          fontSize: 15,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }
      }, r.name), /*#__PURE__*/React.createElement("p", {
        style: {
          margin: '2px 0 0',
          fontSize: 12,
          color: 'var(--muted-foreground)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }
      }, r.category, " \xB7 ", r.account, " \xB7 d\xEDa ", r.day)), /*#__PURE__*/React.createElement("div", {
        style: isMobile ? {
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingLeft: 58
        } : {
          display: 'contents'
        }
      }, /*#__PURE__*/React.createElement("span", {
        className: `mt-badge mt-badge-${s.tone}`
      }, /*#__PURE__*/React.createElement(SI, {
        size: 11
      }), " ", s.label), /*#__PURE__*/React.createElement("span", {
        style: {
          fontWeight: 700,
          fontSize: 16,
          fontVariantNumeric: 'tabular-nums',
          minWidth: isMobile ? 0 : 110,
          textAlign: 'right'
        }
      }, formatCOP(r.amount))));
    })));
  }

  // ── Generic placeholder for unbuilt tabs ─────────────────
  function Placeholder({
    label
  }) {
    const Box = Icon('Construction');
    return /*#__PURE__*/React.createElement("div", {
      className: "mt-card",
      style: {
        textAlign: 'center',
        padding: '56px 24px',
        color: 'var(--muted-foreground)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'inline-flex',
        padding: 16,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--muted)',
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement(Box, {
      size: 28
    })), /*#__PURE__*/React.createElement("h3", {
      style: {
        margin: 0,
        color: 'var(--foreground)'
      }
    }, label), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '8px 0 0',
        fontSize: 14
      }
    }, "Esta vista existe en el producto pero no se incluye en este UI kit."));
  }
  window.MTFinance = {
    StatCards,
    TransactionsView,
    AccountsView,
    RecurringView,
    Placeholder
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/moneytrack/finance.jsx", error: String((e && e.message) || e) }); }

// ui_kits/moneytrack/icons.js
try { (() => {
// Lucide icon → React component helper (shared across the kit)
// Usage: const Wallet = Icon('Wallet'); <Wallet size={18} />
(function () {
  function Icon(name) {
    return function IconCmp({
      size = 18,
      color = 'currentColor',
      strokeWidth = 2,
      style = {}
    }) {
      const ref = React.useRef(null);
      React.useEffect(() => {
        const node = ref.current;
        if (!node || !window.lucide) return;
        node.innerHTML = '';
        const data = window.lucide.icons[name];
        if (!data) return;
        const svg = window.lucide.createElement(data);
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('stroke', color);
        svg.setAttribute('stroke-width', strokeWidth);
        node.appendChild(svg);
      }, [size, color, strokeWidth]);
      return React.createElement('span', {
        ref,
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...style
        },
        'aria-hidden': 'true'
      });
    };
  }
  window.Icon = Icon;

  // Viewport hook → responsive breakpoints (product uses sm:640, lg:1024).
  // window.__forceWidth lets screenshots simulate a narrow viewport.
  function useViewport() {
    const get = () => typeof window !== 'undefined' ? window.__forceWidth || window.innerWidth || 1024 : 1024;
    const [w, setW] = React.useState(get());
    React.useEffect(() => {
      const on = () => setW(get());
      window.addEventListener('resize', on);
      return () => window.removeEventListener('resize', on);
    }, []);
    return {
      width: w,
      isMobile: w < 640,
      isTablet: w >= 640 && w < 1024,
      isDesktop: w >= 1024
    };
  }
  window.useViewport = useViewport;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/moneytrack/icons.js", error: String((e && e.message) || e) }); }

// ui_kits/moneytrack/stats.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// MoneyTrack UI kit — Estadísticas (charts via Recharts)
(function () {
  const {
    Icon
  } = window;
  const {
    formatCOP,
    monthlyData,
    yearlyData,
    categoryData,
    interestSummary
  } = window.MTData;
  const Activity = Icon('Activity'),
    BarChart3 = Icon('BarChart3'),
    PieIcon = Icon('PieChart'),
    Trend = Icon('TrendingUp'),
    Percent = Icon('Percent');
  const INCOME = '#8b5cf6';
  const EXPENSE = '#f43f5e';
  const INTEREST = '#f59e0b';
  const CHART_COLORS = ['#8b5cf6', '#7c3aed', '#a78bfa', '#c084fc', '#c4b5fd', '#6d28d9'];
  const R = () => window.Recharts;
  function gridColor(dark) {
    return dark ? 'rgba(167,139,250,0.16)' : '#ede9fe';
  }
  const axis = {
    stroke: '#9ca3af',
    tick: {
      fontSize: 11,
      fill: '#9ca3af'
    }
  };
  const yAxis = {
    ...axis,
    width: 46,
    tickFormatter: v => `${Math.round(v / 1000)}k`
  };
  const margins = {
    top: 5,
    right: 12,
    left: 0,
    bottom: 5
  };
  function CustomTooltip({
    active,
    payload,
    label
  }) {
    if (!active || !payload || !payload.length) return null;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        padding: '10px 12px',
        minWidth: 150
      }
    }, label != null && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 600,
        marginBottom: 6,
        color: 'var(--foreground)'
      }
    }, label), payload.map((p, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        marginTop: i ? 4 : 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: p.color || p.payload && p.payload.fill,
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--muted-foreground)'
      }
    }, p.name), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 'auto',
        fontWeight: 600,
        color: 'var(--foreground)',
        fontVariantNumeric: 'tabular-nums'
      }
    }, formatCOP(p.value)))));
  }
  const legendStyle = {
    fontSize: 12,
    paddingTop: 12
  };
  function ChartCard({
    title,
    subtitle,
    icon: I,
    children
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "mt-card"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
      style: {
        fontSize: 18,
        fontWeight: 600,
        margin: 0
      }
    }, title), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 13,
        color: 'var(--muted-foreground)',
        margin: '4px 0 0'
      }
    }, subtitle)), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        padding: 9,
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-transfer)',
        color: 'var(--primary)'
      }
    }, /*#__PURE__*/React.createElement(I, {
      size: 20
    }))), children);
  }
  function CashFlow({
    dark
  }) {
    const {
      AreaChart,
      Area,
      XAxis,
      YAxis,
      CartesianGrid,
      Tooltip,
      Legend,
      ResponsiveContainer
    } = R();
    return /*#__PURE__*/React.createElement(ChartCard, {
      title: "Flujo de Caja",
      subtitle: "\xDAltimos 6 meses",
      icon: Activity
    }, /*#__PURE__*/React.createElement(ResponsiveContainer, {
      width: "100%",
      height: 300
    }, /*#__PURE__*/React.createElement(AreaChart, {
      data: monthlyData,
      margin: margins
    }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
      id: "gradIng",
      x1: "0",
      y1: "0",
      x2: "0",
      y2: "1"
    }, /*#__PURE__*/React.createElement("stop", {
      offset: "5%",
      stopColor: INCOME,
      stopOpacity: 0.3
    }), /*#__PURE__*/React.createElement("stop", {
      offset: "95%",
      stopColor: INCOME,
      stopOpacity: 0
    })), /*#__PURE__*/React.createElement("linearGradient", {
      id: "gradGas",
      x1: "0",
      y1: "0",
      x2: "0",
      y2: "1"
    }, /*#__PURE__*/React.createElement("stop", {
      offset: "5%",
      stopColor: EXPENSE,
      stopOpacity: 0.3
    }), /*#__PURE__*/React.createElement("stop", {
      offset: "95%",
      stopColor: EXPENSE,
      stopOpacity: 0
    }))), /*#__PURE__*/React.createElement(CartesianGrid, {
      strokeDasharray: "3 3",
      stroke: gridColor(dark)
    }), /*#__PURE__*/React.createElement(XAxis, _extends({
      dataKey: "month"
    }, axis)), /*#__PURE__*/React.createElement(YAxis, yAxis), /*#__PURE__*/React.createElement(Tooltip, {
      content: /*#__PURE__*/React.createElement(CustomTooltip, null),
      cursor: {
        stroke: 'var(--border-accent)'
      }
    }), /*#__PURE__*/React.createElement(Legend, {
      iconType: "circle",
      wrapperStyle: legendStyle
    }), /*#__PURE__*/React.createElement(Area, {
      type: "monotone",
      dataKey: "ingresos",
      name: "Ingresos",
      stroke: INCOME,
      strokeWidth: 2.5,
      fill: "url(#gradIng)",
      isAnimationActive: false
    }), /*#__PURE__*/React.createElement(Area, {
      type: "monotone",
      dataKey: "gastos",
      name: "Gastos",
      stroke: EXPENSE,
      strokeWidth: 2.5,
      fill: "url(#gradGas)",
      isAnimationActive: false
    }))));
  }
  function MonthlyBars({
    dark
  }) {
    const {
      BarChart,
      Bar,
      XAxis,
      YAxis,
      CartesianGrid,
      Tooltip,
      Legend,
      ResponsiveContainer
    } = R();
    return /*#__PURE__*/React.createElement(ChartCard, {
      title: "Comparaci\xF3n Mensual",
      subtitle: "\xDAltimos 6 meses",
      icon: BarChart3
    }, /*#__PURE__*/React.createElement(ResponsiveContainer, {
      width: "100%",
      height: 280
    }, /*#__PURE__*/React.createElement(BarChart, {
      data: monthlyData,
      margin: margins
    }, /*#__PURE__*/React.createElement(CartesianGrid, {
      strokeDasharray: "3 3",
      stroke: gridColor(dark)
    }), /*#__PURE__*/React.createElement(XAxis, _extends({
      dataKey: "month"
    }, axis)), /*#__PURE__*/React.createElement(YAxis, yAxis), /*#__PURE__*/React.createElement(Tooltip, {
      content: /*#__PURE__*/React.createElement(CustomTooltip, null),
      cursor: {
        fill: 'var(--surface-transfer)',
        opacity: 0.4
      }
    }), /*#__PURE__*/React.createElement(Legend, {
      iconType: "circle",
      wrapperStyle: legendStyle
    }), /*#__PURE__*/React.createElement(Bar, {
      dataKey: "ingresos",
      name: "Ingresos",
      fill: INCOME,
      radius: [6, 6, 0, 0],
      isAnimationActive: false
    }), /*#__PURE__*/React.createElement(Bar, {
      dataKey: "gastos",
      name: "Gastos",
      fill: EXPENSE,
      radius: [6, 6, 0, 0],
      isAnimationActive: false
    }))));
  }
  function CategoryDonut() {
    const {
      PieChart,
      Pie,
      Cell,
      Tooltip,
      ResponsiveContainer
    } = R();
    const total = categoryData.reduce((s, d) => s + d.value, 0);
    return /*#__PURE__*/React.createElement(ChartCard, {
      title: "Gastos por Categor\xEDa",
      subtitle: "Distribuci\xF3n actual",
      icon: PieIcon
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative',
        width: '100%',
        maxWidth: 300,
        margin: '0 auto'
      }
    }, /*#__PURE__*/React.createElement(ResponsiveContainer, {
      width: "100%",
      height: 220
    }, /*#__PURE__*/React.createElement(PieChart, null, /*#__PURE__*/React.createElement(Pie, {
      data: categoryData,
      cx: "50%",
      cy: "50%",
      innerRadius: 55,
      outerRadius: 78,
      paddingAngle: 2,
      dataKey: "value",
      stroke: "none",
      isAnimationActive: false
    }, categoryData.map((_, i) => /*#__PURE__*/React.createElement(Cell, {
      key: i,
      fill: CHART_COLORS[i % CHART_COLORS.length]
    }))), /*#__PURE__*/React.createElement(Tooltip, {
      content: /*#__PURE__*/React.createElement(CustomTooltip, null)
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: 'var(--muted-foreground)'
      }
    }, "Total"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 16,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums'
      }
    }, formatCOP(total)))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginTop: 16
      }
    }, categoryData.slice(0, 5).map((item, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: CHART_COLORS[i % CHART_COLORS.length]
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--muted-foreground)'
      }
    }, item.name)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 500,
        fontVariantNumeric: 'tabular-nums'
      }
    }, formatCOP(item.value))))));
  }
  function YearlyTrend({
    dark
  }) {
    const {
      LineChart,
      Line,
      XAxis,
      YAxis,
      CartesianGrid,
      Tooltip,
      Legend,
      ResponsiveContainer
    } = R();
    return /*#__PURE__*/React.createElement(ChartCard, {
      title: "Tendencia Anual",
      subtitle: "Resumen por a\xF1o",
      icon: Trend
    }, /*#__PURE__*/React.createElement(ResponsiveContainer, {
      width: "100%",
      height: 280
    }, /*#__PURE__*/React.createElement(LineChart, {
      data: yearlyData,
      margin: margins
    }, /*#__PURE__*/React.createElement(CartesianGrid, {
      strokeDasharray: "3 3",
      stroke: gridColor(dark)
    }), /*#__PURE__*/React.createElement(XAxis, _extends({
      dataKey: "a\xF1o"
    }, axis)), /*#__PURE__*/React.createElement(YAxis, yAxis), /*#__PURE__*/React.createElement(Tooltip, {
      content: /*#__PURE__*/React.createElement(CustomTooltip, null),
      cursor: {
        stroke: 'var(--border-accent)'
      }
    }), /*#__PURE__*/React.createElement(Legend, {
      iconType: "circle",
      wrapperStyle: legendStyle
    }), /*#__PURE__*/React.createElement(Line, {
      type: "monotone",
      dataKey: "ingresos",
      name: "Ingresos",
      stroke: INCOME,
      strokeWidth: 3,
      dot: {
        fill: INCOME,
        r: 5
      },
      isAnimationActive: false
    }), /*#__PURE__*/React.createElement(Line, {
      type: "monotone",
      dataKey: "gastos",
      name: "Gastos",
      stroke: EXPENSE,
      strokeWidth: 3,
      dot: {
        fill: EXPENSE,
        r: 5
      },
      isAnimationActive: false
    }))));
  }
  function InterestsCard() {
    const s = interestSummary;
    const items = [{
      label: 'Interés pagado',
      value: s.paid,
      hint: 'en lo corrido del año'
    }, {
      label: 'Interés proyectado',
      value: s.projected,
      hint: 'cuotas restantes'
    }, {
      label: 'Capital en cuotas',
      value: s.principal,
      hint: `${s.cards} tarjeta`
    }];
    return /*#__PURE__*/React.createElement("div", {
      className: "mt-card",
      style: {
        borderColor: 'var(--border)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
      style: {
        fontSize: 18,
        fontWeight: 600,
        margin: 0
      }
    }, "Intereses de tarjetas"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 13,
        color: 'var(--muted-foreground)',
        margin: '4px 0 0'
      }
    }, "Costo de financiaci\xF3n con tasa E.A.")), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        padding: 9,
        borderRadius: 'var(--radius-md)',
        background: 'var(--warning-muted)',
        color: 'var(--warning-text)'
      }
    }, /*#__PURE__*/React.createElement(Percent, {
      size: 20
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 14
      }
    }, items.map((it, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        padding: 16,
        borderRadius: 'var(--radius-lg)',
        background: i === 0 ? 'var(--warning-muted)' : 'var(--muted)',
        border: `1px solid ${i === 0 ? 'var(--warning)' : 'var(--border)'}`
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: 'var(--muted-foreground)',
        marginBottom: 6
      }
    }, it.label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 22,
        fontWeight: 700,
        color: i === 0 ? 'var(--warning-text)' : 'var(--foreground)',
        fontVariantNumeric: 'tabular-nums'
      }
    }, formatCOP(it.value)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--muted-foreground)',
        marginTop: 4
      }
    }, it.hint)))));
  }
  function StatsView({
    dark
  }) {
    const {
      isMobile
    } = window.useViewport();
    if (!window.Recharts) {
      return /*#__PURE__*/React.createElement("div", {
        className: "mt-card",
        style: {
          textAlign: 'center',
          padding: 48,
          color: 'var(--muted-foreground)'
        }
      }, "Cargando gr\xE1ficos\u2026");
    }
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 24
      }
    }, /*#__PURE__*/React.createElement(CashFlow, {
      dark: dark
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: 24
      }
    }, /*#__PURE__*/React.createElement(MonthlyBars, {
      dark: dark
    }), /*#__PURE__*/React.createElement(CategoryDonut, null)), /*#__PURE__*/React.createElement(YearlyTrend, {
      dark: dark
    }), /*#__PURE__*/React.createElement(InterestsCard, null));
  }
  window.MTStats = {
    StatsView
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/moneytrack/stats.jsx", error: String((e && e.message) || e) }); }

// ui_kits/moneytrack/views.jsx
try { (() => {
// MoneyTrack UI kit — Préstamos (debts), Presupuestos (budgets), Metas (goals)
(function () {
  const {
    Icon
  } = window;
  const {
    formatCOP,
    savingsGoals,
    debts,
    budgets
  } = window.MTData;
  const DS = () => window.MoneyTrackDesignSystem_daa395;
  const Target = Icon('Target'),
    Trophy = Icon('Trophy'),
    Check = Icon('CheckCircle2'),
    Cal = Icon('Calendar'),
    Plus = Icon('Plus'),
    Dollar = Icon('DollarSign'),
    Trash = Icon('Trash2'),
    HandCoins = Icon('HandCoins'),
    ArrowDown = Icon('ArrowDownLeft'),
    ArrowUp = Icon('ArrowUpRight'),
    Pie = Icon('PieChart'),
    Wallet = Icon('Wallet'),
    TrendingDown = Icon('TrendingDown');

  // Small summary tile (semantic surfaces, flexible label) ──
  const SURF = {
    primary: {
      bg: 'var(--surface-primary)',
      fg: 'var(--primary)',
      val: 'var(--primary-text)'
    },
    success: {
      bg: 'var(--surface-income)',
      fg: 'var(--success)',
      val: 'var(--success-text)'
    },
    danger: {
      bg: 'var(--surface-expense)',
      fg: 'var(--destructive)',
      val: 'var(--destructive-text)'
    },
    warning: {
      bg: 'var(--surface-pending)',
      fg: 'var(--warning)',
      val: 'var(--warning-text)'
    },
    info: {
      bg: 'var(--surface-info)',
      fg: 'var(--info)',
      val: 'var(--info-text)'
    }
  };
  function MiniStat({
    tone = 'primary',
    icon: I,
    label,
    value,
    neutralValue
  }) {
    const s = SURF[tone];
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 16,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        padding: 8,
        borderRadius: 'var(--radius-md)',
        background: s.bg,
        color: s.fg,
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement(I, {
      size: 18
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--muted-foreground)',
        fontWeight: 500
      }
    }, label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 20,
        fontWeight: 700,
        marginTop: 2,
        color: neutralValue ? 'var(--foreground)' : s.val,
        fontVariantNumeric: 'tabular-nums'
      }
    }, value));
  }
  function ViewHeader({
    title,
    subtitle,
    action
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 20
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 20,
        fontWeight: 700,
        margin: 0
      }
    }, title), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 13,
        color: 'var(--muted-foreground)',
        margin: '4px 0 0'
      }
    }, subtitle)), /*#__PURE__*/React.createElement("button", {
      className: "mt-btn mt-btn-primary",
      style: {
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement(Plus, {
      size: 16
    }), " ", action));
  }
  function IconAction({
    label,
    color,
    bg,
    icon: I
  }) {
    return /*#__PURE__*/React.createElement("button", {
      "aria-label": label,
      title: label,
      className: "mt-btn",
      style: {
        minHeight: 36,
        minWidth: 36,
        padding: 8,
        background: bg,
        color
      }
    }, /*#__PURE__*/React.createElement(I, {
      size: 15
    }));
  }

  // ── Metas (Goals) ──────────────────────────────────────────
  function GoalsView() {
    const {
      ProgressBar
    } = DS();
    const {
      isMobile
    } = window.useViewport();
    const active = savingsGoals;
    const totalTarget = active.reduce((s, g) => s + g.target, 0);
    const totalSaved = active.reduce((s, g) => s + g.current, 0);
    return /*#__PURE__*/React.createElement("div", {
      className: "mt-card"
    }, /*#__PURE__*/React.createElement(ViewHeader, {
      title: "Metas de Ahorro",
      subtitle: "Define y alcanza tus objetivos financieros",
      action: "Nueva meta"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 22
      }
    }, /*#__PURE__*/React.createElement(MiniStat, {
      tone: "primary",
      icon: Target,
      label: "Metas activas",
      value: active.length
    }), /*#__PURE__*/React.createElement(MiniStat, {
      tone: "info",
      icon: Target,
      label: "Objetivo total",
      value: formatCOP(totalTarget)
    }), /*#__PURE__*/React.createElement(MiniStat, {
      tone: "success",
      icon: Check,
      label: "Ahorrado",
      value: formatCOP(totalSaved)
    }), /*#__PURE__*/React.createElement(MiniStat, {
      tone: "warning",
      icon: Trophy,
      label: "Completadas",
      value: 1
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }
    }, active.map(g => {
      const pct = Math.round(g.current / g.target * 100);
      const done = pct >= 100;
      return /*#__PURE__*/React.createElement("div", {
        key: g.id,
        style: {
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--card)',
          padding: 16,
          boxShadow: 'var(--shadow-sm)'
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
          marginBottom: 10
        }
      }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
        style: {
          margin: 0,
          fontSize: 15,
          fontWeight: 600
        }
      }, g.name), /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 4,
          fontSize: 12,
          color: g.daysLeft < 30 ? 'var(--warning-text)' : 'var(--muted-foreground)'
        }
      }, /*#__PURE__*/React.createElement(Cal, {
        size: 12
      }), " ", g.daysLeft, " d\xEDas restantes")), /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          gap: 6
        }
      }, /*#__PURE__*/React.createElement(IconAction, {
        label: "Agregar ahorro",
        icon: Dollar,
        bg: "var(--surface-income)",
        color: "var(--success-text)"
      }), /*#__PURE__*/React.createElement(IconAction, {
        label: "Eliminar meta",
        icon: Trash,
        bg: "var(--surface-expense)",
        color: "var(--destructive-text)"
      }))), /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          marginBottom: 10
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--primary-text)',
          fontVariantNumeric: 'tabular-nums'
        }
      }, formatCOP(g.current)), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          color: 'var(--muted-foreground)'
        }
      }, "de ", formatCOP(g.target))), /*#__PURE__*/React.createElement(ProgressBar, {
        value: g.current,
        max: g.target,
        tone: done ? 'success' : 'primary'
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: 'var(--muted-foreground)',
          marginTop: 8
        }
      }, /*#__PURE__*/React.createElement("span", null, pct, "% completado"), /*#__PURE__*/React.createElement("span", null, "Faltan ", formatCOP(Math.max(g.target - g.current, 0)))), /*#__PURE__*/React.createElement("p", {
        style: {
          fontSize: 12,
          color: 'var(--info-text)',
          margin: '8px 0 0'
        }
      }, "Ahorra ", formatCOP(g.suggestedMonthly), "/mes para alcanzar tu meta a tiempo."));
    })));
  }

  // ── Préstamos (Debts) ──────────────────────────────────────
  function DebtsView() {
    const {
      ProgressBar
    } = DS();
    const {
      isMobile
    } = window.useViewport();
    const owed = debts.filter(d => d.type === 'owed').reduce((s, d) => s + (d.total - d.paid), 0);
    const lent = debts.filter(d => d.type === 'lent').reduce((s, d) => s + (d.total - d.paid), 0);
    const monthly = debts.reduce((s, d) => s + d.monthly, 0);
    return /*#__PURE__*/React.createElement("div", {
      className: "mt-card"
    }, /*#__PURE__*/React.createElement(ViewHeader, {
      title: "Pr\xE9stamos",
      subtitle: "Lo que debes y lo que te deben",
      action: "Nuevo pr\xE9stamo"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 22
      }
    }, /*#__PURE__*/React.createElement(MiniStat, {
      tone: "danger",
      icon: ArrowUp,
      label: "Debes",
      value: formatCOP(owed)
    }), /*#__PURE__*/React.createElement(MiniStat, {
      tone: "success",
      icon: ArrowDown,
      label: "Te deben",
      value: formatCOP(lent)
    }), /*#__PURE__*/React.createElement(MiniStat, {
      tone: "warning",
      icon: Cal,
      label: "Cuota mensual",
      value: formatCOP(monthly)
    }), /*#__PURE__*/React.createElement(MiniStat, {
      tone: "primary",
      icon: HandCoins,
      label: "Pr\xE9stamos activos",
      value: debts.length
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }
    }, debts.map(d => {
      const isOwed = d.type === 'owed';
      const remaining = d.total - d.paid;
      const pct = Math.round(d.paid / d.total * 100);
      return /*#__PURE__*/React.createElement("div", {
        key: d.id,
        style: {
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--card)',
          padding: '16px 16px 16px 20px',
          boxShadow: 'var(--shadow-sm)'
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          background: isOwed ? 'var(--destructive)' : 'var(--success)'
        }
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
          marginBottom: 10
        }
      }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap'
        }
      }, /*#__PURE__*/React.createElement("h3", {
        style: {
          margin: 0,
          fontSize: 15,
          fontWeight: 600
        }
      }, d.name), /*#__PURE__*/React.createElement("span", {
        className: `mt-badge ${isOwed ? 'mt-badge-danger' : 'mt-badge-success'}`
      }, isOwed ? 'Debes' : 'Te deben')), /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          marginTop: 6,
          fontSize: 12,
          color: 'var(--muted-foreground)'
        }
      }, /*#__PURE__*/React.createElement("span", null, "Pr\xF3ximo pago: ", /*#__PURE__*/React.createElement("b", {
        style: {
          color: 'var(--foreground)'
        }
      }, d.nextDate)), /*#__PURE__*/React.createElement("span", null, "Cuota: ", /*#__PURE__*/React.createElement("b", {
        style: {
          color: 'var(--foreground)'
        }
      }, formatCOP(d.monthly))), d.rate && /*#__PURE__*/React.createElement("span", null, "Tasa E.A.: ", /*#__PURE__*/React.createElement("b", {
        style: {
          color: 'var(--primary-text)'
        }
      }, d.rate.toFixed(1).replace('.', ','), "%")))), /*#__PURE__*/React.createElement("div", {
        style: {
          textAlign: 'right',
          flexShrink: 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          color: 'var(--muted-foreground)'
        }
      }, "Saldo"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 19,
          fontWeight: 700,
          color: isOwed ? 'var(--destructive-text)' : 'var(--success-text)',
          fontVariantNumeric: 'tabular-nums'
        }
      }, formatCOP(remaining)))), /*#__PURE__*/React.createElement(ProgressBar, {
        value: d.paid,
        max: d.total,
        tone: isOwed ? 'primary' : 'success',
        label: "Pagado",
        detail: `${formatCOP(d.paid)} / ${formatCOP(d.total)} · ${pct}%`
      }));
    })));
  }

  // ── Presupuestos (Budgets) ─────────────────────────────────
  function BudgetsView() {
    const {
      ProgressBar
    } = DS();
    const {
      isMobile
    } = window.useViewport();
    const totalLimit = budgets.reduce((s, b) => s + b.limit, 0);
    const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
    const available = totalLimit - totalSpent;
    return /*#__PURE__*/React.createElement("div", {
      className: "mt-card"
    }, /*#__PURE__*/React.createElement(ViewHeader, {
      title: "Presupuestos",
      subtitle: "Controla tu gasto por categor\xEDa este mes",
      action: "Nuevo presupuesto"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: 12,
        marginBottom: 22
      }
    }, /*#__PURE__*/React.createElement(MiniStat, {
      tone: "primary",
      icon: Pie,
      label: "Presupuesto total",
      value: formatCOP(totalLimit)
    }), /*#__PURE__*/React.createElement(MiniStat, {
      tone: "danger",
      icon: TrendingDown,
      label: "Gastado",
      value: formatCOP(totalSpent)
    }), /*#__PURE__*/React.createElement(MiniStat, {
      tone: "success",
      icon: Wallet,
      label: "Disponible",
      value: formatCOP(available)
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }
    }, budgets.map(b => {
      const over = b.spent > b.limit;
      const pct = Math.round(b.spent / b.limit * 100);
      return /*#__PURE__*/React.createElement("div", {
        key: b.id
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontWeight: 600,
          fontSize: 14
        }
      }, b.category), over && /*#__PURE__*/React.createElement("span", {
        className: "mt-badge mt-badge-danger"
      }, "Excedido"), !over && pct >= 90 && /*#__PURE__*/React.createElement("span", {
        className: "mt-badge mt-badge-warning"
      }, "Casi al l\xEDmite")), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 13,
          color: 'var(--muted-foreground)',
          fontVariantNumeric: 'tabular-nums'
        }
      }, /*#__PURE__*/React.createElement("b", {
        style: {
          color: over ? 'var(--destructive-text)' : 'var(--foreground)'
        }
      }, formatCOP(b.spent)), " / ", formatCOP(b.limit))), /*#__PURE__*/React.createElement(ProgressBar, {
        value: b.spent,
        max: b.limit,
        autoWarn: true
      }));
    })));
  }
  window.MTViews = {
    GoalsView,
    DebtsView,
    BudgetsView
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/moneytrack/views.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.TransactionRow = __ds_scope.TransactionRow;

})();
