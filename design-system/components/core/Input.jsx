import React from 'react';

/**
 * Input — labelled text field. All states (hover, focus, disabled, error) live
 * in the `.mt-input` classes; this component maps props to them and wires
 * accessibility (label association, aria-invalid + aria-describedby).
 */
export function Input({ label, hint, error, id, className = '', ...props }) {
  const auto = React.useId();
  const fieldId = id || `in-${auto}`;
  const msgId = (hint || error) ? `${fieldId}-msg` : undefined;
  return (
    <div style={{ width: '100%' }}>
      {label && <label htmlFor={fieldId} className="mt-label">{label}</label>}
      <input
        id={fieldId}
        className={`mt-input${error ? ' mt-input--error' : ''}${className ? ' ' + className : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={msgId}
        {...props}
      />
      {(hint || error) && (
        <p id={msgId} className={error ? 'mt-field-error' : 'mt-field-hint'}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

// Chevron como máscara: el color lo aporta `currentColor` del <select>
// (var(--foreground)), así se adapta a claro/oscuro sin hex hardcodeados.
// (currentColor no resuelve dentro de un background-image data-uri, por eso mask.)
const chevronMask =
  "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='black' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")";

/**
 * Select — same shell as Input with a chevron affordance.
 */
export function Select({ label, id, children, className = '', style = {}, ...props }) {
  const auto = React.useId();
  const fieldId = id || `sel-${auto}`;
  return (
    <div style={{ width: '100%' }}>
      {label && <label htmlFor={fieldId} className="mt-label">{label}</label>}
      <div style={{ position: 'relative', color: 'var(--muted-foreground)' }}>
        <select
          id={fieldId}
          className={`mt-input${className ? ' ' + className : ''}`}
          style={{
            cursor: 'pointer',
            paddingRight: '2.5rem',
            appearance: 'none',
            WebkitAppearance: 'none',
            ...style,
          }}
          {...props}
        >
          {children}
        </select>
        {/* Chevron pintado con currentColor (var(--muted-foreground)) vía máscara:
            theme-aware sin literales hex y sin duplicar por tema. */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '1.25em',
            height: '1.25em',
            backgroundColor: 'currentColor',
            WebkitMaskImage: chevronMask,
            maskImage: chevronMask,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
