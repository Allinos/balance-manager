/** Document pieces shared by several screens. */

import { useMemo, useState } from 'react';
import { BUSINESS_TYPES, DOCUMENT_TYPES, getType, statusesFor, statusLabel } from '@desktop/config/documentTypes.js';
import { pricesVisible } from '@desktop/config/defaults.js';
import { newDocument, renderPayload, setDocumentStatus } from '@desktop/services/documentService.js';
import { pickImage } from '@desktop/services/settingsService.js';
import PagePreview from '@desktop/renderer/PagePreview.jsx';
import { formatMoney } from '@desktop/utils/format.js';
import { formatDate } from '@desktop/utils/dates.js';
import Icon from './Icon.jsx';
import { Sheet, StatusBadge, go, useUi } from './ui.jsx';
import { useApp } from '../data.jsx';

/** Card titles (plural), as on the desktop dashboard. */
export const PLURAL = {
  TAX_INVOICE: 'Invoices', SERVICE_INVOICE: 'Service Invoices', QUOTATION: 'Quotations', REVERSE_QUOTATION: 'Reverse Quotations',
  ESTIMATE: 'Estimates', PROFORMA_INVOICE: 'Proforma Invoices', SALES_ORDER: 'Sales Orders', DELIVERY_CHALLAN: 'Delivery Challans',
  PURCHASE_ORDER: 'Purchase Orders', GOODS_RECEIPT: 'Goods Receipts', PURCHASE_INVOICE: 'Purchase Bills', CREDIT_NOTE: 'Credit Notes',
  DEBIT_NOTE: 'Debit Notes', BILL_OF_SUPPLY: 'Bills of Supply', PAYMENT_RECEIPT: 'Receipts', PAYMENT_VOUCHER: 'Payment Vouchers',
  WORK_ORDER: 'Work Orders', JOB_COMPLETION: 'Job Completions',
};

/** One document in a list: number, type, party, amount, date and status. */
export function DocRow({ d, onOpen, onStatus, onMore }) {
  const { settings, docSettings } = useApp();
  const t = getType(d.document_type);
  const cancelled = d.status === 'CANCELLED' || d.status === 'VOID';
  return (
    <div className={`doc-row ${cancelled ? 'cancelled' : ''}`} data-testid="doc-row">
      <button className="doc-row-main" onClick={onOpen}>
        <span className="avatar">
          <Icon name={t.icon} size={19} />
        </span>
        <span className="list-main">
          <strong>
            {d.document_number}
            {d.is_demo ? <span className="pill demo">Sample</span> : null}
          </strong>
          <span className="small muted">
            {t.short} · {d.party_name || '—'}
          </span>
        </span>
        <span className="list-end">
          <strong className="amount">{pricesVisible(d.document_type, settings, docSettings) ? formatMoney(d.grand_total, d) : '—'}</strong>
          <span className="small muted">{formatDate(d.issue_date, settings.dateFormat)}</span>
        </span>
      </button>
      <div className="doc-row-foot">
        {d.deleted_at ? (
          <StatusBadge deleted />
        ) : (
          <button className="status-btn" onClick={onStatus} disabled={!onStatus || cancelled} data-testid={`status-${d.id}`}>
            <StatusBadge status={d.status} type={d.document_type} />
            {onStatus && !cancelled && <Icon name="edit" size={13} />}
          </button>
        )}
        {onMore && (
          <button className="icon-btn sm" onClick={onMore} aria-label={`More actions for ${d.document_number}`} data-testid={`more-${d.id}`}>
            <Icon name="more" size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Change a document's status (cancelling asks for a reason, kept in its history). */
export function StatusSheet({ doc, onClose, onChanged }) {
  const { toast } = useUi();
  const [pending, setPending] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (status, note = '') => {
    setBusy(true);
    try {
      await setDocumentStatus(doc.id, status, note);
      toast(`${doc.document_number}: ${statusLabel(doc.document_type, status)}`);
      onClose();
      onChanged?.(status);
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  const choose = (s) => {
    if (s === doc.status) return onClose();
    if (s === 'CANCELLED' || s === 'VOID') return setPending(s);
    return save(s);
  };
  return (
    <Sheet title={pending ? `Mark as ${statusLabel(doc.document_type, pending).toLowerCase()}?` : `Status of ${doc.document_number}`} onClose={onClose} testId="status-sheet">
      {pending ? (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            save(pending, reason);
          }}
        >
          <p className="muted small">The document is kept for your records and clearly marked. This is noted in its history.</p>
          <input className="input" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus data-testid="status-reason" />
          <div className="grid-2">
            <button type="button" className="btn" onClick={() => setPending(null)}>
              Back
            </button>
            <button className="btn btn-danger-solid" disabled={busy} data-testid="status-confirm-cancel">
              Confirm
            </button>
          </div>
        </form>
      ) : (
        <div className="action-list">
          {statusesFor(doc.document_type, doc.status).map((s) => (
            <button key={s} className={`action-item ${s === doc.status ? 'current' : ''}`} onClick={() => choose(s)} disabled={busy} data-testid={`status-option-${s}`}>
              <StatusBadge status={s} type={doc.document_type} />
              {s === doc.status && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** Choose the type of a new document: the business's usual types first, then all others. */
export function NewDocumentSheet({ onClose }) {
  const { settings } = useApp();
  const business = BUSINESS_TYPES.find((b) => b.id === settings.businessType);
  const preferred = new Set(settings.visibleDocTypes || business?.types || []);
  const first = DOCUMENT_TYPES.filter((t) => preferred.has(t.id));
  const rest = DOCUMENT_TYPES.filter((t) => !preferred.has(t.id));
  const card = (t) => (
    <button
      key={t.id}
      onClick={() => {
        onClose();
        go(`/doc/new/${t.id}`);
      }}
      data-testid={`new-${t.id}`}
    >
      <span className="avatar">
        <Icon name={t.icon} size={19} />
      </span>
      <span>{t.label}</span>
    </button>
  );
  return (
    <Sheet title="Create a new document" onClose={onClose} testId="new-document">
      <div className="type-grid">{first.map(card)}</div>
      {rest.length > 0 && (
        <>
          <div className="section-label">More document types</div>
          <div className="type-grid">{rest.map(card)}</div>
        </>
      )}
    </Sheet>
  );
}

/** A sample invoice in the chosen template/colours (Settings → Documents, setup). */
export function SamplePreview({ overrides, company: companyOverride, typeId = 'TAX_INVOICE' }) {
  const { settings, company: saved, docSettings } = useApp();
  const payload = useMemo(() => {
    const company = { ...(saved || {}), ...(companyOverride || {}) };
    const ctx = { settings: { ...settings, ...overrides }, company, docSettings };
    const m = newDocument(typeId, ctx);
    m.document = {
      ...m.document,
      document_number: 'INV-00001',
      party_name: 'Sample Customer',
      party_address: '12, MG Road, Bengaluru',
      party_gstin: '29ABCDE1234F1Z5',
      place_of_supply: company?.state || '',
    };
    // GST samples use 18%; other taxes use the chosen standard rate.
    const rate = ctx.settings.taxSystem === 'GST' ? '18' : ctx.settings.defaultTaxRate || '0';
    m.items = [
      { ...m.items[0], name: 'Office Chair', hsn_sac: '9401', quantity: '2', unit_price: '4500', tax_rate: rate },
      { ...m.items[0], _key: 's2', name: 'Installation', hsn_sac: '995419', quantity: '1', unit: 'Job', unit_price: '1500', tax_rate: rate },
    ];
    return renderPayload(m, ctx);
  }, [settings, saved, companyOverride, docSettings, overrides, typeId]);
  return (
    <div className="sample-preview" data-testid="sample-preview">
      <PagePreview payload={payload} />
    </div>
  );
}

/** Logo / signature / stamp: choose a photo or image on the phone (scaled down automatically). */
export function ImagePicker({ label, value, onChange, hint, testId }) {
  const { toast } = useUi();
  const choose = async () => {
    try {
      const data = await pickImage();
      if (data) onChange(data);
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  return (
    <div className="image-picker">
      <span className="field-label">{label}</span>
      <button type="button" className="image-picker-box" onClick={choose} data-testid={testId}>
        {value ? <img src={value} alt="" /> : <Icon name="image" size={26} />}
      </button>
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={choose}>
          {value ? 'Change' : 'Upload'}
        </button>
        {value && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange('')}>
            Remove
          </button>
        )}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
