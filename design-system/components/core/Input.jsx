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

const chevron =
  "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")";

/**
 * Select — same shell as Input with a chevron affordance.
 */
export function Select({ label, id, children, className = '', style = {}, ...props }) {
  const auto = React.useId();
  const fieldId = id || `sel-${auto}`;
  return (
    <div style={{ width: '100%' }}>
      {label && <label htmlFor={fieldId} className="mt-label">{label}</label>}
      <select
        id={fieldId}
        className={`mt-input${className ? ' ' + className : ''}`}
        style={{
          cursor: 'pointer',
          paddingRight: '2.5rem',
          appearance: 'none',
          WebkitAppearance: 'none',
          backgroundImage: chevron,
          backgroundPosition: 'right 0.75rem center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '1.25em 1.25em',
          ...style,
        }}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
