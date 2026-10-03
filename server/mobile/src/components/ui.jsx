/** UI building blocks for DocGen Mobile (touch-first). */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

export { NumberInput } from '@desktop/components/Form.jsx';
export { StatusBadge } from '@desktop/components/Common.jsx';

export function Header({ title, subtitle, onBack, actions }) {
  return (
    <header className={`app-header no-print ${onBack ? 'with-back' : ''}`}>
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="Back" data-testid="back">
          <Icon name="back" />
        </button>
      )}
      <div className="app-header-title">
        <h1>{title}</h1>
        {subtitle && <span className="small muted">{subtitle}</span>}
      </div>
      {actions}
    </header>
  );
}

/** A labelled field. `help` shows a short explanation under the label (no hover on phones). */
export function Field({ label, hint, help, required, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      {label && (
        <span className="field-label">
          {label}
          {required && <span className="req"> *</span>}
        </span>
      )}
      {children}
      {(hint || help) && <span className="field-hint">{hint || help}</span>}
    </label>
  );
}

export const Input = ({ value, onChange, ...rest }) => <input className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
export const TextArea = ({ value, onChange, rows = 3, ...rest }) => (
  <textarea className="input" rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
);
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
    <label className="toggle-row">
      <span>
        {label}
        {hint && <span className="field-hint block">{hint}</span>}
      </span>
      <input type="checkbox" className="switch" checked={!!checked} onChange={(e) => onChange(e.target.checked)} {...rest} />
    </label>
  );
}
export function Segmented({ value, onChange, options, testId }) {
  return (
    <div className="segmented" role="tablist" data-testid={testId}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)} data-testid={testId ? `${testId}-${o.value || 'all'}` : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon = 'documents', title, message, action }) {
  return (
    <div className="empty">
      <div className="icon-wrap">
        <Icon name={icon} size={28} />
      </div>
      <strong>{title}</strong>
      {message && <p className="small">{message}</p>}
      {action}
    </div>
  );
}

export const Spinner = () => (
  <div className="spinner-wrap" role="status">
    <span className="spinner" aria-hidden="true" />
  </div>
);

/** Bottom sheet (closes on backdrop tap or Esc). `full` = full-screen panel. Rendered on <body>, outside any form label. */
export function Sheet({ title, onClose, children, full = false, actions, testId }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('sheet-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('sheet-open');
    };
  }, [onClose]);
  return createPortal(
    <div className={`sheet-backdrop no-print ${full ? 'full' : ''}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label={title} data-testid={testId}>
        {full ? (
          <div className="sheet-top">
            <button className="icon-btn" onClick={onClose} aria-label="Close" data-testid="sheet-close">
              <Icon name="x" />
            </button>
            <h2>{title}</h2>
            {actions}
          </div>
        ) : (
          <>
            <div className="sheet-handle" />
            {title && <h2>{title}</h2>}
          </>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** List of actions in a bottom sheet (the phone version of a "⋯" menu). */
export function ActionSheet({ title, items, onClose }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="action-list">
        {items.filter(Boolean).map((it) =>
          it.divider ? (
            <hr key={it.key} />
          ) : (
            <button
              key={it.label}
              className={`action-item ${it.danger ? 'danger' : ''}`}
              disabled={it.disabled}
              onClick={() => {
                onClose();
                it.onClick();
              }}
              data-testid={it.testId}
            >
              {it.icon && <Icon name={it.icon} size={20} />}
              <span>{it.label}</span>
            </button>
          ),
        )}
      </div>
    </Sheet>
  );
}

const flatOptions = (options) => options.flatMap((o) => (o.group ? o.options.map((v) => (typeof v === 'string' ? { value: v, label: v, group: o.group } : { ...v, group: o.group })) : [typeof o === 'string' ? { value: o, label: o } : o]));

/**
 * A value chosen from a searchable list in a sheet — for states, units, GST rates, currencies, categories …
 * `creatable` accepts what the user typed when it is not in the list.
 */
export function Picker({ value, onChange, options, placeholder = 'Choose…', title, creatable = false, clearable = false, testId, disabled }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const all = useMemo(() => flatOptions(options), [options]);
  const current = all.find((o) => String(o.value) === String(value ?? ''));
  const query = q.trim().toLowerCase();
  const shown = query ? all.filter((o) => `${o.label} ${o.hint || ''}`.toLowerCase().includes(query)) : all;
  const choose = (v) => {
    onChange(v);
    setOpen(false);
    setQ('');
  };
  return (
    <>
      <button type="button" className={`input picker ${current || value ? '' : 'placeholder'}`} onClick={() => setOpen(true)} disabled={disabled} data-testid={testId}>
        <span>{current ? current.label : value || placeholder}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <Sheet title={title || placeholder} onClose={() => setOpen(false)} testId={testId ? `${testId}-sheet` : undefined}>
          {all.length > 8 || creatable ? (
            <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={creatable ? 'Search or type a new one' : 'Search'} data-testid={testId ? `${testId}-search` : undefined} />
          ) : null}
          <div className="picker-list">
            {creatable && query && !all.some((o) => String(o.label).toLowerCase() === query) && (
              <button type="button" className="picker-option" onClick={() => choose(q.trim())} data-testid={testId ? `${testId}-create` : undefined}>
                <Icon name="plus" size={16} /> Use “{q.trim()}”
              </button>
            )}
            {clearable && value && (
              <button type="button" className="picker-option muted" onClick={() => choose('')}>
                Clear
              </button>
            )}
            {shown.map((o, i) => (
              <div key={`${o.group || ''}${o.value}`}>
                {o.group && (i === 0 || shown[i - 1].group !== o.group) && <div className="picker-group">{o.group}</div>}
                <button type="button" className={`picker-option ${String(o.value) === String(value) ? 'current' : ''}`} onClick={() => choose(o.value)}>
                  <span>{o.label}</span>
                  {o.hint && <span className="muted small">{o.hint}</span>}
                  {String(o.value) === String(value) && <Icon name="check" size={16} />}
                </button>
              </div>
            ))}
            {!shown.length && !creatable && <p className="muted small center">Nothing found</p>}
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Text input with suggestions (saved customers, products) shown under it while typing. */
export function Suggest({ value, onChange, fetchOptions, onSelect, renderOption, placeholder, inputProps = {} }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (!open) return undefined;
    const n = ++seq.current;
    const t = setTimeout(() => {
      fetchOptions(String(value || '').trim())
        .then((r) => n === seq.current && setRows(r.slice(0, 8)))
        .catch(() => setRows([]));
    }, 120);
    return () => clearTimeout(t);
  }, [value, open, fetchOptions]);
  return (
    <div className="suggest">
      <input
        className="input"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        autoComplete="off"
        {...inputProps}
      />
      {open && rows.length > 0 && (
        <div className="suggest-list" role="listbox">
          {rows.map((r) => (
            <button
              type="button"
              key={r.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(r);
                setOpen(false);
              }}
            >
              {renderOption(r)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ toast + confirm
const UiCtx = createContext(null);

export function UiProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [confirmState, setConfirm] = useState(null);
  const [text, setText] = useState('');
  const show = useCallback((message, tone = 'good') => {
    const id = Math.random();
    setToast({ id, message, tone });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3200);
  }, []);
  /** Resolves true/false, or the typed text (possibly '') when `input` is given, or false when cancelled. */
  const confirm = useCallback((options) => {
    setText('');
    return new Promise((resolve) => setConfirm({ ...options, resolve }));
  }, []);
  const close = (v) => {
    confirmState.resolve(v);
    setConfirm(null);
  };
  return (
    <UiCtx.Provider value={{ toast: show, confirm }}>
      {children}
      {toast && (
        <div className={`toast no-print ${toast.tone === 'bad' ? 'bad' : ''}`} role="status" data-testid="toast">
          {toast.message}
        </div>
      )}
      {confirmState && (
        <Sheet title={confirmState.title} onClose={() => close(false)} testId="confirm">
          {confirmState.message && <p className="muted">{confirmState.message}</p>}
          {confirmState.input && (
            <Field label={confirmState.input.label}>
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={confirmState.input.placeholder} autoFocus data-testid="confirm-input" />
            </Field>
          )}
          <div className="grid-2" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => close(false)} data-testid="confirm-cancel">
              {confirmState.cancelLabel || 'Cancel'}
            </button>
            <button className={`btn ${confirmState.danger ? 'btn-danger-solid' : 'btn-primary'}`} onClick={() => close(confirmState.input ? text : true)} data-testid="confirm-ok">
              {confirmState.confirmLabel || 'OK'}
            </button>
          </div>
        </Sheet>
      )}
    </UiCtx.Provider>
  );
}
export const useUi = () => useContext(UiCtx);

// ------------------------------------------------------------------ hash router
const readHash = () => {
  const [path, query = ''] = (window.location.hash.replace(/^#/, '') || '/').split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(query)) };
};

/** Routes like #/documents?tab=files, #/doc/12, #/doc/new/TAX_INVOICE?from=3&mode=convert. */
export function useRoute() {
  const [route, setRoute] = useState(readHash);
  useEffect(() => {
    const on = () => {
      setRoute(readHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
export const go = (path, { replace = false } = {}) => {
  if (replace) window.location.replace(`#${path}`);
  else window.location.hash = path;
};
export const back = (fallback = '/') => (window.history.length > 1 ? window.history.back() : go(fallback, { replace: true }));
