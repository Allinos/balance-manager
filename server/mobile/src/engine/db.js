/**
 * DocGen Mobile business data (IndexedDB on the phone) — the same records the desktop app keeps in SQLite.
 *
 *   settings      key → value          app settings (Settings → …)
 *   doc_settings  doc type → object    per-type overrides (Settings → Document Types)
 *   meta          key → value          company profile, safety copy before a restore, migration flags
 *   sequences     doc_type             numbering series
 *   categories, products, parties      catalog
 *   documents     document + its items (__items) and tax breakdown (__taxes)
 *   history       document_id → audit trail
 *   folders, files                     uploaded (external) documents; their content is in blobs (by SHA-256)
 *
 * The license (encrypted) and device id live separately in lib/db.js.
 */

import { openDB } from 'idb';

export const DATA_DB = 'docgen-data';

/** Default numbering series, as created by the desktop's first migration. */
export const SEEDED_SEQUENCES = [
  ['QUOTATION', 'QTN'],
  ['PROFORMA_INVOICE', 'PI'],
  ['SALES_ORDER', 'SO'],
  ['PURCHASE_ORDER', 'PO'],
  ['TAX_INVOICE', 'INV'],
  ['DELIVERY_CHALLAN', 'DC'],
  ['GOODS_RECEIPT', 'GRN'],
  ['CREDIT_NOTE', 'CN'],
  ['DEBIT_NOTE', 'DN'],
  ['PAYMENT_RECEIPT', 'RCT'],
];

export const sequenceRow = (docType, prefix) => ({
  doc_type: docType,
  prefix,
  next_number: 1,
  start_number: 1,
  padding: 5,
  format: '{PREFIX}-{NUM}',
  reset_yearly: 0,
  last_period: '',
});

export const STORES = ['settings', 'doc_settings', 'meta', 'sequences', 'categories', 'products', 'parties', 'documents', 'history', 'folders', 'files', 'blobs'];

let dbPromise = null;

export function dataDb() {
  if (!dbPromise) {
    dbPromise = openDB(DATA_DB, 1, {
      upgrade(d, _old, _new, tx) {
        d.createObjectStore('settings');
        d.createObjectStore('doc_settings');
        d.createObjectStore('meta');
        d.createObjectStore('sequences', { keyPath: 'doc_type' });
        for (const name of ['categories', 'products', 'parties', 'documents', 'folders', 'files']) {
          d.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
        }
        d.createObjectStore('history', { keyPath: 'id', autoIncrement: true }).createIndex('document_id', 'document_id');
        d.createObjectStore('blobs', { keyPath: 'sha256' });
        for (const [type, prefix] of SEEDED_SEQUENCES) tx.objectStore('sequences').put(sequenceRow(type, prefix));
      },
    });
  }
  return dbPromise;
}

const pad = (n) => String(n).padStart(2, '0');

/** Local time as the desktop stores it: `YYYY-MM-DD HH:MM:SS`. */
export function now() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Case-insensitive name order (SQLite `COLLATE NOCASE`). */
export const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });

/** Case-insensitive "contains" (SQLite `LIKE '%q%'`). */
export const contains = (value, q) => String(value ?? '').toLowerCase().includes(q);

/** Keep only allow-listed columns; booleans are stored as 0/1 like SQLite. */
export function pick(data, columns) {
  const out = {};
  for (const c of columns) {
    if (data[c] === undefined) continue;
    const v = data[c];
    out[c] = typeof v === 'boolean' ? Number(v) : v;
  }
  return out;
}

export class AppError extends Error {}
