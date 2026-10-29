/**
 * Partner programme: authorised partners and distributors refer customers and earn a commission.
 * Referral codes belong to partners only (customers share a plain promotional message and download link).
 *
 *  - A partner applies on the website (/partners/apply), accepting the partnership terms (the version, time and IP
 *    are recorded). An admin approves the account: it then gets a unique code and link <PORTAL_URL>/r/<code>.
 *  - /r/<code> counts a click and sends the visitor to the website with ?ref=<code>; the website keeps the code for
 *    30 days and sends it with sign-up and checkout. The server keeps it on the customer (first partner wins, and only
 *    before their first purchase) and on each payment — Local Storage alone is never the record.
 *  - When a partner's payment is paid, one commission is created (payment_id is unique: never twice) at the partner's
 *    own rate. Admin approves it and marks it paid (payout reference). A refund reverses it; a reversal after payout
 *    is deducted from the next payout.
 *  - No commission on a partner's own purchase, for an unapproved / suspended partner, or without a valid code.
 */

import crypto from 'node:crypto';
import { config } from '../config.js';
import { nowIso, parseJson } from '../db.js';
import { ApiError } from '../lib/http.js';

/** Current version of the partnership terms (frontend: PartnerTerms page). Partners accept it again when it changes. */
export const PARTNER_TERMS_VERSION = '2026-10';
export const PARTNER_STATUSES = ['pending', 'approved', 'rejected', 'suspended', 'terminated'];
export const COMMISSION_STATUSES = ['pending', 'approved', 'paid', 'reversed'];
export const DEFAULT_COMMISSION_RATE = '10';
/** Commissions become payable after the refund window (terms: paid monthly for sales older than this). */
export const COMMISSION_HOLD_DAYS = 15;

/** What a partner's dashboard may show — set per partner by the admin. */
export const DEFAULT_PERMISSIONS = {
  dashboard: true, // the dashboard is visible at all (off: the partner sees only their link)
  customerNames: false, // names of referred customers (off: masked, e.g. R***h K.)
  salesAmounts: true, // the amounts of referred sales
  commissions: true, // commission list and earnings
  shareTools: true, // WhatsApp / copy share buttons
};

export const PARTNER_CODE_PATTERN = /^[A-Z0-9]{4,12}$/;

/** "ab 12-3" → "AB123" (codes are matched without case, spaces or dashes). */
export const normaliseCode = (v) =>
  String(v || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);

export const partnerLink = (code) => (code ? `${config.portalUrl}/r/${code}` : '');
export const permissionsOf = (p) => ({ ...DEFAULT_PERMISSIONS, ...parseJson(p?.permissions, {}) });

/** The rate as basis points: "12.5" → 1250. Rates are 0–50 %, at most two decimals. */
export function rateBps(rate) {
  const m = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(String(rate ?? '').trim());
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
  return bps <= 5000 ? bps : null;
}

/** Commission in paise, rounded to the nearest paisa. */
export const commissionPaise = (basePaise, rate) => Math.round((Number(basePaise) * (rateBps(rate) ?? 0)) / 10000);

async function codeTaken(db, code, exceptPartnerId = null) {
  const q = db('partners').where({ code });
  if (exceptPartnerId) q.whereNot({ id: exceptPartnerId });
  if (await q.first('id')) return true;
  // An old customer code (before partners) is never reused, so an old link cannot credit a partner by accident.
  return !!(await db('clients').where({ referral_code: code }).first('id'));
}

/** A new unique code: up to 4 letters of the name and 4 digits, e.g. RAVI4821. */
export async function generatePartnerCode(db, name = '') {
  const letters = normaliseCode(name).replace(/[0-9]/g, '').slice(0, 4) || 'DG';
  for (let i = 0; i < 40; i++) {
    const code = `${letters}${crypto.randomInt(1000, 10000)}`;
    if (!(await codeTaken(db, code))) return code;
  }
  throw new ApiError(500, 'PARTNER_CODE_FAILED', 'Could not create a partner code. Please try again.');
}

/** Set a partner's code (admin). Empty → a new generated one. */
export async function assignPartnerCode(db, partner, wanted) {
  const code = wanted ? normaliseCode(wanted) : await generatePartnerCode(db, partner.name);
  if (!PARTNER_CODE_PATTERN.test(code)) throw new ApiError(400, 'INVALID_PARTNER_CODE', 'A partner code has 4 to 12 letters or digits, e.g. RAVI4821.');
  if (await codeTaken(db, code, partner.id)) throw new ApiError(409, 'PARTNER_CODE_TAKEN', `The code ${code} is already in use.`);
  await db('partners').where({ id: partner.id }).update({ code, updated_at: nowIso() });
  return code;
}

/** The approved partner a code belongs to (or null). */
export async function findPartner(db, code) {
  const c = normaliseCode(code);
  if (!PARTNER_CODE_PATTERN.test(c)) return null;
  return (await db('partners').where({ code: c, status: 'approved' }).first()) || null;
}

const sameEmail = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/** Columns for a new client who came through a partner's link. */
export async function newClientPartner(db, refCode, email = '') {
  const partner = refCode ? await findPartner(db, refCode) : null;
  if (!partner || sameEmail(partner.email, email)) return {};
  return { partner_id: partner.id, partner_code: partner.code, partner_at: nowIso() };
}

/**
 * Credit an existing client to a partner if they have none yet and have not bought before
 * (`exceptPaymentId`: the payment being completed now). Returns the partner or null.
 */
export async function recordPartner(db, client, refCode, { exceptPaymentId = null } = {}) {
  if (!client || client.partner_id || !refCode) return null;
  const partner = await findPartner(db, refCode);
  if (!partner || sameEmail(partner.email, client.email)) return null;
  const bought = db('payments').where({ client_id: client.id, status: 'paid' });
  if (exceptPaymentId) bought.whereNot({ id: exceptPaymentId });
  if (await bought.first('id')) return null;
  await db('clients').where({ id: client.id }).whereNull('partner_id').update({ partner_id: partner.id, partner_code: partner.code, partner_at: nowIso() });
  return partner;
}

/** Partner columns for a payment: the code sent with it (before the first purchase), else the client's partner. */
export async function paymentPartner(db, client, refCode) {
  if (client.partner_id) {
    const p = await db('partners').where({ id: client.partner_id }).first('id', 'code');
    return p ? { partner_id: p.id, partner_code: p.code || client.partner_code || '' } : {};
  }
  const partner = refCode ? await findPartner(db, refCode) : null;
  if (partner && !sameEmail(partner.email, client.email)) return { partner_id: partner.id, partner_code: partner.code };
  return {};
}

/**
 * The commission for a paid payment, created once (payment_id is unique; a second call returns the first).
 * Only for an approved partner at the time of payment, and never for the partner's own purchase.
 */
export async function createCommission(db, payment) {
  if (!payment?.partner_id || payment.status !== 'paid') return null;
  const existing = await db('partner_commissions').where({ payment_id: payment.id }).first();
  if (existing) return existing;
  const partner = await db('partners').where({ id: payment.partner_id }).first();
  if (!partner || partner.status !== 'approved') return null;
  const client = await db('clients').where({ id: payment.client_id }).first('id', 'email');
  if (client && sameEmail(client.email, partner.email)) return null;
  const ts = nowIso();
  const row = {
    partner_id: partner.id,
    payment_id: payment.id,
    client_id: payment.client_id,
    base_paise: payment.amount_paise,
    rate: partner.commission_rate,
    amount_paise: commissionPaise(payment.amount_paise, partner.commission_rate),
    status: 'pending',
    created_at: ts,
    updated_at: ts,
  };
  try {
    await db('partner_commissions').insert(row);
  } catch (e) {
    // Two confirmations at once: the unique payment_id keeps only one.
    const again = await db('partner_commissions').where({ payment_id: payment.id }).first();
    if (again) return again;
    throw e;
  }
  return db('partner_commissions').where({ payment_id: payment.id }).first();
}

/** A refunded / reversed payment: its commission is reversed (deducted from the next payout if already paid). */
export async function reverseCommission(db, paymentId, reason = 'Payment refunded') {
  const c = await db('partner_commissions').where({ payment_id: paymentId }).first();
  if (!c || c.status === 'reversed') return c || null;
  await db('partner_commissions')
    .where({ id: c.id })
    .update({ status: 'reversed', reversed_at: nowIso(), reversal_reason: String(reason).slice(0, 300), reversed_after_payout: c.status === 'paid', updated_at: nowIso() });
  return db('partner_commissions').where({ id: c.id }).first();
}

/** A visit through a partner's link (one counter per partner and day). */
export async function recordClick(db, partner) {
  const day = nowIso().slice(0, 10);
  const updated = await db('partner_clicks').where({ partner_id: partner.id, day }).increment('clicks', 1);
  if (!updated) {
    try {
      await db('partner_clicks').insert({ partner_id: partner.id, day, clicks: 1 });
    } catch {
      await db('partner_clicks').where({ partner_id: partner.id, day }).increment('clicks', 1);
    }
  }
}

const rupees = (paise) => Math.round(Number(paise || 0)) / 100;

/** Days from `days - 1` days ago to today, as YYYY-MM-DD. */
export function lastDays(days, now = new Date()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push(new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10));
  return out;
}

/**
 * Totals and the last 30 days for one partner: clicks, registrations, paying customers, sales and commissions.
 * Refunded sales and reversed commissions are left out of the totals (reversals after payout are deducted).
 */
export async function partnerStats(db, partnerId, { days = 30 } = {}) {
  const series = lastDays(days);
  const from = series[0];
  const [clicksAll, clicksRecent, signups, payments, commissions] = await Promise.all([
    db('partner_clicks').where({ partner_id: partnerId }).sum({ n: 'clicks' }).first(),
    db('partner_clicks').where({ partner_id: partnerId }).where('day', '>=', from).select('day', 'clicks'),
    db('clients').where({ partner_id: partnerId }).select('id', 'created_at', 'partner_at'),
    db('payments').where({ partner_id: partnerId }).whereIn('status', ['paid', 'refunded']).select('id', 'client_id', 'amount_paise', 'status', 'paid_at'),
    db('partner_commissions').where({ partner_id: partnerId }).select('status', 'amount_paise', 'reversed_after_payout', 'created_at'),
  ]);
  const paid = payments.filter((p) => p.status === 'paid');
  const sum = (rows) => rows.reduce((a, r) => a + Number(r.amount_paise || 0), 0);
  const by = (s) => commissions.filter((c) => c.status === s);
  const clawback = sum(commissions.filter((c) => c.status === 'reversed' && (c.reversed_after_payout === true || c.reversed_after_payout === 1)));
  const daily = Object.fromEntries(series.map((d) => [d, { day: d, clicks: 0, signups: 0, sales: 0, salesAmount: 0, commission: 0 }]));
  for (const c of clicksRecent) if (daily[c.day]) daily[c.day].clicks += Number(c.clicks);
  for (const c of signups) {
    const d = String(c.partner_at || c.created_at || '').slice(0, 10);
    if (daily[d]) daily[d].signups += 1;
  }
  for (const p of paid) {
    const d = String(p.paid_at || '').slice(0, 10);
    if (daily[d]) {
      daily[d].sales += 1;
      daily[d].salesAmount += rupees(p.amount_paise);
    }
  }
  for (const c of commissions) {
    const d = String(c.created_at || '').slice(0, 10);
    if (daily[d] && c.status !== 'reversed') daily[d].commission += rupees(c.amount_paise);
  }
  const recent = Object.values(daily);
  const total = (k) => recent.reduce((a, r) => a + r[k], 0);
  return {
    totals: {
      clicks: Number(clicksAll?.n || 0),
      registrations: signups.length,
      customers: new Set(paid.map((p) => p.client_id)).size,
      sales: paid.length,
      salesAmount: rupees(sum(paid)),
      refunds: payments.length - paid.length,
      earned: rupees(sum(by('pending')) + sum(by('approved')) + sum(by('paid'))),
      pending: rupees(sum(by('pending')) + sum(by('approved')) - clawback),
      approved: rupees(sum(by('approved'))),
      paid: rupees(sum(by('paid'))),
      reversed: rupees(sum(by('reversed'))),
    },
    last30: {
      clicks: total('clicks'),
      registrations: total('signups'),
      sales: total('sales'),
      salesAmount: Math.round(total('salesAmount') * 100) / 100,
      commission: Math.round(total('commission') * 100) / 100,
    },
    daily: recent,
  };
}

/** "Ravi Kumar" → "R***i K." (referred customers' names when the partner may not see them). */
export function maskName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Customer';
  const [first, ...rest] = parts;
  const head = first.length <= 2 ? `${first[0]}*` : `${first[0]}${'*'.repeat(Math.min(3, first.length - 2))}${first[first.length - 1]}`;
  return [head, ...rest.map((r) => `${r[0]}.`)].join(' ');
}

/** What the partner (and the admin list) sees of a partner account. */
export const publicPartner = (p) => ({
  id: p.id,
  name: p.name,
  email: p.email,
  phone: p.phone,
  company: p.company,
  city: p.city,
  channel: p.channel,
  status: p.status,
  code: p.code || '',
  link: p.status === 'approved' ? partnerLink(p.code) : '',
  commissionRate: p.commission_rate,
  permissions: permissionsOf(p),
  termsVersion: p.terms_version,
  termsAcceptedAt: p.terms_accepted_at,
  termsCurrent: p.terms_version === PARTNER_TERMS_VERSION,
  approvedAt: p.approved_at,
  lastLoginAt: p.last_login_at,
  createdAt: p.created_at,
});
