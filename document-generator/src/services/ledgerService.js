/**
 * Payments & ledger for customers and vendors (desktop and mobile).
 *
 * The ledger is not a second set of books: it is read from the documents themselves, so it always agrees with
 * them and can never be posted twice. Every invoice, bill, credit / debit note, receipt and payment voucher of a
 * saved customer or vendor (party_id) is one ledger line; cancelled and deleted documents are left out.
 *
 * Sign: + = they owe you ("You'll get"), − = you owe them ("You'll give").
 *   You gave  (+): sales invoice, service invoice, bill of supply, debit note, payment voucher (money paid out)
 *   You got   (−): payment receipt (money in), credit note, purchase bill (goods / services received)
 * A payment linked to an invoice or bill (parent_document_id, as "Receive payment" makes it) settles that bill
 * in full or in part; a payment not linked to one is an advance (on account) and counts in the balance.
 */

import { call } from './api.js';
import { getType } from '../config/documentTypes.js';
import { add, dec, sub, toFixed } from '../utils/decimal.js';

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
/** Bills that can be paid in parts, and the payment document that settles each. */
export const BILL_PAYMENT = {
  TAX_INVOICE: 'PAYMENT_RECEIPT',
  SERVICE_INVOICE: 'PAYMENT_RECEIPT',
  BILL_OF_SUPPLY: 'PAYMENT_RECEIPT',
  PURCHASE_INVOICE: 'PAYMENT_VOUCHER',
};
const PAYMENTS = ['PAYMENT_RECEIPT', 'PAYMENT_VOUCHER'];

/** A document that counts in the ledger. Drafts count: a saved invoice is owed. */
export const counts = (d) => !d.deleted_at && d.status !== 'CANCELLED' && d.status !== 'VOID' && !!LEDGER_SIGN[d.document_type];

const fixed = (v) => toFixed(v, 2);

/**
 * Where a party stands: a positive balance is money to get (receivable), a negative one money to give (payable).
 * For a customer a negative balance is an advance received; for a vendor a positive one an advance paid.
 */
export function positionOf(balance, kind = 'customer') {
  const b = dec(balance);
  const pos = b > 0n ? b : 0n;
  const negv = b < 0n ? -b : 0n;
  if (kind === 'vendor') return { receivable: '0.00', payable: fixed(negv), advance: fixed(pos), advanceKind: pos ? 'paid' : '' };
  if (kind === 'both') return { receivable: fixed(pos), payable: fixed(negv), advance: '0.00', advanceKind: '' };
  return { receivable: fixed(pos), payable: '0.00', advance: fixed(negv), advanceKind: negv ? 'received' : '' };
}

/** "You'll get ₹500" / "You'll give ₹500" / "Settled". */
export function balanceLabel(balance) {
  const b = dec(balance);
  return b > 0n ? "You'll get" : b < 0n ? "You'll give" : 'Settled';
}

/**
 * The ledger of one party from its documents.
 * @param {Object[]} documents  list rows of this party (any order): id, document_type, document_number, status,
 *   issue_date, due_date, grand_total, parent_document_id, deleted_at
 * @param {string} kind  customer | vendor | both
 */
export function buildLedger(documents, kind = 'customer') {
  const docs = documents
    .filter(counts)
    .sort((a, b) => (a.issue_date === b.issue_date ? a.id - b.id : a.issue_date < b.issue_date ? -1 : 1));
  const byId = new Map(docs.map((d) => [d.id, d]));
  const paid = new Map();
  let advance = 0n;
  for (const d of docs) {
    if (!PAYMENTS.includes(d.document_type)) continue;
    const bill = d.parent_document_id && byId.get(d.parent_document_id);
    if (bill && BILL_PAYMENT[bill.document_type] === d.document_type) paid.set(bill.id, add(paid.get(bill.id) || 0n, d.grand_total));
    else advance += dec(d.grand_total);
  }
  let balance = 0n;
  let gave = 0n;
  let got = 0n;
  const rows = docs.map((d) => {
    const amount = dec(d.grand_total);
    const sign = LEDGER_SIGN[d.document_type];
    balance += BigInt(sign) * amount;
    if (sign > 0) gave += amount;
    else got += amount;
    const bill = byId.get(d.parent_document_id);
    return {
      id: d.id,
      date: d.issue_date,
      type: d.document_type,
      label: getType(d.document_type).short,
      number: d.document_number,
      status: d.status,
      gave: sign > 0 ? fixed(amount) : '',
      got: sign < 0 ? fixed(amount) : '',
      balance: fixed(balance),
      against: bill ? bill.document_number : '',
      advance: PAYMENTS.includes(d.document_type) && !(bill && BILL_PAYMENT[bill.document_type] === d.document_type),
    };
  });
  // Bills with something still to pay or receive (full, partial), oldest first.
  const open = docs
    .filter((d) => BILL_PAYMENT[d.document_type])
    .map((d) => {
      const settled = paid.get(d.id) || 0n;
      const due = sub(d.grand_total, settled);
      return {
        id: d.id,
        type: d.document_type,
        label: getType(d.document_type).short,
        number: d.document_number,
        date: d.issue_date,
        due_date: d.due_date || '',
        total: fixed(d.grand_total),
        paid: fixed(settled),
        due: fixed(due < 0n ? 0n : due),
        state: settled === 0n ? 'unpaid' : due > 0n ? 'partial' : 'paid',
      };
    })
    .filter((b) => b.state !== 'paid');
  return {
    rows,
    open,
    balance: fixed(balance),
    totalGave: fixed(gave),
    totalGot: fixed(got),
    unallocated: fixed(advance),
    ...positionOf(balance, kind),
  };
}

/** Totals of many parties: receivables, payables and advances (customer advances received, vendor advances paid). */
export function ledgerTotals(parties) {
  let receivable = 0n;
  let payable = 0n;
  let advanceReceived = 0n;
  let advancePaid = 0n;
  for (const p of parties) {
    receivable += dec(p.receivable);
    payable += dec(p.payable);
    if (p.advanceKind === 'received') advanceReceived += dec(p.advance);
    if (p.advanceKind === 'paid') advancePaid += dec(p.advance);
  }
  return { receivable: fixed(receivable), payable: fixed(payable), advanceReceived: fixed(advanceReceived), advancePaid: fixed(advancePaid) };
}

/** Balances of every party from the backend's sums per party and type ({party_id, document_type, total}). */
export function balancesFromSums(sums) {
  const out = new Map();
  for (const s of sums) {
    const sign = LEDGER_SIGN[s.document_type];
    if (!sign) continue;
    out.set(s.party_id, add(out.get(s.party_id) || 0n, BigInt(sign) * dec(s.total)));
  }
  return out;
}

/** One party with its documents (party_ledger) → { party, ledger }. */
export async function partyLedger(partyId) {
  const { party, documents } = await call('party_ledger', { id: Number(partyId) });
  return { party, ledger: buildLedger(documents, party.kind) };
}

/** Every saved party of the list with its balance and position, and the totals. */
export async function ledgerSummary(parties) {
  const balances = balancesFromSums(await call('ledger_sums', { types: LEDGER_TYPES }));
  const rows = parties.map((p) => {
    const balance = fixed(balances.get(p.id) || 0n);
    return { ...p, balance, ...positionOf(balance, p.kind) };
  });
  return { parties: rows, totals: ledgerTotals(rows) };
}

/**
 * Where "Receive payment" / "Make payment" / "Advance" lead: a new receipt (customer) or payment voucher (vendor).
 * Against a bill it is the bill's own Convert → Receipt (party, amount due and the link filled in).
 */
export function paymentRoute(party, { bill = null, side } = {}) {
  const vendorSide = side ? side === 'vendor' : party.kind === 'vendor';
  if (bill) return `/doc/new/${BILL_PAYMENT[bill.type]}?from=${bill.id}&mode=convert`;
  return `/doc/new/${vendorSide ? 'PAYMENT_VOUCHER' : 'PAYMENT_RECEIPT'}?party=${party.id}&advance=1`;
}
