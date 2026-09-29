/**
 * Document Manager — the home of the app.
 *
 *  ┌ create strip (document types for this business) ────────────────────────┐
 *  │ summary: documents · this month · drafts · unpaid · files               │
 *  ├ folders ─────┬ [Documents] [Uploaded files]  search · type · status · date│
 *  │ All          │ list (status with ✎ quick edit, actions)                   │
 *  │ Unfiled      │                                                            │
 *  │ <folders>    │                                                            │
 *  │ Deleted      │                                                            │
 *  └──────────────┴────────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import SearchSelect from '../../components/SearchSelect.jsx';
import StatusEditor from '../../components/StatusEditor.jsx';
import { EmptyState, Menu, StatusBadge } from '../../components/Common.jsx';
import { BUSINESS_TYPES, DOCUMENT_TYPES, STATUSES, STATUS_LABELS, TYPE_MAP, getType, typesMatching } from '../../config/documentTypes.js';
import { pricesVisible } from '../../config/defaults.js';
import { dashboardStats, listDocuments } from '../../services/documentService.js';
import {
  FILE_ICONS, copyFiles, deleteFiles, deleteFolder, exportFile, formatSize, importFiles, listFiles, listFolders, moveDocuments,
  moveFiles, openFile, purgeFiles, restoreFiles, updateFile,
} from '../../services/filesService.js';
import { formatMoney } from '../../utils/format.js';
import { formatDate, rangeFor } from '../../utils/dates.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useConfirm, useToast } from '../../hooks/useUi.jsx';
import { useDebounced, useShortcuts } from '../../hooks/useShortcuts.js';
import { useRouter } from '../../router/router.jsx';
import { useDocumentActions } from '../documents/useDocumentActions.js';
import { FolderNameModal, FolderPickerModal } from './FolderDialogs.jsx';

const PAGE = 50;
const DATE_OPTIONS = [
  { value: 'all', label: 'Any date' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'custom', label: 'Custom range…' },
];

function CustomizeTypesModal({ visible, onClose, onSave }) {
  const [selected, setSelected] = useState(visible);
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <Modal
      title="Document types shown for quick create"
      onClose={onClose}
      size="md"
      footer={
        <>
          <span className="muted small">All types are always available from “New Document”.</span>
          <button className="btn btn-primary" onClick={() => onSave(DOCUMENT_TYPES.map((t) => t.id).filter((id) => selected.includes(id)))}>
            Save
          </button>
        </>
      }
    >
      <ul className="type-list">
        {DOCUMENT_TYPES.map((t) => (
          <li key={t.id}>
            <label className="type-list-check">
              <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
              <Icon name={t.icon} size={16} />
              <span>{t.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export default function DocumentManagerPage({ query }) {
  const { settings, docSettings, updateSettings } = useAppData();
  const { navigate } = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const actions = useDocumentActions();
  const searchRef = useRef(null);

  const [tab, setTab] = useState(query.tab === 'files' ? 'files' : 'documents');
  const [folder, setFolder] = useState(query.folder || 'all'); // 'all' | 'unfiled' | 'deleted' | '<id>'
  const [search, setSearch] = useState('');
  const [type, setType] = useState(query.type || '');
  const [status, setStatus] = useState(query.status || '');
  const [dateKey, setDateKey] = useState('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [docs, setDocs] = useState({ rows: [], total: 0 });
  const [files, setFiles] = useState({ rows: [], total: 0 });
  const [folders, setFolders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(null); // { mode, kind, ids }
  const [folderModal, setFolderModal] = useState(null); // { id?, name? }
  const [customize, setCustomize] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const debounced = useDebounced(search, 200);

  useShortcuts({ 'mod+f': () => searchRef.current?.focus() });

  const business = BUSINESS_TYPES.find((b) => b.id === settings.businessType) || BUSINESS_TYPES[0];
  const quickTypes = (settings.visibleDocTypes?.length ? settings.visibleDocTypes : business.types).filter((id) => TYPE_MAP[id]);

  const folderFilter = useMemo(() => {
    if (folder === 'unfiled') return { unfiled: true };
    if (folder === 'deleted') return { deleted: true };
    if (folder !== 'all') return { folderId: Number(folder) };
    return {};
  }, [folder]);

  const docFilter = useCallback(
    (offset = 0) => {
      const range = rangeFor(dateKey, custom);
      return {
        ...folderFilter,
        search: debounced,
        searchTypes: typesMatching(debounced),
        types: type ? [type] : [],
        status,
        from: range.from,
        to: range.to,
        limit: PAGE,
        offset,
      };
    },
    [folderFilter, debounced, type, status, dateKey, custom],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, f, fo, st] = await Promise.all([
        listDocuments(docFilter(0)),
        listFiles({ ...folderFilter, search: debounced, limit: PAGE, offset: 0 }),
        listFolders(),
        dashboardStats(),
      ]);
      setDocs(d);
      setFiles(f);
      setFolders(fo);
      setStats(st);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [docFilter, folderFilter, debounced, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    try {
      if (tab === 'documents') {
        const more = await listDocuments(docFilter(docs.rows.length));
        setDocs((d) => ({ total: more.total, rows: [...d.rows, ...more.rows] }));
      } else {
        const more = await listFiles({ ...folderFilter, search: debounced, limit: PAGE, offset: files.rows.length });
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
      const target = folder !== 'all' && folder !== 'unfiled' && folder !== 'deleted' ? Number(folder) : null;
      const r = await importFiles(target);
      if (r.added) toast.success(`${r.added} ${r.added === 1 ? 'document' : 'documents'} added`);
      for (const err of r.errors || []) toast.error(err);
      if (r.added) {
        setTab('files');
        if (folder === 'deleted') setFolder('all');
        load();
      }
    } catch (e) {
      toast.error(e.message);
    }
  };

  const applyPicker = async (folderId) => {
    const { mode, kind, ids } = picker;
    try {
      if (kind === 'documents') await moveDocuments(ids, folderId);
      else if (mode === 'copy') await copyFiles(ids, folderId);
      else await moveFiles(ids, folderId);
      toast.success(`${ids.length === 1 ? 'Item' : `${ids.length} items`} ${mode === 'copy' ? 'copied' : 'moved'}`);
      setPicker(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const removeFolder = async (f) => {
    const ok = await confirm({
      title: `Delete folder "${f.name}"?`,
      message: 'Documents and files inside are kept and become unfiled.',
      confirmText: 'Delete folder',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteFolder(f.id);
      if (folder === String(f.id)) setFolder('all');
      load();
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
        const ok = await confirm({ title: `Delete "${f.name}"?`, message: 'It moves to Deleted, where you can restore it.', confirmText: 'Delete', danger: true });
        if (!ok) return;
        await deleteFiles([f.id]);
        toast.success('Moved to Deleted');
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

  const byType = Object.fromEntries((stats?.byType || []).map((r) => [r.document_type, r.count]));
  const filtersActive = search || type || status || dateKey !== 'all';
  const currentFolder = folders.find((f) => String(f.id) === folder);
  const folderTitle = folder === 'all' ? 'All documents' : folder === 'unfiled' ? 'Unfiled' : folder === 'deleted' ? 'Deleted' : currentFolder?.name || 'Folder';

  return (
    <div className="page manager">
      <div className="page-header">
        <div className="page-title">
          <div>
            <h1>Document Manager</h1>
            <p className="muted">Create, find and organise all your documents in one place.</p>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={upload} data-testid="add-external">
            <Icon name="paperclip" size={16} /> Add External Document
          </button>
        </div>
      </div>

      <section className="create-strip" aria-label="Create a document">
        {quickTypes.map((id) => (
          <button key={id} className="create-chip" onClick={() => navigate(`/doc/new/${id}`)} data-testid={`create-${id}`}>
            <Icon name={TYPE_MAP[id].icon} size={16} />
            <span>{TYPE_MAP[id].short}</span>
          </button>
        ))}
        <button className="create-chip ghost" onClick={() => setCustomize(true)} title="Choose which document types appear here">
          <Icon name="sliders" size={15} /> <span>Customise</span>
        </button>
      </section>

      {stats && (
        <section className="summary-strip" aria-label="Summary">
          <div>
            <strong>{stats.total}</strong>
            <span>Documents</span>
          </div>
          <div>
            <strong>{stats.thisMonth}</strong>
            <span>This month</span>
          </div>
          <div>
            <strong>{(byType.TAX_INVOICE || 0) + (byType.SERVICE_INVOICE || 0)}</strong>
            <span>Invoices</span>
          </div>
          <div>
            <strong>{(byType.QUOTATION || 0) + (byType.ESTIMATE || 0)}</strong>
            <span>Quotations</span>
          </div>
          <button className="summary-link" onClick={() => setStatus('DRAFT')} disabled={!stats.drafts}>
            <strong>{stats.drafts}</strong>
            <span>Drafts</span>
          </button>
          <div>
            <strong>{files.total}</strong>
            <span>Files here</span>
          </div>
        </section>
      )}

      <div className="manager-body">
        <aside className="folder-panel" aria-label="Folders">
          {[
            ['all', 'All documents', 'documents'],
            ['unfiled', 'Unfiled', 'inbox'],
          ].map(([id, label, icon]) => (
            <button key={id} className={`folder-item ${folder === id ? 'active' : ''}`} onClick={() => setFolder(id)}>
              <Icon name={icon} size={16} />
              <span>{label}</span>
            </button>
          ))}
          <div className="folder-head">
            <span>Folders</span>
            <button className="icon-btn" title="New folder" onClick={() => setFolderModal({})} data-testid="new-folder">
              <Icon name="folder-plus" size={16} />
            </button>
          </div>
          {folders.map((f) => (
            <div key={f.id} className={`folder-item ${folder === String(f.id) ? 'active' : ''}`} data-testid={`folder-${f.name}`}>
              <button className="folder-link" onClick={() => setFolder(String(f.id))}>
                <Icon name="folder" size={16} />
                <span className="truncate">{f.name}</span>
                <small>{f.document_count + f.file_count}</small>
              </button>
              <Menu
                className="icon-btn folder-menu"
                items={[
                  { label: 'Rename', icon: 'edit', onClick: () => setFolderModal({ id: f.id, name: f.name }) },
                  { label: 'Delete folder', icon: 'trash', danger: true, onClick: () => removeFolder(f) },
                ]}
              />
            </div>
          ))}
          {folders.length === 0 && <p className="muted small folder-hint">Create folders to organise documents, e.g. by customer or year.</p>}
          <button className={`folder-item deleted ${folder === 'deleted' ? 'active' : ''}`} onClick={() => setFolder('deleted')}>
            <Icon name="trash" size={16} />
            <span>Deleted</span>
          </button>
        </aside>

        <section className="manager-main">
          <div className="manager-toolbar">
            <div className="segmented" role="tablist">
              <button role="tab" aria-selected={tab === 'documents'} className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')} data-testid="tab-documents">
                Documents <small>{docs.total}</small>
              </button>
              <button role="tab" aria-selected={tab === 'files'} className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')} data-testid="tab-files">
                Uploaded files <small>{files.total}</small>
              </button>
            </div>
            <div className="search">
              <Icon name="search" size={16} />
              <input
                ref={searchRef}
                className="input"
                placeholder={tab === 'documents' ? 'Search number, customer, product… (Ctrl+F)' : 'Search file name or notes…'}
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
          </div>
          {tab === 'documents' && (
            <div className="filter-row">
              <SearchSelect
                value={type}
                onChange={setType}
                options={[{ value: '', label: 'All types' }, ...DOCUMENT_TYPES.map((t) => ({ value: t.id, label: t.label }))]}
                placeholder="All types"
                ariaLabel="Document type"
                className="filter-select"
                testId="filter-type"
              />
              <SearchSelect
                value={status}
                onChange={setStatus}
                options={[{ value: '', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))]}
                placeholder="All statuses"
                ariaLabel="Status"
                className="filter-select"
              />
              <SearchSelect value={dateKey} onChange={setDateKey} options={DATE_OPTIONS} ariaLabel="Date" className="filter-select" />
              {dateKey === 'custom' && (
                <div className="date-range">
                  <input className="input" type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From date" />
                  <span>–</span>
                  <input className="input" type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To date" />
                </div>
              )}
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
                  Clear filters
                </button>
              )}
              <span className="muted small filter-count">{folderTitle}</span>
            </div>
          )}

          <div className="card table-card">
            {tab === 'documents' ? (
              docs.rows.length === 0 ? (
                <EmptyState
                  icon={filtersActive ? 'search' : 'documents'}
                  title={loading ? 'Loading…' : filtersActive ? 'No matching documents' : folder === 'deleted' ? 'Nothing deleted' : 'No documents here yet'}
                  message={filtersActive ? 'Try a different search or clear the filters.' : 'Create one using the buttons above — it takes less than a minute.'}
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
                      const deleted = !!d.deleted_at;
                      const t = getType(d.document_type);
                      return (
                        <tr key={d.id} onDoubleClick={() => !deleted && actions.view(d)} className={d.status === 'CANCELLED' || d.status === 'VOID' ? 'row-cancelled' : ''}>
                          <td>
                            <button className="link doc-link" onClick={() => actions.view(d)} disabled={deleted}>
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
                          <td>{deleted ? <StatusBadge deleted /> : <StatusEditor doc={d} onChanged={load} />}</td>
                          <td className="actions-col">
                            {deleted ? (
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
                                    { label: 'Move to folder…', icon: 'folder', onClick: () => setPicker({ mode: 'move', kind: 'documents', ids: [d.id] }) },
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
                title={folder === 'deleted' ? 'No deleted files' : 'No uploaded files here'}
                message="Keep supplier bills, contracts, delivery proofs and other documents together with your invoices."
                action={
                  folder !== 'deleted' && (
                    <button className="btn btn-primary" onClick={upload}>
                      <Icon name="paperclip" size={16} /> Add External Document
                    </button>
                  )
                }
              />
            ) : (
              <table className="table" data-testid="files-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Folder</th>
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
                      <td>{f.folder_name || <span className="muted">Unfiled</span>}</td>
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
                                { label: 'Move to folder…', icon: 'folder', onClick: () => setPicker({ mode: 'move', kind: 'files', ids: [f.id] }) },
                                { label: 'Copy to folder…', icon: 'copy', onClick: () => setPicker({ mode: 'copy', kind: 'files', ids: [f.id] }) },
                                { divider: true, key: 'd' },
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
                  Load more ({(tab === 'documents' ? docs.total - docs.rows.length : files.total - files.rows.length)} remaining)
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {picker && <FolderPickerModal mode={picker.mode} count={picker.ids.length} folders={folders} onClose={() => setPicker(null)} onConfirm={applyPicker} />}
      {folderModal && (
        <FolderNameModal
          id={folderModal.id}
          initial={folderModal.name}
          title={folderModal.id ? 'Rename folder' : 'New folder'}
          onClose={() => setFolderModal(null)}
          onSaved={(id) => {
            setFolderModal(null);
            setFolder(String(id));
            load();
          }}
        />
      )}
      {customize && (
        <CustomizeTypesModal
          visible={quickTypes}
          onClose={() => setCustomize(false)}
          onSave={async (ids) => {
            await updateSettings({ visibleDocTypes: ids });
            setCustomize(false);
            toast.success('Quick create updated');
          }}
        />
      )}
    </div>
  );
}
