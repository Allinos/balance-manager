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
import { BILL_PAYMENT, modesOf, paidStatus } from './billPayment.js';
import { newDocumentForParty, saveDocument, setDocumentStatus } from './documentService.js';

export { BILL_PAYMENT };

export const LEDGER_SIGN = {
  TAX_INVOICE: 1,
  SERVICE_INVOICE: 1,
  BILL_OF_SUPPLY: 1,
  DEBIT_NOTE: 1,
  PAYMENT_VOUCHER: 1,
  CREDIT_NOTE: -1,
  PAYMENT_RECEIPT: -1,
  PURCHASE_INVOICE: -1,
};
export const LEDGER_TYPES = Object.keys(LEDGER_SIGN);
const PAYMENTS = ['PAYMENT_RECEIPT', 'PAYMENT_VOUCHER'];

/** A document that counts in the ledger. Drafts count: a saved invoice is owed. */
export const counts = (d) => !d.deleted_at && d.status !== 'CANCELLED' && d.status !== 'VOID' && !!LEDGER_SIGN[d.document_type];

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

  let balance = 0n;
  const rows = [];
  const line = (r, sign, amount) => {
    balance += BigInt(sign) * amount;
    rows.push({ ...r, gave: sign > 0 ? fixed(amount) : '', got: sign < 0 ? fixed(amount) : '', balance: fixed(balance) });
  };
  for (const d of docs) {
    const sign = LEDGER_SIGN[d.document_type];
    const meta = metaOf(d);
    const bill = byId.get(d.parent_document_id);
    line(
      {
        key: String(d.id),
        id: d.id,
        date: d.issue_date,
        type: d.document_type,
        label: getType(d.document_type).short,
        number: d.document_number,
        status: d.status,
        mode: PAYMENTS.includes(d.document_type) ? meta.payment_mode || '' : '',
        against: bill ? bill.document_number : '',
      },
      sign,
      dec(d.grand_total),
    );
    // Paid on the bill: money in for a sale, money out for a purchase.
    const paid = isBill(d) ? dec(meta.paid || '0') : 0n;
    if (paid > 0n) {
      const sale = BILL_PAYMENT[d.document_type] === 'PAYMENT_RECEIPT';
      line(
        {
          key: `${d.id}-paid`,
          id: d.id,
          date: d.issue_date,
          type: sale ? 'PAYMENT_RECEIPT' : 'PAYMENT_VOUCHER',
          label: sale ? 'Payment received' : 'Payment made',
          number: '',
          status: '',
          mode: modesOf(meta.payments),
          against: d.document_number,
          onBill: true,
        },
        -sign,
        paid,
      );
    }
  }
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
 * "Payment received" (customer) / "Payment made" (vendor) from a profile: only the amount and the mode.
 * Saved as one receipt / payment voucher for the party, which settles the oldest open bills first.
 * @returns {Promise<{id: number, document_number: string, settles: Object[]}>}
 */
export async function recordPayment({ party, side, amount, mode, ledger, ctx }) {
  if (dec(amount || '0') <= 0n) throw new Error('Please enter the amount.');
  const typeId = PAYMENT_SIDES[side].type;
  const { settles } = allocate(ledger, side, amount);
  const model = await newDocumentForParty(typeId, ctx, party.id);
  model.document.status = 'ISSUED';
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
