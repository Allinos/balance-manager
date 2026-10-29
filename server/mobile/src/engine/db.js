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

/**
 * Schema versions. Each step only adds (stores, indexes); records are never rewritten, so a phone's data
 * survives every update. An index only lists records that have the field, so older records just work.
 *   1  the stores above
 *   2  indexes for large data: documents by party, date, type and parent (ledger, lists, receipts),
 *      parties by name
 */
export const DATA_DB_VERSION = 2;

let dbPromise = null;

function upgrade(d, oldVersion, _new, tx) {
  if (oldVersion < 1) {
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
  }
  if (oldVersion < 2) {
    const docs = tx.objectStore('documents');
    for (const [name, key] of [['party_id', 'party_id'], ['issue_date', 'issue_date'], ['document_type', 'document_type'], ['parent_document_id', 'parent_document_id']]) {
      if (!docs.indexNames.contains(name)) docs.createIndex(name, key);
    }
    const parties = tx.objectStore('parties');
    if (!parties.indexNames.contains('name')) parties.createIndex('name', 'name');
  }
}

export function dataDb() {
  if (!dbPromise) {
    dbPromise = openDB(DATA_DB, DATA_DB_VERSION, {
      upgrade,
      // Another tab still has the old version open: the upgrade waits until it closes.
      blocked() {
        window.dispatchEvent(new CustomEvent('docgen-db-blocked'));
      },
      // Another tab wants to upgrade (newer DocGen) or delete the database: let go of it. After an upgrade
      // elsewhere this tab runs old code, so it reloads; after a delete it simply opens again when next used.
      blocking(_current, wanted) {
        dbPromise?.then((db) => db.close()).catch(() => {});
        dbPromise = null;
        if (wanted !== null && wanted !== undefined) window.location.reload();
      },
      // The browser closed the database (storage cleared, low disk): open it again on the next call.
      terminated() {
        dbPromise = null;
      },
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

/** Ask the browser to keep DocGen's data even when the phone runs low on space (installed apps usually get it). */
export async function keepDataSafe() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported: the data is still kept, just not protected from clean-up */
  }
}

/** All records of `store` whose `index` is in `values` (one lookup per value). */
export async function getAllBy(store, index, values) {
  const out = [];
  for (const v of values) out.push(...(await store.index(index).getAll(v)));
  return out;
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
