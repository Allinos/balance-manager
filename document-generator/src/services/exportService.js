/**
 * Document Manager → Download: the documents of one type (or all types) for a month or period, as
 *   - PDF:         the documents themselves, one after another (each starts on a new page)
 *   - CSV list:    one row per document (opens in Excel)
 *   - CSV items:   one row per item line
 *   - GST sales register (the existing sales_export)
 * Licensed copies only: checked here, in the UI and again by the backend that writes the file.
 */

import { call } from './api.js';
import { getDocument, listDocuments } from './documentService.js';
import { SALES_REGISTER_TYPES, TYPE_MAP, getType } from '../config/documentTypes.js';
import { pricesVisible, resolveDocSettings, withDocumentOptions } from '../config/defaults.js';
import { endOfMonth, rangeFor, toISODate } from '../utils/dates.js';

export const LICENSE_NEEDED = 'Downloading documents needs a DocGen license. Please activate your license in Settings → License.';

export const EXPORT_FORMATS = [
  { value: 'pdf', label: 'PDF — the documents' },
  { value: 'csv', label: 'CSV — list of documents' },
  { value: 'items', label: 'CSV — item details' },
  { value: 'sales', label: 'CSV — GST sales register' },
];

export const FORMAT_HELP = {
  pdf: 'One PDF file with every document, each starting on a new page — ready to print or send to your accountant.',
  csv: 'One row per document: date, number, type, status, party, GSTIN, due date and amounts. Opens in Excel.',
  items: 'One row per item: document, party, item, HSN/SAC, quantity, unit, rate, discount, tax and amount. Opens in Excel.',
  sales:
    'Every invoice, bill of supply, credit note and debit note: date, number, party name, GSTIN and state, place of supply, taxable value, CGST, SGST, IGST and total.',
};

export const EXPORT_PERIODS = [
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'pickMonth', label: 'Choose a month' },
  { value: 'fy', label: 'This financial year' },
  { value: 'lastFy', label: 'Last financial year' },
  { value: 'custom', label: 'Custom dates' },
  { value: 'all', label: 'All dates' },
];

/** Most documents in one PDF (a larger PDF takes long to make; choose a shorter period). */
export const MAX_PDF_DOCUMENTS = 200;

/** Financial year containing today (or `back` years before), e.g. 1 Apr 2026 – 31 Mar 2027. */
export function financialYear(startMonth = 4, back = 0, now = new Date()) {
  const first = startMonth - 1;
  const year = (now.getMonth() >= first ? now.getFullYear() : now.getFullYear() - 1) - back;
  return { from: toISODate(new Date(year, first, 1)), to: toISODate(new Date(year + 1, first, 0)) };
}

/** Dates of a period choice. `month` is YYYY-MM for "Choose a month". */
export function periodRange(period, { month = '', custom = {}, fyStartMonth = 4 } = {}) {
  if (period === 'fy') return financialYear(fyStartMonth);
  if (period === 'lastFy') return financialYear(fyStartMonth, 1);
  if (period === 'all') return { from: '', to: '' };
  if (period === 'pickMonth') {
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    if (!m) return { from: '', to: '' };
    const first = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    return { from: toISODate(first), to: endOfMonth(first) };
  }
  return rangeFor(period, custom);
}

/** A period needs both dates, except "All dates". */
export const periodReady = (period, range) => period === 'all' || (!!range.from && !!range.to && range.from <= range.to);

/** Part of a file name for the period, e.g. "2026-10" or "2026-04-01-to-2027-03-31". */
export function periodName(range) {
  if (!range.from && !range.to) return 'All';
  const m = /^(\d{4}-\d{2})-01$/.exec(range.from);
  if (m && range.to === endOfMonth(new Date(Number(m[1].slice(0, 4)), Number(m[1].slice(5)) - 1, 1))) return m[1];
  return `${range.from}-to-${range.to}`;
}

const csvField = (value, text) => {
  let v = String(value ?? '');
  // A cell starting with = + - @ would run as a formula in Excel.
  if (text && /^[=+\-@]/.test(v)) v = `'${v}`;
  return /[,"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const csvRow = (fields) => `${fields.map(([v, t]) => csvField(v, t)).join(',')}\r\n`;
/** UTF-8 marker first, so Excel shows ₹ and Indian names correctly. */
const BOM = '﻿';

/** Every document of `typeId` ('' = all types) in the period, oldest first. Deleted documents are left out. */
export async function collectDocuments({ typeId = '', from = '', to = '' }) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await listDocuments({ types: typeId ? [typeId] : [], from, to, limit: 1000, offset });
    rows.push(...page.rows);
    if (rows.length >= page.total || !page.rows.length) break;
  }
  return rows.sort((a, b) =>
    a.issue_date === b.issue_date ? String(a.document_number).localeCompare(String(b.document_number), undefined, { numeric: true }) : a.issue_date < b.issue_date ? -1 : 1,
  );
}

const parseMeta = (meta) => {
  try {
    return typeof meta === 'string' ? JSON.parse(meta || '{}') : meta || {};
  } catch {
    return {};
  }
};

/** What the preview draws for a saved document, exactly as stored (the same as the document screen). */
export function storedPayload(bundle, { settings, company, docSettings }) {
  const document = { ...bundle.document, meta: parseMeta(bundle.document.meta) };
  const ds = withDocumentOptions(resolveDocSettings(document.document_type, settings, docSettings), document);
  return { company: company || {}, document, items: bundle.items, taxes: bundle.taxes, settings: { ...settings, doc: ds }, parent: bundle.parent };
}

/** CSV: one row per document. */
export async function documentsCsv(rows, { settings, docSettings }) {
  let csv = `${BOM}Date,Document No.,Document Type,Status,Party Name,Party Company,Party GSTIN,Party State,Due Date,Taxable Value,Tax,Grand Total,Currency\r\n`;
  for (const r of rows) {
    // The list has the totals; the party's GSTIN and state come with the full document.
    const d = (await getDocument(r.id)).document;
    const priced = pricesVisible(d.document_type, settings, docSettings);
    csv += csvRow([
      [d.issue_date, false], [d.document_number, true], [getType(d.document_type).label, true], [d.status, true],
      [d.party_name, true], [d.party_company, true], [d.party_gstin, true], [d.party_state, true], [d.due_date || '', false],
      [priced ? d.taxable : '', false], [priced ? d.tax : '', false], [priced ? d.grand_total : '', false], [d.currency, false],
    ]);
  }
  return csv;
}

/** CSV: one row per item line. */
export async function itemsCsv(rows, { settings, docSettings }) {
  let csv = `${BOM}Date,Document No.,Document Type,Party Name,Item,Description,HSN/SAC,Quantity,Unit,Rate,Discount,Taxable Value,Tax %,Tax,Amount,Currency\r\n`;
  for (const r of rows) {
    const { document: d, items } = await getDocument(r.id);
    const priced = pricesVisible(d.document_type, settings, docSettings);
    const p = (v) => (priced ? v : '');
    for (const it of items) {
      csv += csvRow([
        [d.issue_date, false], [d.document_number, true], [getType(d.document_type).label, true], [d.party_name, true],
        [it.name, true], [it.description, true], [it.hsn_sac, true], [it.quantity, false], [it.unit, true],
        [p(it.unit_price), false], [p(it.discount_amount), false], [p(it.taxable_amount), false], [p(it.tax_rate), false],
        [p(it.tax_amount), false], [p(it.total_amount), false], [d.currency, false],
      ]);
    }
  }
  return csv;
}

/** Save a CSV through the app (a save dialog on the computer, Downloads on the phone). Resolves the path, or null if cancelled. */
export const saveCsv = (fileName, content) => call('export_save', { fileName, content });

/**
 * Download documents. `makePdf(payloads, fileName)` is the platform's way of writing one PDF of many documents.
 * @returns {Promise<{count: number, path?: string}|null>} null when the save was cancelled
 */
export async function exportDocuments({ format, typeId, range, licensed, settings, company, docSettings, makePdf }) {
  if (!licensed) throw new Error(LICENSE_NEEDED);
  const span = periodName(range);
  if (format === 'sales') {
    const labels = Object.fromEntries(SALES_REGISTER_TYPES.map((id) => [id, TYPE_MAP[id].label]));
    const saved = await call('sales_export', { types: SALES_REGISTER_TYPES, labels, from: range.from || '2000-01-01', to: range.to || toISODate(new Date()) });
    return saved ? { count: saved.count, path: saved.path } : null;
  }
  const rows = await collectDocuments({ typeId, from: range.from, to: range.to });
  if (!rows.length) throw new Error('There are no documents of this type in this period.');
  const name = `DocGen-${typeId ? getType(typeId).short.replace(/[^\w]+/g, '-') : 'Documents'}-${span}`;
  if (format === 'pdf') {
    if (rows.length > MAX_PDF_DOCUMENTS) throw new Error(`That is ${rows.length} documents — one PDF can hold up to ${MAX_PDF_DOCUMENTS}. Please choose a shorter period or one document type.`);
    const ctx = { settings, company, docSettings };
    const payloads = [];
    for (const r of rows) payloads.push(storedPayload(await getDocument(r.id), ctx));
    const path = await makePdf(payloads, `${name}.pdf`);
    return path ? { count: rows.length, path } : null;
  }
  const ctx = { settings, docSettings };
  const csv = format === 'items' ? await itemsCsv(rows, ctx) : await documentsCsv(rows, ctx);
  const path = await saveCsv(`${name}${format === 'items' ? '-Items' : ''}.csv`, csv);
  return path ? { count: rows.length, path } : null;
}
