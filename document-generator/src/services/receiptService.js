/**
 * Payment receipts against invoices (desktop and mobile).
 *
 * A receipt (or payment voucher) is linked to its invoice through `parent_document_id`, the same link
 * "Convert → Payment Receipt" uses. From that link we know what was received before, the balance due,
 * and whether the invoice is now paid in full (status PAID) or in part (PARTIAL).
 */

import { getType } from '../config/documentTypes.js';
import { add, cmp, dec, sub, toFixed } from '../utils/decimal.js';
import { listDocuments, setDocumentStatus } from './documentService.js';

/** Documents a payment can be received (customer) or made (vendor) against. */
export const PAYABLE_TYPES = {
  customer: ['TAX_INVOICE', 'SERVICE_INVOICE', 'BILL_OF_SUPPLY', 'PROFORMA_INVOICE'],
  vendor: ['PURCHASE_INVOICE'],
};

/** Paper sizes a receipt can be printed on (document setting `paperSize`, per receipt `meta.paperSize`). */
export const PAPER_SIZES = [
  { value: 'A4', label: 'A4', hint: '210 × 297 mm' },
  { value: 'A5', label: 'A5', hint: '148 × 210 mm, half of A4' },
];

const open = (d) => d.status !== 'CANCELLED' && d.status !== 'VOID' && !d.deleted_at;

/**
 * Received so far per invoice id, from the other receipts of this kind.
 * @param {string} receiptType  PAYMENT_RECEIPT or PAYMENT_VOUCHER
 * @param {number|null} excludeId  the receipt being edited (not counted)
 */
export async function receivedByInvoice(receiptType, excludeId = null) {
  const { rows } = await listDocuments({ types: [receiptType], limit: 1000 });
  const totals = new Map();
  for (const r of rows) {
    if (!r.parent_document_id || r.id === excludeId || !open(r)) continue;
    totals.set(r.parent_document_id, add(totals.get(r.parent_document_id) || 0n, r.grand_total));
  }
  return totals;
}

/**
 * Invoices a receipt can be made against, newest first, with what was received and the balance.
 * Drafts and cancelled invoices are left out.
 * @returns {Promise<Object[]>} list rows + { received, balance } (decimal strings)
 */
export async function invoicesForReceipt(receiptType, excludeId = null) {
  const type = getType(receiptType);
  const types = PAYABLE_TYPES[type.partyKind === 'vendor' ? 'vendor' : 'customer'];
  const [{ rows }, received] = await Promise.all([listDocuments({ types, limit: 1000 }), receivedByInvoice(receiptType, excludeId)]);
  return rows
    .filter((d) => open(d) && d.status !== 'DRAFT')
    .map((d) => {
      const dp = Number(d.currency_decimals ?? 2);
      const got = received.get(d.id) || 0n;
      const balance = sub(d.grand_total, got);
      return { ...d, received: toFixed(got, dp), balance: toFixed(balance < 0n ? 0n : balance, dp) };
    });
}

/**
 * Fill a receipt from the invoice it is for: party, currency, invoice number / date / amount, what was
 * received before, and the balance as the amount received.
 * @param {Object} doc      receipt document (model.document)
 * @param {Object} invoice  full invoice document (getDocument().document) or a list row
 * @param {string} receivedBefore decimal string
 */
export function receiptFromInvoice(doc, invoice, receivedBefore = '0') {
  const dp = Number(invoice.currency_decimals ?? 2);
  const balance = sub(invoice.grand_total, receivedBefore);
  const party = [
    'party_id', 'party_name', 'party_company', 'party_address', 'party_phone', 'party_email', 'party_gstin', 'party_tax_id', 'party_state',
  ];
  return {
    ...doc,
    ...Object.fromEntries(party.filter((k) => invoice[k] !== undefined).map((k) => [k, invoice[k] ?? ''])),
    currency: invoice.currency,
    currency_symbol: invoice.currency_symbol,
    currency_decimals: invoice.currency_decimals,
    parent_document_id: invoice.id,
    meta: {
      ...doc.meta,
      against: invoice.document_number,
      against_date: invoice.issue_date,
      against_total: toFixed(invoice.grand_total, dp),
      received_before: toFixed(receivedBefore, dp),
      amount_received: toFixed(balance > 0n ? balance : 0n, dp),
    },
  };
}

/** The receipt no longer belongs to an invoice. */
export function detachInvoice(doc) {
  const meta = { ...doc.meta, against: '' };
  delete meta.against_date;
  delete meta.against_total;
  delete meta.received_before;
  return { ...doc, parent_document_id: null, meta };
}

/** Balance after this receipt: invoice amount − received before − this receipt (never below 0). */
export function balanceAfter(meta, amount, dp = 2) {
  if (!meta?.against_total) return null;
  const left = sub(sub(meta.against_total, meta.received_before || '0'), amount || '0');
  return toFixed(left < 0n ? 0n : left, dp);
}

/**
 * After an issued receipt is saved: mark its invoice PAID when everything is received, otherwise PARTIAL.
 * Only Issued and Partly paid invoices change, and only forward. Returns the new status, or null.
 */
export async function settleInvoice(receipt, invoiceStatus) {
  if (!receipt.parent_document_id || receipt.status !== 'ISSUED') return null;
  if (!['ISSUED', 'PARTIAL'].includes(invoiceStatus)) return null; // a Paid invoice is never moved back
  const meta = receipt.meta || {};
  if (!meta.against_total) return null;
  const received = add(meta.received_before || '0', receipt.grand_total ?? meta.amount_received);
  const status = cmp(received, meta.against_total) >= 0 ? 'PAID' : dec(received) > 0n ? 'PARTIAL' : null;
  if (!status || status === invoiceStatus) return null;
  const type = getType(receipt.document_type);
  await setDocumentStatus(receipt.parent_document_id, status, `${type.short} ${receipt.document_number || ''}`.trim());
  return status;
}
