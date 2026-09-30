/** Shared UI building blocks for the portal and the admin panel. */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export function Field({ label, hint, error, children, span }) {
  return (
    <label className={`field ${span ? 'span-2' : ''}`}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export const Input = ({ value, onChange, ...rest }) => (
  <input className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
);

export const Textarea = ({ value, onChange, rows = 3, ...rest }) => (
  <textarea className="input" rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
);

export function Select({ value, onChange, options, ...rest }) {
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

export const Check = ({ checked, onChange, label }) => (
  <label className="check">
    <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    <span>{label}</span>
  </label>
);

const STATUS_TONE = {
  active: 'good', paid: 'good', unused: 'info', pending: 'warn', created: 'warn', expired: 'bad', suspended: 'bad',
  revoked: 'bad', failed: 'bad', cancelled: 'muted', refunded: 'muted', inactive: 'muted',
};
export const Badge = ({ status, children }) => <span className={`badge tone-${STATUS_TONE[status] || 'muted'}`}>{children || status}</span>;

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Pagination({ page, pages, total, onPage }) {
  if (pages <= 1) return <div className="pager muted">{total} record{total === 1 ? '' : 's'}</div>;
  return (
    <div className="pager">
      <span className="muted">
        Page {page} of {pages} · {total} records
      </span>
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <button className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

export const Empty = ({ children }) => <div className="empty">{children}</div>;
export const Spinner = () => <div className="spinner-wrap"><span className="spinner" /></div>;

export function ErrorText({ error }) {
  if (!error) return null;
  return <div className="alert alert-error">{error.message || String(error)}</div>;
}

// ------------------------------------------------------------------ toasts
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'good') => {
    const id = Math.random();
    setItems((x) => [...x.slice(-2), { id, message, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status">
        {items.map((t) => <div key={t.id} className={`toast tone-${t.tone}`}>{t.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Load data with loading/error state and a reload function. */
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      setState({ data: await fn(), error: null, loading: false });
    } catch (error) {
      setState({ data: null, error, loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

export function CopyButton({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

// ----------------------------------------------------------------- dialogs
/**
 * In-app replacements for window.confirm / window.prompt:
 *   const dialog = useDialog();
 *   if (!(await dialog.confirm({ title, message, confirmLabel, danger }))) return;
 *   const ref = await dialog.prompt({ title, message, label });        // null when cancelled
 *   await dialog.show({ title, message, value });                      // e.g. a temporary password to copy
 */
const DialogCtx = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const open = useCallback((kind, options) => new Promise((resolve) => setDialog({ kind, ...options, resolve })), []);
  const api = useRef({
    confirm: (o) => open('confirm', o),
    prompt: (o) => open('prompt', o),
    show: (o) => open('show', o),
  }).current;
  const close = (result) => {
    dialog.resolve(result);
    setDialog(null);
  };
  return (
    <DialogCtx.Provider value={api}>
      {children}
      {dialog && <DialogView dialog={dialog} close={close} />}
    </DialogCtx.Provider>
  );
}

function DialogView({ dialog, close }) {
  const [value, setValue] = useState(dialog.defaultValue || '');
  const cancel = () => close(dialog.kind === 'confirm' ? false : dialog.kind === 'prompt' ? null : undefined);
  const ok = (e) => {
    e?.preventDefault();
    close(dialog.kind === 'confirm' ? true : dialog.kind === 'prompt' ? value : undefined);
  };
  return (
    <Modal title={dialog.title || 'Please confirm'} onClose={cancel}>
      <form className="form" onSubmit={ok} data-testid="dialog">
        {dialog.message && <p className="dialog-message">{dialog.message}</p>}
        {dialog.kind === 'prompt' && (
          <Field label={dialog.label}>
            <Input value={value} onChange={setValue} autoFocus data-testid="dialog-input" />
          </Field>
        )}
        {dialog.kind === 'show' && (
          <div className="code-box">
            <span className="code">{dialog.value}</span>
            <CopyButton text={dialog.value} />
          </div>
        )}
        <div className="row end">
          {dialog.kind !== 'show' && (
            <button type="button" className="btn" onClick={cancel}>
              Cancel
            </button>
          )}
          <button className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`} autoFocus={dialog.kind !== 'prompt'} data-testid="dialog-ok">
            {dialog.confirmLabel || (dialog.kind === 'show' ? 'Done' : 'OK')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export const useDialog = () => useContext(DialogCtx);
