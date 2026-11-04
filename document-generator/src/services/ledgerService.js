/**
 * Payment & Ledger for customers and vendors (desktop and mobile; Settings → Features → Payment & Ledger).
 *
 * The ledger is not a second set of books: it is read from the documents themselves, so it always agrees with
 * them and can never be posted twice. Every invoice, bill, credit / debit note, receipt and payment voucher of a
 * saved customer or vendor (party_id) is a ledger line, and so is the payment taken on a bill (meta.paid, see
 * billPayment.js); cancelled and deleted documents are left out.
 *
 * Sign: + = they owe you ("I'll get"), − = you owe them ("I'll give").
 *   You gave  (+): sales invoice, service invoice, bill of supply, debit note, payment voucher (money paid out)
 *   You got   (−): payment receipt (money in), credit note, purchase bill (goods / services received)
 * Settling bills: a payment linked to a bill (parent_document_id, "Convert → Receipt") settles that bill; every
 * other payment ("Payment received" / "Payment made") settles the oldest open bills first. Money beyond the open
 * bills simply shows in the balance (I'll give to a customer, I'll get from a vendor).
 */

import { call } from './api.js';
import { getType } from '../config/documentTypes.js';
import { add, dec, toFixed } from '../utils/decimal.js';
import { BILL_PAYMENT, paidStatus } from './billPayment.js';
import { newDocumentForParty, saveDocument, setDocumentStatus } from './documentService.js';

export { BILL_PAYMENT };

export const LEDGER_SIGN = {
  TAX_INVOICE: 1,
  SERVICE_INVOICE: 1,
  BILL_OF_SUPPLY: 1,
  RETAIL_BILL: 1,
  DEBIT_NOTE: 1,
  PAYMENT_VOUCHER: 1,
  CREDIT_NOTE: -1,
  PAYMENT_RECEIPT: -1,
  PURCHASE_INVOICE: -1,
};
export const LEDGER_TYPES = Object.keys(LEDGER_SIGN);
const PAYMENTS = ['PAYMENT_RECEIPT', 'PAYMENT_VOUCHER'];

/**
 * A ledger entry made straight from a profile (phone: Given / Received), without a bill: goods sold or bought without
 * a bill, credit, an opening balance, goods returned … Stored as a document of type LEDGER_ENTRY (never listed with
 * the documents) with meta { side: 'gave' | 'got', reason, payment_mode, settles }. `settles` is the payment pool it
 * joins ('PAYMENT_RECEIPT' / 'PAYMENT_VOUCHER'): money or goods back that clear the oldest bills, like a payment.
 * The backend sums them per side as LEDGER_ENTRY_GAVE / LEDGER_ENTRY_GOT.
 */
export const LEDGER_ENTRY = 'LEDGER_ENTRY';
LEDGER_SIGN.LEDGER_ENTRY_GAVE = 1;
LEDGER_SIGN.LEDGER_ENTRY_GOT = -1;

/** Sign of a document in the ledger: + you gave (they owe you), − you got. */
const signOf = (d) => (d.document_type === LEDGER_ENTRY ? (metaOf(d).side === 'gave' ? 1 : -1) : LEDGER_SIGN[d.document_type]);

/** A document that counts in the ledger. Drafts count: a saved invoice is owed. */
export const counts = (d) => !d.deleted_at && d.status !== 'CANCELLED' && d.status !== 'VOID' && (d.document_type === LEDGER_ENTRY || !!LEDGER_SIGN[d.document_type]);

const fixed = (v) => toFixed(v, 2);
const metaOf = (d) => {
  if (d.meta && typeof d.meta === 'object') return d.meta;
  try {
    return JSON.parse(d.meta || '{}') || {};
  } catch {
    return {};
  }
};

/** Where a party stands: a positive balance is money to get, a negative one money to give. */
export function positionOf(balance) {
  const b = dec(balance);
  return { receivable: fixed(b > 0n ? b : 0n), payable: fixed(b < 0n ? -b : 0n) };
}

/** "I'll get" / "I'll give" / "Settled". */
export function balanceLabel(balance) {
  const b = dec(balance);
  return b > 0n ? "I'll get" : b < 0n ? "I'll give" : 'Settled';
}

/** The side a payment is on: a customer pays you (receipt), you pay a vendor (voucher). */
export const PAYMENT_SIDES = {
  customer: { type: 'PAYMENT_RECEIPT', button: 'Payment received', amount: 'Amount received' },
  vendor: { type: 'PAYMENT_VOUCHER', button: 'Payment made', amount: 'Amount paid' },
};
export const sidesOf = (party) => (party?.kind === 'both' ? ['customer', 'vendor'] : [party?.kind === 'vendor' ? 'vendor' : 'customer']);

/**
 * The ledger of one party from its documents.
 * @param {Object[]} documents  rows of this party (any order): id, document_type, document_number, status,
 *   issue_date, due_date, grand_total, parent_document_id, deleted_at, meta
 */
export function buildLedger(documents) {
  const docs = documents
    .filter(counts)
    .sort((a, b) => (a.issue_date === b.issue_date ? a.id - b.id : a.issue_date < b.issue_date ? -1 : 1));
  const byId = new Map(docs.map((d) => [d.id, d]));
  const isBill = (d) => !!BILL_PAYMENT[d.document_type];
  // Settled per bill: paid on the bill, then payments linked to it.
  const settled = new Map();
  const pool = { PAYMENT_RECEIPT: 0n, PAYMENT_VOUCHER: 0n };
  for (const d of docs) if (isBill(d)) settled.set(d.id, dec(metaOf(d).paid || '0'));
  for (const d of docs) {
    // Entries made without a bill that clear bills (payment, goods returned …) join the payments.
    if (d.document_type === LEDGER_ENTRY) {
      const pay = metaOf(d).settles;
      if (pool[pay] !== undefined) pool[pay] += dec(d.grand_total);
      continue;
    }
    if (!PAYMENTS.includes(d.document_type)) continue;
    const bill = d.parent_document_id && byId.get(d.parent_document_id);
    if (bill && BILL_PAYMENT[bill.document_type] === d.document_type) settled.set(bill.id, settled.get(bill.id) + dec(d.grand_total));
    else pool[d.document_type] += dec(d.grand_total);
  }
  // Other payments clear the oldest open bills first.
  const bills = docs.filter(isBill).map((d) => {
    const total = dec(d.grand_total);
    let got = settled.get(d.id);
    const payType = BILL_PAYMENT[d.document_type];
    if (got < total && pool[payType] > 0n) {
      const take = total - got < pool[payType] ? total - got : pool[payType];
      got += take;
      pool[payType] -= take;
    }
    const due = total - got;
    return {
      id: d.id,
      type: d.document_type,
      label: getType(d.document_type).short,
      number: d.document_number,
      status: d.status,
      date: d.issue_date,
      due_date: d.due_date || '',
      total: fixed(total),
      paid: fixed(got > total ? total : got),
      due: fixed(due < 0n ? 0n : due),
      state: got <= 0n ? 'unpaid' : due > 0n ? 'partial' : 'paid',
    };
  });

  // Lines: every document, and every payment taken on a bill on its own date; oldest first.
  const events = [];
  for (const d of docs) {
    const meta = metaOf(d);
    const bill = byId.get(d.parent_document_id);
    const sign = signOf(d);
    const entry = d.document_type === LEDGER_ENTRY;
    events.push({
      sort: [d.issue_date, d.id, 0],
      sign,
      amount: dec(d.grand_total),
      row: {
        key: String(d.id),
        id: d.id,
        date: d.issue_date,
        type: d.document_type,
        label: entry ? meta.reason || (sign > 0 ? 'Given' : 'Received') : getType(d.document_type).short,
        number: entry ? '' : d.document_number,
        status: d.status,
        mode: PAYMENTS.includes(d.document_type) || entry ? meta.payment_mode || '' : '',
        entry,
        against: bill ? bill.document_number : '',
      },
    });
    if (!isBill(d) || dec(meta.paid || '0') <= 0n) continue;
    // Paid on the bill: money in for a sale, money out for a purchase. Older bills kept only the total.
    const sale = BILL_PAYMENT[d.document_type] === 'PAYMENT_RECEIPT';
    const list = Array.isArray(meta.payments) && meta.payments.length ? meta.payments : [{ amount: meta.paid, mode: '', date: d.issue_date }];
    list.forEach((p, i) => {
      if (dec(p.amount || '0') <= 0n) return;
      const date = p.date && p.date > d.issue_date ? p.date : d.issue_date;
      events.push({
        sort: [date, d.id, i + 1],
        sign: -sign,
        amount: dec(p.amount),
        row: {
          key: `${d.id}-paid-${i}`,
          id: d.id,
          date,
          type: sale ? 'PAYMENT_RECEIPT' : 'PAYMENT_VOUCHER',
          label: sale ? 'Payment received' : 'Payment made',
          number: '',
          status: '',
          mode: p.mode || '',
          against: d.document_number,
          onBill: true,
        },
      });
    });
  }
  const before = (x, y) => {
    for (let i = 0; i < 3; i += 1) if (x.sort[i] !== y.sort[i]) return x.sort[i] < y.sort[i] ? -1 : 1;
    return 0;
  };
  let balance = 0n;
  const rows = events.sort(before).map((e) => {
    balance += BigInt(e.sign) * e.amount;
    return { ...e.row, gave: e.sign > 0 ? fixed(e.amount) : '', got: e.sign < 0 ? fixed(e.amount) : '', balance: fixed(balance) };
  });
  return {
    rows,
    bills,
    open: bills.filter((b) => b.state !== 'paid'),
    balance: fixed(balance),
    ...positionOf(balance),
  };
}

/**
 * What a new payment of `amount` would settle, oldest open bill first (the dialog's "This will settle").
 * @returns {{ settles: {id, number, amount}[], left: string, balanceAfter: string }}
 */
export function allocate(ledger, side, amount) {
  const payType = PAYMENT_SIDES[side].type;
  let left = dec(amount || '0');
  const settles = [];
  for (const b of ledger.open) {
    if (left <= 0n) break;
    if (BILL_PAYMENT[b.type] !== payType) continue;
    const take = dec(b.due) < left ? dec(b.due) : left;
    settles.push({ id: b.id, number: b.number, amount: fixed(take), clears: take === dec(b.due) });
    left -= take;
  }
  const sign = BigInt(LEDGER_SIGN[payType]);
  return { settles, left: fixed(left), balanceAfter: fixed(dec(ledger.balance) + sign * dec(amount || '0')) };
}

/** Totals of many parties: I'll get (receivable) and I'll give (payable). */
export function ledgerTotals(parties) {
  let receivable = 0n;
  let payable = 0n;
  for (const p of parties) {
    receivable += dec(p.receivable);
    payable += dec(p.payable);
  }
  return { receivable: fixed(receivable), payable: fixed(payable) };
}

/** Balances of every party from the backend's sums per party and type ({party_id, document_type, total, paid}). */
export function balancesFromSums(sums) {
  const out = new Map();
  for (const s of sums) {
    const sign = LEDGER_SIGN[s.document_type];
    if (!sign) continue;
    const net = dec(s.total) - (BILL_PAYMENT[s.document_type] ? dec(s.paid || '0') : 0n);
    out.set(s.party_id, add(out.get(s.party_id) || 0n, BigInt(sign) * net));
  }
  return out;
}

/** One party with its documents (party_ledger) → { party, ledger }. */
export async function partyLedger(partyId) {
  const { party, documents } = await call('party_ledger', { id: Number(partyId) });
  return { party, ledger: buildLedger(documents) };
}

/** Every saved party of the list with its balance and position, and the totals. */
export async function ledgerSummary(parties) {
  const balances = balancesFromSums(await call('ledger_sums', { types: LEDGER_TYPES }));
  const rows = parties.map((p) => {
    const balance = fixed(balances.get(p.id) || 0n);
    return { ...p, balance, ...positionOf(balance) };
  });
  return { parties: rows, totals: ledgerTotals(rows) };
}

/** Move bills that are now paid (or partly paid) forward: Issued → Partly paid → Paid. Returns how many changed. */
export async function syncBillStatuses(partyId, note = '') {
  const { ledger } = await partyLedger(partyId);
  let changed = 0;
  for (const b of ledger.bills) {
    const next = paidStatus(b.status, b.paid, b.total);
    if (!next) continue;
    await setDocumentStatus(b.id, next, note);
    changed += 1;
  }
  return changed;
}

/**
 * "Payment received" (customer) / "Payment made" (vendor) from a profile: the amount, the mode and the date
 * (today unless another day is chosen). Saved as one receipt / payment voucher for the party, dated that day,
 * which settles the oldest open bills first.
 * @returns {Promise<{id: number, document_number: string, settles: Object[]}>}
 */
export async function recordPayment({ party, side, amount, mode, date, ledger, ctx }) {
  if (dec(amount || '0') <= 0n) throw new Error('Please enter the amount.');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Please choose a valid payment date.');
  const typeId = PAYMENT_SIDES[side].type;
  const { settles } = allocate(ledger, side, amount);
  const model = await newDocumentForParty(typeId, ctx, party.id);
  model.document.status = 'ISSUED';
  if (date) model.document.issue_date = date;
  model.document.meta = {
    ...model.document.meta,
    amount_received: amount,
    payment_mode: mode || 'Cash',
    against: settles.length ? settles.map((s) => s.number).filter(Boolean).join(', ').slice(0, 120) : 'On account',
  };
  const saved = await saveDocument(model, ctx);
  await syncBillStatuses(party.id, `${getType(typeId).short} ${saved.document_number}`);
  return { ...saved, settles };
}

/**
 * Given / Received on a customer's or vendor's profile (phone). Reasons that are a payment save a receipt / payment
 * voucher (recordPayment: oldest bills first); the others save a ledger entry without a bill.
 * pay: the payment side it records (customer = money in, vendor = money out); settles: whether it clears bills.
 */
export const ENTRY_REASONS = {
  customer: {
    gave: [
      { id: 'goods', label: 'Goods sold (no bill)' },
      { id: 'credit', label: 'Credit given' },
      { id: 'refund', label: 'Cash given / refund' },
      { id: 'opening', label: 'Opening balance' },
      { id: 'other', label: 'Other' },
    ],
    got: [
      { id: 'payment', label: 'Payment received', pay: 'customer' },
      { id: 'advance', label: 'Advance received', pay: 'customer' },
      { id: 'return', label: 'Goods returned', settles: true },
      { id: 'discount', label: 'Discount / write-off', settles: true },
      { id: 'other', label: 'Other', settles: true },
    ],
  },
  vendor: {
    gave: [
      { id: 'payment', label: 'Payment made', pay: 'vendor' },
      { id: 'advance', label: 'Advance paid', pay: 'vendor' },
      { id: 'return', label: 'Goods returned', settles: true },
      { id: 'other', label: 'Other', settles: true },
    ],
    got: [
      { id: 'goods', label: 'Goods bought (no bill)' },
      { id: 'credit', label: 'Credit received' },
      { id: 'opening', label: 'Opening balance' },
      { id: 'other', label: 'Other' },
    ],
  },
};

/** The side whose reasons apply: a vendor's, or a customer's ("both" use the customer's). */
export const entrySide = (party) => (party?.kind === 'vendor' ? 'vendor' : 'customer');

/**
 * Save a Given / Received entry. Returns { id, document_number, payment: boolean }.
 * @param {{ party, direction: 'gave'|'got', reasonId, amount, mode, date, ledger, ctx }} entry
 */
export async function recordLedgerEntry({ party, direction, reasonId, amount, mode, date, ledger, ctx }) {
  if (dec(amount || '0') <= 0n) throw new Error('Please enter the amount.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Please choose a valid date.');
  const side = entrySide(party);
  const reason = (ENTRY_REASONS[side][direction] || []).find((r) => r.id === reasonId);
  if (!reason) throw new Error('Please choose a reason.');
  if (reason.pay) {
    const saved = await recordPayment({ party, side: reason.pay, amount, mode, date, ledger, ctx });
    return { ...saved, payment: true };
  }
  const settles = reason.settles ? (side === 'vendor' ? 'PAYMENT_VOUCHER' : 'PAYMENT_RECEIPT') : '';
  const settings = ctx?.settings || {};
  const saved = await call('document_save', {
    payload: {
      defaultPrefix: 'LE',
      document: {
        document_type: LEDGER_ENTRY,
        status: 'ISSUED',
        issue_date: date,
        party_id: party.id,
        party_name: party.name,
        party_phone: party.phone || '',
        currency: settings.baseCurrency || 'INR',
        grand_total: toFixed(amount, 2),
        subtotal: toFixed(amount, 2),
        meta: { side: direction, reason: reason.label, reason_id: reason.id, payment_mode: mode || 'Cash', settles },
      },
      items: [],
      taxes: [],
    },
  });
  if (settles) await syncBillStatuses(party.id, `${reason.label} ${date}`);
  return { ...saved, payment: false };
}

/** Date filter of a ledger (desktop and phone): the periods offered, newest first. */
export const LEDGER_PERIODS = [
  { value: 'all', label: 'All' },
  { value: 'month', label: 'This month' },
  { value: 'last', label: 'Last month' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'year', label: 'This financial year' },
  { value: 'custom', label: 'Custom dates' },
];

/** { from, to } (YYYY-MM-DD, '' = open) of a period; 'custom' uses the dates given. */
export function ledgerPeriod(id, custom = {}, today = new Date()) {
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const y = today.getFullYear();
  const m = today.getMonth();
  const back = (days) => iso(new Date(y, m, today.getDate() - days + 1));
  if (id === 'month') return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  if (id === 'last') return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  if (id === '30' || id === '90') return { from: back(Number(id)), to: iso(today) };
  if (id === 'year') {
    const start = m >= 3 ? y : y - 1;
    return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
  }
  if (id === 'custom') return { from: custom.from || '', to: custom.to || '' };
  return { from: '', to: '' };
}

/**
 * Ledger rows between two dates (inclusive). Each row keeps the running balance of the whole ledger, so the
 * balance shown on a row is the real balance on that day.
 */
export const rowsBetween = (rows, { from = '', to = '' } = {}) => rows.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));

/** In and out of the filtered rows: what you gave and what you got in that period. */
export function periodTotals(rows) {
  let gave = 0n;
  let got = 0n;
  for (const r of rows) {
    gave += dec(r.gave || '0');
    got += dec(r.got || '0');
  }
  return { gave: toFixed(gave, 2), got: toFixed(got, 2) };
}
