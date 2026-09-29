import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import { Menu, Spinner, StatusBadge } from '../../components/Common.jsx';
import StatusEditor from '../../components/StatusEditor.jsx';
import { getType, normaliseTemplate, statusLabel, TEMPLATES, TYPE_MAP } from '../../config/documentTypes.js';
import { resolveDocSettings } from '../../config/defaults.js';
import { getDocument, setDocumentTemplate } from '../../services/documentService.js';
import { openExternal, printCurrent, savePdf } from '../../services/systemService.js';
import { formatDateTime } from '../../utils/dates.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import { useShortcuts } from '../../hooks/useShortcuts.js';
import { Link, useRouter } from '../../router/router.jsx';
import PagePreview from '../../renderer/PagePreview.jsx';
import { isCancelled, useDocumentActions } from './useDocumentActions.js';

function parseMeta(meta) {
  try {
    return typeof meta === 'string' ? JSON.parse(meta || '{}') : meta || {};
  } catch {
    return {};
  }
}

/** Simple contact panel for the document's customer/vendor. */
function ContactPanel({ doc, onClose }) {
  const toast = useToast();
  const phoneDigits = (doc.party_phone || '').replace(/[^\d+]/g, '');
  const waNumber = phoneDigits.replace(/^\+/, '').replace(/^0+/, '');
  const open = (url) => openExternal(url).catch((e) => toast.error(e.message));
  return (
    <Modal title="Contact" onClose={onClose} size="sm">
      <div className="contact-card">
        <div className="contact-avatar">
          <Icon name="user" size={22} />
        </div>
        <div>
          <strong>{doc.party_name}</strong>
          {doc.party_company && <div className="muted">{doc.party_company}</div>}
        </div>
      </div>
      <dl className="contact-list">
        <dt>Phone</dt>
        <dd>{doc.party_phone || '—'}</dd>
        <dt>Email</dt>
        <dd>{doc.party_email || '—'}</dd>
        {doc.party_gstin && (
          <>
            <dt>GSTIN</dt>
            <dd>{doc.party_gstin}</dd>
          </>
        )}
      </dl>
      <div className="contact-actions">
        <button className="btn" disabled={!phoneDigits} onClick={() => open(`tel:${phoneDigits}`)}>
          <Icon name="phone" /> Call
        </button>
        <button className="btn" disabled={!doc.party_email} onClick={() => open(`mailto:${doc.party_email}?subject=${encodeURIComponent(doc.document_number)}`)}>
          <Icon name="mail" /> Email
        </button>
        <button className="btn" disabled={waNumber.length < 8} onClick={() => open(`https://wa.me/${waNumber.length === 10 ? `91${waNumber}` : waNumber}`)}>
          <Icon name="message" /> WhatsApp
        </button>
      </div>
    </Modal>
  );
}

const HISTORY_LABELS = {
  CREATED: 'Created',
  UPDATED: 'Edited',
  STATUS: 'Status changed',
  CANCELLED: 'Cancelled',
  TEMPLATE: 'Template changed',
  DELETED: 'Deleted',
  RESTORED: 'Restored',
  MOVED: 'Moved to folder',
  CONVERTED: 'Converted',
};

function HistoryPanel({ doc, history, onClose }) {
  const describe = (h) => {
    if (h.action === 'STATUS' || h.action === 'CANCELLED') {
      return `${statusLabel(doc.document_type, h.from_status) || '—'} → ${statusLabel(doc.document_type, h.to_status)}`;
    }
    if (h.action === 'TEMPLATE') return TEMPLATES.find((t) => t.id === h.note)?.label || 'Default template';
    return '';
  };
  return (
    <aside className="history-panel no-print" aria-label="Document history" data-testid="history-panel">
      <div className="history-head">
        <h3>
          <Icon name="history" size={16} /> History
        </h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close history">
          <Icon name="x" size={16} />
        </button>
      </div>
      {history.length === 0 ? (
        <p className="muted small">No changes recorded yet.</p>
      ) : (
        <ol className="history-list">
          {history.map((h) => (
            <li key={h.id} className={`history-item action-${h.action.toLowerCase()}`}>
              <strong>{HISTORY_LABELS[h.action] || h.action}</strong>
              {describe(h) && <span>{describe(h)}</span>}
              {h.note && h.action !== 'TEMPLATE' && <span className="history-note">“{h.note}”</span>}
              <time className="muted small">{formatDateTime(String(h.created_at).replace(' ', 'T'))}</time>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

export default function DocumentViewPage({ params, query }) {
  const { settings, company, docSettings } = useAppData();
  const { navigate } = useRouter();
  const toast = useToast();
  const actions = useDocumentActions();
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState('');
  const [contact, setContact] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const printed = useRef(false);

  const load = useCallback(async () => {
    try {
      setBundle(await getDocument(params.id));
    } catch (e) {
      setError(e.message);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const doc = bundle?.document;
  const ds = useMemo(() => (doc ? resolveDocSettings(doc.document_type, settings, docSettings) : null), [doc, settings, docSettings]);
  const template = doc ? normaliseTemplate(doc.template || ds.template) : '';

  const payload = useMemo(() => {
    if (!bundle) return null;
    const d = { ...bundle.document, meta: parseMeta(bundle.document.meta) };
    return {
      company: company || {},
      document: d,
      items: bundle.items,
      taxes: bundle.taxes,
      settings: { ...settings, doc: ds },
      parent: bundle.parent,
    };
  }, [bundle, company, settings, ds]);

  const fileTitle = doc ? `${doc.document_number} - ${doc.party_name || getType(doc.document_type).short}`.replace(/[\\/:*?"<>|]/g, '-') : '';

  const print = useCallback(async () => {
    if (doc) await printCurrent(fileTitle);
  }, [doc, fileTitle]);

  const download = async () => {
    if (!doc || downloading) return;
    setDownloading(true);
    try {
      const path = await savePdf(`${fileTitle}.pdf`);
      if (path) toast.success(`PDF saved to ${path}`);
    } catch (e) {
      if (e.unsupported) {
        toast.info('Choose "Save as PDF" as the printer to download the PDF.');
        await print();
      } else {
        toast.error(e.message);
      }
    } finally {
      setDownloading(false);
    }
  };

  const changeTemplate = async (id) => {
    try {
      await setDocumentTemplate(doc.id, id === ds.template ? '' : id);
      toast.success(`Template: ${TEMPLATES.find((t) => t.id === id)?.label}`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  // Auto-print when opened with ?print=1 (from "Save & Print" or the list).
  useEffect(() => {
    if (payload && query.print === '1' && !printed.current) {
      printed.current = true;
      const t = setTimeout(() => {
        print();
        navigate(`/doc/${params.id}`, { replace: true, force: true });
      }, 350);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [payload, query.print, print, navigate, params.id]);

  useShortcuts({
    'mod+p': () => print(),
    'mod+e': () => doc && actions.edit(doc),
  });

  if (error) {
    return (
      <div className="page">
        <div className="callout callout-error">
          <Icon name="alert" /> {error}
          <button className="btn btn-sm" onClick={() => navigate('/manager')}>
            Back to Document Manager
          </button>
        </div>
      </div>
    );
  }
  if (!bundle || !payload) return <Spinner />;

  const type = getType(doc.document_type);
  const deleted = !!doc.deleted_at;
  const cancelled = isCancelled(doc);
  const history = bundle.history || [];

  return (
    <div className="viewer">
      <div className="editor-bar no-print">
        <button className="icon-btn" onClick={() => navigate('/manager')} title="Back to Document Manager">
          <Icon name="back" />
        </button>
        <div className="editor-title">
          <h1>{doc.document_number}</h1>
          <span className="muted hide-sm">{type.label}</span>
          {deleted ? <StatusBadge deleted /> : <StatusEditor doc={doc} onChanged={load} disabled={cancelled} />}
          {doc.is_demo ? <span className="badge badge-demo">Sample</span> : null}
        </div>
        <div className="editor-actions">
          {deleted ? (
            <button className="btn btn-primary" onClick={async () => (await actions.restore(doc)) && load()}>
              <Icon name="undo" /> Restore
            </button>
          ) : (
            <>
              <label className="template-switch" title="Template for this document only">
                <Icon name="palette" size={15} />
                <select className="input input-sm" value={template} onChange={(e) => changeTemplate(e.target.value)} aria-label="Template" data-testid="template-switch">
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              {!cancelled && (
                <button className="btn" onClick={() => actions.edit(doc)} data-testid="edit-doc">
                  <Icon name="edit" /> <span className="hide-sm">Edit</span>
                </button>
              )}
              <button className="btn" onClick={() => print()} data-testid="print-doc">
                <Icon name="printer" /> <span className="hide-sm">Print</span>
              </button>
              {!cancelled && type.financial && (
                <button className="btn btn-danger-outline" onClick={async () => (await actions.cancel(doc)) && load()} data-testid="cancel-doc">
                  <Icon name="ban" /> <span className="hide-sm">Cancel {type.short}</span>
                </button>
              )}
              <button className="btn btn-primary" onClick={download} disabled={downloading} data-testid="download-pdf">
                <Icon name="download" /> <span className="hide-sm">{downloading ? 'Saving…' : 'Download PDF'}</span>
              </button>
              <Menu
                items={[
                  { label: 'History', icon: 'history', onClick: () => setShowHistory(true) },
                  { label: 'Duplicate', icon: 'copy', onClick: () => actions.duplicate(doc) },
                  doc.party_name && { label: 'Contact customer', icon: 'user', onClick: () => setContact(true) },
                  !cancelled && type.conversions.length > 0 && { divider: true, key: 'd1' },
                  ...(cancelled
                    ? []
                    : type.conversions.map((target) => ({
                        label: `Convert to ${TYPE_MAP[target].label}`,
                        icon: 'convert',
                        onClick: () => actions.convert(doc, target),
                      }))),
                  { divider: true, key: 'd2' },
                  !cancelled && !type.financial && doc.status !== 'DRAFT' && {
                    label: `Cancel ${type.short}`,
                    icon: 'ban',
                    danger: true,
                    onClick: async () => (await actions.cancel(doc)) && load(),
                  },
                  {
                    label: 'Delete',
                    icon: 'trash',
                    danger: true,
                    onClick: async () => (await actions.remove(doc)) && load(),
                  },
                ]}
              />
            </>
          )}
        </div>
      </div>

      {cancelled && (
        <div className="callout callout-error no-print cancel-note" data-testid="cancelled-note">
          <Icon name="ban" />
          <span>
            This {type.short.toLowerCase()} is <strong>cancelled</strong>
            {doc.cancelled_at ? ` since ${formatDateTime(String(doc.cancelled_at).replace(' ', 'T'))}` : ''}
            {doc.cancel_reason ? ` — “${doc.cancel_reason}”` : ''}. It is kept for your records and printed with a CANCELLED mark.
          </span>
        </div>
      )}

      {(bundle.parent || bundle.children.length > 0) && (
        <div className="lineage no-print">
          {bundle.parent && (
            <span>
              <Icon name="convert" size={15} /> Created from <Link to={`/doc/${bundle.parent.id}`}>{bundle.parent.document_number}</Link>
            </span>
          )}
          {bundle.children.length > 0 && (
            <span>
              Converted into{' '}
              {bundle.children.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ', '}
                  <Link to={`/doc/${c.id}`}>{c.document_number}</Link>
                </span>
              ))}
            </span>
          )}
        </div>
      )}

      <div className={`viewer-body ${showHistory ? 'with-history' : ''}`}>
        <div className="viewer-page">
          {doc.party_name && (
            <button className="party-pill no-print" onClick={() => setContact(true)} title="Show contact details">
              <Icon name="user" size={15} /> {doc.party_name}
            </button>
          )}
          <PagePreview payload={payload} />
        </div>
        {showHistory && <HistoryPanel doc={doc} history={history} onClose={() => setShowHistory(false)} />}
      </div>

      {contact && <ContactPanel doc={doc} onClose={() => setContact(false)} />}
    </div>
  );
}
