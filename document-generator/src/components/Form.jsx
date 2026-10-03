/** Small form primitives with consistent styling. */

import { isValidDecimal } from '../utils/decimal.js';
import HelpTip from './HelpTip.jsx';

/** @param {{label?: string, hint?: string, help?: string, required?: boolean, className?: string, children: any}} props  `help` adds a small "?" with an explanation. */
export function Field({ label, hint, help, children, className = '', required = false }) {
  return (
    <label className={`field ${className}`}>
      {label && (
        <span className="field-label">
          {label}
          {required && <span className="req"> *</span>}
          {help && <HelpTip text={help} label={`About ${label}`} />}
        </span>
      )}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function TextInput({ value, onChange, ...rest }) {
  return <input className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function TextArea({ value, onChange, rows = 3, ...rest }) {
  return <textarea className="input" rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

/**
 * Decimal input: accepts digits and one dot while typing and keeps the raw string
 * (never converts to a float).
 */
export function NumberInput({ value, onChange, allowNegative = false, className = '', ...rest }) {
  const pattern = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  return (
    <input
      className={`input num ${className}`}
      inputMode="decimal"
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value.replace(/,/g, '');
        if (v === '' || pattern.test(v)) onChange(v);
      }}
      onBlur={(e) => {
        const v = e.target.value;
        if (v !== '' && !isValidDecimal(v)) onChange('0');
      }}
      {...rest}
    />
  );
}

export function Select({ value, onChange, options, ...rest }) {
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {options.map((o) =>
        typeof o === 'string' ? (
          <option key={o} value={o}>
            {o}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ),
      )}
    </select>
  );
}

export function Toggle({ checked, onChange, label, hint, ...rest }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} {...rest} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

/** Segmented control for 2–4 choices. */
export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
