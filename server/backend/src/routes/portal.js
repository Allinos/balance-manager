/** Client portal API: account, business details, plans, checkout, licenses. */

import { Router } from 'express';
import { z } from 'zod';
import { insertOne, nowIso, parseJson, updateOne } from '../db.js';
import { ApiError, clientIp, notFound, pageQuery, paginate, parse } from '../lib/http.js';
import { limits, requireClient } from '../lib/auth.js';
import { burnPasswordCheck, hashPassword, signSession, verifyPassword } from '../lib/security.js';
import { audit } from '../services/common.js';
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
    res.json({ plans: rows.map(publicPlan), providers: listProviders() });
  });

  r.post('/auth/register', limits.auth, async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().toLowerCase().email().max(190),
        password,
        phone: z.string().trim().max(30).optional().default(''),
      }),
      req.body,
    );
    const exists = await knex('clients').where({ email: body.email }).first('id');
    if (exists) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Please sign in.');
    const ts = nowIso();
    const client = await insertOne(knex, 'clients', {
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
      const owned = await knex('licenses').where({ id: body.renewLicenseId, client_id: req.client.id }).first('id');
      if (!owned) throw notFound('License');
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

/** Mark a payment paid and issue/extend its license (idempotent). */
export async function markPaid(knex, payment, providerPaymentId, meta = {}) {
  return knex.transaction(async (trx) => {
    const fresh = await trx('payments').where({ id: payment.id }).first();
    let paid = fresh;
    if (fresh.status !== 'paid') {
      paid = await updateOne(trx, 'payments', { id: payment.id }, {
          status: 'paid',
          provider_payment_id: providerPaymentId || fresh.provider_payment_id,
          paid_at: nowIso(),
          meta: JSON.stringify({ ...parseJson(fresh.meta, {}), ...meta }),
          updated_at: nowIso(),
        });
    }
    const license = await fulfillPayment(trx, paid);
    return { paid: { ...paid, license_id: license.id }, license };
  });
}
