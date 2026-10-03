/**
 * Documents in DocGen Mobile: types, numbering, GST calculation and listing helpers.
 * A document is stored as one IndexedDB record including its items.
 */

import { calcDocument } from './calc.js';
import { stateFromGstin } from './states.js';
import { db, kvGet, kvSet, put, upsertByName } from './db.js';

const SALES_STATUSES = ['DRAFT', 'SENT', 'PAID', 'CANCELLED'];
const OFFER_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CANCELLED'];
const DELIVERY_STATUSES = ['DRAFT', 'SENT', 'DELIVERED', 'CANCELLED'];

export const STATUS_LABELS = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  PAID: 'Paid',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  DELIVERED: 'Delivered',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};

/** Document types available on mobile (the common ones; the desktop app has more). */
export const TYPES = [
  { id: 'TAX_INVOICE', label: 'Tax Invoice', short: 'Invoice', plural: 'Invoices', prefix: 'INV', title: 'TAX INVOICE', party: 'Bill To', dueLabel: 'Due Date', dueDays: 15, statuses: SALES_STATUSES, bank: true, qr: true, sale: true },
  { id: 'QUOTATION', label: 'Quotation', short: 'Quotation', plural: 'Quotations', prefix: 'QTN', title: 'QUOTATION', party: 'Quotation For', dueLabel: 'Valid Until', dueDays: 15, statuses: OFFER_STATUSES, bank: false, bankOption: true },
  { id: 'PROFORMA_INVOICE', label: 'Proforma Invoice', short: 'Proforma', plural: 'Proforma Invoices', prefix: 'PI', title: 'PROFORMA INVOICE', party: 'Bill To', dueLabel: 'Valid Until', dueDays: 15, statuses: OFFER_STATUSES, bank: true, qr: true },
  { id: 'ESTIMATE', label: 'Estimate', short: 'Estimate', plural: 'Estimates', prefix: 'EST', title: 'ESTIMATE', party: 'Estimate For', dueLabel: 'Valid Until', dueDays: 30, statuses: OFFER_STATUSES, bank: false, bankOption: true },
  { id: 'DELIVERY_CHALLAN', label: 'Delivery Challan', short: 'Challan', plural: 'Delivery Challans', prefix: 'DC', title: 'DELIVERY CHALLAN', party: 'Deliver To', statuses: DELIVERY_STATUSES, prices: false },
  { id: 'BILL_OF_SUPPLY', label: 'Bill of Supply', short: 'Bill of Supply', plural: 'Bills of Supply', prefix: 'BOS', title: 'BILL OF SUPPLY', party: 'Bill To', dueLabel: 'Due Date', dueDays: 15, statuses: SALES_STATUSES, bank: true, qr: true, noTax: true, sale: true },
  { id: 'CREDIT_NOTE', label: 'Credit Note', short: 'Credit Note', plural: 'Credit Notes', prefix: 'CN', title: 'CREDIT NOTE', party: 'Issued To', statuses: ['DRAFT', 'SENT', 'CANCELLED'], bank: false },
  { id: 'PURCHASE_ORDER', label: 'Purchase Order', short: 'Purchase Order', plural: 'Purchase Orders', prefix: 'PO', title: 'PURCHASE ORDER', party: 'Vendor', dueLabel: 'Expected By', dueDays: 7, statuses: ['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED'], bank: false },
];
export const TYPE_MAP = Object.fromEntries(TYPES.map((t) => [t.id, t]));
export const typeOf = (id) => TYPE_MAP[id] || TYPES[0];

export const DEFAULT_TERMS = {
  TAX_INVOICE: 'Payment due within 15 days of invoice date.',
  QUOTATION: '1. Prices are valid for the period mentioned above.\n2. Taxes as applicable.',
  PROFORMA_INVOICE: 'This is a proforma invoice and not a demand for payment.',
  ESTIMATE: 'This is an estimate. Final charges may vary with actual quantities.',
  DELIVERY_CHALLAN: 'Received the above goods in good condition.',
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let keySeq = 0;
export const newKey = () => `k${Date.now().toString(36)}${(keySeq++).toString(36)}`;
export const blankItem = () => ({ key: newKey(), name: '', hsn: '', qty: '1', unit: 'Nos', rate: '', taxRate: '18', discount: '' });

/** GST mode: same state → CGST + SGST, other state → IGST; not GST registered or bill of supply → no tax. */
export function taxModeFor(company, type, placeOfSupply) {
  if (type.noTax || !company?.gstin) return 'NONE';
  const own = (company.state || stateFromGstin(company.gstin) || '').trim().toLowerCase();
  const pos = (placeOfSupply || '').trim().toLowerCase();
  return !pos || pos === own ? 'INTRA' : 'INTER';
}

export function newDocument(typeId, { company, settings }) {
  const type = typeOf(typeId);
  const date = todayISO();
  return {
    type: type.id,
    number: '',
    status: 'DRAFT',
    date,
    dueDate: type.dueDays ? addDays(date, type.dueDays) : '',
    party: { name: '', phone: '', email: '', gstin: '', state: '', address: '' },
    placeOfSupply: company?.state || '',
    items: [blankItem()],
    roundOff: true,
    notes: '',
    terms: settings?.terms?.[type.id] ?? DEFAULT_TERMS[type.id] ?? '',
    showBank: type.bank,
  };
}

/** Totals with the shared GST engine (same rules as the desktop app). */
export function calculate(doc, company) {
  const type = typeOf(doc.type);
  const taxMode = taxModeFor(company, type, doc.placeOfSupply);
  const items = doc.items
    .filter((i) => i.name.trim() || Number(i.rate))
    .map((i) => ({
      ...i,
      quantity: i.qty || '0',
      unit_price: i.rate || '0',
      discount_value: i.discount || '0',
      discount_type: 'PERCENT',
      tax_rate: i.taxRate || '0',
    }));
  const r = calcDocument({ tax_mode: taxMode, shipping: '0', other_charges: '0' }, items, { roundOffMode: doc.roundOff ? 'AUTO' : 'NONE' });
  return { ...r, taxMode };
}

/** Next number for a type (INV-00001 …), stored per type on the device. */
export async function nextNumber(typeId) {
  const counters = await kvGet('counters', {});
  const n = (counters[typeId] || 0) + 1;
  await kvSet('counters', { ...counters, [typeId]: n });
  return `${typeOf(typeId).prefix}-${String(n).padStart(5, '0')}`;
}

/** Save a document; new ones get their number now. Saves the customer and new products for next time. */
export async function saveDocument(doc, company) {
  const calc = calculate(doc, company);
  const now = new Date().toISOString();
  const record = {
    ...doc,
    items: doc.items.filter((i) => i.name.trim() || Number(i.rate)),
    number: doc.number || (await nextNumber(doc.type)),
    taxMode: calc.taxMode,
    totals: calc.totals,
    updatedAt: now,
    createdAt: doc.createdAt || now,
  };
  const id = await put('documents', record);
  if (record.party.name.trim()) await upsertByName('parties', { ...record.party, name: record.party.name.trim() });
  for (const it of record.items) {
    if (!it.name.trim()) continue;
    const exists = await (await db()).getFromIndex('products', 'name', it.name.trim().toLowerCase());
    if (!exists) await upsertByName('products', { name: it.name.trim(), hsn: it.hsn, unit: it.unit, rate: it.rate, taxRate: it.taxRate });
  }
  return { ...record, id };
}

export const money = (value, { symbol = true } = {}) =>
  new Intl.NumberFormat('en-IN', symbol ? { style: 'currency', currency: 'INR', minimumFractionDigits: 2 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(value || 0),
  );
export const shortDate = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
