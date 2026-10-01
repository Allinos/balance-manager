/**
 * License lifecycle.
 *
 *   unused ──(first activation)──▶ active ──(expires_at passes)──▶ expired (computed)
 *                                    │
 *                                    └──(admin)──▶ suspended / revoked
 *
 * A license bought on the website is valid from the payment date (e.g. 1 year). Codes created by
 * an admin without a date start their period at the first activation (duration_days).
 * duration_days = 0 means lifetime. A suspended customer account blocks all its licenses.
 */

import { insertOne, nowIso, updateOne } from '../db.js';
import { ApiError } from '../lib/http.js';
import { generateActivationCode, signLicenseToken } from '../lib/security.js';

const DAY = 86400000;

export function effectiveStatus(license, now = Date.now()) {
  if (license.status === 'suspended' || license.status === 'revoked' || license.status === 'unused') return license.status;
  if (license.expires_at && new Date(license.expires_at).getTime() < now) return 'expired';
  return 'active';
}

/** Whole days until expiry (0 on the last day), null for lifetime / not yet started. */
export function daysLeft(license, now = Date.now()) {
  if (!license.expires_at) return null;
  return Math.max(0, Math.ceil((new Date(license.expires_at).getTime() - now) / DAY));
}

export function publicLicense(l) {
  return {
    id: l.id,
    code: l.code,
    clientId: l.client_id,
    planId: l.plan_id,
    planName: l.plan_name,
    status: effectiveStatus(l),
    storedStatus: l.status,
    durationDays: l.duration_days,
    maxDevices: l.max_devices,
    activatedAt: l.activated_at,
    expiresAt: l.expires_at,
    daysLeft: daysLeft(l),
    lifetime: !l.expires_at && l.duration_days === 0,
    source: l.source,
    notes: l.notes,
    createdAt: l.created_at,
  };
}

/** Insert a license with a unique activation code (retries on the rare collision). */
export async function createLicense(knex, fields) {
  const ts = nowIso();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateActivationCode();
    const exists = await knex('licenses').where({ code }).first('id');
    if (exists) continue;
    const row = await insertOne(knex, 'licenses', { status: 'unused', notes: '', ...fields, code, created_at: ts, updated_at: ts });
    return row;
  }
  throw new ApiError(500, 'CODE_GENERATION_FAILED', 'Could not generate a unique activation code.');
}

/** Extend a license by `days` from its current expiry (or from now if already expired). */
export async function extendLicense(knex, license, days) {
  if (!days) return license;
  const patch = { updated_at: nowIso() };
  if (!license.expires_at) {
    if (license.duration_days === 0) return license; // lifetime
    if (license.status === 'unused') patch.duration_days = license.duration_days + days;
    else patch.expires_at = new Date(Date.now() + days * DAY).toISOString();
  } else {
    const base = Math.max(Date.now(), new Date(license.expires_at).getTime());
    patch.expires_at = new Date(base + days * DAY).toISOString();
    if (license.status === 'suspended' || license.status === 'revoked') patch.status = 'active';
  }
  const row = await updateOne(knex, 'licenses', { id: license.id }, patch);
  return row;
}

const withPlan = (knex) =>
  knex('licenses').leftJoin('plans', 'plans.id', 'licenses.plan_id').select('licenses.*', 'plans.name as plan_name', 'plans.code as plan_code');

/**
 * Activate `license` on a device inside a transaction. Throws friendly errors.
 * @returns {Promise<object>} the updated license row (with plan_name)
 */
export async function activateOnDevice(trx, license, device) {
  const status = effectiveStatus(license);
  if (status === 'revoked') throw new ApiError(403, 'LICENSE_REVOKED', 'This license has been revoked. Please contact support.');
  if (status === 'suspended') throw new ApiError(403, 'LICENSE_SUSPENDED', 'This license is suspended. Please contact support.');
  if (status === 'expired') throw new ApiError(403, 'LICENSE_EXPIRED', 'This license has expired. Renew it in the client portal.');
  const ts = nowIso();

  if (license.status === 'unused') {
    const expires =
      license.expires_at || (license.duration_days > 0 ? new Date(Date.now() + license.duration_days * DAY).toISOString() : null);
    await trx('licenses').where({ id: license.id }).update({ status: 'active', activated_at: ts, expires_at: expires, updated_at: ts });
  }

  const existing = await trx('devices').where({ license_id: license.id, device_id: device.deviceId }).first();
  if (!existing || existing.released_at) {
    const [{ count }] = await trx('devices')
      .where({ license_id: license.id })
      .whereNull('released_at')
      .whereNot({ device_id: device.deviceId })
      .count({ count: '*' });
    if (Number(count) >= license.max_devices) {
      throw new ApiError(
        409,
        'DEVICE_LIMIT',
        `This license is already active on ${license.max_devices} computer(s). Release a computer in the client portal or contact support.`,
      );
    }
  }
  const deviceRow = {
    device_name: device.deviceName || '',
    platform: device.platform || '',
    app_version: device.appVersion || '',
    last_seen_at: ts,
    released_at: null,
  };
  if (existing) {
    await trx('devices').where({ id: existing.id }).update(deviceRow);
  } else {
    await trx('devices').insert({ ...deviceRow, license_id: license.id, device_id: device.deviceId, activated_at: ts });
  }
  return withPlan(trx).where('licenses.id', license.id).first();
}

/** Pick the best license of a client for a device (already bound > active > unused). */
export async function licenseForClient(trx, clientId, deviceId) {
  const rows = await withPlan(trx).where('licenses.client_id', clientId).whereIn('licenses.status', ['active', 'unused']);
  const usable = rows.filter((l) => effectiveStatus(l) === 'active' || l.status === 'unused');
  if (!usable.length) return null;
  const bound = await trx('devices')
    .whereIn('license_id', usable.map((l) => l.id))
    .where({ device_id: deviceId })
    .whereNull('released_at')
    .first('license_id');
  const score = (l) =>
    (bound && bound.license_id === l.id ? 4 : 0) + (l.status === 'active' ? 2 : 0) + (l.expires_at ? 0 : 1);
  usable.sort((a, b) => score(b) - score(a) || String(b.expires_at || '9999').localeCompare(String(a.expires_at || '9999')));
  return usable;
}

/** Signed token the desktop app stores and verifies offline. */
export function licenseToken(license, client, deviceId) {
  const status = client && client.status !== 'active' ? 'suspended' : effectiveStatus(license);
  return signLicenseToken({
    v: 1,
    lid: license.id,
    cid: client?.id ?? license.client_id ?? null,
    email: client?.email || '',
    name: client?.name || '',
    business: client?.business_name || '',
    plan: license.plan_code || '',
    planName: license.plan_name || '',
    code: license.code,
    status,
    activatedAt: license.activated_at,
    expiresAt: license.expires_at,
    maxDevices: license.max_devices,
    did: deviceId,
    iat: new Date().toISOString(),
  });
}

export const getLicenseWithPlan = (knex, id) => withPlan(knex).where('licenses.id', id).first();

/**
 * Renew (or upgrade) a license with a paid plan: the plan's period is added to the current expiry,
 * the license moves to the paid plan and keeps the larger computer limit. A lifetime plan makes it lifetime.
 */
export async function renewWithPlan(trx, license, plan) {
  const patch = { plan_id: plan.id, max_devices: Math.max(license.max_devices, plan.max_devices), updated_at: nowIso() };
  if (plan.duration_days === 0) {
    patch.expires_at = null;
    patch.duration_days = 0;
    return updateOne(trx, 'licenses', { id: license.id }, patch);
  }
  await trx('licenses').where({ id: license.id }).update(patch);
  const updated = await trx('licenses').where({ id: license.id }).first();
  return extendLicense(trx, updated, plan.duration_days);
}

/** Create or extend the license paid for by a payment. Idempotent per payment. */
export async function fulfillPayment(trx, payment) {
  if (payment.license_id) return getLicenseWithPlan(trx, payment.license_id);
  const plan = await trx('plans').where({ id: payment.plan_id }).first();
  let license;
  if (payment.renew_license_id) {
    const current = await trx('licenses').where({ id: payment.renew_license_id, client_id: payment.client_id }).first();
    if (current) license = await renewWithPlan(trx, current, plan);
  }
  if (!license) {
    // Valid from the payment date, so the customer sees the same end date everywhere.
    const now = nowIso();
    license = await createLicense(trx, {
      client_id: payment.client_id,
      plan_id: plan.id,
      status: 'active',
      activated_at: now,
      expires_at: plan.duration_days > 0 ? new Date(Date.now() + plan.duration_days * DAY).toISOString() : null,
      duration_days: plan.duration_days,
      max_devices: plan.max_devices,
      source: 'payment',
      payment_id: payment.id,
    });
  }
  await trx('payments').where({ id: payment.id }).update({ license_id: license.id, updated_at: nowIso() });
  return getLicenseWithPlan(trx, license.id);
}
