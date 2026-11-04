/**
 * Messages to customers and vendors (Android app):
 *  - SMS alerts (Settings → Features → SMS alerts): when a bill or a payment is saved for a party with a phone
 *    number, a short SMS goes out through the phone's own SMS service.
 *  - WhatsApp reminders: a button that opens WhatsApp with the outstanding amount and a payment reminder
 *    (works in the browser too, through wa.me).
 */

import { getType } from '@desktop/config/documentTypes.js';
import { formatMoney } from '@desktop/utils/format.js';
import { bridge, native, openLink } from './native.js';

export const SMS_SETTING = 'smsAlerts';
export const smsOn = (settings) => native() && !!settings?.[SMS_SETTING];

/** Documents that send an SMS alert when first saved (a saved bill counts as created, draft or issued). */
const SMS_TYPES = new Set(['TAX_INVOICE', 'SERVICE_INVOICE', 'BILL_OF_SUPPLY', 'RETAIL_BILL', 'PURCHASE_INVOICE', 'PAYMENT_RECEIPT', 'PAYMENT_VOUCHER', 'CREDIT_NOTE', 'DEBIT_NOTE']);

/** A phone number as WhatsApp / SMS expect it: digits, Indian numbers with 91 in front. */
export function phoneDigits(phone, country = '91') {
  let d = String(phone || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d.slice(1);
  d = d.replace(/^0+/, '');
  if (d.length === 10) return `${country}${d}`;
  return d.length >= 8 ? d : '';
}

const amount = (v, doc) => formatMoney(v, { currency: doc?.currency || 'INR', currency_symbol: doc?.currency_symbol || '₹', currency_decimals: doc?.currency_decimals ?? 2 });
const firstName = (name) => String(name || '').trim() || 'Customer';

/** The SMS text for a saved document. */
export function smsText(doc, company, due = null) {
  const t = getType(doc.document_type);
  const from = company?.name || 'us';
  const who = firstName(doc.party_name);
  const total = amount(doc.grand_total, doc);
  if (doc.document_type === 'PAYMENT_RECEIPT') return `Dear ${who}, we have received ${total} (receipt ${doc.document_number}). Thank you! - ${from}`;
  if (doc.document_type === 'PAYMENT_VOUCHER') return `Dear ${who}, we have paid you ${total} (voucher ${doc.document_number}). - ${from}`;
  const dueText = due && Number(due) > 0 ? ` Balance due: ${amount(due, doc)}.` : '';
  return `Dear ${who}, ${t.short} ${doc.document_number} for ${total} dated ${doc.issue_date}.${dueText} Thank you for your business. - ${from}`;
}

/**
 * Send the SMS alert for a saved document when SMS alerts are on. Never throws: a message that cannot be sent
 * must not stop the bill from being saved. Returns 'sent', 'skipped' or the reason it was not sent.
 */
export async function smsAlert(doc, { settings, company, due = null } = {}) {
  if (!smsOn(settings) || !doc || ['CANCELLED', 'VOID'].includes(doc.status) || !SMS_TYPES.has(doc.document_type)) return 'skipped';
  const phone = phoneDigits(doc.party_phone);
  if (!phone) return 'no phone';
  const res = await bridge('sms.send', { phone, text: smsText(doc, company, due) });
  return res?.sent ? 'sent' : res?.reason || 'not sent';
}

const longDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** The payment reminder text (WhatsApp and SMS). With payBy (YYYY-MM-DD) it asks to pay by that date. */
export function reminderText({ name, due, company, upi, doc, payBy = '' }) {
  const pay = upi ? ` You can pay by UPI to ${upi}.` : '';
  const bill = doc?.document_number ? ` for ${getType(doc.document_type).short} ${doc.document_number}` : '';
  const when = /^\d{4}-\d{2}-\d{2}$/.test(payBy) ? `Kindly pay by ${longDate(payBy)}.` : 'Kindly pay at the earliest.';
  return `Dear ${firstName(name)}, this is a friendly reminder that ${amount(due, doc)} is outstanding${bill} with ${company?.name || 'us'}.${pay} ${when} Thank you!`;
}

export const whatsappUrl = (phone, text) => `https://wa.me/${phoneDigits(phone)}?text=${encodeURIComponent(text)}`;

/**
 * Send the reminder by SMS. Android app: the phone's SMS service (or, without the SMS permission, the SMS app with
 * the message filled in). Browser: the phone's SMS app with the message ready to send.
 * Returns 'sent' | 'opened' | 'no phone'.
 */
export async function sendSmsReminder({ phone, ...rest }) {
  const digits = phoneDigits(phone);
  if (!digits) return 'no phone';
  const text = reminderText(rest);
  if (native()) {
    const res = await bridge('sms.send', { phone: digits, text });
    return res?.sent ? 'sent' : 'opened';
  }
  window.open(`sms:+${digits}?body=${encodeURIComponent(text)}`, '_self');
  return 'opened';
}

/** Open WhatsApp with the reminder (to the party's number, or WhatsApp's own chooser without one). */
export function sendWhatsAppReminder({ phone, ...rest }) {
  const text = reminderText(rest);
  const digits = phoneDigits(phone);
  return openLink(digits ? whatsappUrl(digits, text) : `https://wa.me/?text=${encodeURIComponent(text)}`);
}
