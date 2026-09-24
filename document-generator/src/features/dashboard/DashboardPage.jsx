import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { PageHeader, Spinner } from '../../components/Common.jsx';
import { dashboardStats } from '../../services/documentService.js';
import { useRouter } from '../../router/router.jsx';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import RecentDocuments from '../documents/RecentDocuments.jsx';

const CARDS = [
  { key: 'total', label: 'Total Documents', icon: 'documents' },
  { key: 'TAX_INVOICE', label: 'Invoices', icon: 'invoice' },
  { key: 'QUOTATION', label: 'Quotations', icon: 'quote' },
  { key: 'PURCHASE_ORDER', label: 'Purchase Orders', icon: 'bag' },
  { key: 'SALES_ORDER', label: 'Sales Orders', icon: 'cart' },
  { key: 'thisMonth', label: 'Created This Month', icon: 'calendar' },
];

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const { navigate } = useRouter();
  const { company } = useAppData();
  const toast = useToast();

  useEffect(() => {
    dashboardStats()
      .then(setStats)
      .catch((e) => toast.error(e.message));
  }, [toast]);

  if (!stats) return <Spinner />;
  const byType = Object.fromEntries(stats.byType.map((r) => [r.document_type, r.count]));
  const value = (key) => (key === 'total' ? stats.total : key === 'thisMonth' ? stats.thisMonth : byType[key] || 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="page">
      <PageHeader
        title={greeting}
        subtitle={company?.name ? `Here is a quick look at ${company.name}` : 'Here is a quick look at your documents'}
        actions={
          <button className="btn btn-primary" onClick={() => navigate('/doc/new/TAX_INVOICE')}>
            <Icon name="plus" /> New Invoice
          </button>
        }
      />
      <div className="stat-grid">
        {CARDS.map((c) => (
          <button
            key={c.key}
            className="stat-card"
            onClick={() => navigate(c.key.includes('_') ? `/created?type=${c.key}` : '/created')}
          >
            <span className="stat-icon">
              <Icon name={c.icon} />
            </span>
            <span className="stat-value">{value(c.key)}</span>
            <span className="stat-label">{c.label}</span>
          </button>
        ))}
      </div>

      {stats.drafts > 0 && (
        <div className="callout">
          <Icon name="info" />
          <span>
            You have <strong>{stats.drafts}</strong> draft {stats.drafts === 1 ? 'document' : 'documents'}.
          </span>
          <button className="btn btn-sm" onClick={() => navigate('/created?status=DRAFT')}>
            Review drafts
          </button>
        </div>
      )}

      <section className="card">
        <div className="card-header">
          <h2>Recent documents</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/created')}>
            View all <Icon name="arrowRight" size={16} />
          </button>
        </div>
        <RecentDocuments rows={stats.recent} />
      </section>
    </div>
  );
}
