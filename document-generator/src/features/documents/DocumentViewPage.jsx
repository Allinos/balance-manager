import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import { Menu, Spinner, StatusBadge } from '../../components/Common.jsx';
import { getType, STATUSES, STATUS_LABELS, TYPE_MAP } from '../../config/documentTypes.js';
import { resolveDocSettings } from '../../config/defaults.js';
import { getDocument } from '../../services/documentService.js';
import { openExternal, printCurrent } from '../../services/systemService.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import { useShortcuts } from '../../hooks/useShortcuts.js';
import { Link, useRouter } from '../../router/router.jsx';
import PagePreview from '../../renderer/PagePreview.jsx';
import { useDocumentActions } from './useDocumentActions.js';

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

export default function DocumentViewPage({ params, query }) {
  const { settings, company, docSettings } = useAppData();
  const { navigate } = useRouter();
  const toast = useToast();
  const actions = useDocumentActions();
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState('');
  const [contact, setContact] = useState(false);
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

  const payload = useMemo(() => {
    if (!bundle) return null;
    const d = { ...bundle.document, meta: parseMeta(bundle.document.meta) };
    return {
      company: company || {},
      document: d,
      items: bundle.items,
      taxes: bundle.taxes,
      settings: { ...settings, doc: resolveDocSettings(d.document_type, settings, docSettings) },
      parent: bundle.parent,
    };
  }, [bundle, company, settings, docSettings]);

  const print = useCallback(
    async (pdf = false) => {
      if (!doc) return;
      if (pdf) toast.info('In the print window choose "Save as PDF" or "Microsoft Print to PDF" as the printer.');
      await printCurrent(`${doc.document_number} - ${doc.party_name || getType(doc.document_type).short}`.replace(/[\\/:*?"<>|]/g, '-'));
    },
    [doc, toast],
  );

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
          <button className="btn btn-sm" onClick={() => navigate('/created')}>
            Back to Created Documents
          </button>
        </div>
      </div>
    );
  }
  if (!bundle || !payload) return <Spinner />;

  const type = getType(doc.document_type);
  const deleted = !!doc.deleted_at;
  const after = async (fn, arg) => {
    if (await fn(doc, arg)) load();
  };

  return (
    <div className="viewer">
      <div className="editor-bar no-print">
        <button className="icon-btn" onClick={() => navigate('/created')} title="Back to Created Documents">
          <Icon name="back" />
        </button>
        <div className="editor-title">
          <h1>{doc.document_number}</h1>
          <span className="muted">{type.label}</span>
          <StatusBadge status={doc.status} deleted={deleted} />
          {doc.is_demo ? <span className="badge badge-demo">Sample</span> : null}
        </div>
        <div className="editor-actions">
          {deleted ? (
            <button className="btn btn-primary" onClick={() => after(actions.restore)}>
              <Icon name="undo" /> Restore
            </button>
          ) : (
            <>
              {doc.status === 'DRAFT' && (
                <button className="btn" onClick={() => after(actions.changeStatus, 'ISSUED')}>
                  <Icon name="check" /> Mark as Issued
                </button>
              )}
              <button className="btn" onClick={() => actions.edit(doc)} data-testid="edit-doc">
                <Icon name="edit" /> Edit
              </button>
              <button className="btn btn-primary" onClick={() => print()} data-testid="print-doc">
                <Icon name="printer" /> Print
              </button>
              <Menu
                items={[
                  { label: 'Export PDF', icon: 'download', onClick: () => print(true) },
                  { label: 'Duplicate', icon: 'copy', onClick: () => actions.duplicate(doc) },
                  doc.party_name && { label: 'Contact customer', icon: 'user', onClick: () => setContact(true) },
                  type.conversions.length > 0 && { divider: true, key: 'd1' },
                  ...type.conversions.map((target) => ({
                    label: `Convert to ${TYPE_MAP[target].label}`,
                    icon: 'convert',
                    onClick: () => actions.convert(doc, target),
                  })),
                  { divider: true, key: 'd2' },
                  ...STATUSES.filter((s) => s !== doc.status && s !== 'DRAFT').map((s) => ({
                    label: `Mark as ${STATUS_LABELS[s]}`,
                    icon: s === 'PAID' ? 'check' : s === 'ISSUED' ? 'check' : 'x',
                    onClick: () => after(actions.changeStatus, s),
                  })),
                  { divider: true, key: 'd3' },
                  {
                    label: 'Delete',
                    icon: 'trash',
                    danger: true,
                    onClick: async () => {
                      if (await actions.remove(doc)) load();
                    },
                  },
                ]}
              />
            </>
          )}
        </div>
      </div>

      {(bundle.parent || bundle.children.length > 0) && (
        <div className="lineage no-print">
          {bundle.parent && (
            <span>
              <Icon name="convert" size={15} /> Created from{' '}
              <Link to={`/doc/${bundle.parent.id}`}>{bundle.parent.document_number}</Link>
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

      <div className="viewer-body">
        {doc.party_name && (
          <button className="party-pill no-print" onClick={() => setContact(true)} title="Show contact details">
            <Icon name="user" size={15} /> {doc.party_name}
          </button>
        )}
        <PagePreview payload={payload} />
      </div>

      {contact && <ContactPanel doc={doc} onClose={() => setContact(false)} />}
    </div>
  );
}
