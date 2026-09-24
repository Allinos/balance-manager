/**
 * Document type registry.
 *
 * Every document type is described here once. The editor, renderer, numbering,
 * conversion menu and settings screens all read from this list, so adding a new
 * type is a matter of adding one entry (see README → "Adding new document types").
 *
 * @typedef {Object} DocumentTypeDef
 * @property {string} id               internal identifier stored in SQLite
 * @property {string} label            full name
 * @property {string} short            short name for cards/buttons
 * @property {string} prefix           default numbering prefix
 * @property {string} title            printed title
 * @property {string} partyLabel       heading for the customer/vendor block
 * @property {'customer'|'vendor'} partyKind
 * @property {string} dateLabel        label for the document date
 * @property {string} [dueLabel]       label for the second date (omit to hide)
 * @property {string} [dueSetting]     doc-setting key holding the default day offset
 * @property {'standard'|'receipt'} layout
 * @property {boolean} financial       issued copies should be voided, not deleted
 * @property {string} icon             icon name (components/Icon.jsx)
 * @property {string[]} conversions    document types this one can be converted into
 * @property {Object} defaults         default per-type settings
 */

/** @type {DocumentTypeDef[]} */
export const DOCUMENT_TYPES = [
  {
    id: 'TAX_INVOICE',
    label: 'Tax Invoice',
    short: 'Invoice',
    prefix: 'INV',
    title: 'TAX INVOICE',
    partyLabel: 'Bill To',
    partyKind: 'customer',
    dateLabel: 'Invoice Date',
    dueLabel: 'Due Date',
    dueSetting: 'dueDays',
    layout: 'standard',
    financial: true,
    icon: 'invoice',
    conversions: ['DELIVERY_CHALLAN', 'CREDIT_NOTE', 'DEBIT_NOTE', 'PAYMENT_RECEIPT'],
    defaults: { dueDays: 15, showQr: false, showTaxBreakup: true },
  },
  {
    id: 'QUOTATION',
    label: 'Quotation / Estimate',
    short: 'Quotation',
    prefix: 'QTN',
    title: 'QUOTATION',
    partyLabel: 'Quotation For',
    partyKind: 'customer',
    dateLabel: 'Quotation Date',
    dueLabel: 'Valid Until',
    dueSetting: 'validityDays',
    layout: 'standard',
    financial: false,
    icon: 'quote',
    conversions: ['SALES_ORDER', 'PROFORMA_INVOICE', 'TAX_INVOICE'],
    defaults: {
      validityDays: 15,
      showBank: false,
      terms: '1. Prices are valid for the period mentioned above.\n2. Taxes extra as applicable.\n3. Delivery within 7 days of order confirmation.',
    },
  },
  {
    id: 'PROFORMA_INVOICE',
    label: 'Proforma Invoice',
    short: 'Proforma',
    prefix: 'PI',
    title: 'PROFORMA INVOICE',
    partyLabel: 'Bill To',
    partyKind: 'customer',
    dateLabel: 'Date',
    dueLabel: 'Valid Until',
    dueSetting: 'validityDays',
    layout: 'standard',
    financial: false,
    icon: 'proforma',
    conversions: ['TAX_INVOICE', 'SALES_ORDER'],
    defaults: { validityDays: 15, terms: '1. This is a proforma invoice and not a demand for payment.\n2. Final invoice will be issued on dispatch.' },
  },
  {
    id: 'SALES_ORDER',
    label: 'Sales Order',
    short: 'Sales Order',
    prefix: 'SO',
    title: 'SALES ORDER',
    partyLabel: 'Customer',
    partyKind: 'customer',
    dateLabel: 'Order Date',
    dueLabel: 'Delivery Date',
    dueSetting: 'deliveryDays',
    layout: 'standard',
    financial: false,
    icon: 'cart',
    conversions: ['TAX_INVOICE', 'DELIVERY_CHALLAN'],
    defaults: { deliveryDays: 7, showBank: false, terms: '1. Delivery as per the schedule above.\n2. Payment as per agreed terms.' },
  },
  {
    id: 'PURCHASE_ORDER',
    label: 'Purchase Order',
    short: 'Purchase Order',
    prefix: 'PO',
    title: 'PURCHASE ORDER',
    partyLabel: 'Vendor',
    partyKind: 'vendor',
    dateLabel: 'PO Date',
    dueLabel: 'Expected By',
    dueSetting: 'deliveryDays',
    layout: 'standard',
    financial: false,
    icon: 'bag',
    conversions: ['GOODS_RECEIPT'],
    defaults: {
      deliveryDays: 7,
      showBank: false,
      showQr: false,
      terms: '1. Please mention the PO number on your invoice.\n2. Goods must match the specification and quantity ordered.',
    },
  },
  {
    id: 'DELIVERY_CHALLAN',
    label: 'Delivery Challan',
    short: 'Delivery Challan',
    prefix: 'DC',
    title: 'DELIVERY CHALLAN',
    partyLabel: 'Deliver To',
    partyKind: 'customer',
    dateLabel: 'Challan Date',
    layout: 'standard',
    financial: false,
    icon: 'truck',
    conversions: ['TAX_INVOICE'],
    defaults: {
      showPrices: false,
      showTax: false,
      showPackage: true,
      showBank: false,
      showAmountInWords: false,
      showQr: false,
      terms: 'Received the above goods in good condition.',
    },
  },
  {
    id: 'GOODS_RECEIPT',
    label: 'Goods Receipt Note',
    short: 'Goods Receipt',
    prefix: 'GRN',
    title: 'GOODS RECEIPT NOTE',
    partyLabel: 'Received From (Vendor)',
    partyKind: 'vendor',
    dateLabel: 'Receipt Date',
    layout: 'standard',
    financial: false,
    icon: 'inbox',
    conversions: [],
    defaults: { showPrices: false, showTax: false, showPackage: true, showBank: false, showAmountInWords: false, terms: '' },
  },
  {
    id: 'CREDIT_NOTE',
    label: 'Credit Note',
    short: 'Credit Note',
    prefix: 'CN',
    title: 'CREDIT NOTE',
    partyLabel: 'Issued To',
    partyKind: 'customer',
    dateLabel: 'Date',
    layout: 'standard',
    financial: true,
    icon: 'minus',
    conversions: [],
    defaults: { showBank: false, terms: 'This credit note is issued against the invoice referenced above.' },
  },
  {
    id: 'DEBIT_NOTE',
    label: 'Debit Note',
    short: 'Debit Note',
    prefix: 'DN',
    title: 'DEBIT NOTE',
    partyLabel: 'Issued To',
    partyKind: 'customer',
    dateLabel: 'Date',
    layout: 'standard',
    financial: true,
    icon: 'plus',
    conversions: [],
    defaults: { showBank: true, terms: 'This debit note is issued against the invoice referenced above.' },
  },
  {
    id: 'PAYMENT_RECEIPT',
    label: 'Payment Receipt',
    short: 'Receipt',
    prefix: 'RCT',
    title: 'PAYMENT RECEIPT',
    partyLabel: 'Received From',
    partyKind: 'customer',
    dateLabel: 'Receipt Date',
    layout: 'receipt',
    financial: true,
    icon: 'receipt',
    conversions: [],
    defaults: { showBank: false, showQr: false, showTaxBreakup: false, terms: '' },
  },
];

export const TYPE_MAP = Object.fromEntries(DOCUMENT_TYPES.map((t) => [t.id, t]));

/** @returns {DocumentTypeDef} */
export const getType = (id) =>
  TYPE_MAP[id] || {
    ...DOCUMENT_TYPES[0],
    id,
    label: id,
    short: id,
    title: id.replace(/_/g, ' '),
    conversions: [],
  };

/** Default visible cards on the Documents page (two rows of five). */
export const DEFAULT_VISIBLE_TYPES = DOCUMENT_TYPES.map((t) => t.id);

export const STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'CANCELLED', 'VOID'];

export const STATUS_LABELS = {
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
  VOID: 'Void',
};

/** Document types whose label matches a free-text search (used by Created Documents search). */
export function typesMatching(text) {
  const q = text.trim().toLowerCase();
  if (q.length < 3) return [];
  return DOCUMENT_TYPES.filter(
    (t) => t.label.toLowerCase().includes(q) || t.short.toLowerCase().includes(q) || t.prefix.toLowerCase() === q,
  ).map((t) => t.id);
}

export const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'];
