/** Small UI building blocks for DocGen Mobile. */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Icon from './Icon.jsx';

export function Header({ title, onBack, actions }) {
  return (
    <header className={`app-header ${onBack ? 'with-back' : ''}`}>
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="Back" data-testid="back">
          <Icon name="back" />
        </button>
      )}
      <h1>{title}</h1>
      {actions}
    </header>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export const Input = ({ value, onChange, ...rest }) => <input className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
export const TextArea = ({ value, onChange, ...rest }) => <textarea className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
export function Select({ value, onChange, options, ...rest }) {
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {options.map((o) => (typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}
export function Toggle({ checked, onChange, label, hint, ...rest }) {
  return (
    <label className="toggle-row">
      <span>
        {label}
        {hint && <div className="field-hint">{hint}</div>}
      </span>
      <input type="checkbox" className="switch" checked={!!checked} onChange={(e) => onChange(e.target.checked)} {...rest} />
    </label>
  );
}

/** Bottom sheet (closes on backdrop tap, Back button or Esc). */
export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-handle" />
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ toast + confirm
const UiCtx = createContext(null);

export function UiProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [confirmState, setConfirm] = useState(null);
  const show = useCallback((message, tone = 'good') => {
    const id = Math.random();
    setToast({ id, message, tone });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2800);
  }, []);
  const confirm = useCallback((options) => new Promise((resolve) => setConfirm({ ...options, resolve })), []);
  const close = (v) => {
    confirmState.resolve(v);
    setConfirm(null);
  };
  return (
    <UiCtx.Provider value={{ toast: show, confirm }}>
      {children}
      {toast && (
        <div className={`toast ${toast.tone === 'bad' ? 'bad' : ''}`} role="status" data-testid="toast">
          {toast.message}
        </div>
      )}
      {confirmState && (
        <Sheet title={confirmState.title} onClose={() => close(false)}>
          {confirmState.message && <p className="muted">{confirmState.message}</p>}
          <div className="grid-2" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => close(false)}>
              Cancel
            </button>
            <button className={`btn ${confirmState.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} data-testid="confirm-ok">
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
/** Routes like #/documents, #/doc/12, #/doc/new/TAX_INVOICE. */
export function useRoute() {
  const read = () => (window.location.hash.replace(/^#/, '') || '/').split('?')[0];
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => {
      setPath(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}
export const go = (path, { replace = false } = {}) => {
  if (replace) window.location.replace(`#${path}`);
  else window.location.hash = path;
};
export const back = (fallback = '/') => (window.history.length > 1 ? window.history.back() : go(fallback, { replace: true }));
