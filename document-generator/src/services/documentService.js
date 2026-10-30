/**
 * Document engine: create, load, calculate, save, convert and duplicate documents.
 *
 * The editor works on a plain "model": `{ document, items }` where every money
 * or quantity field is a decimal string. Totals are always recalculated with
 * the deterministic decimal engine right before saving, so stored totals can
 * never drift from their line items.
 */

import { call } from './api.js';
import { EXTRA_FIELDS, getType } from '../config/documentTypes.js';
import { isValidGstin } from '../config/states.js';
import { SHIP_FIELDS, shippingMetaFor, shippingOn } from '../config/shipping.js';
import { resolveDocSettings, withDocumentOptions, CURRENCY_PRESETS } from '../config/defaults.js';
import { calcDocument, chargesOf } from '../utils/calc.js';
import { dec, toFixed, round } from '../utils/decimal.js';
import { todayISO, addDays } from '../utils/dates.js';
import { saveParty } from './catalogService.js';
import { paidStatus, paymentError, paymentMeta, takesPayment } from './billPayment.js';

let keySeq = 0;
export const newKey = () => `k${Date.now().toString(36)}${(keySeq++).toString(36)}`;

/** Currency definition (code, symbol, decimals, rate) from settings or presets. */
export function currencyInfo(settings, code) {
  const list = settings.currencies || [];
  const found = list.find((c) => c.code === code) || CURRENCY_PRESETS.find((c) => c.code === code);
  return {
    code: code || 'INR',
    symbol: found?.symbol ?? '',
    decimals: Number.isInteger(found?.decimals) ? found.decimals : 2,
    rate: found?.rate || '1',
  };
}

export function defaultTaxMode(settings) {
  if (settings.taxSystem === 'VAT') return 'SIMPLE';
  if (settings.taxSystem === 'NONE') return 'NONE';
  return 'INTRA';
}

export const taxLabelFor = (settings) => (settings.taxSystem === 'VAT' ? settings.taxLabel || 'VAT' : 'GST');

/** A blank, editable item row. `typeId` picks the type's default unit (e.g. "Service"). */
export function blankItem(settings, typeId) {
  const typeUnit = typeId ? getType(typeId).defaults.defaultUnit : '';
  return {
    _key: newKey(),
    product_id: null,
    name: '',
    description: '',
    hsn_sac: '',
    quantity: '1',
    unit: typeUnit || (settings.units && settings.units[0]) || 'Nos',
    unit_price: '0',
    discount_value: '0',
    discount_type: 'PERCENT',
    tax_rate: settings.taxSystem === 'NONE' ? '0' : String(settings.defaultTaxRate ?? '0'),
    package_info: '',
  };
}

/** A blank additional-charge row (label, amount before tax, tax rate). */
export const blankCharge = (label = '') => ({ _key: newKey(), label, amount: '', tax_rate: '0' });

/**
 * The document with its additional charges as a list (meta.charges). A document saved before the list existed
 * had one Shipping and one Other charges amount: they become two rows at 0 % tax, so the total stays the same.
 * Used when a document is edited, duplicated or converted; viewing an old document never changes it.
 */
export function withCharges(doc) {
  const meta = doc.meta || {};
  if (chargesOf(doc)) return { ...doc, meta: { ...meta, charges: meta.charges.map((c) => ({ ...c, _key: c._key || newKey() })) } };
  const charges = [];
  if (dec(doc.shipping) !== 0n) charges.push({ ...blankCharge('Shipping'), amount: String(doc.shipping) });
  if (dec(doc.other_charges) !== 0n) charges.push({ ...blankCharge(doc.other_charges_label || 'Other charges'), amount: String(doc.other_charges) });
  return { ...doc, shipping: '0', other_charges: '0', meta: { ...meta, charges } };
}

/** Charges worth saving (a row with a label or an amount); the editor's row keys are not stored. */
const savedCharges = (list) =>
  (list || []).filter((c) => String(c.label || '').trim() || dec(c.amount) !== 0n).map(({ label = '', amount = '0', tax_rate = '0' }) => ({ label: String(label).trim(), amount: String(amount || '0'), tax_rate: String(tax_rate || '0') }));

function parseMeta(meta) {
  if (!meta) return {};
  if (typeof meta === 'object') return meta;
  try {
    return JSON.parse(meta) || {};
  } catch {
    return {};
  }
}

/**
 * A new, unsaved document of the given type.
 * @param {string} typeId
 * @param {{settings: Object, company: Object, docSettings: Object}} ctx
 */
export function newDocument(typeId, { settings, docSettings }) {
  const type = getType(typeId);
  const ds = resolveDocSettings(typeId, settings, docSettings);
  const cur = currencyInfo(settings, settings.baseCurrency);
  const today = todayISO();
  const offset = type.dueSetting ? Number(ds[type.dueSetting] || 0) : 0;
  return {
    document: {
      id: null,
      document_type: type.id,
      document_number: '',
      // A receipt is written when the money comes in, so it starts as issued.
      status: type.layout === 'receipt' ? 'ISSUED' : 'DRAFT',
      party_id: null,
      party_name: '',
      party_company: '',
      party_address: '',
      party_phone: '',
      party_email: '',
      party_gstin: '',
      party_tax_id: '',
      party_state: '',
      shipping_address: '',
      place_of_supply: '',
      reference: '',
      issue_date: today,
      due_date: type.dueLabel && offset > 0 ? addDays(today, offset) : '',
      currency: cur.code,
      currency_symbol: cur.symbol,
      currency_decimals: cur.decimals,
      exchange_rate: '1',
      tax_mode: defaultTaxMode(settings),
      tax_label: taxLabelFor(settings),
      shipping: '0',
      other_charges: '0',
      other_charges_label: 'Other charges',
      round_off: '0',
      notes: ds.notes || '',
      terms: ds.terms || '',
      parent_document_id: null,
      is_demo: 0,
      meta: {
        roundOffMode: settings.autoRoundOff ? 'AUTO' : 'NONE',
        amount_received: '',
        payment_mode: 'Cash',
        payment_reference: '',
        against: '',
        charges: [],
        // The declaration printed on this document (editable per document; Settings → Document Types sets the default).
        declaration: ds.declaration || '',
        // Shipping address switch: starts as set in Settings → Documents (config/shipping.js).
        ...shippingMetaFor(type.id, settings),
      },
    },
    items: type.layout === 'receipt' ? [] : [blankItem(settings, type.id)],
    parent: null,
  };
}

/** Convert a loaded bundle (from `getDocument`) into an editable model. */
export function modelFromBundle(bundle) {
  const d = bundle.document;
  return {
    document: { ...d, meta: parseMeta(d.meta) },
    items: bundle.items.map((it) => ({
      _key: newKey(),
      product_id: it.product_id,
      name: it.name,
      description: it.description,
      hsn_sac: it.hsn_sac,
      quantity: it.quantity,
      unit: it.unit,
      unit_price: it.unit_price,
      discount_value: it.discount_value,
      discount_type: it.discount_type,
      tax_rate: it.tax_rate,
      package_info: it.package_info,
    })),
    parent: bundle.parent,
  };
}

/**
 * Build a new model from an existing document — used for Duplicate and Convert.
 * @param {Object} bundle        result of getDocument()
 * @param {string} targetType    document type to create
 * @param {'duplicate'|'convert'} mode
 * @param {Object} ctx
 */
export function modelFromSource(bundle, targetType, mode, ctx) {
  const fresh = newDocument(targetType, ctx);
  const source = modelFromBundle(bundle);
  const s = withCharges(source.document);
  const partyFields = [
    'party_id', 'party_name', 'party_company', 'party_address', 'party_phone', 'party_email', 'party_gstin',
    'party_tax_id', 'party_state', 'shipping_address', 'place_of_supply',
  ];
  const carried = Object.fromEntries(partyFields.map((f) => [f, s[f]]));
  const money = {
    currency: s.currency,
    currency_symbol: s.currency_symbol,
    currency_decimals: s.currency_decimals,
    exchange_rate: s.exchange_rate,
    tax_mode: s.tax_mode,
    tax_label: s.tax_label,
    shipping: s.shipping,
    other_charges: s.other_charges,
    other_charges_label: s.other_charges_label,
  };
  const document = {
    ...fresh.document,
    ...carried,
    ...money,
    is_demo: 0,
    notes: mode === 'duplicate' ? s.notes : fresh.document.notes,
    terms: mode === 'duplicate' ? s.terms : fresh.document.terms,
    reference: mode === 'convert' ? '' : s.reference,
    parent_document_id: mode === 'convert' ? s.id : null,
    meta: {
      ...fresh.document.meta,
      roundOffMode: s.meta.roundOffMode || fresh.document.meta.roundOffMode,
      charges: s.meta.charges.map((c) => ({ ...c, _key: newKey() })),
      // The shipping address goes with the customer's details.
      ...(typeof s.meta.showShipping === 'boolean' ? { showShipping: s.meta.showShipping } : {}),
      ...Object.fromEntries(SHIP_FIELDS.filter((f) => s.meta[f]).map((f) => [f, s.meta[f]])),
      // A duplicate keeps this document's own "show bank details" choice, paper size and declaration.
      ...(mode === 'duplicate' && typeof s.meta.showBank === 'boolean' ? { showBank: s.meta.showBank } : {}),
      ...(mode === 'duplicate' && ['A4', 'A5'].includes(s.meta.paperSize) ? { paperSize: s.meta.paperSize } : {}),
      ...(mode === 'duplicate' && typeof s.meta.declaration === 'string' ? { declaration: s.meta.declaration } : {}),
    },
  };
  if (targetType === 'PROOF_OF_DELIVERY' && mode === 'convert') {
    // The delivery's references: the invoice or challan it comes from, and the transport details already entered.
    const m = s.meta || {};
    for (const k of ['vehicleNo', 'dispatchDocNo', 'dispatchedThrough', 'buyerOrderNo', 'deliveryNote', 'invoiceRef']) if (m[k]) document.meta[k] = m[k];
    if (getType(s.document_type).group === 'sales' && s.document_number) document.meta.invoiceRef = s.document_number;
    if (s.document_type === 'DELIVERY_CHALLAN' && s.document_number) document.meta.deliveryNote = s.document_number;
  }
  if (getType(targetType).layout === 'receipt') {
    document.meta.amount_received = mode === 'duplicate' ? s.meta.amount_received || s.grand_total : s.grand_total;
    document.meta.against = mode === 'convert' ? s.document_number : s.meta.against || '';
    document.meta.payment_mode = s.meta.payment_mode || 'Cash';
  }
  const items = getType(targetType).layout === 'receipt' ? [] : source.items.map((it) => ({ ...it, _key: newKey() }));
  return {
    document,
    items: items.length || getType(targetType).layout === 'receipt' ? items : fresh.items,
    parent: mode === 'convert' ? { id: s.id, document_type: s.document_type, document_number: s.document_number } : null,
  };
}

/** Rows that contain something worth saving. */
const meaningful = (it) => it.name.trim() !== '' || dec(it.unit_price) !== 0n || it.description.trim() !== '';

/**
 * Calculate a model for preview/saving.
 * @returns {{lines: Object[], taxes: Object[], totals: Object, docSettings: Object}}
 */
export function calculate(model, ctx) {
  const { document: doc } = model;
  const type = getType(doc.document_type);
  const ds = withDocumentOptions(resolveDocSettings(doc.document_type, ctx.settings, ctx.docSettings), doc);
  const decimals = Number(doc.currency_decimals ?? 2);
  if (type.layout === 'receipt') {
    const amount = toFixed(round(doc.meta.amount_received || '0', decimals), decimals);
    const zero = toFixed(0, decimals);
    return {
      lines: [],
      taxes: [],
      docSettings: ds,
      totals: {
        subtotal: amount, discount: zero, taxable: amount, tax: zero, cgst: zero, sgst: zero, igst: zero,
        shipping: zero, other_charges: zero, round_off: zero, grand_total: amount,
      },
    };
  }
  const items = model.items.filter(meaningful);
  const result = calcDocument(doc, items, {
    decimals,
    roundOffMode: doc.meta.roundOffMode || 'NONE',
    includeTax: ds.showTax !== false,
  });
  return { ...result, docSettings: ds };
}

/** A saved customer's / vendor's details on a document (picking it, or "Record payment" from its profile). */
export function partyPatch(p, doc) {
  return {
    party_id: p.id,
    party_name: p.name,
    party_company: p.company_name || '',
    party_address: p.address || '',
    party_phone: p.phone || '',
    party_email: p.email || '',
    party_gstin: p.gstin || '',
    party_tax_id: p.tax_id || '',
    party_state: p.state || '',
    shipping_address: p.shipping_address || '',
    place_of_supply: p.state || doc.place_of_supply,
    meta: { ...doc.meta, ...Object.fromEntries(SHIP_FIELDS.map((f) => [f, ''])) },
  };
}

/** New document for a saved party (Customers & Vendors → profile → new invoice, Payment received). */
export async function newDocumentForParty(typeId, ctx, partyId) {
  const m = newDocument(typeId, ctx);
  const { party } = await call('party_ledger', { id: Number(partyId) });
  m.document = { ...m.document, ...partyPatch(party, m.document) };
  return m;
}

/** Validate a model; returns an error message or ''. */
export function validate(model) {
  const doc = model.document;
  const type = getType(doc.document_type);
  if (!doc.party_name.trim()) return `Please enter the ${type.partyKind === 'vendor' ? 'vendor' : 'customer'} name.`;
  if (!doc.issue_date) return 'Please choose the document date.';
  if (doc.party_gstin && !isValidGstin(doc.party_gstin)) return `The ${type.partyKind === 'vendor' ? 'vendor' : 'customer'} GSTIN "${doc.party_gstin}" is not valid. It has 15 characters, e.g. 27AAPFU0939F1ZV.`;
  if (shippingOn(doc) && doc.meta?.ship_gstin && !isValidGstin(doc.meta.ship_gstin)) return `The shipping address GST number "${doc.meta.ship_gstin}" is not valid. It has 15 characters, e.g. 27AAPFU0939F1ZV.`;
  for (const field of type.required) {
    if (!field.startsWith('meta.') || field === 'meta.amount_received') continue;
    const key = field.slice(5);
    if (!String(doc.meta?.[key] ?? '').trim()) return `Please fill in "${EXTRA_FIELDS[key]?.label || key}".`;
  }
  if (type.layout === 'receipt') {
    if (dec(doc.meta.amount_received) <= 0n) return 'Please enter the amount received.';
    return '';
  }
  const items = model.items.filter(meaningful);
  if (items.length === 0) return 'Please add at least one item.';
  const unnamed = items.findIndex((it) => !it.name.trim());
  if (unnamed >= 0) return `Item ${unnamed + 1} needs a name.`;
  const badQty = items.findIndex((it) => dec(it.quantity) <= 0n);
  if (badQty >= 0) return `Item ${badQty + 1} needs a quantity greater than zero.`;
  if (dec(doc.exchange_rate) <= 0n) return 'The exchange rate must be greater than zero.';
  return '';
}

/**
 * Save a model. Optionally stores the customer for reuse first.
 * @returns {Promise<{id: number, document_number: string}>}
 */
export async function saveDocument(model, ctx, { saveCustomer = false } = {}) {
  const error = validate(model);
  if (error) throw new Error(error);
  const doc = { ...model.document };
  if (saveCustomer) {
    doc.party_id = await saveParty({
      id: doc.party_id || undefined,
      name: doc.party_name.trim(),
      company_name: doc.party_company,
      phone: doc.party_phone,
      email: doc.party_email,
      address: doc.party_address,
      shipping_address: doc.shipping_address,
      state: doc.party_state,
      gstin: doc.party_gstin,
      tax_id: doc.party_tax_id,
      // Customer or vendor from the document type; one already saved as the other kind becomes "both".
      kind: getType(doc.document_type).partyKind === 'vendor' ? 'vendor' : 'customer',
      merge_kind: true,
    });
  }
  const { lines, taxes, totals } = calculate(model, ctx);
  const type = getType(doc.document_type);
  // Payment & Ledger: the payment taken on a bill, and its status moved forward (Issued → Partly paid → Paid).
  if (takesPayment(doc, ctx.settings)) {
    const problem = paymentError(doc, totals.grand_total);
    if (problem) throw new Error(problem);
    const pay = paymentMeta(doc, totals.grand_total, Number(doc.currency_decimals ?? 2));
    doc.meta = { ...doc.meta, ...pay };
    doc.status = paidStatus(doc.status, pay.paid, totals.grand_total) || doc.status;
  }
  const payload = {
    defaultPrefix: type.prefix,
    document: {
      ...doc,
      id: doc.id || undefined,
      party_name: doc.party_name.trim(),
      ...totals,
      meta: chargesOf(doc) ? { ...doc.meta, charges: savedCharges(doc.meta.charges) } : doc.meta,
    },
    items: lines.map((l) => ({
      product_id: l.product_id || null,
      name: l.name.trim(),
      description: l.description,
      hsn_sac: l.hsn_sac,
      quantity: l.quantity,
      unit: l.unit,
      unit_price: l.unit_price,
      discount_value: l.discount_value || '0',
      discount_type: l.discount_type || 'PERCENT',
      discount_amount: l.discount_amount,
      tax_rate: l.tax_rate,
      taxable_amount: l.taxable_amount,
      tax_amount: l.tax_amount,
      cgst_amount: l.cgst_amount,
      sgst_amount: l.sgst_amount,
      igst_amount: l.igst_amount,
      total_amount: l.total_amount,
      package_info: l.package_info || '',
    })),
    taxes,
  };
  const result = await call('document_save', { payload });
  return { ...result, party_id: doc.party_id };
}

export const listDocuments = (filter) => call('documents_list', { filter });
export const getDocument = (id) => call('document_get', { id: Number(id) });
export const setDocumentStatus = (id, status, note = '') => call('document_set_status', { id, status, note });
export const setDocumentTemplate = (id, template) => call('document_set_template', { id, template });
export const deleteDocument = (id) => call('document_delete', { id });
export const restoreDocument = (id) => call('document_restore', { id });
export const dashboardStats = () => call('dashboard_stats');
/** Save the sales data of a period as CSV. Resolves to { path, count }, or null if cancelled. */
export const exportSales = ({ types, labels, from, to }) => call('sales_export', { types, labels, from, to });

/** Build the payload consumed by the HTML renderer from a model. */
export function renderPayload(model, ctx) {
  const calc = calculate(model, ctx);
  return {
    company: ctx.company || {},
    document: { ...model.document, ...calc.totals },
    items: calc.lines,
    taxes: calc.taxes,
    settings: { ...ctx.settings, doc: calc.docSettings },
    parent: model.parent,
  };
}
