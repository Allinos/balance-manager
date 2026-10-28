/**
 * Documents (the desktop's Document Manager, without uploaded files on the phone):
 *   summary · search · type filter · Deleted
 *   documents: status quick change, view / edit / print / duplicate / convert / delete · restore
 *   Download: documents by type and month as PDF or CSV, or the GST sales register (licensed).
 */

import { useCallback, useEffect, useState } from 'react';
import { DOCUMENT_TYPES, STATUS_LABELS, TYPE_MAP, getType, typesMatching } from '@desktop/config/documentTypes.js';
import { dashboardStats, listDocuments } from '@desktop/services/documentService.js';
import { EXPORT_FORMATS, EXPORT_PERIODS, FORMAT_HELP, LICENSE_NEEDED, exportDocuments, periodRange, periodReady } from '@desktop/services/exportService.js';
import { rangeFor, todayISO } from '@desktop/utils/dates.js';
import { documentsPdf, saveFile } from '../lib/pdf.js';
import PrivacyToggle from '@desktop/components/PrivacyToggle.jsx';
import Icon from '../components/Icon.jsx';
import { ActionSheet, Empty, Field, Header, Picker, Select, Sheet, useUi } from '../components/ui.jsx';
import { DocRow, NewDocumentSheet, StatusSheet } from '../components/docs.jsx';
import { useApp, useDocumentActions } from '../data.jsx';

const PAGE = 50;
const SUMMARY_STATUSES = ['DRAFT', 'ISSUED', 'ACCEPTED', 'PARTIAL', 'PAID', 'COMPLETED', 'REJECTED', 'CANCELLED', 'VOID'];

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const TYPE_OPTIONS = [{ value: '', label: 'All document types' }, ...DOCUMENT_TYPES.map((t) => ({ value: t.id, label: t.label }))];

/** Many documents in one PDF, made on the phone and saved to Downloads. */
async function phonePdf(payloads, fileName) {
  const file = await documentsPdf(payloads, fileName);
  saveFile(file);
  return `Downloads/${file.name}`;
}

/** Download documents by type and month (or any period): PDF, CSV list, CSV items or the GST sales register. Licensed only. */
function DownloadSheet({ onClose }) {
  const { settings, company, docSettings, lic } = useApp();
  const { toast } = useUi();
  const [format, setFormat] = useState('pdf');
  const [typeId, setTypeId] = useState('');
  const [period, setPeriod] = useState('month');
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [custom, setCustom] = useState(() => rangeFor('month'));
  const [busy, setBusy] = useState(false);
  const licensed = lic?.state === 'active';
  const range = periodRange(period, { month, custom, fyStartMonth: Number(settings.fiscalYearStartMonth) || 4 });
  const run = async () => {
    setBusy(true);
    try {
      const saved = await exportDocuments({ format, typeId: format === 'sales' ? '' : typeId, range, licensed, settings, company, docSettings, makePdf: phonePdf });
      if (saved) {
        toast(`Downloaded ${saved.count} ${saved.count === 1 ? 'document' : 'documents'}`);
        onClose();
      }
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="Download documents" onClose={onClose} testId="sales-download-sheet">
      <div className="form">
        {!licensed && (
          <div className="alert alert-warn" data-testid="download-license">
            {LICENSE_NEEDED}
          </div>
        )}
        <Field label="Format">
          <Select value={format} onChange={setFormat} options={EXPORT_FORMATS} data-testid="download-format" />
        </Field>
        {format !== 'sales' && (
          <Field label="Document type">
            <Select value={typeId} onChange={setTypeId} options={TYPE_OPTIONS} data-testid="download-type" />
          </Field>
        )}
        <Field label="Period">
          <Select value={period} onChange={setPeriod} options={EXPORT_PERIODS} data-testid="sales-period" />
        </Field>
        {period === 'pickMonth' && (
          <Field label="Month">
            <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="download-month" />
          </Field>
        )}
        {period === 'custom' && (
          <div className="grid-2">
            <Field label="From">
              <input className="input" type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} data-testid="sales-from" />
            </Field>
            <Field label="To">
              <input className="input" type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} data-testid="sales-to" />
            </Field>
          </div>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          {FORMAT_HELP[format]}
        </p>
        <button className="btn btn-primary btn-block" onClick={run} disabled={busy || !periodReady(period, range)} data-testid="sales-download-go">
          <Icon name="download" size={18} /> {busy ? 'Preparing…' : 'Download'}
        </button>
      </div>
    </Sheet>
  );
}

export default function Documents({ query }) {
  const { toast } = useUi();
  const actions = useDocumentActions();
  const [search, setSearch] = useState(query.q || '');
  const [typeFilter, setTypeFilter] = useState(query.type || '');
  const [deleted, setDeleted] = useState(false);
  const [docs, setDocs] = useState(null);
  const [stats, setStats] = useState(null);
  const [sheet, setSheet] = useState(null);
  const debounced = useDebounced(search, 200);

  const docFilter = useCallback(
    (offset = 0) => ({ search: debounced, searchTypes: typesMatching(debounced), types: typeFilter ? [typeFilter] : [], deleted, limit: PAGE, offset }),
    [debounced, deleted, typeFilter],
  );

  const load = useCallback(async () => {
    try {
      const [d, st] = await Promise.all([listDocuments(docFilter(0)), dashboardStats()]);
      setDocs(d);
      setStats(st);
    } catch (e) {
      toast(e.message, 'bad');
    }
  }, [docFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    const more = await listDocuments(docFilter(docs.rows.length));
    setDocs((d) => ({ total: more.total, rows: [...d.rows, ...more.rows] }));
  };

  const run = async (fn, ...args) => {
    if (await fn(...args)) load();
  };

  const docMenu = (d) => {
    const t = getType(d.document_type);
    if (d.deleted_at) return [{ label: 'Restore', icon: 'undo', onClick: () => run(actions.restore, d), testId: 'action-restore' }];
    return [
      { label: 'View', icon: 'eye', onClick: () => actions.view(d) },
      { label: 'Edit', icon: 'edit', onClick: () => actions.edit(d), testId: 'action-edit' },
      { label: 'Print', icon: 'printer', onClick: () => actions.print(d) },
      { label: 'Duplicate', icon: 'copy', onClick: () => actions.duplicate(d), testId: 'action-duplicate' },
      ...t.conversions.map((c) => ({ label: `Convert to ${TYPE_MAP[c]?.short || c}`, icon: 'convert', onClick: () => actions.convert(d, c), testId: `action-convert-${c}` })),
      { divider: true, key: 'd' },
      { label: 'Delete', icon: 'trash', danger: true, onClick: () => run(actions.remove, d), testId: 'action-delete' },
    ];
  };

  const statusCounts = Object.fromEntries((stats?.byStatus || []).map((r) => [r.status, Number(r.count)]));
  const n = (v) => Number(v || 0).toLocaleString('en-IN');

  return (
    <>
      <Header
        title="Documents"
        actions={
          <>
            <PrivacyToggle className="icon-btn" size={20} />
            <button className="icon-btn" onClick={() => setSheet({ kind: 'sales' })} aria-label="Download documents" data-testid="sales-download">
              <Icon name="download" size={20} />
            </button>
          </>
        }
      />
      <div className="page" data-testid="documents">
        {stats && (
          <div className="summary-card" data-testid="summary-line">
            <span>
              <strong>{n(stats.total)}</strong> Total
            </span>
            <span>
              <strong>{n(stats.thisMonth)}</strong> This month
            </span>
            {SUMMARY_STATUSES.filter((s) => statusCounts[s]).map((s) => (
              <span key={s} className={`summary-status status-${s.toLowerCase()}`}>
                <i aria-hidden="true" />
                {STATUS_LABELS[s]} <strong>{n(statusCounts[s])}</strong>
              </span>
            ))}
          </div>
        )}
        <div className="search-row">
          <div className="search">
            <Icon name="search" size={18} />
            <input className="input" placeholder="Number, customer, product…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="manager-search" />
            {search && (
              <button className="icon-btn sm" onClick={() => setSearch('')} aria-label="Clear search">
                <Icon name="x" size={16} />
              </button>
            )}
          </div>
          <button className={`chip ${deleted ? 'active' : ''}`} onClick={() => setDeleted((x) => !x)} data-testid="show-deleted">
            <Icon name="trash" size={14} /> Deleted
          </button>
        </div>
        <Picker
          value={typeFilter}
          onChange={(v) => setTypeFilter(v || '')}
          options={TYPE_OPTIONS}
          placeholder="All document types"
          title="Document type"
          testId="type-filter"
        />

        {!docs ? null : docs.rows.length === 0 ? (
          <Empty
            icon={search || typeFilter ? 'search' : 'documents'}
            title={search || typeFilter ? 'No matching documents' : deleted ? 'Nothing deleted' : 'No documents yet'}
            message={search || typeFilter ? 'Try a different search or type.' : deleted ? '' : 'Tap + to create one.'}
          />
        ) : (
          <div className="list" data-testid="documents-list">
            {docs.rows.map((d) => (
              <DocRow key={d.id} d={d} onOpen={() => (d.deleted_at ? setSheet({ kind: 'menu', d }) : actions.view(d))} onStatus={d.deleted_at ? null : () => setSheet({ kind: 'status', d })} onMore={() => setSheet({ kind: 'menu', d })} />
            ))}
          </div>
        )}
        {docs && docs.rows.length < docs.total && (
          <button className="btn btn-block" onClick={loadMore}>
            Load more ({docs.total - docs.rows.length} remaining)
          </button>
        )}
      </div>
      <button className="fab no-print" onClick={() => setSheet({ kind: 'new' })} aria-label="New document" data-testid="new-document-btn">
        <Icon name="plus" size={26} />
      </button>

      {sheet?.kind === 'new' && <NewDocumentSheet onClose={() => setSheet(null)} />}
      {sheet?.kind === 'sales' && <DownloadSheet onClose={() => setSheet(null)} />}
      {sheet?.kind === 'status' && <StatusSheet doc={sheet.d} onClose={() => setSheet(null)} onChanged={load} />}
      {sheet?.kind === 'menu' && <ActionSheet title={`${sheet.d.document_number} · ${getType(sheet.d.document_type).short}`} items={docMenu(sheet.d)} onClose={() => setSheet(null)} />}
    </>
  );
}
