/**
 * Document Manager — full list of created documents and uploaded files.
 *
 *   one compact summary line · [Documents] [Files] · search · Add External Document
 *   simple list (status with ✎ quick edit, actions)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import StatusEditor from '../../components/StatusEditor.jsx';
import { EmptyState, Menu, StatusBadge } from '../../components/Common.jsx';
import { STATUS_LABELS, TYPE_MAP, getType, typesMatching } from '../../config/documentTypes.js';
import { pricesVisible } from '../../config/defaults.js';
import { dashboardStats, listDocuments } from '../../services/documentService.js';
import { FILE_ICONS, deleteFiles, exportFile, formatSize, importFiles, listFiles, openFile, purgeFiles, restoreFiles, updateFile } from '../../services/filesService.js';
import { formatMoney } from '../../utils/format.js';
import { formatDate } from '../../utils/dates.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useConfirm, useToast } from '../../hooks/useUi.jsx';
import { useDebounced, useShortcuts } from '../../hooks/useShortcuts.js';
import { useDocumentActions } from '../documents/useDocumentActions.js';

const PAGE = 50;
/** Order of statuses in the summary line. */
const SUMMARY_STATUSES = ['DRAFT', 'ISSUED', 'ACCEPTED', 'PARTIAL', 'PAID', 'COMPLETED', 'REJECTED', 'CANCELLED', 'VOID'];

export default function DocumentManagerPage({ query }) {
  const { settings, docSettings } = useAppData();
  const toast = useToast();
  const confirm = useConfirm();
  const actions = useDocumentActions();
  const searchRef = useRef(null);

  const [tab, setTab] = useState(query.tab === 'files' ? 'files' : 'documents');
  const [search, setSearch] = useState(query.q || '');
  const [deleted, setDeleted] = useState(false);
  const [docs, setDocs] = useState({ rows: [], total: 0 });
  const [files, setFiles] = useState({ rows: [], total: 0 });
  const [fileTotal, setFileTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState(null);
  const debounced = useDebounced(search, 200);

  useShortcuts({ 'mod+f': () => searchRef.current?.focus() });

  const docFilter = useCallback(
    (offset = 0) => ({ search: debounced, searchTypes: typesMatching(debounced), deleted, limit: PAGE, offset }),
    [debounced, deleted],
  );
  const fileFilter = useCallback((offset = 0) => ({ search: debounced, deleted, limit: PAGE, offset }), [debounced, deleted]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, f, all, st] = await Promise.all([listDocuments(docFilter(0)), listFiles(fileFilter(0)), listFiles({ limit: 1 }), dashboardStats()]);
      setDocs(d);
      setFiles(f);
      setFileTotal(all.total);
      setStats(st);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [docFilter, fileFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    try {
      if (tab === 'documents') {
        const more = await listDocuments(docFilter(docs.rows.length));
        setDocs((d) => ({ total: more.total, rows: [...d.rows, ...more.rows] }));
      } else {
        const more = await listFiles(fileFilter(files.rows.length));
        setFiles((f) => ({ total: more.total, rows: [...f.rows, ...more.rows] }));
      }
    } catch (e) {
      toast.error(e.message);
    }
  };

  const run = async (fn, arg) => {
    if (await fn(arg)) load();
  };

  const upload = async () => {
    try {
      const r = await importFiles(null);
      if (r.added) toast.success(`${r.added} ${r.added === 1 ? 'document' : 'documents'} added`);
      for (const err of r.errors || []) toast.error(err);
      if (r.added) {
        setTab('files');
        setDeleted(false);
        load();
      }
    } catch (e) {
      toast.error(e.message);
    }
  };

  const fileAction = async (kind, f) => {
    try {
      if (kind === 'open') await openFile(f.id);
      if (kind === 'export') {
        const path = await exportFile(f.id);
        if (path) toast.success(`Saved to ${path}`);
      }
      if (kind === 'delete') {
        const ok = await confirm({ title: `Delete "${f.name}"?`, message: 'It can be restored from "Deleted".', confirmText: 'Delete', danger: true });
        if (!ok) return;
        await deleteFiles([f.id]);
        toast.success('Deleted');
        load();
      }
      if (kind === 'restore') {
        await restoreFiles([f.id]);
        toast.success('Restored');
        load();
      }
      if (kind === 'purge') {
        const ok = await confirm({ title: `Delete "${f.name}" permanently?`, message: 'This cannot be undone.', confirmText: 'Delete permanently', danger: true });
        if (!ok) return;
        await purgeFiles([f.id]);
        load();
      }
    } catch (e) {
      toast.error(e.message);
    }
  };

  const statusCounts = Object.fromEntries((stats?.byStatus || []).map((r) => [r.status, Number(r.count)]));
  const summary = stats
    ? [
        ['Total', stats.total],
        ['This Month', stats.thisMonth],
        ['Files', fileTotal],
        ...SUMMARY_STATUSES.filter((s) => statusCounts[s]).map((s) => [STATUS_LABELS[s], statusCounts[s]]),
      ]
    : [];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">
          <h1>Document Manager</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={upload} data-testid="add-external">
            <Icon name="upload" size={16} /> Add External Document
          </button>
        </div>
      </div>

      {stats && (
        <div className="summary-line" data-testid="summary-line">
          {summary.map(([label, value]) => (
            <span key={label}>
              {label}: <strong>{Number(value).toLocaleString('en-IN')}</strong>
            </span>
          ))}
        </div>
      )}

      <div className="manager-toolbar">
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={tab === 'documents'} className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')} data-testid="tab-documents">
            Documents
          </button>
          <button role="tab" aria-selected={tab === 'files'} className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')} data-testid="tab-files">
            Files
          </button>
        </div>
        <div className="search">
          <Icon name="search" size={16} />
          <input
            ref={searchRef}
            className="input"
            placeholder={tab === 'documents' ? 'Search number, customer, product… (Ctrl+F)' : 'Search file name…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="manager-search"
          />
          {search && (
            <button className="icon-btn" onClick={() => setSearch('')} aria-label="Clear search">
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
        <button className={`btn btn-ghost btn-sm ${deleted ? 'active' : ''}`} onClick={() => setDeleted((d) => !d)} data-testid="show-deleted">
          <Icon name={deleted ? 'back' : 'trash'} size={14} /> {deleted ? 'Back' : 'Deleted'}
        </button>
      </div>

      <div className="card table-card">
        {tab === 'documents' ? (
          docs.rows.length === 0 ? (
            <EmptyState
              icon={search ? 'search' : 'documents'}
              title={loading ? 'Loading…' : search ? 'No matching documents' : deleted ? 'Nothing deleted' : 'No documents yet'}
              message={search ? 'Try a different search.' : deleted ? '' : 'Create documents from the Dashboard.'}
            />
          ) : (
            <table className="table" data-testid="documents-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Customer / Party</th>
                  <th>Date</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.rows.map((d) => {
                  const isDeleted = !!d.deleted_at;
                  const t = getType(d.document_type);
                  return (
                    <tr key={d.id} onDoubleClick={() => !isDeleted && actions.view(d)} className={d.status === 'CANCELLED' || d.status === 'VOID' ? 'row-cancelled' : ''}>
                      <td>
                        <button className="link doc-link" onClick={() => actions.view(d)} disabled={isDeleted}>
                          <Icon name={t.icon} size={15} />
                          {d.document_number}
                        </button>
                        <div className="muted small">
                          {t.short}
                          {d.is_demo ? <span className="badge badge-demo">Sample</span> : null}
                        </div>
                      </td>
                      <td className="truncate">{d.party_name || '—'}</td>
                      <td className="nowrap">{formatDate(d.issue_date, settings.dateFormat)}</td>
                      <td className="num">{pricesVisible(d.document_type, settings, docSettings) ? formatMoney(d.grand_total, d) : '—'}</td>
                      <td>{isDeleted ? <StatusBadge deleted /> : <StatusEditor doc={d} onChanged={load} />}</td>
                      <td className="actions-col">
                        {isDeleted ? (
                          <button className="btn btn-sm" onClick={() => run(actions.restore, d)}>
                            <Icon name="undo" size={14} /> Restore
                          </button>
                        ) : (
                          <div className="row-actions">
                            <button className="icon-btn" title="View" onClick={() => actions.view(d)}>
                              <Icon name="eye" size={16} />
                            </button>
                            <button className="icon-btn" title="Edit" onClick={() => actions.edit(d)}>
                              <Icon name="edit" size={16} />
                            </button>
                            <button className="icon-btn" title="Print" onClick={() => actions.print(d)}>
                              <Icon name="printer" size={16} />
                            </button>
                            <Menu
                              className="icon-btn"
                              items={[
                                { label: 'Duplicate', icon: 'copy', onClick: () => actions.duplicate(d) },
                                ...t.conversions.map((c) => ({ label: `Convert to ${TYPE_MAP[c]?.short || c}`, icon: 'convert', onClick: () => actions.convert(d, c) })),
                                { divider: true, key: 'd' },
                                { label: 'Delete', icon: 'trash', danger: true, onClick: () => run(actions.remove, d) },
                              ]}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : files.rows.length === 0 ? (
          <EmptyState
            icon="paperclip"
            title={loading ? 'Loading…' : deleted ? 'No deleted files' : 'No files yet'}
            message={deleted ? '' : 'Store supplier bills, contracts and other documents here.'}
            action={
              !deleted && (
                <button className="btn btn-primary" onClick={upload}>
                  <Icon name="upload" size={16} /> Add External Document
                </button>
              )
            }
          />
        ) : (
          <table className="table" data-testid="files-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Added</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.rows.map((f) => (
                <tr key={f.id} onDoubleClick={() => !f.deleted_at && fileAction('open', f)}>
                  <td>
                    {renaming?.id === f.id ? (
                      <form
                        className="inline-rename"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            await updateFile(f.id, { name: renaming.name });
                            setRenaming(null);
                            load();
                          } catch (err) {
                            toast.error(err.message);
                          }
                        }}
                      >
                        <input className="input" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} autoFocus onBlur={() => setRenaming(null)} />
                      </form>
                    ) : (
                      <div className="file-name">
                        <span className={`file-badge ext-${f.extension}`}>
                          <Icon name={FILE_ICONS[f.extension] || 'file'} size={15} />
                        </span>
                        <div>
                          <strong>{f.name}</strong>
                          <div className="muted small">{f.original_name}</div>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="nowrap">{formatSize(f.size)}</td>
                  <td className="nowrap">{formatDate(f.created_at.slice(0, 10), settings.dateFormat)}</td>
                  <td className="actions-col">
                    {f.deleted_at ? (
                      <div className="row-actions">
                        <button className="btn btn-sm" onClick={() => fileAction('restore', f)}>
                          Restore
                        </button>
                        <button className="btn btn-sm btn-danger-outline" onClick={() => fileAction('purge', f)}>
                          Delete forever
                        </button>
                      </div>
                    ) : (
                      <div className="row-actions">
                        <button className="icon-btn" title="Open" onClick={() => fileAction('open', f)}>
                          <Icon name="external-link" size={16} />
                        </button>
                        <button className="icon-btn" title="Save a copy" onClick={() => fileAction('export', f)}>
                          <Icon name="download" size={16} />
                        </button>
                        <Menu
                          className="icon-btn"
                          items={[
                            { label: 'Rename', icon: 'edit', onClick: () => setRenaming({ id: f.id, name: f.name }) },
                            { label: 'Delete', icon: 'trash', danger: true, onClick: () => fileAction('delete', f) },
                          ]}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(tab === 'documents' ? docs.rows.length < docs.total : files.rows.length < files.total) && (
          <div className="load-more">
            <button className="btn" onClick={loadMore}>
              Load more ({tab === 'documents' ? docs.total - docs.rows.length : files.total - files.rows.length} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
