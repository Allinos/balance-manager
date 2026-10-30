/**
 * Payment taken on the bill itself (Payment & Ledger feature): Paid in full, Partial (one or more payments,
 * each with its mode) or Credit. Stored in the bill's meta, so the ledger reads it with the bill:
 *   meta.payment   'full' | 'partial' | 'credit'
 *   meta.payments  [{ amount, mode }]   (full: one entry of the bill total)
 *   meta.paid      total paid on the bill (decimal text; the backend sums it per party)
 * A new bill starts as Paid in full; a bill saved before this feature counts as Credit.
 */

import { add, cmp, dec, toFixed } from '../utils/decimal.js';

/** Bills that can be paid in parts, and the payment document that settles each. */
export const BILL_PAYMENT = {
  TAX_INVOICE: 'PAYMENT_RECEIPT',
  SERVICE_INVOICE: 'PAYMENT_RECEIPT',
  BILL_OF_SUPPLY: 'PAYMENT_RECEIPT',
  PURCHASE_INVOICE: 'PAYMENT_VOUCHER',
};

export const PAYMENT_KINDS = [
  { value: 'full', label: 'Paid in full', short: 'Full' },
  { value: 'partial', label: 'Partial', short: 'Partial' },
  { value: 'credit', label: 'Credit', short: 'Credit' },
];

/** Payment & Ledger switched on (Settings → Features). */
export const ledgerOn = (settings) => !!settings?.ledgerModule;

/** Does this document take a payment section? */
export const takesPayment = (doc, settings) => ledgerOn(settings) && !!BILL_PAYMENT[doc?.document_type];

/** Full / partial / credit of a bill: as chosen, else Paid in full for a new bill and Credit for an older one. */
export const paymentKind = (doc) => (['full', 'partial', 'credit'].includes(doc?.meta?.payment) ? doc.meta.payment : doc?.id ? 'credit' : 'full');

/** The partial payments entered (blank rows kept while editing). */
export const partialRows = (meta) => (Array.isArray(meta?.payments) && meta.payments.length ? meta.payments : [{ amount: '', mode: 'Cash' }]);

const positive = (rows) => rows.filter((p) => dec(p.amount || '0') > 0n);

/** Paid and still due on a bill, from its payment choice and grand total. */
export function paymentSummary(doc, grandTotal, dp = 2) {
  const kind = paymentKind(doc);
  const paid = kind === 'full' ? grandTotal : kind === 'partial' ? positive(partialRows(doc.meta)).reduce((s, p) => add(s, p.amount), 0n) : 0n;
  const due = dec(grandTotal) - dec(paid);
  return { kind, paid: toFixed(paid, dp), due: toFixed(due < 0n ? 0n : due, dp), over: due < 0n };
}

/** An error message for the payment section, or ''. */
export function paymentError(doc, grandTotal) {
  if (paymentKind(doc) !== 'partial') return '';
  return cmp(paymentSummary(doc, grandTotal).paid, grandTotal) > 0 ? 'The payments are more than the bill total. Choose "Paid in full" instead.' : '';
}

/**
 * The meta stored with a bill: payment choice, payments and the total paid.
 * @param {Object} doc  the bill (model.document)
 * @param {string} grandTotal
 */
export function paymentMeta(doc, grandTotal, dp = 2) {
  const kind = paymentKind(doc);
  const mode = doc.meta?.payment_mode || 'Cash';
  const payments =
    kind === 'full'
      ? [{ amount: toFixed(grandTotal, dp), mode }]
      : kind === 'partial'
        ? positive(partialRows(doc.meta)).map((p) => ({ amount: toFixed(p.amount, dp), mode: p.mode || 'Cash' }))
        : [];
  return { payment: kind, payments, paid: paymentSummary(doc, grandTotal, dp).paid };
}

/**
 * The status a bill moves to from what is paid: forward only (Issued → Partly paid → Paid). Drafts and
 * cancelled bills keep theirs. Returns the new status or null.
 */
export function paidStatus(status, paid, total) {
  if (!['ISSUED', 'PARTIAL'].includes(status)) return null;
  const next = dec(total) > 0n && cmp(paid, total) >= 0 ? 'PAID' : dec(paid) > 0n ? 'PARTIAL' : null;
  return next && next !== status ? next : null;
}

/** "UPI ₹5,000 + Cash ₹2,000" → just the modes, for the ledger. */
export const modesOf = (payments) => [...new Set((payments || []).map((p) => p.mode).filter(Boolean))].join(', ');
