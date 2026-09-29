/**
 * Status badge with a small pencil. Clicking the pencil opens a compact
 * selector with the statuses allowed for this document type; choosing one
 * saves immediately. Cancelling/voiding asks for confirmation and a reason
 * (kept in the document history).
 */

import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { StatusBadge } from './Common.jsx';
import { statusesFor, statusLabel } from '../config/documentTypes.js';
import { setDocumentStatus } from '../services/documentService.js';
import { useToast } from '../hooks/useUi.jsx';

export default function StatusEditor({ doc, onChanged, disabled = false }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(null); // status awaiting a cancel reason
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => root.current && !root.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const save = async (status, note = '') => {
    setBusy(true);
    try {
      await setDocumentStatus(doc.id, status, note);
      toast.success(`${doc.document_number}: ${statusLabel(doc.document_type, status)}`);
      setOpen(false);
      setPending(null);
      setReason('');
      onChanged?.(status);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const choose = (status) => {
    if (status === doc.status) return setOpen(false);
    if (status === 'CANCELLED' || status === 'VOID') return setPending(status);
    return save(status);
  };

  return (
    <span className="status-editor" ref={root}>
      <StatusBadge status={doc.status} type={doc.document_type} />
      {!disabled && (
        <button
          type="button"
          className="icon-btn status-pencil"
          title="Change status"
          aria-label={`Change status of ${doc.document_number}`}
          onClick={(e) => {
            e.stopPropagation();
            setUp(root.current.getBoundingClientRect().bottom + 260 > window.innerHeight);
            setOpen((o) => !o);
            setPending(null);
          }}
          data-testid={`status-edit-${doc.id}`}
        >
          <Icon name="edit" size={13} />
        </button>
      )}
      {open && (
        <div className={`status-pop ${up ? 'up' : ''}`} role="dialog" aria-label="Change status" onClick={(e) => e.stopPropagation()}>
          {pending ? (
            <form
              className="status-cancel"
              onSubmit={(e) => {
                e.preventDefault();
                save(pending, reason);
              }}
            >
              <strong>Mark as {statusLabel(doc.document_type, pending).toLowerCase()}?</strong>
              <p className="muted small">The document is kept for your records and clearly marked. This is noted in its history.</p>
              <input className="input" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              <div className="row gap end">
                <button type="button" className="btn btn-sm" onClick={() => setPending(null)}>
                  Back
                </button>
                <button className="btn btn-sm btn-danger" disabled={busy} data-testid="status-confirm-cancel">
                  Confirm
                </button>
              </div>
            </form>
          ) : (
            <ul className="status-options">
              {statusesFor(doc.document_type, doc.status).map((s) => (
                <li key={s}>
                  <button type="button" className={`status-option ${s === doc.status ? 'current' : ''}`} onClick={() => choose(s)} disabled={busy} data-testid={`status-option-${s}`}>
                    <StatusBadge status={s} type={doc.document_type} />
                    {s === doc.status && <Icon name="check" size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </span>
  );
}
