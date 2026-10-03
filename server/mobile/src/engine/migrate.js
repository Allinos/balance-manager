/**
 * Data from the first DocGen Mobile version (one record per document, its own field names) converted into the
 * desktop-compatible records used now. Runs once at start, and when an old backup file is restored.
 */

import { calcDocument } from '@desktop/utils/calc.js';
import { getType } from '@desktop/config/documentTypes.js';
import { db as legacyDb } from '../lib/db.js';
import { SEEDED_SEQUENCES, dataDb, now, sequenceRow } from './db.js';

const STATUS = { SENT: 'ISSUED', DELIVERED: 'COMPLETED', RECEIVED: 'COMPLETED' };

const pad = (n) => String(n).padStart(2, '0');
function localTime(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return now();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const ITEM_KEYS = [
  'product_id', 'name', 'description', 'hsn_sac', 'quantity', 'unit', 'unit_price', 'discount_value', 'discount_type', 'discount_amount',
  'tax_rate', 'taxable_amount', 'tax_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'total_amount', 'package_info',
];

function convertDocument(old, id) {
  const type = getType(old.type);
  const taxMode = old.taxMode || 'INTRA';
  const input = (old.items || []).map((i) => ({
    product_id: null,
    name: String(i.name || ''),
    description: '',
    hsn_sac: i.hsn || '',
    quantity: String(i.qty || '1'),
    unit: i.unit || 'Nos',
    unit_price: String(i.rate || '0'),
    discount_value: String(i.discount || '0'),
    discount_type: 'PERCENT',
    tax_rate: String(i.taxRate || '0'),
    package_info: '',
  }));
  const roundOffMode = old.roundOff ? 'AUTO' : 'NONE';
  const { lines, taxes, totals } = calcDocument({ tax_mode: taxMode, shipping: '0', other_charges: '0', round_off: '0' }, input, { decimals: 2, roundOffMode });
  const party = old.party || {};
  const created = localTime(old.createdAt);
  return {
    id,
    document_type: type.id,
    document_number: old.number,
    status: STATUS[old.status] || old.status || 'DRAFT',
    party_id: null,
    party_name: party.name || '',
    party_company: '',
    party_address: party.address || '',
    party_phone: party.phone || '',
    party_email: party.email || '',
    party_gstin: party.gstin || '',
    party_tax_id: '',
    party_state: party.state || '',
    shipping_address: '',
    place_of_supply: old.placeOfSupply || party.state || '',
    reference: '',
    issue_date: old.date,
    due_date: old.dueDate || '',
    currency: 'INR',
    currency_symbol: '₹',
    currency_decimals: 2,
    exchange_rate: '1',
    tax_mode: taxMode,
    tax_label: 'GST',
    ...totals,
    other_charges_label: '',
    notes: old.notes || '',
    terms: old.terms || '',
    meta: JSON.stringify({ roundOffMode, ...(type.bankOption ? { showBank: !!old.showBank } : {}), amount_received: '', payment_mode: 'Cash', payment_reference: '', against: '' }),
    parent_document_id: null,
    folder_id: null,
    template: '',
    cancelled_at: old.status === 'CANCELLED' ? localTime(old.updatedAt) : null,
    cancel_reason: '',
    is_demo: 0,
    issued_at: null,
    deleted_at: null,
    created_at: created,
    updated_at: localTime(old.updatedAt),
    __items: lines.map((l) => Object.fromEntries(ITEM_KEYS.map((k) => [k, l[k] ?? (k === 'product_id' ? null : '')]))),
    __taxes: taxes,
  };
}

/** Old backup / old database contents → the `stores` part of a current backup. */
export function convertV1(old) {
  const c = old.company || {};
  const company = c.name
    ? {
        id: 1,
        name: c.name, legal_name: '', trade_name: '', address: c.address || '', city: '', state: c.state || '', state_code: '', pin: '',
        country: 'India', phone: c.phone || '', email: c.email || '', website: '', gstin: c.gstin || '', pan: '', vat_number: '',
        logo: '', stamp: '', signature: '', bank_name: c.bankName || '', account_holder: c.accountName || '', account_number: c.accountNumber || '',
        ifsc: c.ifsc || '', swift: '', iban: '', branch: '', upi_id: c.upi || '', currency: 'INR', created_at: now(), updated_at: now(),
      }
    : null;
  const counters = old.counters || {};
  const sequences = SEEDED_SEQUENCES.map(([t, p]) => sequenceRow(t, p));
  for (const [t, n] of Object.entries(counters)) {
    const seq = sequences.find((s) => s.doc_type === t) || (sequences.push(sequenceRow(t, getType(t).prefix)), sequences.at(-1));
    seq.next_number = Number(n) + 1;
  }
  const documents = (old.documents || []).filter((d) => d?.type && d.number && d.date).map((d, i) => convertDocument(d, i + 1));
  return {
    settings: [['setupComplete', true]],
    doc_settings: Object.entries(old.settings?.terms || {}).map(([t, terms]) => [t, { terms }]),
    company,
    sequences,
    categories: [],
    products: (old.products || []).filter((p) => p?.name).map((p, i) => ({
      id: i + 1, type: 'PRODUCT', name: p.name, sku: '', category_id: null, description: '', hsn_sac: p.hsn || '', unit: p.unit || 'Nos',
      selling_price: String(p.rate || '0'), purchase_price: '0', tax_rate: String(p.taxRate || '0'), tax_type: 'EXCLUSIVE', barcode: '', notes: '',
      is_demo: 0, created_at: localTime(p.createdAt), updated_at: localTime(p.updatedAt),
    })),
    parties: (old.parties || []).filter((p) => p?.name).map((p, i) => ({
      id: i + 1, name: p.name, company_name: '', phone: p.phone || '', email: p.email || '', address: p.address || '', shipping_address: '',
      state: p.state || '', gstin: p.gstin || '', tax_id: '', is_demo: 0, created_at: localTime(p.createdAt), updated_at: localTime(p.updatedAt),
    })),
    documents,
    history: documents.map((d, i) => ({ id: i + 1, document_id: d.id, action: 'CREATED', from_status: '', to_status: d.status, note: '', created_at: d.created_at })),
    folders: [],
    files: [],
    blobs: [],
  };
}

/** Move data saved by the first mobile version into the current database (once). */
export async function migrateFromV1(writeStores) {
  const d = await dataDb();
  if (await d.get('meta', 'migrated-v1')) return false;
  const old = await legacyDb();
  const [company, settings, counters, documents, parties, products] = await Promise.all([
    old.get('kv', 'company'),
    old.get('kv', 'settings'),
    old.get('kv', 'counters'),
    old.getAll('documents'),
    old.getAll('parties'),
    old.getAll('products'),
  ]);
  const empty = !(await d.get('meta', 'company')) && (await d.count('documents')) === 0;
  const hasOld = company?.name || documents.length;
  if (hasOld && empty) await writeStores(convertV1({ company, settings, counters, documents, parties, products }));
  await d.put('meta', now(), 'migrated-v1');
  return !!(hasOld && empty);
}
