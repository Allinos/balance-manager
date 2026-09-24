import Icon from '../../components/Icon.jsx';
import { EmptyState, StatusBadge } from '../../components/Common.jsx';
import { getType } from '../../config/documentTypes.js';
import { pricesVisible } from '../../config/defaults.js';
import { formatMoney } from '../../utils/format.js';
import { formatDate } from '../../utils/dates.js';
import { useRouter } from '../../router/router.jsx';
import { useAppData } from '../../hooks/useAppData.jsx';

/** Compact list of recent documents: number, party, amount, date, View. */
export default function RecentDocuments({ rows }) {
  const { navigate } = useRouter();
  const { settings, docSettings } = useAppData();
  if (!rows.length) {
    return (
      <EmptyState
        title="No documents yet"
        message="Create your first invoice or quotation — it takes less than a minute."
        action={
          <button className="btn btn-primary" onClick={() => navigate('/doc/new/TAX_INVOICE')}>
            <Icon name="plus" /> Create Invoice
          </button>
        }
      />
    );
  }
  return (
    <ul className="recent-list">
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
            <StatusBadge status={d.status} />
            <button
              className="btn btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/doc/${d.id}`);
              }}
            >
              View
            </button>
          </li>
        );
      })}
    </ul>
  );
}
