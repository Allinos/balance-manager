import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
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
  const { settings } = useAppData();
  const { navigate } = useRouter();
  const toast = useToast();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    dashboardStats()
      .then(setStats)
      .catch((e) => toast.error(e.message));
  }, [toast]);

  if (!stats) return <Spinner />;
  const counts = Object.fromEntries(stats.byType.map((r) => [r.document_type, Number(r.count)]));
  const business = BUSINESS_TYPES.find((b) => b.id === settings.businessType) || BUSINESS_TYPES[0];
  const preferred = new Set(settings.visibleDocTypes?.length ? settings.visibleDocTypes : business.types);
  // The business's document types, plus any other type that already has documents.
  const types = DOCUMENT_TYPES.filter((t) => preferred.has(t.id) || counts[t.id]);

  return (
    <div className="page">
      <PageHeader title="Dashboard" />
      <div className="type-cards" data-testid="type-cards">
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
              <Icon name="plus" size={16} />
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
    </div>
  );
}
