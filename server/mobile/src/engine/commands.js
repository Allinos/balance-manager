/**
 * The desktop app's backend commands (src-tauri/src/commands.rs, files.rs), implemented on the phone over IndexedDB.
 *
 * The desktop's own JavaScript services (documentService, catalogService, settingsService, filesService …)
 * call these through `call(command, args)` exactly as they call the Rust backend on a computer, so documents,
 * numbering, statuses, history and totals behave the same on both. Column allow-lists, validation messages and
 * defaults are taken from the Rust code and the SQLite schema.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { AppError, STORES, byName, contains, dataDb, now, pick } from './db.js';
import * as numbering from './numbering.js';
import { clean, download, openBlob, pickFiles, readAsDataUrl } from './io.js';
import { exportData, importData } from './backup.js';
import { APP_VERSION } from '../lib/license.js';

// ------------------------------------------------------------------ schema (allow-lists and defaults)

const COMPANY_COLUMNS = [
  'name', 'legal_name', 'trade_name', 'address', 'city', 'state', 'state_code', 'pin', 'country', 'phone',
  'email', 'website', 'gstin', 'pan', 'vat_number', 'logo', 'stamp', 'signature', 'bank_name', 'account_holder',
  'account_number', 'ifsc', 'swift', 'iban', 'branch', 'upi_id', 'currency',
];
const COMPANY_DEFAULTS = { ...Object.fromEntries(COMPANY_COLUMNS.map((c) => [c, ''])), country: 'India', currency: 'INR' };

const CATEGORY_COLUMNS = ['name', 'is_demo'];

const PRODUCT_COLUMNS = [
  'type', 'name', 'sku', 'category_id', 'description', 'hsn_sac', 'unit', 'selling_price', 'purchase_price',
  'tax_rate', 'tax_type', 'barcode', 'notes', 'is_demo',
];
const PRODUCT_DEFAULTS = {
  type: 'PRODUCT', sku: '', category_id: null, description: '', hsn_sac: '', unit: 'Nos', selling_price: '0', purchase_price: '0',
  tax_rate: '0', tax_type: 'EXCLUSIVE', barcode: '', notes: '', is_demo: 0,
};

const PARTY_COLUMNS = ['name', 'company_name', 'phone', 'email', 'address', 'shipping_address', 'state', 'gstin', 'tax_id', 'is_demo'];
const PARTY_DEFAULTS = { ...Object.fromEntries(PARTY_COLUMNS.map((c) => [c, ''])), is_demo: 0 };

const DOCUMENT_COLUMNS = [
  'document_type', 'document_number', 'status', 'party_id', 'party_name', 'party_company', 'party_address',
  'party_phone', 'party_email', 'party_gstin', 'party_tax_id', 'party_state', 'shipping_address',
  'place_of_supply', 'reference', 'issue_date', 'due_date', 'currency', 'currency_symbol', 'currency_decimals',
  'exchange_rate', 'tax_mode', 'tax_label', 'subtotal', 'discount', 'taxable', 'tax', 'cgst', 'sgst', 'igst',
  'shipping', 'other_charges', 'other_charges_label', 'round_off', 'grand_total', 'notes', 'terms', 'meta',
  'parent_document_id', 'is_demo', 'folder_id', 'template',
];
const DOCUMENT_DEFAULTS = {
  status: 'DRAFT', party_id: null, party_name: '', party_company: '', party_address: '', party_phone: '', party_email: '',
  party_gstin: '', party_tax_id: '', party_state: '', shipping_address: '', place_of_supply: '', reference: '', due_date: '',
  currency: 'INR', currency_symbol: '₹', currency_decimals: 2, exchange_rate: '1', tax_mode: 'INTRA', tax_label: 'GST',
  subtotal: '0', discount: '0', taxable: '0', tax: '0', cgst: '0', sgst: '0', igst: '0', shipping: '0', other_charges: '0',
  other_charges_label: '', round_off: '0', grand_total: '0', notes: '', terms: '', meta: '{}', parent_document_id: null,
  folder_id: null, template: '', cancelled_at: null, cancel_reason: '', is_demo: 0, issued_at: null, deleted_at: null,
};

const ITEM_COLUMNS = [
  'product_id', 'name', 'description', 'hsn_sac', 'quantity', 'unit', 'unit_price', 'discount_value', 'discount_type',
  'discount_amount', 'tax_rate', 'taxable_amount', 'tax_amount', 'cgst_amount', 'sgst_amount', 'igst_amount',
  'total_amount', 'package_info',
];
const ITEM_DEFAULTS = {
  product_id: null, name: '', description: '', hsn_sac: '', quantity: '1', unit: '', unit_price: '0', discount_value: '0',
  discount_type: 'PERCENT', discount_amount: '0', tax_rate: '0', taxable_amount: '0', tax_amount: '0', cgst_amount: '0',
  sgst_amount: '0', igst_amount: '0', total_amount: '0', package_info: '',
};

const TAX_COLUMNS = ['tax_rate', 'taxable_amount', 'cgst', 'sgst', 'igst', 'tax_amount'];
const TAX_DEFAULTS = { taxable_amount: '0', cgst: '0', sgst: '0', igst: '0', tax_amount: '0' };

const STATUSES = ['DRAFT', 'ISSUED', 'ACCEPTED', 'REJECTED', 'PARTIAL', 'PAID', 'COMPLETED', 'CANCELLED', 'VOID'];

const LIST_COLUMNS = [
  'id', 'document_type', 'document_number', 'status', 'party_name', 'party_company', 'issue_date', 'due_date', 'grand_total',
  'currency', 'currency_symbol', 'currency_decimals', 'parent_document_id', 'is_demo', 'deleted_at', 'created_at', 'updated_at',
  'folder_id', 'cancelled_at',
];
const listRow = (d) => Object.fromEntries(LIST_COLUMNS.map((c) => [c, d[c] ?? null]));

/** Uploadable document formats (files.rs). Executables and scripts are never accepted. */
const ALLOWED_FILES = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  tif: 'image/tiff', tiff: 'image/tiff', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet', csv: 'text/csv', txt: 'text/plain', rtf: 'application/rtf',
  xml: 'application/xml', json: 'application/json', zip: 'application/zip',
};
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// ------------------------------------------------------------------ helpers

const fail = (message) => {
  throw new AppError(message);
};
const idOf = (data) => {
  const id = Number(data?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
};
const requireName = (data, what) => {
  if (!String(data?.name ?? '').trim()) fail(`Please enter a ${what} name.`);
};
const validDocType = (t) => {
  if (!/^[A-Z_]{1,40}$/.test(String(t || ''))) fail('Unknown document type.');
};
const validDate = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
  if (!m) return false;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.getMonth() === Number(m[2]) - 1 && date.getDate() === Number(m[3]);
};

/** Insert (no id) or update (id) a row with allow-listed columns; missing keys stay untouched on update. */
async function upsert(store, id, data, columns, defaults, { touch = true } = {}) {
  const row = pick(data, columns);
  const ts = now();
  if (id) {
    const existing = await store.get(id);
    if (!existing) fail('The record you are editing no longer exists.');
    await store.put({ ...existing, ...row, ...(touch ? { updated_at: ts } : {}) });
    return id;
  }
  return store.add({ ...defaults, ...row, created_at: ts, ...(touch ? { updated_at: ts } : {}) });
}

const addHistory = (history, docId, action, from = '', to = '', note = '') =>
  history.add({ document_id: docId, action, from_status: from, to_status: to, note: String(note || '').slice(0, 500), created_at: now() });

async function tx(stores, mode, fn) {
  const t = (await dataDb()).transaction(stores, mode);
  const s = Object.fromEntries(stores.map((name) => [name, t.objectStore(name)]));
  const result = await fn(s);
  await t.done;
  return result;
}
const read = (stores, fn) => tx(stores, 'readonly', fn);
const write = (stores, fn) => tx(stores, 'readwrite', fn);

async function hexSha256(buffer) {
  if (globalThis.crypto?.subtle) {
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
    return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Array.from(sha256(new Uint8Array(buffer)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Photos from a phone camera are large: scale images down so logos and signatures stay small. */
async function shrinkImage(file, mime) {
  if (file.size <= 600 * 1024 || typeof createImageBitmap !== 'function') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const type = mime === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b || file), type, 0.85));
}

function csvField(value, text) {
  let v = String(value ?? '');
  if (text && /^[=+\-@]/.test(v)) v = `'${v}`;
  return /[,"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ------------------------------------------------------------------ commands

const commands = {
  // ---------------------------------------------------------------- application
  app_info: () => ({
    name: 'DocGen Mobile',
    version: APP_VERSION,
    platform: /Android/.test(navigator.userAgent) ? 'android' : /iPhone|iPad/.test(navigator.userAgent) ? 'ios' : 'web',
    dataFile: 'Stored on this phone (browser storage)',
    remoteConfigured: false,
    fileExtensions: Object.keys(ALLOWED_FILES),
    clockOffsetMs: 0,
  }),
  print_window: () => window.print(),
  open_external: ({ url }) => {
    const lower = String(url).toLowerCase();
    if (!(lower.startsWith('https://') || lower.startsWith('mailto:') || lower.startsWith('tel:')) || url.length > 2048) fail('This link cannot be opened.');
    if (lower.startsWith('https://')) window.open(url, '_blank', 'noopener');
    else window.location.href = url;
  },

  // ---------------------------------------------------------------- settings
  settings_get_all: () =>
    read(['settings'], async ({ settings }) => {
      const [keys, values] = await Promise.all([settings.getAllKeys(), settings.getAll()]);
      return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
    }),
  settings_set: ({ values }) =>
    write(['settings'], async ({ settings }) => {
      for (const [k, v] of Object.entries(values || {})) {
        if (!k || k.length > 100) fail('Invalid setting name.');
        await settings.put(v, k);
      }
    }),
  company_get: () => read(['meta'], async ({ meta }) => (await meta.get('company')) || null),
  company_save: ({ company }) => {
    requireName(company, 'company');
    return write(['meta'], async ({ meta }) => {
      const existing = await meta.get('company');
      const ts = now();
      const next = { ...(existing || { ...COMPANY_DEFAULTS, id: 1, created_at: ts }), ...pick(company, COMPANY_COLUMNS), updated_at: ts };
      await meta.put(next, 'company');
      return next;
    });
  },
  doc_settings_get_all: () =>
    read(['doc_settings'], async ({ doc_settings: ds }) => {
      const [keys, values] = await Promise.all([ds.getAllKeys(), ds.getAll()]);
      return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
    }),
  doc_settings_save: ({ docType, settings }) => {
    validDocType(docType);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) fail('Invalid settings.');
    return write(['doc_settings'], ({ doc_settings: ds }) => ds.put(settings, docType)).then(() => undefined);
  },

  // ---------------------------------------------------------------- numbering
  sequences_list: () => read(['sequences'], async ({ sequences }) => (await sequences.getAll()).sort((a, b) => a.doc_type.localeCompare(b.doc_type))),
  sequence_save: ({ sequence }) => {
    const docType = String(sequence?.doc_type || '');
    validDocType(docType);
    const prefix = String(sequence.prefix || '').trim();
    const format = String(sequence.format || '').trim();
    if (prefix.length > 20 || format.length > 60) fail('The prefix or format is too long.');
    if (!format.includes('{NUM}')) fail('The number format must contain {NUM}.');
    const int = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.trunc(Number(v)) : d);
    return write(['sequences'], async ({ sequences }) => {
      const existing = (await sequences.get(docType)) || { last_period: '' };
      await sequences.put({
        ...existing,
        doc_type: docType,
        prefix,
        format,
        next_number: Math.max(1, int(sequence.next_number, 1)),
        start_number: Math.max(1, int(sequence.start_number, 1)),
        padding: Math.min(12, Math.max(1, int(sequence.padding, 5))),
        reset_yearly: sequence.reset_yearly ? 1 : 0,
      });
    });
  },
  sequence_preview: ({ docType, defaultPrefix, date }) => {
    validDocType(docType);
    return read(['sequences', 'documents', 'settings'], (s) => numbering.preview(s, docType, defaultPrefix, date));
  },

  // ---------------------------------------------------------------- categories
  categories_list: () =>
    read(['categories', 'products'], async ({ categories, products }) => {
      const prods = await products.getAll();
      return (await categories.getAll())
        .map((c) => ({ id: c.id, name: c.name, is_demo: c.is_demo, product_count: prods.filter((p) => p.category_id === c.id).length }))
        .sort(byName);
    }),
  category_save: ({ category }) => {
    requireName(category, 'category');
    return write(['categories'], async ({ categories }) => {
      const id = idOf(category);
      const name = String(category.name).trim().toLowerCase();
      if ((await categories.getAll()).some((c) => c.name.toLowerCase() === name && c.id !== id)) fail('A category with this name already exists.');
      return upsert(categories, id, category, CATEGORY_COLUMNS, { is_demo: 0 }, { touch: false });
    });
  },
  category_delete: ({ id }) =>
    write(['categories', 'products'], async ({ categories, products }) => {
      for (const p of await products.getAll()) if (p.category_id === Number(id)) await products.put({ ...p, category_id: null });
      await categories.delete(Number(id));
    }),

  // ---------------------------------------------------------------- products & services
  products_list: ({ filter } = {}) =>
    read(['products', 'categories'], async ({ products, categories }) => {
      const f = filter || {};
      const cats = new Map((await categories.getAll()).map((c) => [c.id, c.name]));
      const q = String(f.search || '').trim().toLowerCase();
      const limit = Math.min(5000, Math.max(1, Number(f.limit) || 500));
      return (await products.getAll())
        .map((p) => ({ ...p, category_name: cats.get(p.category_id) ?? null }))
        .filter((p) => !q || [p.name, p.sku, p.hsn_sac, p.barcode, p.category_name].some((v) => contains(v, q)))
        .filter((p) => !Number.isInteger(f.category_id) || p.category_id === f.category_id)
        .filter((p) => !['PRODUCT', 'SERVICE'].includes(f.type) || p.type === f.type)
        .sort(byName)
        .slice(0, limit);
    }),
  product_save: ({ product }) => {
    requireName(product, 'product or service');
    if (product.type && !['PRODUCT', 'SERVICE'].includes(product.type)) fail('Some of the entered values are not valid.');
    if (product.tax_type && !['EXCLUSIVE', 'INCLUSIVE', 'EXEMPT'].includes(product.tax_type)) fail('Some of the entered values are not valid.');
    return write(['products'], ({ products }) => upsert(products, idOf(product), product, PRODUCT_COLUMNS, PRODUCT_DEFAULTS));
  },
  product_delete: ({ id }) => write(['products'], ({ products }) => products.delete(Number(id))).then(() => undefined),

  // ---------------------------------------------------------------- parties
  parties_list: ({ search } = {}) =>
    read(['parties'], async ({ parties }) => {
      const q = String(search || '').trim().toLowerCase();
      const rows = (await parties.getAll()).sort(byName);
      if (!q) return rows.slice(0, 1000);
      return rows.filter((p) => [p.name, p.company_name, p.phone, p.gstin].some((v) => contains(v, q))).slice(0, 50);
    }),
  party_save: ({ party }) => {
    requireName(party, 'customer');
    return write(['parties'], ({ parties }) => upsert(parties, idOf(party), party, PARTY_COLUMNS, PARTY_DEFAULTS));
  },
  party_delete: ({ id }) =>
    write(['parties', 'documents'], async ({ parties, documents }) => {
      for (const d of await documents.getAll()) if (d.party_id === Number(id)) await documents.put({ ...d, party_id: null });
      await parties.delete(Number(id));
    }),

  // ---------------------------------------------------------------- documents
  documents_list: ({ filter } = {}) =>
    read(['documents'], async ({ documents }) => {
      const f = filter || {};
      const q = String(f.search || '').trim().toLowerCase();
      const types = Array.isArray(f.types) ? f.types.filter(Boolean) : [];
      const searchTypes = Array.isArray(f.searchTypes) ? f.searchTypes : [];
      const status = STATUSES.includes(f.status) ? f.status : null;
      const rows = (await documents.getAll()).filter((d) => {
        if (f.deleted ? !d.deleted_at : d.deleted_at) return false;
        if (types.length && !types.includes(d.document_type)) return false;
        if (status && d.status !== status) return false;
        if (Number.isInteger(f.folderId)) {
          if (d.folder_id !== f.folderId) return false;
        } else if (f.unfiled && d.folder_id !== null && d.folder_id !== undefined) return false;
        if (f.from && d.issue_date < f.from) return false;
        if (f.to && d.issue_date > f.to) return false;
        if (q) {
          const hit =
            [d.document_number, d.party_name, d.party_company, d.reference].some((v) => contains(v, q)) ||
            (d.__items || []).some((i) => contains(i.name, q)) ||
            searchTypes.includes(d.document_type);
          if (!hit) return false;
        }
        return true;
      });
      rows.sort((a, b) => (a.issue_date < b.issue_date ? 1 : a.issue_date > b.issue_date ? -1 : b.id - a.id));
      const limit = Math.min(1000, Math.max(1, Number(f.limit) || 100));
      const offset = Math.max(0, Number(f.offset) || 0);
      return { total: rows.length, rows: rows.slice(offset, offset + limit).map(listRow) };
    }),

  document_get: ({ id }) =>
    read(['documents', 'history', 'folders'], async ({ documents, history, folders }) => {
      const record = await documents.get(Number(id));
      if (!record) fail('This document could not be found.');
      const { __items: items = [], __taxes: taxes = [], ...doc } = record;
      const all = await documents.getAll();
      const parentDoc = doc.parent_document_id ? all.find((d) => d.id === doc.parent_document_id) : null;
      const folder = doc.folder_id ? await folders.get(doc.folder_id) : null;
      return {
        document: doc,
        items: items.map((it, i) => ({ id: i + 1, document_id: doc.id, position: i, ...it })),
        taxes: [...taxes].sort((a, b) => Number.parseFloat(a.tax_rate) - Number.parseFloat(b.tax_rate)),
        parent: parentDoc ? { id: parentDoc.id, document_type: parentDoc.document_type, document_number: parentDoc.document_number, deleted_at: parentDoc.deleted_at } : null,
        children: all
          .filter((d) => d.parent_document_id === doc.id && !d.deleted_at)
          .sort((a, b) => a.id - b.id)
          .map((d) => ({ id: d.id, document_type: d.document_type, document_number: d.document_number, status: d.status })),
        history: (await history.index('document_id').getAll(doc.id)).sort((a, b) => b.id - a.id).slice(0, 100),
        folder: folder ? { id: folder.id, name: folder.name } : null,
      };
    }),

  /** Save a document with its items and tax breakdown in one transaction; an empty number takes the next one. */
  document_save: ({ payload }) => {
    const doc = payload?.document;
    if (!doc || typeof doc !== 'object') fail('Invalid document.');
    const items = Array.isArray(payload.items) ? payload.items : [];
    const taxes = Array.isArray(payload.taxes) ? payload.taxes : [];
    const docType = String(doc.document_type || '');
    validDocType(docType);
    const status = String(doc.status || '');
    if (!STATUSES.includes(status)) fail('Unknown document status.');
    if (!validDate(doc.issue_date)) fail('Please enter a valid document date.');
    if (items.length > 2000) fail('A document can have at most 2000 items.');

    return write(['documents', 'sequences', 'history', 'settings'], async (s) => {
      const id = idOf(doc);
      let number = String(doc.document_number || '').trim();
      let previous = null;
      if (id) {
        previous = await s.documents.get(id);
        if (!previous || previous.deleted_at) fail('This document no longer exists.');
      }
      if (!number) {
        number = previous ? previous.document_number : await numbering.allocate(s, docType, payload.defaultPrefix || '', doc.issue_date);
      } else {
        if (number.length > 60) fail('The document number is too long.');
        await numbering.ensureUnique(s.documents, docType, number, id);
      }
      const data = { ...doc, document_number: number };
      if (data.meta !== undefined && typeof data.meta !== 'string') data.meta = JSON.stringify(data.meta);
      const ts = now();
      const row = pick(data, DOCUMENT_COLUMNS);
      const record = previous ? { ...previous, ...row, updated_at: ts } : { ...DOCUMENT_DEFAULTS, ...row, created_at: ts, updated_at: ts };
      if (status === 'CANCELLED' && previous?.status !== 'CANCELLED') record.cancelled_at = record.cancelled_at || ts;
      if (status === 'ISSUED' || status === 'PAID') record.issued_at = record.issued_at || ts;
      record.__items = items.map((it) => ({ ...ITEM_DEFAULTS, ...pick(it, ITEM_COLUMNS) }));
      record.__taxes = taxes.map((t) => ({ ...TAX_DEFAULTS, ...pick(t, TAX_COLUMNS) }));
      const docId = previous ? (await s.documents.put(record), id) : await s.documents.add(record);
      if (!previous) await addHistory(s.history, docId, 'CREATED', '', status);
      else if (previous.status !== status) await addHistory(s.history, docId, 'UPDATED', previous.status, status);
      else await addHistory(s.history, docId, 'UPDATED');
      return { id: docId, document_number: number };
    });
  },

  document_set_status: ({ id, status, note = '' }) => {
    if (!STATUSES.includes(status)) fail('Unknown document status.');
    return write(['documents', 'history'], async ({ documents, history }) => {
      const doc = await documents.get(Number(id));
      if (!doc || doc.deleted_at) fail('This document could not be found.');
      if (doc.status === status) return;
      const ts = now();
      const cancel = status === 'CANCELLED' || status === 'VOID';
      await documents.put({
        ...doc,
        status,
        updated_at: ts,
        issued_at: ['ISSUED', 'PAID', 'PARTIAL', 'ACCEPTED', 'COMPLETED'].includes(status) ? doc.issued_at || ts : doc.issued_at,
        cancelled_at: cancel ? ts : null,
        cancel_reason: cancel ? String(note || '').slice(0, 500) : '',
      });
      await addHistory(history, doc.id, 'STATUS', doc.status, status, note);
    });
  },

  document_set_template: ({ id, template }) => {
    if (String(template).length > 40 || !/^[a-z-]*$/.test(String(template))) fail('Unknown template.');
    return write(['documents', 'history'], async ({ documents, history }) => {
      const doc = await documents.get(Number(id));
      if (!doc) fail('This document could not be found.');
      await documents.put({ ...doc, template });
      await addHistory(history, doc.id, 'TEMPLATE', '', '', template);
    });
  },

  /** Soft delete: kept and restorable from "Deleted". */
  document_delete: ({ id }) =>
    write(['documents', 'history'], async ({ documents, history }) => {
      const doc = await documents.get(Number(id));
      if (!doc || doc.deleted_at) return;
      await documents.put({ ...doc, deleted_at: now() });
      await addHistory(history, doc.id, 'DELETED');
    }),

  document_restore: ({ id }) =>
    write(['documents', 'history'], async ({ documents, history }) => {
      const doc = await documents.get(Number(id));
      if (!doc) fail('The requested record was not found.');
      if ((await numbering.takenNumbers(documents, doc.document_type, doc.id)).has(doc.document_number)) {
        fail(`Cannot restore: another document already uses number "${doc.document_number}". Rename that document first.`);
      }
      await documents.put({ ...doc, deleted_at: null, updated_at: now() });
      await addHistory(history, doc.id, 'RESTORED');
    }),

  dashboard_stats: () =>
    read(['documents', 'products', 'parties'], async ({ documents, products, parties }) => {
      const all = await documents.getAll();
      const live = all.filter((d) => !d.deleted_at);
      const count = (key) => Object.entries(live.reduce((acc, d) => ({ ...acc, [d[key]]: (acc[d[key]] || 0) + 1 }), {})).map(([k, n]) => ({ [key]: k, count: n }));
      const t = new Date();
      const monthStart = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`;
      const recent = [...live].sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : b.id - a.id)).slice(0, 10).map(listRow);
      const demo = all.some((d) => d.is_demo) || (await products.getAll()).some((p) => p.is_demo) || (await parties.getAll()).some((p) => p.is_demo);
      return {
        total: live.length,
        thisMonth: live.filter((d) => d.issue_date >= monthStart).length,
        drafts: live.filter((d) => d.status === 'DRAFT').length,
        byType: count('document_type'),
        byStatus: count('status'),
        recent,
        hasDemoData: demo,
      };
    }),

  /** Remove every record created by "Load sample data". Real data is never touched. */
  demo_remove: () =>
    write(['documents', 'history', 'products', 'parties', 'categories'], async (s) => {
      const docs = await s.documents.getAll();
      const demoIds = new Set(docs.filter((d) => d.is_demo).map((d) => d.id));
      for (const d of docs) {
        if (demoIds.has(d.id)) {
          await s.documents.delete(d.id);
          for (const h of await s.history.index('document_id').getAll(d.id)) await s.history.delete(h.id);
        } else if (demoIds.has(d.parent_document_id)) await s.documents.put({ ...d, parent_document_id: null });
      }
      for (const p of await s.products.getAll()) if (p.is_demo) await s.products.delete(p.id);
      for (const p of await s.parties.getAll()) if (p.is_demo) await s.parties.delete(p.id);
      const used = new Set((await s.products.getAll()).map((p) => p.category_id));
      for (const c of await s.categories.getAll()) if (c.is_demo && !used.has(c.id)) await s.categories.delete(c.id);
    }),

  // ---------------------------------------------------------------- images (logo, signature, stamp)
  pick_image: async () => {
    const files = await pickFiles({ accept: 'image/png,image/jpeg,image/webp' });
    if (!files) return null;
    const file = files[0];
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const mime =
      head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
        ? 'image/png'
        : head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
          ? 'image/jpeg'
          : String.fromCharCode(...head.slice(0, 4)) === 'RIFF' && String.fromCharCode(...head.slice(8, 12)) === 'WEBP'
            ? 'image/webp'
            : null;
    if (!mime) fail('Please choose a PNG, JPG or WEBP image.');
    const small = await shrinkImage(file, mime);
    if (small.size > MAX_IMAGE_BYTES) fail('The image is larger than 2 MB. Please choose a smaller image.');
    return readAsDataUrl(small);
  },

  // ---------------------------------------------------------------- backup
  backup_export: async () => {
    const name = `DocGen-Mobile-Backup-${new Date().toISOString().slice(0, 10)}.json`;
    download(new Blob([JSON.stringify(await exportData())], { type: 'application/json' }), name);
    return `Downloads/${name}`;
  },
  /** Called right after the user tapped "Choose backup file". */
  backup_restore: async () => {
    const files = await pickFiles({ accept: '.json,application/json' });
    if (!files) return null;
    let data;
    try {
      data = JSON.parse(await files[0].text());
    } catch {
      fail('This file is not a valid DocGen Mobile backup.');
    }
    await importData(data);
    return { restoredFrom: files[0].name, safetyCopy: 'Kept on this phone' };
  },

  /** Sales register (CSV for Excel / your accountant), the desktop's sales_csv. */
  sales_export: async ({ types, labels, from, to }) => {
    if (!validDate(from) || !validDate(to) || from > to) fail('Please choose a valid period.');
    const docs = await read(['documents'], ({ documents }) => documents.getAll());
    const rows = docs
      .filter((d) => !d.deleted_at && (types || []).includes(d.document_type) && d.issue_date >= from && d.issue_date <= to)
      .sort((a, b) => (a.issue_date === b.issue_date ? String(a.document_number).localeCompare(String(b.document_number)) : a.issue_date < b.issue_date ? -1 : 1));
    if (!rows.length) fail('There are no invoices or notes in this period.');
    const supply = { INTRA: 'Intra-state', INTER: 'Inter-state', NONE: 'No tax' };
    let csv =
      '﻿Date,Document No.,Document Type,Status,Party Name,Party Company,Party GSTIN,Party State,Place of Supply,Supply Type,' +
      'Taxable Value,CGST,SGST,IGST,Total Tax,Grand Total,Currency\r\n';
    for (const d of rows) {
      const fields = [
        [d.issue_date, false], [d.document_number, true], [labels?.[d.document_type] || d.document_type, true], [d.status, true],
        [d.party_name, true], [d.party_company, true], [d.party_gstin, true], [d.party_state, true], [d.place_of_supply, true],
        [supply[d.tax_mode] || '', false], [d.taxable, false], [d.cgst, false], [d.sgst, false], [d.igst, false], [d.tax, false],
        [d.grand_total, false], [d.currency, false],
      ];
      csv += `${fields.map(([v, t]) => csvField(v, t)).join(',')}\r\n`;
    }
    const name = `DocGen-Sales-${from}-to-${to}.csv`;
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), name);
    return { path: `Downloads/${name}`, count: rows.length };
  },

  /** No direct PDF writer in a browser: the caller opens the print dialog ("Save as PDF"). */
  document_save_pdf: () => fail('UNSUPPORTED|Choose "Save as PDF" in the print dialog to download the PDF.'),

  // ---------------------------------------------------------------- folders & external documents
  folders_list: () =>
    read(['folders', 'documents', 'files'], async ({ folders, documents, files }) => {
      const docs = (await documents.getAll()).filter((d) => !d.deleted_at);
      const fs = (await files.getAll()).filter((f) => !f.deleted_at);
      return (await folders.getAll())
        .map((f) => ({ id: f.id, name: f.name, color: f.color || '', document_count: docs.filter((d) => d.folder_id === f.id).length, file_count: fs.filter((x) => x.folder_id === f.id).length }))
        .sort(byName);
    }),
  folder_save: ({ id, name }) => {
    const n = clean(name);
    if (n.length > 80) fail('Folder names can have at most 80 characters.');
    return write(['folders'], async ({ folders }) => {
      if ((await folders.getAll()).some((f) => f.name.toLowerCase() === n.toLowerCase() && f.id !== (id ?? 0))) fail('A folder with this name already exists.');
      if (id) {
        const f = await folders.get(id);
        await folders.put({ ...f, name: n });
        return id;
      }
      return folders.add({ name: n, color: '', created_at: now() });
    });
  },
  folder_delete: ({ id }) =>
    write(['folders', 'documents', 'files'], async ({ folders, documents, files }) => {
      for (const d of await documents.getAll()) if (d.folder_id === id) await documents.put({ ...d, folder_id: null });
      for (const f of await files.getAll()) if (f.folder_id === id) await files.put({ ...f, folder_id: null });
      await folders.delete(id);
    }),
  documents_move: ({ ids, folderId }) =>
    write(['documents'], async ({ documents }) => {
      for (const id of ids || []) {
        const d = await documents.get(id);
        if (d) await documents.put({ ...d, folder_id: folderId ?? null, updated_at: now() });
      }
    }),

  /** Let the user pick files and store them (content de-duplicated by SHA-256). */
  files_import: async ({ folderId = null } = {}) => {
    const picked = await pickFiles({ accept: Object.keys(ALLOWED_FILES).map((e) => `.${e}`).join(','), multiple: true });
    if (!picked) return { added: 0, ids: [], errors: [] };
    const ids = [];
    const errors = [];
    for (const file of picked.slice(0, 100)) {
      const ext = (/\.([^.]+)$/.exec(file.name)?.[1] || '').toLowerCase();
      const mime = ALLOWED_FILES[ext];
      if (!mime) {
        errors.push(`"${file.name}" is not a supported document type.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push(`"${file.name}" is larger than 25 MB.`);
        continue;
      }
      const buffer = await file.arrayBuffer();
      const hash = await hexSha256(buffer);
      const stem = clean(file.name.replace(/\.[^.]+$/, ''));
      ids.push(
        await write(['files', 'blobs'], async ({ files, blobs }) => {
          if (!(await blobs.get(hash))) await blobs.put({ sha256: hash, size: buffer.byteLength, data: new Blob([buffer], { type: mime }) });
          const ts = now();
          return files.add({ name: stem, original_name: clean(file.name), extension: ext, mime, size: file.size, sha256: hash, folder_id: folderId ?? null, notes: '', deleted_at: null, created_at: ts, updated_at: ts });
        }),
      );
    }
    return { added: ids.length, ids, errors };
  },
  files_list: ({ filter } = {}) =>
    read(['files', 'folders'], async ({ files, folders }) => {
      const f = filter || {};
      const names = new Map((await folders.getAll()).map((x) => [x.id, x.name]));
      const q = String(f.search || '').trim().toLowerCase();
      const rows = (await files.getAll())
        .filter((x) => (f.deleted ? x.deleted_at : !x.deleted_at))
        .filter((x) => (Number.isInteger(f.folderId) ? x.folder_id === f.folderId : f.unfiled ? x.folder_id == null : true))
        .filter((x) => !q || [x.name, x.original_name, x.notes].some((v) => contains(v, q)))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id))
        .map((x) => ({ ...x, folder_name: names.get(x.folder_id) ?? null }));
      const limit = Math.min(500, Math.max(1, Number(f.limit) || 100));
      const offset = Math.max(0, Number(f.offset) || 0);
      return { total: rows.length, rows: rows.slice(offset, offset + limit) };
    }),
  file_open: async ({ id }) => {
    const { file, blob } = await fileWithBlob(id);
    openBlob(blob);
    return `${file.name}.${file.extension}`;
  },
  file_export: async ({ id }) => {
    const { file, blob } = await fileWithBlob(id);
    const name = `${clean(file.name)}.${file.extension}`;
    download(blob, name);
    return `Downloads/${name}`;
  },
  file_update: ({ id, name = null, notes = null }) =>
    write(['files'], async ({ files }) => {
      const f = await files.get(id);
      if (!f) fail('This file could not be found.');
      await files.put({ ...f, ...(name !== null ? { name: clean(name) } : {}), ...(notes !== null ? { notes: String(notes).slice(0, 1000) } : {}), updated_at: now() });
    }),
  files_move: ({ ids, folderId }) => updateFiles(ids, () => ({ folder_id: folderId ?? null, updated_at: now() })),
  files_copy: ({ ids, folderId }) =>
    write(['files'], async ({ files }) => {
      const out = [];
      for (const id of ids || []) {
        const f = await files.get(id);
        if (!f) continue;
        const { id: _old, ...rest } = f;
        const ts = now();
        out.push(await files.add({ ...rest, folder_id: folderId ?? null, deleted_at: null, created_at: ts, updated_at: ts }));
      }
      return out;
    }),
  files_delete: ({ ids }) => updateFiles(ids, (f) => (f.deleted_at ? null : { deleted_at: now() })),
  files_restore: ({ ids }) => updateFiles(ids, () => ({ deleted_at: null, updated_at: now() })),
  files_purge: ({ ids }) =>
    write(['files', 'blobs'], async ({ files, blobs }) => {
      for (const id of ids || []) {
        const f = await files.get(id);
        if (f?.deleted_at) await files.delete(id);
      }
      const used = new Set((await files.getAll()).map((f) => f.sha256));
      for (const key of await blobs.getAllKeys()) if (!used.has(key)) await blobs.delete(key);
    }),

  // ---------------------------------------------------------------- desktop-only features (ads, remote configuration)
  ad_state_get: () => ({}),
  ad_state_set: () => undefined,
  ad_event_record: () => undefined,
  remote_config_fetch: () => fail('Not available in DocGen Mobile.'),
};

async function fileWithBlob(id) {
  return read(['files', 'blobs'], async ({ files, blobs }) => {
    const file = await files.get(Number(id));
    if (!file) fail('This file could not be found.');
    const stored = await blobs.get(file.sha256);
    if (!stored) fail('This file could not be found.');
    return { file, blob: stored.data instanceof Blob ? stored.data : new Blob([stored.data], { type: file.mime }) };
  });
}

function updateFiles(ids, patch) {
  return write(['files'], async ({ files }) => {
    for (const id of ids || []) {
      const f = await files.get(id);
      const p = f && patch(f);
      if (p) await files.put({ ...f, ...p });
    }
  });
}

/** Run a command. Errors carry a message meant for the user. */
export async function call(command, args = {}) {
  const handler = commands[command];
  if (!handler) throw new Error(`"${command}" is not available in DocGen Mobile.`);
  try {
    return await handler(args || {});
  } catch (err) {
    if (err instanceof AppError) throw new Error(err.message);
    console.error(`[${command}]`, err);
    if (err?.name === 'QuotaExceededError') throw new Error("Your phone's storage is full. Free some space and try again.");
    throw new Error('Something went wrong while saving your data. Please try again.');
  }
}

export { STORES };
