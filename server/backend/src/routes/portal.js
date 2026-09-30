/** Client portal API: account, business details, plans, checkout, licenses. */

import { Router } from 'express';
import { z } from 'zod';
import { insertOne, isMysql, nowIso, parseJson, updateOne } from '../db.js';
import { ApiError, clientIp, notFound, pageQuery, paginate, parse } from '../lib/http.js';
import { config } from '../config.js';
import { limits, requireClient } from '../lib/auth.js';
import { burnPasswordCheck, hashPassword, passwordFingerprint, signPurposeToken, signSession, verifyPassword, verifyPurposeToken } from '../lib/security.js';
import { audit, getAppConfig } from '../services/common.js';
import { isEntitled, listInstallers } from '../services/downloads.js';
import { mailEnabled, sendPasswordReset, sendPaymentReceipt } from '../services/mail.js';
import { fulfillPayment, publicLicense } from '../services/licenses.js';
import { getProvider, listProviders } from '../payments/index.js';

const password = z.string().min(8, 'must be at least 8 characters').max(200);
const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .max(15)
  .refine((v) => v === '' || /^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]{3}$/.test(v), 'must be a valid 15-character GSTIN')
  .optional();

export const businessSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  business_name: z.string().trim().max(160).optional(),
  business_type: z.string().trim().max(40).optional(),
  gstin,
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  pin: z.string().trim().max(12).optional(),
  country: z.string().trim().max(60).optional(),
});

// Tracking data must never block a sign-up: over-long values are shortened, malformed ones dropped.
const shortText = (max) => z.string().trim().max(4000).transform((v) => v.slice(0, max)).optional().default('');
const attributionSchema = z
  .object({
    utm_source: shortText(60),
    utm_medium: shortText(60),
    utm_campaign: shortText(120),
    utm_term: shortText(120),
    utm_content: shortText(120),
    gclid: shortText(200),
    fbclid: shortText(300),
    landing: shortText(300),
    referrer: shortText(300),
  })
  .partial()
  .optional()
  .catch({});

/** Where a new client came from: explicit UTM tags win; ad click ids and referrers fill the gaps. */
export function signupSource(a = {}) {
  let source = (a.utm_source || '').toLowerCase();
  let medium = (a.utm_medium || '').toLowerCase();
  if (!source && a.gclid) [source, medium] = ['google', medium || 'cpc'];
  if (!source && a.fbclid) [source, medium] = ['facebook', medium || 'paid-social'];
  if (!source && a.referrer) {
    try {
      source = new URL(a.referrer).hostname.replace(/^www\./, '');
      medium = medium || 'referral';
    } catch {
      /* not a URL */
    }
  }
  const details = Object.fromEntries(['utm_term', 'utm_content', 'gclid', 'fbclid', 'landing', 'referrer'].filter((k) => a[k]).map((k) => [k, a[k]]));
  return {
    ref_source: (source || 'direct').slice(0, 60),
    ref_medium: medium.slice(0, 60),
    ref_campaign: (a.utm_campaign || '').slice(0, 120),
    ref_details: JSON.stringify(details),
  };
}

export const publicClient = (c) => ({
  id: c.id,
  email: c.email,
  name: c.name,
  phone: c.phone,
  businessName: c.business_name,
  businessType: c.business_type,
  gstin: c.gstin,
  address: c.address,
  city: c.city,
  state: c.state,
  pin: c.pin,
  country: c.country,
  status: c.status,
  createdAt: c.created_at,
  lastLoginAt: c.last_login_at,
  signup: { source: c.ref_source || '', medium: c.ref_medium || '', campaign: c.ref_campaign || '', details: parseJson(c.ref_details, {}) },
});

export const publicPayment = (p) => ({
  id: p.id,
  planId: p.plan_id,
  planName: p.plan_name,
  licenseId: p.license_id,
  provider: p.provider,
  providerOrderId: p.provider_order_id,
  providerPaymentId: p.provider_payment_id,
  amount: p.amount_paise / 100,
  amountPaise: p.amount_paise,
  currency: p.currency,
  status: p.status,
  paidAt: p.paid_at,
  createdAt: p.created_at,
});

export const publicPlan = (p) => ({
  id: p.id,
  code: p.code,
  name: p.name,
  description: p.description,
  price: p.price_paise / 100,
  pricePaise: p.price_paise,
  currency: p.currency,
  durationDays: p.duration_days,
  maxDevices: p.max_devices,
  features: parseJson(p.features, []),
  isActive: !!p.is_active,
  isPublic: !!p.is_public,
  sortOrder: p.sort_order,
});

export function portalRoutes(knex) {
  const r = Router();
  const auth = requireClient(knex);

  r.get('/plans', async (_req, res) => {
    const rows = await knex('plans').where({ is_active: true, is_public: true }).orderBy('sort_order');
    res.json({ plans: rows.map(publicPlan), providers: listProviders(), emailEnabled: mailEnabled() });
  });

  r.post('/auth/register', limits.auth, async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().toLowerCase().email().max(190),
        password,
        phone: z.string().trim().max(30).optional().default(''),
        attribution: attributionSchema,
      }),
      req.body,
    );
    const exists = await knex('clients').where({ email: body.email }).first('id');
    if (exists) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Please sign in.');
    const ts = nowIso();
    const client = await insertOne(knex, 'clients', {
        ...signupSource(body.attribution),
        name: body.name,
        email: body.email,
        phone: body.phone,
        password_hash: await hashPassword(body.password),
        created_at: ts,
        updated_at: ts,
        last_login_at: ts,
      });
    await audit(knex, { actorType: 'client', actorId: client.id, action: 'client.register', entity: 'client', entityId: client.id, ip: clientIp(req) });
    res.status(201).json({ token: signSession('client', client), client: publicClient(client) });
  });

  r.post('/auth/login', limits.auth, async (req, res) => {
    const body = parse(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) }), req.body);
    const client = await knex('clients').where({ email: body.email }).first();
    const ok = client ? await verifyPassword(body.password, client.password_hash) : await burnPasswordCheck(body.password);
    if (!client || !ok) throw new ApiError(401, 'INVALID_LOGIN', 'Incorrect email or password.');
    if (client.status !== 'active') throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'Your account is suspended. Please contact support.');
    await knex('clients').where({ id: client.id }).update({ last_login_at: nowIso() });
    res.json({ token: signSession('client', client), client: publicClient(client) });
  });

  /** Email a password reset link. Same answer whether or not the email exists. */
  r.post('/auth/forgot', limits.auth, async (req, res) => {
    const body = parse(z.object({ email: z.string().trim().toLowerCase().email().max(190) }), req.body);
    if (!mailEnabled()) return res.json({ emailEnabled: false, supportEmail: config.supportEmail });
    const client = await knex('clients').where({ email: body.email }).first();
    if (client && client.status === 'active') {
      const token = signPurposeToken('reset', { sub: String(client.id), tv: client.token_version, ph: passwordFingerprint(client.password_hash) }, '1h');
      await sendPasswordReset(client, `${config.portalUrl}/reset-password?token=${encodeURIComponent(token)}`);
      await audit(knex, { actorType: 'client', actorId: client.id, action: 'client.password_reset_requested', entity: 'client', entityId: client.id, ip: clientIp(req) });
    }
    return res.json({ emailEnabled: true });
  });

  /** Set a new password with a reset link; signs the client in. */
  r.post('/auth/reset', limits.auth, async (req, res) => {
    const body = parse(z.object({ token: z.string().min(10).max(2000), password }), req.body);
    const payload = verifyPurposeToken(body.token, 'reset');
    const client = payload && (await knex('clients').where({ id: Number(payload.sub) }).first());
    if (!client || client.token_version !== payload.tv || passwordFingerprint(client.password_hash) !== payload.ph) {
      throw new ApiError(400, 'INVALID_RESET_LINK', 'This link has expired or was already used. Please request a new one.');
    }
    if (client.status !== 'active') throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'Your account is suspended. Please contact support.');
    const updated = await updateOne(knex, 'clients', { id: client.id }, {
      password_hash: await hashPassword(body.password),
      token_version: client.token_version + 1,
      last_login_at: nowIso(),
      updated_at: nowIso(),
    });
    await audit(knex, { actorType: 'client', actorId: client.id, action: 'client.password_reset', entity: 'client', entityId: client.id, ip: clientIp(req) });
    res.json({ token: signSession('client', updated), client: publicClient(updated) });
  });

  r.get('/me', auth, (req, res) => res.json({ client: publicClient(req.client) }));

  r.put('/me', auth, async (req, res) => {
    const body = parse(businessSchema, req.body);
    const client = await updateOne(knex, 'clients', { id: req.client.id }, { ...body, updated_at: nowIso() });
    res.json({ client: publicClient(client) });
  });

  r.put('/me/password', auth, limits.auth, async (req, res) => {
    const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: password }), req.body);
    if (!(await verifyPassword(body.currentPassword, req.client.password_hash))) {
      throw new ApiError(400, 'WRONG_PASSWORD', 'Your current password is incorrect.');
    }
    const client = await updateOne(knex, 'clients', { id: req.client.id }, { password_hash: await hashPassword(body.newPassword), token_version: req.client.token_version + 1, updated_at: nowIso() });
    await audit(knex, { actorType: 'client', actorId: client.id, action: 'client.password', entity: 'client', entityId: client.id, ip: clientIp(req) });
    res.json({ token: signSession('client', client) });
  });

  r.get('/licenses', auth, async (req, res) => {
    const rows = await knex('licenses')
      .leftJoin('plans', 'plans.id', 'licenses.plan_id')
      .where('licenses.client_id', req.client.id)
      .select('licenses.*', 'plans.name as plan_name')
      .orderBy('licenses.id', 'desc')
      .limit(100);
    const devices = rows.length
      ? await knex('devices').whereIn('license_id', rows.map((l) => l.id)).whereNull('released_at').orderBy('activated_at')
      : [];
    res.json({
      licenses: rows.map((l) => ({
        ...publicLicense(l),
        devices: devices
          .filter((d) => d.license_id === l.id)
          .map((d) => ({ id: d.id, name: d.device_name, platform: d.platform, appVersion: d.app_version, activatedAt: d.activated_at, lastSeenAt: d.last_seen_at })),
      })),
    });
  });

  r.post('/licenses/:id/devices/:deviceRowId/release', auth, async (req, res) => {
    const license = await knex('licenses').where({ id: Number(req.params.id), client_id: req.client.id }).first();
    if (!license) throw notFound('License');
    const n = await knex('devices')
      .where({ id: Number(req.params.deviceRowId), license_id: license.id })
      .whereNull('released_at')
      .update({ released_at: nowIso() });
    if (!n) throw notFound('Computer');
    await audit(knex, { actorType: 'client', actorId: req.client.id, action: 'device.release', entity: 'license', entityId: license.id, ip: clientIp(req) });
    res.status(204).end();
  });

  /** Installers for paying customers, with personal links that expire after 30 minutes. */
  r.get('/downloads', auth, async (req, res) => {
    const { config: appConfig } = await getAppConfig(knex);
    const version = appConfig.app.latestVersion;
    if (!(await isEntitled(knex, req.client.id))) return res.json({ entitled: false, version, files: [] });
    const files = listInstallers().map((i) => ({
      ...i,
      url: `/api/downloads/${signPurposeToken('download', { sub: String(req.client.id), p: i.platform, f: i.fileName }, '30m')}`,
    }));
    res.set('Cache-Control', 'no-store');
    res.json({ entitled: true, version, files, externalUrl: files.length ? '' : appConfig.app.downloadUrl });
  });

  r.get('/payments', auth, async (req, res) => {
    const q = parse(pageQuery, req.query);
    const result = await paginate(
      knex,
      'payments',
      q,
      (qb) => qb.where('payments.client_id', req.client.id),
      { orderBy: [['payments.id', 'desc']], select: ['payments.*'] },
    );
    const plans = Object.fromEntries((await knex('plans').select('id', 'name')).map((p) => [p.id, p.name]));
    res.json({ ...result, rows: result.rows.map((p) => publicPayment({ ...p, plan_name: plans[p.plan_id] })) });
  });

  /** Start a purchase (or renewal). Returns what the portal needs to open the provider's checkout. */
  r.post('/checkout', auth, async (req, res) => {
    const body = parse(
      z.object({
        planId: z.coerce.number().int().positive(),
        provider: z.string().max(30).optional().default('manual'),
        renewLicenseId: z.coerce.number().int().positive().optional(),
      }),
      req.body,
    );
    const plan = await knex('plans').where({ id: body.planId, is_active: true }).first();
    if (!plan) throw notFound('Plan');
    const provider = getProvider(body.provider);
    if (body.renewLicenseId) {
      const owned = await knex('licenses').where({ id: body.renewLicenseId, client_id: req.client.id }).first();
      if (!owned) throw notFound('License');
      if (owned.status === 'suspended' || owned.status === 'revoked') {
        throw new ApiError(409, 'LICENSE_BLOCKED', 'This license is suspended. Please contact support before renewing it.');
      }
      if (!owned.expires_at && owned.duration_days === 0) throw new ApiError(409, 'LICENSE_LIFETIME', 'This license is already valid for life.');
    }
    const ts = nowIso();
    const payment = await insertOne(knex, 'payments', {
        client_id: req.client.id,
        plan_id: plan.id,
        renew_license_id: body.renewLicenseId ?? null,
        provider: provider.name,
        amount_paise: plan.price_paise,
        currency: plan.currency,
        status: 'created',
        meta: '{}',
        created_at: ts,
        updated_at: ts,
      });
    const order = await provider.createOrder({ payment, plan, client: req.client });
    const updated = await updateOne(knex, 'payments', { id: payment.id }, { provider_order_id: order.providerOrderId, status: 'pending', updated_at: nowIso() });
    await audit(knex, { actorType: 'client', actorId: req.client.id, action: 'payment.create', entity: 'payment', entityId: payment.id, details: { plan: plan.code, provider: provider.name }, ip: clientIp(req) });
    res.status(201).json({ payment: publicPayment({ ...updated, plan_name: plan.name }), checkout: order.checkout });
  });

  /** Confirmation posted by the portal after the provider's checkout completes. */
  r.post('/payments/:id/confirm', auth, async (req, res) => {
    const payment = await knex('payments').where({ id: Number(req.params.id), client_id: req.client.id }).first();
    if (!payment) throw notFound('Payment');
    if (payment.status === 'paid') {
      const license = await knex.transaction((trx) => fulfillPayment(trx, payment));
      return res.json({ payment: publicPayment(payment), license: publicLicense(license) });
    }
    const provider = getProvider(payment.provider);
    const result = await provider.verifyConfirmation({ payment, body: req.body || {} });
    if (!result.paid) {
      const status = result.meta?.outcome === 'failed' ? 'failed' : payment.status;
      const p = await updateOne(knex, 'payments', { id: payment.id }, { status, updated_at: nowIso() });
      return res.status(202).json({ payment: publicPayment(p), license: null });
    }
    const { paid, license } = await markPaid(knex, payment, result.providerPaymentId, result.meta);
    await audit(knex, { actorType: 'client', actorId: req.client.id, action: 'payment.paid', entity: 'payment', entityId: payment.id, ip: clientIp(req) });
    return res.json({ payment: publicPayment(paid), license: publicLicense(license) });
  });

  return r;
}

/**
 * Mark a payment paid and issue/extend its license (idempotent: the webhook, the customer's
 * confirmation and an admin may all report the same payment). The receipt email is sent once.
 */
export async function markPaid(knex, payment, providerPaymentId, meta = {}) {
  const result = await knex.transaction(async (trx) => {
    // Lock the payment row: the provider's webhook and the customer's confirmation often arrive together,
    // and only one of them may issue the license. (SQLite runs one write transaction at a time anyway.)
    const query = trx('payments').where({ id: payment.id });
    const fresh = await (isMysql(trx) ? query.forUpdate() : query).first();
    let paid = fresh;
    const newlyPaid = fresh.status !== 'paid';
    if (newlyPaid) {
      paid = await updateOne(trx, 'payments', { id: payment.id }, {
          status: 'paid',
          provider_payment_id: providerPaymentId || fresh.provider_payment_id,
          paid_at: nowIso(),
          meta: JSON.stringify({ ...parseJson(fresh.meta, {}), ...meta }),
          updated_at: nowIso(),
        });
    }
    const license = await fulfillPayment(trx, paid);
    return { paid: { ...paid, license_id: license.id }, license, newlyPaid };
  });
  if (result.newlyPaid) sendPaymentReceipt(knex, result.paid, result.license).catch((e) => console.error('Receipt email failed:', e.message));
  return result;
}
