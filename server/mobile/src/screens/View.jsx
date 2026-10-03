/**
 * A saved document, drawn by the desktop's renderer in its template (Tally Professional, Tally Standard,
 * Modern, Simple). Print / Save as PDF (with the number of copies from settings), share, change status,
 * template for this document, cancel, history, contact the customer, duplicate, convert, delete / restore.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TEMPLATES, TYPE_MAP, getType, normaliseTemplate, statusLabel } from '@desktop/config/documentTypes.js';
import { resolveDocSettings, withDocumentOptions } from '@desktop/config/defaults.js';
import { getDocument, setDocumentTemplate } from '@desktop/services/documentService.js';
import PagePreview from '@desktop/renderer/PagePreview.jsx';
import { clampCopies } from '@desktop/renderer/copies.js';
import { formatMoney } from '@desktop/utils/format.js';
import { formatDate, formatDateTime } from '@desktop/utils/dates.js';
import Icon from '../components/Icon.jsx';
import { ActionSheet, Header, Picker, Sheet, Spinner, StatusBadge, go, useUi } from '../components/ui.jsx';
import { StatusSheet } from '../components/docs.jsx';
import { isCancelled, useApp, useDocumentActions } from '../data.jsx';

const parseMeta = (meta) => {
  try {
    return typeof meta === 'string' ? JSON.parse(meta || '{}') : meta || {};
  } catch {
    return {};
  }
};

const HISTORY_LABELS = {
  CREATED: 'Created', UPDATED: 'Edited', STATUS: 'Status changed', CANCELLED: 'Cancelled', TEMPLATE: 'Template changed',
  DELETED: 'Deleted', RESTORED: 'Restored', MOVED: 'Moved to folder', CONVERTED: 'Converted',
};

function HistorySheet({ doc, history, onClose }) {
  const describe = (h) => {
    if (h.action === 'STATUS' || h.action === 'CANCELLED') return `${statusLabel(doc.document_type, h.from_status) || '—'} → ${statusLabel(doc.document_type, h.to_status)}`;
    if (h.action === 'TEMPLATE') return TEMPLATES.find((t) => t.id === h.note)?.label || 'Default template';
    return '';
  };
  return (
    <Sheet title="History" onClose={onClose} testId="history">
      {history.length === 0 ? (
        <p className="muted small">No changes recorded yet.</p>
      ) : (
        <ol className="history-list">
          {history.map((h) => (
            <li key={h.id}>
              <strong>{HISTORY_LABELS[h.action] || h.action}</strong>
              {describe(h) && <span>{describe(h)}</span>}
              {h.note && h.action !== 'TEMPLATE' && <span className="muted">“{h.note}”</span>}
              <time className="small muted">{formatDateTime(String(h.created_at).replace(' ', 'T'))}</time>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}

function ContactSheet({ doc, onClose }) {
  const phone = (doc.party_phone || '').replace(/[^\d+]/g, '');
  const wa = phone.replace(/^\+/, '').replace(/^0+/, '');
  return (
    <Sheet title={doc.party_name} onClose={onClose} testId="contact">
      {doc.party_company && <p className="muted" style={{ margin: 0 }}>{doc.party_company}</p>}
      <dl className="kv">
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
      <div className="grid-3">
        <a className={`btn ${phone ? '' : 'disabled'}`} href={phone ? `tel:${phone}` : undefined}>
          <Icon name="phone" size={18} /> Call
        </a>
        <a className={`btn ${wa.length >= 8 ? '' : 'disabled'}`} href={wa.length >= 8 ? `https://wa.me/${wa.length === 10 ? `91${wa}` : wa}` : undefined} target="_blank" rel="noreferrer" data-testid="contact-whatsapp">
          <Icon name="message" size={18} /> WhatsApp
        </a>
        <a className={`btn ${doc.party_email ? '' : 'disabled'}`} href={doc.party_email ? `mailto:${doc.party_email}?subject=${encodeURIComponent(doc.document_number)}` : undefined}>
          <Icon name="mail" size={18} /> Email
        </a>
      </div>
    </Sheet>
  );
}

export default function View({ id, query = {} }) {
  const { settings, company, docSettings } = useApp();
  const { toast } = useUi();
  const actions = useDocumentActions();
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState('');
  const [zoom, setZoom] = useState(false);
  const printed = useRef(false);

  const load = useCallback(async () => {
    try {
      setBundle(await getDocument(id));
    } catch (e) {
      setError(e.message);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const doc = bundle?.document;
  const ds = useMemo(() => (doc ? withDocumentOptions(resolveDocSettings(doc.document_type, settings, docSettings), { ...doc, meta: parseMeta(doc.meta) }) : null), [doc, settings, docSettings]);
  const template = doc ? normaliseTemplate(doc.template || ds.template) : '';
  const payload = useMemo(
    () =>
      bundle && {
        company: company || {},
        document: { ...bundle.document, meta: parseMeta(bundle.document.meta) },
        items: bundle.items,
        taxes: bundle.taxes,
        settings: { ...settings, doc: ds },
        parent: bundle.parent,
      },
    [bundle, company, settings, ds],
  );
  const fileTitle = doc ? `${doc.document_number} - ${doc.party_name || getType(doc.document_type).short}`.replace(/[\\/:*?"<>|]/g, '-') : '';

  /** The phone's print dialog: print, or choose "Save as PDF" to get a PDF file. */
  const print = useCallback(() => {
    const previous = document.title;
    document.title = fileTitle;
    setZoom(false);
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.title = previous;
      }, 1500);
    }, 50);
  }, [fileTitle]);

  useEffect(() => {
    if (payload && query.print === '1' && !printed.current) {
      printed.current = true;
      const t = setTimeout(() => {
        go(`/doc/${id}`, { replace: true });
        print();
      }, 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [payload, query.print, print, id]);

  const share = async () => {
    const type = getType(doc.document_type);
    const text = [
      `${ds.title || type.title} ${doc.document_number}`,
      `Date: ${formatDate(doc.issue_date, settings.dateFormat)}`,
      ds.showPrices !== false ? `Amount: ${formatMoney(doc.grand_total, doc)}` : '',
      company?.upi_id && ds.showQr !== false && doc.currency === 'INR' ? `Pay by UPI: ${company.upi_id}` : '',
      company?.name || '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      if (navigator.share) await navigator.share({ title: fileTitle, text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Details copied — paste them in WhatsApp or email. Use Print → Save as PDF to send the document itself.');
      }
    } catch {
      /* share cancelled */
    }
  };

  const changeTemplate = async (tid) => {
    try {
      await setDocumentTemplate(doc.id, tid === ds.template ? '' : tid);
      toast(`Template: ${TEMPLATES.find((t) => t.id === tid)?.label}`);
      load();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  if (error) {
    return (
      <>
        <Header title="Document" onBack={() => go('/documents')} />
        <div className="page">
          <div className="alert alert-bad">{error}</div>
        </div>
      </>
    );
  }
  if (!bundle || !payload) return <Spinner />;

  const type = getType(doc.document_type);
  const deleted = !!doc.deleted_at;
  const cancelled = isCancelled(doc);
  const run = async (fn, ...args) => (await fn(...args)) && load();

  const more = [
    { label: 'History', icon: 'history', onClick: () => setSheet('history'), testId: 'action-history' },
    { label: 'Duplicate', icon: 'copy', onClick: () => actions.duplicate(doc), testId: 'action-duplicate' },
    doc.party_name && { label: 'Contact customer', icon: 'user', onClick: () => setSheet('contact'), testId: 'action-contact' },
    ...(cancelled ? [] : type.conversions.map((target) => ({ label: `Convert to ${TYPE_MAP[target].label}`, icon: 'convert', onClick: () => actions.convert(doc, target), testId: `action-convert-${target}` }))),
    { divider: true, key: 'd' },
    !cancelled && (type.financial || doc.status !== 'DRAFT') && { label: `Cancel ${type.short}`, icon: 'ban', danger: true, onClick: () => run(actions.cancel, doc), testId: 'action-cancel' },
    { label: 'Delete', icon: 'trash', danger: true, onClick: () => run(actions.remove, doc), testId: 'action-delete' },
  ];

  return (
    <>
      <Header
        title={doc.document_number}
        subtitle={type.label}
        onBack={() => go('/documents')}
        actions={
          !deleted && (
            <button className="icon-btn" onClick={() => setSheet('more')} aria-label="More" data-testid="view-more">
              <Icon name="more" size={21} />
            </button>
          )
        }
      />
      <div className="page viewer" data-testid="view">
        <div className="view-status no-print">
          {deleted ? (
            <StatusBadge deleted />
          ) : (
            <button className="status-btn" onClick={() => !cancelled && setSheet('status')} disabled={cancelled} data-testid="view-status">
              <StatusBadge status={doc.status} type={doc.document_type} />
              {!cancelled && <Icon name="edit" size={13} />}
            </button>
          )}
          {doc.is_demo ? <span className="pill demo">Sample</span> : null}
          {doc.party_name && (
            <button className="party-pill" onClick={() => setSheet('contact')} data-testid="party-pill">
              <Icon name="user" size={14} /> {doc.party_name}
            </button>
          )}
        </div>

        {cancelled && (
          <div className="alert alert-bad no-print" data-testid="cancelled-note">
            This {type.short.toLowerCase()} is <strong>cancelled</strong>
            {doc.cancelled_at ? ` since ${formatDateTime(String(doc.cancelled_at).replace(' ', 'T'))}` : ''}
            {doc.cancel_reason ? ` — “${doc.cancel_reason}”` : ''}. It is kept for your records and printed with a CANCELLED mark.
          </div>
        )}
        {(bundle.parent || bundle.children.length > 0) && (
          <div className="lineage no-print">
            {bundle.parent && (
              <span>
                Created from <a href={`#/doc/${bundle.parent.id}`}>{bundle.parent.document_number}</a>
              </span>
            )}
            {bundle.children.length > 0 && (
              <span>
                Converted into{' '}
                {bundle.children.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && ', '}
                    <a href={`#/doc/${c.id}`}>{c.document_number}</a>
                  </span>
                ))}
              </span>
            )}
          </div>
        )}

        {deleted ? (
          <button className="btn btn-primary btn-block no-print" onClick={() => run(actions.restore, doc)} data-testid="restore-doc">
            <Icon name="undo" size={18} /> Restore
          </button>
        ) : (
          <div className="view-actions no-print">
            {!cancelled && (
              <button className="btn" onClick={() => actions.edit(doc)} data-testid="edit-doc">
                <Icon name="edit" size={18} /> Edit
              </button>
            )}
            <button className="btn btn-primary" onClick={print} data-testid="print-doc">
              <Icon name="printer" size={18} /> Print / PDF
            </button>
            <button className="btn" onClick={share} data-testid="share-doc">
              <Icon name="share" size={18} /> Share
            </button>
          </div>
        )}
        {!deleted && (
          <div className="row no-print">
            <span className="small muted">Template</span>
            <div className="spacer">
              <Picker value={template} onChange={changeTemplate} options={TEMPLATES.map((t) => ({ value: t.id, label: t.label, hint: t.description }))} title="Template for this document" testId="template-switch" />
            </div>
            <button className="icon-btn" onClick={() => setZoom((z) => !z)} aria-label={zoom ? 'Fit to screen' : 'Zoom in'} data-testid="zoom">
              <Icon name={zoom ? 'zoomOut' : 'zoomIn'} size={21} />
            </button>
          </div>
        )}

        <div className={`doc-scroll ${zoom ? 'zoomed' : ''}`} data-testid="doc-page">
          <div className="doc-scroll-inner">
            <PagePreview payload={payload} copies={clampCopies(settings.documentCopies)} />
          </div>
        </div>
        <p className="small muted center no-print">Print → choose “Save as PDF” to get a PDF you can send on WhatsApp or email.</p>
      </div>

      {sheet === 'more' && <ActionSheet title={`${doc.document_number} · ${type.short}`} items={more} onClose={() => setSheet('')} />}
      {sheet === 'status' && <StatusSheet doc={doc} onClose={() => setSheet('')} onChanged={load} />}
      {sheet === 'history' && <HistorySheet doc={doc} history={bundle.history || []} onClose={() => setSheet('')} />}
      {sheet === 'contact' && <ContactSheet doc={doc} onClose={() => setSheet('')} />}
    </>
  );
}
