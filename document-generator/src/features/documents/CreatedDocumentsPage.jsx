import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { EmptyState, PageHeader, StatusBadge, Spinner } from '../../components/Common.jsx';
import { DOCUMENT_TYPES, STATUSES, STATUS_LABELS, getType, typesMatching } from '../../config/documentTypes.js';
import { pricesVisible } from '../../config/defaults.js';
import { listDocuments } from '../../services/documentService.js';
import { formatMoney } from '../../utils/format.js';
import { formatDate, rangeFor } from '../../utils/dates.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import { useDebounced, useShortcuts } from '../../hooks/useShortcuts.js';
import { useRouter } from '../../router/router.jsx';
import { useDocumentActions } from './useDocumentActions.js';

const PAGE_SIZE = 100;

const DATE_OPTIONS = [
  { value: 'all', label: 'All dates' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'custom', label: 'Custom range' },
];

export default function CreatedDocumentsPage({ query }) {
  const { settings, docSettings } = useAppData();
  const { navigate } = useRouter();
  const toast = useToast();
  const actions = useDocumentActions();
  const searchRef = useRef(null);

  const [search, setSearch] = useState('');
  const [type, setType] = useState(query.type || '');
  const [status, setStatus] = useState(query.status || '');
  const [dateKey, setDateKey] = useState('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const debounced = useDebounced(search, 200);

  useShortcuts({ 'mod+f': () => searchRef.current?.focus() });

  const buildFilter = useCallback(
    (offset = 0) => {
      const range = rangeFor(dateKey, custom);
      return {
        search: debounced,
        searchTypes: typesMatching(debounced),
        types: type ? [type] : [],
        status: status === 'DELETED' ? '' : status,
        deleted: status === 'DELETED',
        from: range.from,
        to: range.to,
        limit: PAGE_SIZE,
        offset,
      };
    },
    [debounced, type, status, dateKey, custom],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listDocuments(buildFilter(0)));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [buildFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    try {
      const more = await listDocuments(buildFilter(data.rows.length));
      setData((d) => ({ total: more.total, rows: [...d.rows, ...more.rows] }));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const run = async (fn, doc) => {
    if (await fn(doc)) load();
  };

  const filtersActive = search || type || status || dateKey !== 'all';

  return (
    <div className="page">
      <PageHeader
        title="Created Documents"
        subtitle={`${data.total} ${data.total === 1 ? 'document' : 'documents'}${filtersActive ? ' match your filters' : ''}`}
      />

      <div className="toolbar card">
        <div className="search">
          <Icon name="search" />
          <input
            ref={searchRef}
            className="input"
            placeholder="Search number, customer, product or type…  (Ctrl+F)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="icon-btn" onClick={() => setSearch('')} aria-label="Clear search">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)} aria-label="Document type">
          <option value="">All types</option>
          {DOCUMENT_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select className="input" value={dateKey} onChange={(e) => setDateKey(e.target.value)} aria-label="Date">
          {DATE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {dateKey === 'custom' && (
          <div className="date-range">
            <input className="input" type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From date" />
            <span>to</span>
            <input className="input" type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To date" />
          </div>
        )}
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
          <option value="DELETED">Deleted</option>
        </select>
        {filtersActive && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('');
              setType('');
              setStatus('');
              setDateKey('all');
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="card table-card">
        {loading && data.rows.length === 0 ? (
          <Spinner />
        ) : data.rows.length === 0 ? (
          <EmptyState
            icon="search"
            title={filtersActive ? 'No matching documents' : 'No documents yet'}
            message={filtersActive ? 'Try a different search or clear the filters.' : 'Documents you create will appear here.'}
            action={
              !filtersActive && (
                <button className="btn btn-primary" onClick={() => navigate('/documents')}>
                  <Icon name="plus" /> Create a document
                </button>
              )
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Type</th>
                <th>Customer / Party</th>
                <th>Date</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((d) => {
                const deleted = !!d.deleted_at;
                return (
                  <tr key={d.id} onDoubleClick={() => !deleted && actions.view(d)}>
                    <td>
                      <button className="link" onClick={() => actions.view(d)} disabled={deleted}>
                        {d.document_number}
                      </button>
                      {d.is_demo ? <span className="badge badge-demo">Sample</span> : null}
                    </td>
                    <td>{getType(d.document_type).short}</td>
                    <td className="truncate">{d.party_name || '—'}</td>
                    <td className="nowrap">{formatDate(d.issue_date, settings.dateFormat)}</td>
                    <td className="num">{pricesVisible(d.document_type, settings, docSettings) ? formatMoney(d.grand_total, d) : '—'}</td>
                    <td>
                      <StatusBadge status={d.status} deleted={deleted} />
                    </td>
                    <td className="actions-col">
                      {deleted ? (
                        <button className="btn btn-sm" onClick={() => run(actions.restore, d)}>
                          <Icon name="undo" size={15} /> Restore
                        </button>
                      ) : (
                        <div className="row-actions">
                          <button className="icon-btn" title="View" onClick={() => actions.view(d)}>
                            <Icon name="eye" size={17} />
                          </button>
                          <button className="icon-btn" title="Edit" onClick={() => actions.edit(d)}>
                            <Icon name="edit" size={17} />
                          </button>
                          <button className="icon-btn" title="Print" onClick={() => actions.print(d)}>
                            <Icon name="printer" size={17} />
                          </button>
                          <button className="icon-btn" title="Duplicate" onClick={() => actions.duplicate(d)}>
                            <Icon name="copy" size={17} />
                          </button>
                          <button className="icon-btn danger" title="Delete" onClick={() => run(actions.remove, d)}>
                            <Icon name="trash" size={17} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {data.rows.length < data.total && (
          <div className="load-more">
            <button className="btn" onClick={loadMore}>
              Load more ({data.total - data.rows.length} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
