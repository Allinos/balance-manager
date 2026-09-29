/**
 * Toast notifications and promise-based confirmation dialogs.
 *
 *   const toast = useToast();   toast.success('Saved');
 *   const confirm = useConfirm();
 *   if (await confirm({ title: 'Delete this document?', message: '...', danger: true })) { ... }
 *
 * With `input: { label, placeholder }` the dialog also asks for text and resolves
 * to that text (possibly '') when confirmed, or `false` when cancelled.
 */

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Modal from '../components/Modal.jsx';

const UiContext = createContext(null);

export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [text, setText] = useState('');
  const resolver = useRef(null);

  const push = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3200);
  }, []);

  const toast = useRef({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }).current;

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setText('');
        setDialog({ confirmText: 'Confirm', cancelText: 'Cancel', ...opts });
      }),
    [],
  );

  const close = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    setDialog(null);
  };

  return (
    <UiContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts no-print" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>
      {dialog && (
        <Modal title={dialog.title} onClose={() => close(false)} size="sm">
          {dialog.message && <p className="dialog-message">{dialog.message}</p>}
          {dialog.input && (
            <label className="field">
              <span className="field-label">{dialog.input.label}</span>
              <input
                className="input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={dialog.input.placeholder}
                maxLength={300}
                autoFocus
                data-testid="confirm-input"
                onKeyDown={(e) => e.key === 'Enter' && close(text.trim())}
              />
            </label>
          )}
          <div className="modal-actions">
            <button className="btn" onClick={() => close(false)}>
              {dialog.cancelText}
            </button>
            <button className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(dialog.input ? text.trim() : true)} autoFocus={!dialog.input} data-testid="confirm-ok">
              {dialog.confirmText}
            </button>
          </div>
        </Modal>
      )}
    </UiContext.Provider>
  );
}

export const useToast = () => useContext(UiContext).toast;
export const useConfirm = () => useContext(UiContext).confirm;
