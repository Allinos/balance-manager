/**
 * Referrals: which existing customer brought in a new one. No rewards or commissions yet — only attribution.
 *
 *  - Every client has a unique referral code (5 digits, system generated, so it reveals nothing about the
 *    customer; an admin may set another: 4–10 letters or digits). Link: <PORTAL_URL>/r/<code>.
 *  - /r/<code> sends the visitor to the website with ?ref=<code>; the website keeps the code in Local Storage
 *    for 30 days and sends it with sign-up and checkout (attribution.ref_code).
 *  - The code is saved on the server: on the new account (referred_by_id, referred_code, referred_at) and on
 *    each payment (payments.referral_code, referrer_id). A customer is credited to one referrer only — the first —
 *    and only while they have not bought before; nobody can refer themselves.
 */

import crypto from 'node:crypto';
import { config } from '../config.js';
import { nowIso } from '../db.js';
import { ApiError } from '../lib/http.js';

export const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{4,10}$/;

/** "ab 12-3" → "AB123" (codes are matched without case, spaces or dashes). */
export const normaliseReferralCode = (v) =>
  String(v || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);

export const referralLink = (code) => (code ? `${config.portalUrl}/r/${code}` : '');

/** A new unique code: 5 random digits (6 if, one day, five-digit codes run out). */
export async function generateReferralCode(db) {
  for (let i = 0; i < 60; i++) {
    const code = String(i < 50 ? crypto.randomInt(10000, 100000) : crypto.randomInt(100000, 1000000));
    if (!(await db('clients').where({ referral_code: code }).first('id'))) return code;
  }
  throw new ApiError(500, 'REFERRAL_CODE_FAILED', 'Could not create a referral code. Please try again.');
}

/** The client's code, created now if they have none (clients from before referrals). */
export async function ensureReferralCode(db, client) {
  if (!client || client.referral_code) return client?.referral_code || '';
  const code = await generateReferralCode(db);
  await db('clients').where({ id: client.id }).whereNull('referral_code').update({ referral_code: code });
  const row = await db('clients').where({ id: client.id }).first('referral_code');
  client.referral_code = row.referral_code;
  return row.referral_code;
}

/** Set a client's code (admin). Empty → a new generated one. Rejects a code another client has. */
export async function assignReferralCode(db, clientId, wanted) {
  const code = wanted ? normaliseReferralCode(wanted) : await generateReferralCode(db);
  if (!REFERRAL_CODE_PATTERN.test(code)) throw new ApiError(400, 'INVALID_REFERRAL_CODE', 'A referral code has 4 to 10 letters or digits, e.g. 48213.');
  const taken = await db('clients').where({ referral_code: code }).whereNot({ id: clientId }).first('id');
  if (taken) throw new ApiError(409, 'REFERRAL_CODE_TAKEN', `The referral code ${code} already belongs to another customer.`);
  await db('clients').where({ id: clientId }).update({ referral_code: code, updated_at: nowIso() });
  return code;
}

/** The client a code belongs to (or null). */
export async function findReferrer(db, code) {
  const c = normaliseReferralCode(code);
  if (!REFERRAL_CODE_PATTERN.test(c)) return null;
  return (await db('clients').where({ referral_code: c }).first()) || null;
}

/** Columns for a new client: their own code and, when a valid referral code came with them, who referred them. */
export async function newClientReferral(db, refCode) {
  const fields = { referral_code: await generateReferralCode(db) };
  const referrer = refCode ? await findReferrer(db, refCode) : null;
  if (referrer) Object.assign(fields, { referred_by_id: referrer.id, referred_code: referrer.referral_code, referred_at: nowIso() });
  return fields;
}

/**
 * Credit an existing client to a referrer, if they have none yet and have not bought before
 * (`exceptPaymentId`: the payment being completed now). Returns the referrer or null.
 */
export async function recordReferral(db, client, refCode, { exceptPaymentId = null } = {}) {
  if (!client || client.referred_by_id || !refCode) return null;
  const referrer = await findReferrer(db, refCode);
  if (!referrer || referrer.id === client.id) return null;
  const bought = db('payments').where({ client_id: client.id, status: 'paid' });
  if (exceptPaymentId) bought.whereNot({ id: exceptPaymentId });
  if (await bought.first('id')) return null;
  await db('clients').where({ id: client.id }).whereNull('referred_by_id').update({ referred_by_id: referrer.id, referred_code: referrer.referral_code, referred_at: nowIso() });
  return referrer;
}

/** Referral columns for a payment: the code sent with it, else the code the client was referred with. */
export async function paymentReferral(db, client, refCode) {
  const referrer = refCode ? await findReferrer(db, refCode) : null;
  if (referrer && referrer.id !== client.id) return { referral_code: referrer.referral_code, referrer_id: referrer.id };
  if (client.referred_by_id) return { referral_code: client.referred_code || '', referrer_id: client.referred_by_id };
  return {};
}
