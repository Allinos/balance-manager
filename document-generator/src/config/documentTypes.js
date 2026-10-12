/**
 * Document type registry — the single place where every document type is defined.
 *
 * The editor, renderer, numbering, status selector, conversion menu, Document
 * Manager and settings screens all read from this list. Adding a new document
 * type = adding one entry here (see README → "Adding new document types").
 *
 * Research notes (Indian practice, CGST Rule 46/49/55 and common Tally usage):
 *  - Tax Invoice / Service Invoice: supplier & recipient GSTIN, invoice no. (≤16
 *    chars, unique per FY), date, HSN/SAC, quantity & unit, taxable value, tax
 *    rate and CGST/SGST/IGST amounts, place of supply (state + code), reverse
 *    charge Y/N, delivery address if different, signature.
 *  - Bill of Supply: for exempt supplies / composition dealers — no tax charged.
 *  - Delivery Challan: goods moved without sale (job work, approval, stock
 *    transfer) — quantities only.
 *  - Credit / Debit Note: reference the original invoice.
 *  - Payment Voucher: money paid out; also the voucher required for payments
 *    under reverse charge (CGST Rule 52).
 *  - Quotation, Reverse Quotation (a price offer to a supplier), Estimate,
 *    Proforma, Sales/Purchase Order, GRN, Purchase Invoice, Work Order, Job
 *    Completion and Payment Receipt are commercial documents commonly issued by
 *    small businesses (no statutory format).
 *
 * @typedef {Object} DocumentTypeDef
 * @property {string} id                 internal identifier stored in SQLite (UPPER_SNAKE_CASE)
 * @property {string} label              full name
 * @property {string} short              short name for cards/buttons
 * @property {string} prefix             default numbering prefix (e.g. INV → INV-00001)
 * @property {string} title              printed title
 * @property {'sales'|'purchase'|'stock'|'payment'|'service'} group
 * @property {string} partyLabel         heading for the customer/vendor block
 * @property {'customer'|'vendor'} partyKind
 * @property {string} dateLabel          label for the document date
 * @property {string} [dueLabel]         label for the second date (omit to hide)
 * @property {string} [dueSetting]       doc-setting key with the default day offset
 * @property {'standard'|'receipt'} layout
 * @property {boolean} financial         issued copies must be cancelled, not deleted
 * @property {string[]} statuses         allowed statuses, in workflow order
 * @property {Record<string,string>} [statusLabels]  per-type wording (e.g. ISSUED → "Sent")
 * @property {string[]} required         fields that must be filled before saving
 * @property {string[]} optional         additional detail fields offered in the editor (see EXTRA_FIELDS)
 * @property {string} icon               icon name (components/Icon.jsx)
 * @property {string[]} conversions      document types this one can be converted into
 * @property {Object} defaults           default per-type settings
 * @property {boolean} [bankOption]      the editor offers "Show bank details" per document
 */

/** Optional "additional details" fields (stored in document.meta). */
export const EXTRA_FIELDS = {
  buyerOrderNo: { label: "Buyer's order no.", placeholder: 'e.g. PO/2026/118' },
  buyerOrderDate: { label: 'Order date', type: 'date' },
  deliveryNote: { label: 'Delivery note no.', placeholder: 'e.g. DC-00012', help: 'Number of the delivery challan / note sent with the goods, if any.' },
  deliveryNoteDate: { label: 'Delivery note date', type: 'date' },
  dispatchDocNo: { label: 'Dispatch doc. no.', placeholder: 'e.g. LR 45871', help: 'Transport document number, e.g. LR (lorry receipt) or courier docket number.' },
  dispatchedThrough: { label: 'Dispatched through', placeholder: 'e.g. VRL Logistics' },
  destination: { label: 'Destination', placeholder: 'e.g. Mysuru' },
  vehicleNo: { label: 'Vehicle no.', placeholder: 'e.g. KA 01 AB 1234' },
  ewayBillNo: { label: 'E-way bill no.', placeholder: 'e.g. 1912 3456 7890', help: 'Required for moving goods worth more than ₹50,000. Generated on the GST e-way bill portal.' },
  paymentTerms: { label: 'Mode / terms of payment', placeholder: 'e.g. 30 days credit / Advance' },
  termsOfDelivery: { label: 'Terms of delivery', placeholder: 'e.g. Door delivery', help: 'Who pays transport and when ownership passes, e.g. "Ex-works", "Door delivery", "FOR destination".' },
  reverseCharge: { label: 'Tax payable on reverse charge', type: 'yesno', help: 'Choose Yes only when the buyer, not you, must pay the GST (reverse charge mechanism, e.g. GTA or legal services). Usually No.' },
  supplierInvoiceNo: { label: "Supplier's invoice no.", placeholder: 'e.g. SB/1045' },
  supplierInvoiceDate: { label: "Supplier's invoice date", type: 'date' },
  againstInvoice: { label: 'Against invoice no.', placeholder: 'e.g. INV-00012', help: 'Number of the original invoice this note corrects.' },
  againstInvoiceDate: { label: 'Original invoice date', type: 'date' },
  reason: { label: 'Reason', placeholder: 'e.g. Goods returned (damaged)' },
  servicePeriod: { label: 'Service period', placeholder: 'e.g. 1–31 Oct 2026' },
  siteLocation: { label: 'Site / location', placeholder: 'e.g. Whitefield site, Block B' },
  startDate: { label: 'Start date', type: 'date' },
  completedOn: { label: 'Completed on', type: 'date' },
  technician: { label: 'Completed by (technician)', placeholder: 'e.g. Ravi Kumar' },
  purpose: { label: 'Purpose of movement', placeholder: 'e.g. Job work', help: 'Why goods move without a sale, e.g. Job work, Sent on approval, Stock transfer.' },
};

const DISPATCH = ['buyerOrderNo', 'buyerOrderDate', 'deliveryNote', 'dispatchDocNo', 'dispatchedThrough', 'destination', 'vehicleNo', 'ewayBillNo', 'termsOfDelivery'];

const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'CANCELLED'];
const OFFER_STATUSES = ['DRAFT', 'ISSUED', 'ACCEPTED', 'REJECTED', 'CANCELLED'];
const ORDER_STATUSES = ['DRAFT', 'ISSUED', 'COMPLETED', 'CANCELLED'];

const base = {
  group: 'sales',
  partyLabel: 'Bill To',
  partyKind: 'customer',
  dateLabel: 'Date',
  layout: 'standard',
  financial: false,
  required: ['party_name', 'issue_date', 'items'],
  optional: [],
  conversions: [],
  defaults: {},
};

const def = (d) => ({ ...base, ...d });

/** @type {DocumentTypeDef[]} */
export const DOCUMENT_TYPES = [
  def({
    id: 'TAX_INVOICE', label: 'Tax Invoice', short: 'Invoice', prefix: 'INV', title: 'TAX INVOICE',
    dateLabel: 'Invoice Date', dueLabel: 'Due Date', dueSetting: 'dueDays', financial: true, icon: 'invoice',
    statuses: INVOICE_STATUSES,
    optional: ['paymentTerms', 'reverseCharge', ...DISPATCH],
    conversions: ['DELIVERY_CHALLAN', 'CREDIT_NOTE', 'DEBIT_NOTE', 'PAYMENT_RECEIPT'],
    // Bank details + UPI QR code (Settings → Company → UPI ID) so the customer can pay at once.
    defaults: { dueDays: 15, showBank: true, showQr: true, showTaxBreakup: true },
  }),
  def({
    id: 'SERVICE_INVOICE', label: 'Service Invoice', short: 'Service Invoice', prefix: 'SI', title: 'TAX INVOICE',
    group: 'service', dateLabel: 'Invoice Date', dueLabel: 'Due Date', dueSetting: 'dueDays', financial: true, icon: 'receipt',
    statuses: INVOICE_STATUSES,
    optional: ['servicePeriod', 'siteLocation', 'paymentTerms', 'reverseCharge', 'buyerOrderNo', 'buyerOrderDate'],
    conversions: ['CREDIT_NOTE', 'PAYMENT_RECEIPT'],
    defaults: { dueDays: 15, showBank: true, showQr: true, showTaxBreakup: true, defaultUnit: 'Service' },
  }),
  def({
    id: 'QUOTATION', label: 'Quotation', short: 'Quotation', prefix: 'QTN', title: 'QUOTATION',
    partyLabel: 'Quotation For', dateLabel: 'Quotation Date', dueLabel: 'Valid Until', dueSetting: 'validityDays', icon: 'quote',
    statuses: OFFER_STATUSES, statusLabels: { ISSUED: 'Sent' },
    optional: ['paymentTerms', 'termsOfDelivery', 'siteLocation'],
    bankOption: true,
    conversions: ['SALES_ORDER', 'PROFORMA_INVOICE', 'TAX_INVOICE', 'SERVICE_INVOICE', 'WORK_ORDER'],
    defaults: {
      validityDays: 15,
      showBank: false,
    },
  }),
  def({
    // A quotation in the buying direction: the price at which you offer to buy from a supplier.
    id: 'REVERSE_QUOTATION', label: 'Reverse Quotation', short: 'Reverse Quotation', prefix: 'RQ', title: 'REVERSE QUOTATION',
    group: 'purchase', partyLabel: 'Supplier', partyKind: 'vendor', dateLabel: 'Quotation Date', dueLabel: 'Valid Until', dueSetting: 'validityDays', icon: 'quote',
    statuses: OFFER_STATUSES, statusLabels: { ISSUED: 'Sent' },
    optional: ['paymentTerms', 'termsOfDelivery', 'destination'],
    conversions: ['PURCHASE_ORDER'],
    defaults: {
      validityDays: 15,
      showBank: false,
      showQr: false,
    },
  }),
  def({
    id: 'ESTIMATE', label: 'Estimate', short: 'Estimate', prefix: 'EST', title: 'ESTIMATE',
    partyLabel: 'Estimate For', dateLabel: 'Estimate Date', dueLabel: 'Valid Until', dueSetting: 'validityDays', icon: 'calculator',
    statuses: OFFER_STATUSES, statusLabels: { ISSUED: 'Sent' },
    optional: ['siteLocation', 'paymentTerms'],
    conversions: ['QUOTATION', 'TAX_INVOICE', 'SERVICE_INVOICE', 'WORK_ORDER'],
    defaults: { validityDays: 30, showBank: false },
  }),
  def({
    id: 'PROFORMA_INVOICE', label: 'Proforma Invoice', short: 'Proforma', prefix: 'PI', title: 'PROFORMA INVOICE',
    dueLabel: 'Valid Until', dueSetting: 'validityDays', icon: 'proforma',
    statuses: OFFER_STATUSES, statusLabels: { ISSUED: 'Sent' },
    optional: ['paymentTerms', 'termsOfDelivery', 'buyerOrderNo'],
    conversions: ['TAX_INVOICE', 'SERVICE_INVOICE', 'SALES_ORDER'],
    defaults: { validityDays: 15 },
  }),
  def({
    id: 'SALES_ORDER', label: 'Sales Order', short: 'Sales Order', prefix: 'SO', title: 'SALES ORDER',
    partyLabel: 'Customer', dateLabel: 'Order Date', dueLabel: 'Delivery Date', dueSetting: 'deliveryDays', icon: 'cart',
    statuses: ORDER_STATUSES, statusLabels: { ISSUED: 'Confirmed', COMPLETED: 'Fulfilled' },
    optional: ['buyerOrderNo', 'buyerOrderDate', 'paymentTerms', 'termsOfDelivery', 'destination'],
    conversions: ['TAX_INVOICE', 'DELIVERY_CHALLAN', 'PROFORMA_INVOICE'],
    defaults: { deliveryDays: 7, showBank: false },
  }),
  def({
    id: 'DELIVERY_CHALLAN', label: 'Delivery Challan', short: 'Delivery Challan', prefix: 'DC', title: 'DELIVERY CHALLAN',
    group: 'stock', partyLabel: 'Deliver To', dateLabel: 'Challan Date', icon: 'truck',
    statuses: ORDER_STATUSES, statusLabels: { ISSUED: 'Dispatched', COMPLETED: 'Delivered' },
    optional: ['purpose', 'dispatchedThrough', 'vehicleNo', 'ewayBillNo', 'destination', 'buyerOrderNo'],
    conversions: ['TAX_INVOICE'],
    defaults: { showPrices: false, showTax: false, showPackage: true, showBank: false, showAmountInWords: false, showQr: false },
  }),
  def({
    id: 'PURCHASE_ORDER', label: 'Purchase Order', short: 'Purchase Order', prefix: 'PO', title: 'PURCHASE ORDER',
    group: 'purchase', partyLabel: 'Vendor', partyKind: 'vendor', dateLabel: 'PO Date', dueLabel: 'Expected By', dueSetting: 'deliveryDays', icon: 'bag',
    statuses: ORDER_STATUSES, statusLabels: { ISSUED: 'Sent', COMPLETED: 'Received' },
    optional: ['paymentTerms', 'termsOfDelivery', 'destination'],
    conversions: ['GOODS_RECEIPT', 'PURCHASE_INVOICE'],
    defaults: { deliveryDays: 7, showBank: false, showQr: false },
  }),
  def({
    id: 'GOODS_RECEIPT', label: 'Goods Receipt Note', short: 'Goods Receipt', prefix: 'GRN', title: 'GOODS RECEIPT NOTE',
    group: 'stock', partyLabel: 'Received From (Vendor)', partyKind: 'vendor', dateLabel: 'Receipt Date', icon: 'inbox',
    statuses: ['DRAFT', 'COMPLETED', 'CANCELLED'], statusLabels: { COMPLETED: 'Received' },
    optional: ['supplierInvoiceNo', 'supplierInvoiceDate', 'vehicleNo', 'dispatchedThrough'],
    conversions: ['PURCHASE_INVOICE'],
    defaults: { showPrices: false, showTax: false, showPackage: true, showBank: false, showAmountInWords: false },
  }),
  def({
    id: 'PURCHASE_INVOICE', label: 'Purchase Invoice / Bill', short: 'Purchase Bill', prefix: 'PB', title: 'PURCHASE INVOICE',
    group: 'purchase', partyLabel: 'Supplier', partyKind: 'vendor', dateLabel: 'Bill Date', dueLabel: 'Due Date', dueSetting: 'dueDays', financial: true, icon: 'file',
    statuses: INVOICE_STATUSES, statusLabels: { ISSUED: 'Recorded' },
    optional: ['supplierInvoiceNo', 'supplierInvoiceDate', 'reverseCharge', 'paymentTerms'],
    conversions: ['DEBIT_NOTE', 'PAYMENT_VOUCHER'],
    defaults: { dueDays: 30, showBank: false, showQr: false },
  }),
  def({
    id: 'CREDIT_NOTE', label: 'Credit Note', short: 'Credit Note', prefix: 'CN', title: 'CREDIT NOTE',
    partyLabel: 'Issued To', financial: true, icon: 'minus',
    statuses: ['DRAFT', 'ISSUED', 'COMPLETED', 'CANCELLED'], statusLabels: { COMPLETED: 'Adjusted' },
    required: ['party_name', 'issue_date', 'items', 'meta.againstInvoice'],
    optional: ['againstInvoice', 'againstInvoiceDate', 'reason', 'reverseCharge'],
    defaults: { showBank: false },
  }),
  def({
    id: 'DEBIT_NOTE', label: 'Debit Note', short: 'Debit Note', prefix: 'DN', title: 'DEBIT NOTE',
    partyLabel: 'Issued To', financial: true, icon: 'plus',
    statuses: INVOICE_STATUSES,
    required: ['party_name', 'issue_date', 'items', 'meta.againstInvoice'],
    optional: ['againstInvoice', 'againstInvoiceDate', 'reason'],
    defaults: { showBank: true },
  }),
  def({
    id: 'BILL_OF_SUPPLY', label: 'Bill of Supply', short: 'Bill of Supply', prefix: 'BOS', title: 'BILL OF SUPPLY',
    dateLabel: 'Bill Date', dueLabel: 'Due Date', dueSetting: 'dueDays', financial: true, icon: 'receipt',
    statuses: INVOICE_STATUSES,
    optional: ['paymentTerms', 'buyerOrderNo', 'dispatchedThrough', 'destination'],
    conversions: ['PAYMENT_RECEIPT'],
    defaults: {
      dueDays: 15, showTax: false, showTaxBreakup: false,
      notes: 'Composition taxable person, not eligible to collect tax on supplies.',
    },
  }),
  def({
    id: 'PAYMENT_RECEIPT', label: 'Payment Receipt', short: 'Receipt', prefix: 'RCT', title: 'PAYMENT RECEIPT',
    group: 'payment', partyLabel: 'Received From', dateLabel: 'Receipt Date', layout: 'receipt', financial: true, icon: 'wallet',
    statuses: ['DRAFT', 'ISSUED', 'CANCELLED'],
    required: ['party_name', 'issue_date', 'meta.amount_received'],
    defaults: { showBank: false, showQr: false, showTaxBreakup: false },
  }),
  def({
    // Money paid out (to a supplier, for expenses, or under reverse charge — CGST Rule 52).
    id: 'PAYMENT_VOUCHER', label: 'Payment Voucher', short: 'Payment Voucher', prefix: 'PV', title: 'PAYMENT VOUCHER',
    group: 'payment', partyLabel: 'Paid To', partyKind: 'vendor', dateLabel: 'Payment Date', layout: 'receipt', financial: true, icon: 'coins',
    statuses: ['DRAFT', 'ISSUED', 'CANCELLED'], statusLabels: { ISSUED: 'Paid' },
    required: ['party_name', 'issue_date', 'meta.amount_received'],
    defaults: { showBank: false, showQr: false, showTaxBreakup: false },
  }),
  def({
    id: 'WORK_ORDER', label: 'Work Order', short: 'Work Order', prefix: 'WO', title: 'WORK ORDER',
    group: 'service', partyLabel: 'Work Order To', partyKind: 'vendor', dateLabel: 'Order Date', dueLabel: 'Complete By', dueSetting: 'deliveryDays', icon: 'tool',
    statuses: ORDER_STATUSES, statusLabels: { ISSUED: 'In progress' },
    optional: ['siteLocation', 'startDate', 'paymentTerms'],
    conversions: ['JOB_COMPLETION', 'PURCHASE_INVOICE'],
    defaults: { deliveryDays: 15, showBank: false },
  }),
  def({
    id: 'JOB_COMPLETION', label: 'Job / Service Completion', short: 'Job Completion', prefix: 'JCR', title: 'JOB COMPLETION REPORT',
    group: 'service', partyLabel: 'Customer', dateLabel: 'Report Date', icon: 'check',
    statuses: ['DRAFT', 'COMPLETED', 'CANCELLED'],
    optional: ['siteLocation', 'completedOn', 'technician', 'buyerOrderNo'],
    conversions: ['SERVICE_INVOICE', 'TAX_INVOICE'],
    defaults: { showPrices: false, showTax: false, showBank: false, showAmountInWords: false },
  }),
];

export const TYPE_MAP = Object.fromEntries(DOCUMENT_TYPES.map((t) => [t.id, t]));

/** @returns {DocumentTypeDef} */
export const getType = (id) =>
  TYPE_MAP[id] || def({
    id, label: id, short: id, prefix: id.slice(0, 3), title: id.replace(/_/g, ' '), icon: 'documents',
    statuses: ['DRAFT', 'ISSUED', 'CANCELLED'],
  });

export const STATUS_LABELS = {
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  PARTIAL: 'Partly paid',
  PAID: 'Paid',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  VOID: 'Void',
};

/** Every status value used anywhere (for filters). */
export const STATUSES = Object.keys(STATUS_LABELS);

/** Status wording for a given document type. */
export const statusLabel = (typeId, status) => getType(typeId).statusLabels?.[status] || STATUS_LABELS[status] || status;

/** Statuses a document of this type can move to (current status always included). */
export function statusesFor(typeId, current) {
  const list = getType(typeId).statuses;
  return current && !list.includes(current) ? [...list, current] : list;
}

/** Business types offered during setup; they decide which document types appear first. */
export const BUSINESS_TYPES = [
  {
    id: 'trading', label: 'Trading / Retail / Wholesale', icon: 'cart',
    types: ['TAX_INVOICE', 'QUOTATION', 'PROFORMA_INVOICE', 'SALES_ORDER', 'DELIVERY_CHALLAN', 'PURCHASE_ORDER', 'GOODS_RECEIPT', 'PURCHASE_INVOICE', 'CREDIT_NOTE', 'PAYMENT_RECEIPT'],
  },
  {
    id: 'manufacturing', label: 'Manufacturing', icon: 'building',
    types: ['TAX_INVOICE', 'QUOTATION', 'SALES_ORDER', 'DELIVERY_CHALLAN', 'PURCHASE_ORDER', 'GOODS_RECEIPT', 'PURCHASE_INVOICE', 'WORK_ORDER', 'CREDIT_NOTE', 'PAYMENT_RECEIPT'],
  },
  {
    id: 'services', label: 'Services / Repair / Maintenance', icon: 'tool',
    types: ['SERVICE_INVOICE', 'QUOTATION', 'ESTIMATE', 'PROFORMA_INVOICE', 'WORK_ORDER', 'JOB_COMPLETION', 'PAYMENT_RECEIPT', 'CREDIT_NOTE', 'PURCHASE_INVOICE'],
  },
  {
    id: 'construction', label: 'Construction / Contractor / Interiors', icon: 'layers',
    types: ['TAX_INVOICE', 'ESTIMATE', 'QUOTATION', 'WORK_ORDER', 'JOB_COMPLETION', 'PURCHASE_ORDER', 'GOODS_RECEIPT', 'DELIVERY_CHALLAN', 'PURCHASE_INVOICE', 'PAYMENT_RECEIPT'],
  },
  {
    id: 'freelancer', label: 'Freelancer / Agency / Consultant', icon: 'user',
    types: ['SERVICE_INVOICE', 'QUOTATION', 'ESTIMATE', 'PROFORMA_INVOICE', 'PAYMENT_RECEIPT', 'CREDIT_NOTE'],
  },
  {
    id: 'composition', label: 'Composition dealer (Bill of Supply)', icon: 'receipt',
    types: ['BILL_OF_SUPPLY', 'QUOTATION', 'DELIVERY_CHALLAN', 'PURCHASE_ORDER', 'PURCHASE_INVOICE', 'PAYMENT_RECEIPT'],
  },
];

export const DEFAULT_VISIBLE_TYPES = BUSINESS_TYPES[0].types;

/** Document types whose label matches a free-text search (used by Document Manager search). */
export function typesMatching(text) {
  const q = text.trim().toLowerCase();
  if (q.length < 3) return [];
  return DOCUMENT_TYPES.filter(
    (t) => t.label.toLowerCase().includes(q) || t.short.toLowerCase().includes(q) || t.prefix.toLowerCase() === q,
  ).map((t) => t.id);
}

/** Document types in the sales data download (Document Manager → Download). */
export const SALES_REGISTER_TYPES = ['TAX_INVOICE', 'SERVICE_INVOICE', 'BILL_OF_SUPPLY', 'CREDIT_NOTE', 'DEBIT_NOTE'];

export const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'];

/**
 * Built-in print templates. Templates only change the look; the document data is the same.
 * The ids (tally-pro, tally-std) are stored in settings and documents, so they stay as they are.
 */
export const TEMPLATES = [
  { id: 'tally-pro', label: 'Professional', description: 'Complete boxed GST invoice: dispatch details, HSN summary, declaration.' },
  { id: 'tally-std', label: 'Standard', description: 'Compact boxed layout, traditional and information dense.' },
  { id: 'modern', label: 'Modern', description: 'Clean, spacious design with your brand colour.' },
  { id: 'simple', label: 'Simple', description: 'Plain black & white, minimal lines. Prints well anywhere.' },
];

/** Map older setting values to current template ids. */
export const normaliseTemplate = (id) => ({ tally: 'tally-std', zoho: 'modern' })[id] || (TEMPLATES.some((t) => t.id === id) ? id : 'tally-pro');
