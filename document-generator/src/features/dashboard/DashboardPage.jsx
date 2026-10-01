import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import { EmptyState, PageHeader, Spinner, StatusBadge } from '../../components/Common.jsx';
import { BUSINESS_TYPES, DOCUMENT_TYPES, getType } from '../../config/documentTypes.js';
import { pricesVisible } from '../../config/defaults.js';
import { dashboardStats } from '../../services/documentService.js';
import { formatMoney } from '../../utils/format.js';
import { formatDate } from '../../utils/dates.js';
import { useRouter } from '../../router/router.jsx';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';

/** Card titles (plural). */
const PLURAL = {
  TAX_INVOICE: 'Invoices',
  SERVICE_INVOICE: 'Service Invoices',
  QUOTATION: 'Quotations',
  ESTIMATE: 'Estimates',
  PROFORMA_INVOICE: 'Proforma Invoices',
  SALES_ORDER: 'Sales Orders',
  DELIVERY_CHALLAN: 'Delivery Challans',
  PURCHASE_ORDER: 'Purchase Orders',
  GOODS_RECEIPT: 'Goods Receipts',
  PURCHASE_INVOICE: 'Purchase Bills',
  CREDIT_NOTE: 'Credit Notes',
  DEBIT_NOTE: 'Debit Notes',
  BILL_OF_SUPPLY: 'Bills of Supply',
  PAYMENT_RECEIPT: 'Receipts',
  WORK_ORDER: 'Work Orders',
  JOB_COMPLETION: 'Job Completions',
};

const MAX_CARDS = 12; // two rows of up to six
const DEFAULT_CARDS = 8; // two rows of four

/**
 * Grid columns for n cards, so a few cards never stretch across the whole page:
 * 1 card → a third of the width, 2 → a quarter each, 3–5 → one row, more → two rows.
 */
export function cardColumns(n) {
  if (n <= 1) return 3;
  if (n === 2) return 4;
  if (n <= 5) return n;
  return Math.ceil(n / 2);
}

/** Document types shown on the Dashboard (Customize), in registry order. */
export function dashboardTypes(settings) {
  const known = new Set(DOCUMENT_TYPES.map((t) => t.id));
  const chosen = (settings.dashboardTypes || []).filter((id) => known.has(id));
  if (chosen.length) return DOCUMENT_TYPES.filter((t) => chosen.includes(t.id));
  const business = BUSINESS_TYPES.find((b) => b.id === settings.businessType) || BUSINESS_TYPES[0];
  const preferred = settings.visibleDocTypes?.length ? settings.visibleDocTypes : business.types;
  return DOCUMENT_TYPES.filter((t) => preferred.includes(t.id)).slice(0, DEFAULT_CARDS);
}

function CustomizeModal({ selected, onClose, onSave }) {
  const [ids, setIds] = useState(selected);
  const toggle = (id) => setIds((x) => (x.includes(id) ? x.filter((i) => i !== id) : x.length >= MAX_CARDS ? x : [...x, id]));
  return (
    <Modal
      title="Customize Dashboard"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <span className="muted small">
            {ids.length} of {MAX_CARDS} cards
          </span>
          <button className="btn btn-primary" disabled={ids.length < 1} onClick={() => onSave(DOCUMENT_TYPES.map((t) => t.id).filter((id) => ids.includes(id)))} data-testid="customize-save">
            Save
          </button>
        </>
      }
    >
      <ul className="customize-list">
        {DOCUMENT_TYPES.map((t) => (
          <li key={t.id}>
            <label className="customize-item">
              <input type="checkbox" checked={ids.includes(t.id)} onChange={() => toggle(t.id)} disabled={!ids.includes(t.id) && ids.length >= MAX_CARDS} data-testid={`customize-${t.id}`} />
              <Icon name={t.icon} size={16} />
              <span>{PLURAL[t.id] || t.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** Last 10 documents: number, type, party, amount, date, status. */
function RecentDocuments({ rows }) {
  const { navigate } = useRouter();
  const { settings, docSettings } = useAppData();
  if (!rows.length) {
    return <EmptyState title="No documents yet" message="Use the + on a card above to create your first document." />;
  }
  return (
    <ul className="recent-list" data-testid="recent-documents">
      {rows.map((d) => {
        const type = getType(d.document_type);
        return (
          <li key={d.id} className="recent-row" onClick={() => navigate(`/doc/${d.id}`)}>
            <span className="recent-icon">
              <Icon name={type.icon} size={18} />
            </span>
            <span className="recent-main">
              <strong>{d.document_number}</strong>
              <small>{type.short}</small>
            </span>
            <span className="recent-party">{d.party_name || '—'}</span>
            <span className="recent-amount">{pricesVisible(d.document_type, settings, docSettings) ? formatMoney(d.grand_total, d) : '—'}</span>
            <span className="recent-date">{formatDate(d.issue_date, settings.dateFormat)}</span>
            <StatusBadge status={d.status} type={d.document_type} />
          </li>
        );
      })}
    </ul>
  );
}

export default function DashboardPage() {
  const { settings, updateSettings } = useAppData();
  const { navigate } = useRouter();
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [customize, setCustomize] = useState(false);

  useEffect(() => {
    dashboardStats()
      .then(setStats)
      .catch((e) => toast.error(e.message));
  }, [toast]);

  if (!stats) return <Spinner />;
  const counts = Object.fromEntries(stats.byType.map((r) => [r.document_type, Number(r.count)]));
  const types = dashboardTypes(settings);

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        actions={
          <button className="btn btn-sm" onClick={() => setCustomize(true)} data-testid="customize-dashboard">
            <Icon name="sliders" size={15} /> Customize
          </button>
        }
      />
      <div className="type-cards" style={{ '--cols': cardColumns(types.length) }} data-testid="type-cards">
        {types.map((t) => (
          <div key={t.id} className="type-count-card" data-testid={`card-${t.id}`}>
            <button className="type-count-main" onClick={() => navigate(`/manager?q=${encodeURIComponent(t.short)}`)} title={`Show ${PLURAL[t.id] || t.label}`}>
              <span className="type-count-icon">
                <Icon name={t.icon} size={18} />
              </span>
              <span className="type-count-label">{PLURAL[t.id] || t.label}</span>
              <span className="type-count-value">{(counts[t.id] || 0).toLocaleString('en-IN')}</span>
            </button>
            <button className="type-count-add" onClick={() => navigate(`/doc/new/${t.id}`)} title={`New ${t.label}`} aria-label={`New ${t.label}`} data-testid={`create-${t.id}`}>
              <Icon name="plus" size={18} />
            </button>
          </div>
        ))}
      </div>

      <section className="card">
        <div className="card-header">
          <h2>Recent Documents</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/manager')}>
            View all <Icon name="arrowRight" size={16} />
          </button>
        </div>
        <RecentDocuments rows={stats.recent} />
      </section>

      {customize && (
        <CustomizeModal
          selected={types.map((t) => t.id)}
          onClose={() => setCustomize(false)}
          onSave={async (ids) => {
            try {
              await updateSettings({ dashboardTypes: ids });
              setCustomize(false);
            } catch (e) {
              toast.error(e.message);
            }
          }}
        />
      )}
    </div>
  );
}
