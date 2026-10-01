/** Admin API: clients, licenses & activation codes, plans, payments, ads, app configuration, audit log. */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { insertOne, nowIso, parseJson, updateOne, whereContains } from '../db.js';
import { ApiError, clientIp, notFound, pageQuery, paginate, parse } from '../lib/http.js';
import { limits, requireAdmin } from '../lib/auth.js';
import { burnPasswordCheck, hashPassword, normaliseCode, signSession, verifyPassword } from '../lib/security.js';
import { audit, getAppConfig, getSiteConfig, saveAppConfig, saveSiteConfig } from '../services/common.js';
import { createLicense, effectiveStatus, extendLicense, getLicenseWithPlan, publicLicense } from '../services/licenses.js';
import { businessSchema, markPaid, publicClient, publicPayment, publicPlan } from './portal.js';
import { PLATFORMS, listInstallers, removeInstaller, storeInstaller } from '../services/downloads.js';

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => v === '' || /^https:\/\/[^\s"<>]+$/i.test(v) || (!config.isProd && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s"<>]*$/i.test(v)),
    'must be an https:// URL',
  );
const isoDate = z
  .string()
  .trim()
  .refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'must be a valid date')
  .transform((v) => (v ? new Date(v).toISOString() : null));

const planSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,40}$/, 'use letters, numbers and _').optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(''),
  price: z.coerce.number().min(0).max(10000000),
  currency: z.string().trim().length(3).default('INR'),
  durationDays: z.coerce.number().int().min(0).max(3650),
  maxDevices: z.coerce.number().int().min(1).max(1000),
  features: z.array(z.string().trim().max(120)).max(20).default([]),
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

const siteSchema = z.object({
  headline: z.string().trim().min(3).max(120),
  subheadline: z.string().trim().max(300).default(''),
  screenshots: z
    .array(z.object({ url: z.string().trim().max(500).refine((v) => v.startsWith('/') || /^https?:\/\//.test(v), 'must be an image address'), caption: z.string().trim().max(80).default('') }))
    .max(6)
    .default([]),
  videos: z.array(z.object({ title: z.string().trim().max(80).default(''), url: httpsUrl.refine((v) => v !== '', 'enter the video address') })).max(2).default([]),
  showComparison: z.boolean().default(true),
});

const adSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(''),
  imageUrl: httpsUrl.default(''),
  html: z.string().max(20000).default(''),
  linkUrl: httpsUrl.default(''),
  ctaText: z.string().trim().max(30).default('Learn more'),
  isActive: z.boolean().default(true),
  startAt: isoDate.optional().default(''),
  endAt: isoDate.optional().default(''),
  frequencyDays: z.coerce.number().int().min(0).max(365).default(7),
  maxPerMonth: z.coerce.number().int().min(0).max(31).default(4),
  priority: z.coerce.number().int().min(-100).max(100).default(0),
  target: z
    .object({
      licenseStatus: z.enum(['all', 'trial', 'licensed']).default('all'),
      platforms: z.array(z.enum(['windows', 'macos', 'linux'])).max(3).default([]),
      minVersion: z.string().trim().max(20).default(''),
      maxVersion: z.string().trim().max(20).default(''),
    })
    .default({ licenseStatus: 'all', platforms: [], minVersion: '', maxVersion: '' }),
});

const configSchema = z.object({
  configIntervalDays: z.coerce.number().int().min(1).max(365),
  adPolicy: z.object({
    minDaysBetweenAds: z.coerce.number().int().min(0).max(365),
    maxPerMonth: z.coerce.number().int().min(0).max(31),
    firstOpenDelayDays: z.coerce.number().int().min(0).max(365),
  }),
  defaultAdEnabled: z.boolean(),
  app: z.object({
    latestVersion: z.string().trim().max(20).default(''),
    downloadUrl: httpsUrl.default(''),
    message: z.string().trim().max(300).default(''),
  }),
  help: z.object({
    youtubeChannel: httpsUrl.default(''),
    videos: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(100),
          url: httpsUrl,
          description: z.string().trim().max(200).default(''),
          duration: z.string().trim().max(10).default(''),
        }),
      )
      .max(50)
      .default([]),
  }),
});

const publicAd = (a) => ({
  id: a.id,
  title: a.title,
  description: a.description,
  imageUrl: a.image_url,
  html: a.html,
  linkUrl: a.link_url,
  ctaText: a.cta_text,
  isActive: !!a.is_active,
  startAt: a.start_at,
  endAt: a.end_at,
  frequencyDays: a.frequency_days,
  maxPerMonth: a.max_per_month,
  priority: a.priority,
  target: parseJson(a.target, {}),
  version: a.version,
  createdAt: a.created_at,
  updatedAt: a.updated_at,
});

const adRow = (b) => ({
  title: b.title,
  description: b.description,
  image_url: b.imageUrl,
  html: b.html,
  link_url: b.linkUrl,
  cta_text: b.ctaText,
  is_active: b.isActive,
  start_at: b.startAt || null,
  end_at: b.endAt || null,
  frequency_days: b.frequencyDays,
  max_per_month: b.maxPerMonth,
  priority: b.priority,
  target: JSON.stringify(b.target),
});

export function adminRoutes(knex) {
  const r = Router();
  const auth = requireAdmin(knex);
  const ownerOnly = requireAdmin(knex, ['owner', 'admin']);
  const log = (req, action, entity, entityId, details = {}) =>
    audit(knex, { actorType: 'admin', actorId: req.admin.id, action, entity, entityId, details, ip: clientIp(req) });

  // ------------------------------------------------------------------ auth
  r.post('/auth/login', limits.auth, async (req, res) => {
    const body = parse(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) }), req.body);
    const admin = await knex('admins').where({ email: body.email }).first();
    const ok = admin ? await verifyPassword(body.password, admin.password_hash) : await burnPasswordCheck(body.password);
    if (!admin || !ok) throw new ApiError(401, 'INVALID_LOGIN', 'Incorrect email or password.');
    await knex('admins').where({ id: admin.id }).update({ last_login_at: nowIso() });
    res.json({ token: signSession('admin', admin), admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
  });

  r.get('/me', auth, (req, res) => res.json({ admin: { id: req.admin.id, email: req.admin.email, name: req.admin.name, role: req.admin.role } }));

  // ------------------------------------------------------------ dashboard
  r.get('/stats', auth, async (_req, res) => {
    const count = async (table, build = (q) => q) => Number((await build(knex(table)).count({ c: '*' }))[0].c);
    const now = nowIso();
    const monthStart = `${now.slice(0, 7)}-01T00:00:00.000Z`;
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString();
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const stats = await knex('usage_stats').where('day', '>=', since).select('metric').sum({ total: 'count' }).groupBy('metric');
    const sum = async (build) => Number((await build(knex('payments').where({ status: 'paid' })).sum({ total: 'amount_paise' }))[0].total || 0) / 100;
    const recent = await knex('payments')
      .leftJoin('clients', 'clients.id', 'payments.client_id')
      .where('payments.status', 'paid')
      .orderBy('payments.paid_at', 'desc')
      .limit(6)
      .select('payments.*', 'clients.name as client_name', 'clients.email as client_email');
    const expiring = await knex('licenses')
      .leftJoin('clients', 'clients.id', 'licenses.client_id')
      .where('licenses.status', 'active')
      .whereBetween('licenses.expires_at', [now, in30])
      .orderBy('licenses.expires_at')
      .limit(8)
      .select('licenses.id', 'licenses.code', 'licenses.expires_at', 'licenses.client_id', 'clients.name as client_name', 'clients.email as client_email');
    res.json({
      clients: await count('clients'),
      customers: Number((await knex('payments').where({ status: 'paid' }).countDistinct({ c: 'client_id' }))[0].c),
      licenses: await count('licenses'),
      activeLicenses: await count('licenses', (q) => q.where({ status: 'active' }).andWhere((w) => w.whereNull('expires_at').orWhere('expires_at', '>=', now))),
      expiringSoon: await count('licenses', (q) => q.where({ status: 'active' }).whereBetween('expires_at', [now, in30])),
      unusedCodes: await count('licenses', (q) => q.where({ status: 'unused' })),
      devices: await count('devices', (q) => q.whereNull('released_at')),
      paidPayments: await count('payments', (q) => q.where({ status: 'paid' })),
      pendingPayments: await count('payments', (q) => q.where({ status: 'pending' })),
      monthSales: await count('payments', (q) => q.where({ status: 'paid' }).where('paid_at', '>=', monthStart)),
      monthRevenue: await sum((q) => q.where('paid_at', '>=', monthStart)),
      revenue: await sum((q) => q),
      recentSales: recent.map((p) => ({ ...publicPayment(p), client: { id: p.client_id, name: p.client_name, email: p.client_email } })),
      expiring: expiring.map((l) => ({ id: l.id, code: l.code, expiresAt: l.expires_at, client: { id: l.client_id, name: l.client_name, email: l.client_email } })),
      last30Days: Object.fromEntries(stats.map((s) => [s.metric, Number(s.total)])),
    });
  });

  /** Ads & campaigns: sign-ups, paying customers and revenue per source/campaign. */
  r.get('/stats/acquisition', auth, async (req, res) => {
    const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(3650).default(30) }), req.query);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const signups = await knex('clients')
      .where('created_at', '>=', since)
      .select('ref_source', 'ref_campaign')
      .count({ signups: '*' })
      .groupBy('ref_source', 'ref_campaign');
    // Payments by clients who signed up in the period (the ad's result), whenever they paid.
    const paid = await knex('payments')
      .join('clients', 'clients.id', 'payments.client_id')
      .where('clients.created_at', '>=', since)
      .where('payments.status', 'paid')
      .select('clients.ref_source', 'clients.ref_campaign')
      .countDistinct({ customers: 'payments.client_id' })
      .sum({ revenue: 'payments.amount_paise' })
      .groupBy('clients.ref_source', 'clients.ref_campaign');
    const key = (r) => `${r.ref_source}\u0000${r.ref_campaign}`;
    const rows = new Map();
    for (const r of signups) rows.set(key(r), { source: r.ref_source || 'direct', campaign: r.ref_campaign, signups: Number(r.signups), customers: 0, revenue: 0 });
    for (const r of paid) {
      const row = rows.get(key(r)) || { source: r.ref_source || 'direct', campaign: r.ref_campaign, signups: 0, customers: 0, revenue: 0 };
      row.customers = Number(r.customers);
      row.revenue = Number(r.revenue || 0) / 100;
      rows.set(key(r), row);
    }
    const list = [...rows.values()].map((r) => ({ ...r, conversion: r.signups ? Math.round((r.customers / r.signups) * 1000) / 10 : 0 }));
    list.sort((a, b) => b.revenue - a.revenue || b.signups - a.signups);
    res.json({ days, rows: list });
  });

  // -------------------------------------------------------------- clients
  r.get('/clients', auth, async (req, res) => {
    const q = parse(pageQuery.extend({ status: z.enum(['', 'active', 'suspended']).default('') }), req.query);
    const result = await paginate(knex, 'clients', q, (qb) => {
      if (q.q) whereContains(qb, ['email', 'name', 'business_name', 'phone', 'gstin'], q.q);
      if (q.status) qb.where({ status: q.status });
    });
    const ids = result.rows.map((c) => c.id);
    const licenses = ids.length ? await knex('licenses').whereIn('client_id', ids).orderBy('id', 'desc') : [];
    const paid = ids.length
      ? await knex('payments').whereIn('client_id', ids).where({ status: 'paid' }).select('client_id').sum({ total: 'amount_paise' }).groupBy('client_id')
      : [];
    const paidBy = Object.fromEntries(paid.map((p) => [p.client_id, Number(p.total) / 100]));
    res.json({
      ...result,
      rows: result.rows.map((c) => {
        const mine = licenses.filter((l) => l.client_id === c.id);
        // The license that matters most: active first, then the latest one.
        const main = mine.find((l) => effectiveStatus(l) === 'active') || mine[0];
        return {
          ...publicClient(c),
          paidTotal: paidBy[c.id] || 0,
          license: main ? { id: main.id, code: main.code, status: effectiveStatus(main), expiresAt: main.expires_at, lifetime: !main.expires_at && main.duration_days === 0 } : null,
        };
      }),
    });
  });

  r.post('/clients', auth, async (req, res) => {
    const body = parse(
      businessSchema.extend({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().toLowerCase().email().max(190),
        password: z.string().min(8).max(200).optional(),
      }),
      req.body,
    );
    const exists = await knex('clients').where({ email: body.email }).first('id');
    if (exists) throw new ApiError(409, 'EMAIL_TAKEN', 'A client with this email already exists.');
    const tempPassword = body.password || crypto.randomBytes(6).toString('base64url');
    const ts = nowIso();
    const { password: _omit, ...fields } = body;
    const client = await insertOne(knex, 'clients', { ...fields, password_hash: await hashPassword(tempPassword), source: 'admin', created_at: ts, updated_at: ts });
    await log(req, 'client.create', 'client', client.id);
    res.status(201).json({ client: publicClient(client), temporaryPassword: body.password ? undefined : tempPassword });
  });

  r.get('/clients/:id', auth, async (req, res) => {
    const client = await knex('clients').where({ id: Number(req.params.id) }).first();
    if (!client) throw notFound('Client');
    const licenses = await knex('licenses')
      .leftJoin('plans', 'plans.id', 'licenses.plan_id')
      .where('licenses.client_id', client.id)
      .select('licenses.*', 'plans.name as plan_name')
      .orderBy('licenses.id', 'desc')
      .limit(100);
    const devices = licenses.length ? await knex('devices').whereIn('license_id', licenses.map((l) => l.id)).orderBy('id', 'desc').limit(300) : [];
    const payments = await knex('payments').where({ client_id: client.id }).orderBy('id', 'desc').limit(50);
    res.json({
      client: publicClient(client),
      licenses: licenses.map((l) => ({ ...publicLicense(l), devices: devices.filter((d) => d.license_id === l.id) })),
      payments: payments.map(publicPayment),
    });
  });

  r.put('/clients/:id', auth, async (req, res) => {
    const body = parse(businessSchema.extend({ status: z.enum(['active', 'suspended']).optional(), email: z.string().trim().toLowerCase().email().optional() }), req.body);
    const client = await updateOne(knex, 'clients', { id: Number(req.params.id) }, { ...body, updated_at: nowIso() });
    if (!client) throw notFound('Client');
    await log(req, 'client.update', 'client', client.id, body);
    res.json({ client: publicClient(client) });
  });

  r.post('/clients/:id/reset-password', auth, async (req, res) => {
    const client = await knex('clients').where({ id: Number(req.params.id) }).first();
    if (!client) throw notFound('Client');
    const temporaryPassword = crypto.randomBytes(6).toString('base64url');
    await knex('clients')
      .where({ id: client.id })
      .update({ password_hash: await hashPassword(temporaryPassword), token_version: client.token_version + 1, updated_at: nowIso() });
    await log(req, 'client.reset_password', 'client', client.id);
    res.json({ temporaryPassword });
  });

  // ------------------------------------------------------------- licenses
  r.get('/licenses', auth, async (req, res) => {
    const q = parse(
      pageQuery.extend({
        status: z.enum(['', 'unused', 'active', 'expired', 'suspended', 'revoked']).default(''),
        planId: z.coerce.number().int().optional(),
        clientId: z.coerce.number().int().optional(),
      }),
      req.query,
    );
    const now = nowIso();
    const result = await paginate(
      knex,
      'licenses',
      q,
      (qb, { count = false } = {}) => {
        // The join is only needed for searching by client or for the listed columns, not for counting.
        if (!count || q.q) qb.leftJoin('clients', 'clients.id', 'licenses.client_id');
        if (q.q) {
          const code = normaliseCode(q.q);
          if (code) qb.where('licenses.code', code);
          else whereContains(qb, ['clients.email', 'clients.name', 'clients.business_name', 'licenses.code'], q.q);
        }
        if (q.planId) qb.where('licenses.plan_id', q.planId);
        if (q.clientId) qb.where('licenses.client_id', q.clientId);
        if (q.status === 'expired') qb.where('licenses.status', 'active').where('licenses.expires_at', '<', now);
        else if (q.status === 'active') qb.where('licenses.status', 'active').andWhere((w) => w.whereNull('licenses.expires_at').orWhere('licenses.expires_at', '>=', now));
        else if (q.status) qb.where('licenses.status', q.status);
      },
      {
        orderBy: [['licenses.id', 'desc']],
        select: ['licenses.*', 'clients.email as client_email', 'clients.name as client_name', 'clients.business_name as client_business'],
      },
    );
    const plans = Object.fromEntries((await knex('plans').select('id', 'name')).map((p) => [p.id, p.name]));
    res.json({
      ...result,
      rows: result.rows.map((l) => ({
        ...publicLicense({ ...l, plan_name: plans[l.plan_id] }),
        client: l.client_id ? { id: l.client_id, email: l.client_email, name: l.client_name, businessName: l.client_business } : null,
      })),
    });
  });

  /** Create licenses without payment: one activated for a client, or a batch of codes. */
  r.post('/licenses', auth, async (req, res) => {
    const body = parse(
      z.object({
        planId: z.coerce.number().int().positive().optional(),
        clientId: z.coerce.number().int().positive().optional(),
        count: z.coerce.number().int().min(1).max(500).default(1),
        durationDays: z.coerce.number().int().min(0).max(3650).optional(),
        maxDevices: z.coerce.number().int().min(1).max(1000).optional(),
        expiresAt: isoDate.optional().default(''),
        activateNow: z.boolean().default(false),
        notes: z.string().trim().max(500).default(''),
      }),
      req.body,
    );
    const plan = body.planId
      ? await knex('plans').where({ id: body.planId }).first()
      : await knex('plans').where({ is_active: true }).orderBy([{ column: 'is_public', order: 'desc' }, 'sort_order']).first();
    if (!plan) throw notFound('Product');
    if (body.clientId && !(await knex('clients').where({ id: body.clientId }).first('id'))) throw notFound('Client');
    const created = await knex.transaction(async (trx) => {
      const out = [];
      for (let i = 0; i < body.count; i += 1) {
        const duration = body.durationDays ?? plan.duration_days;
        const fields = {
          client_id: body.clientId ?? null,
          plan_id: plan.id,
          duration_days: duration,
          max_devices: body.maxDevices ?? plan.max_devices,
          expires_at: body.expiresAt || null,
          source: body.count > 1 ? 'bulk' : 'admin',
          notes: body.notes,
        };
        if (body.activateNow) {
          fields.status = 'active';
          fields.activated_at = nowIso();
          if (!fields.expires_at && duration > 0) fields.expires_at = new Date(Date.now() + duration * 86400000).toISOString();
        }
        out.push(await createLicense(trx, fields));
      }
      return out;
    });
    await log(req, 'license.create', 'license', created[0].id, { count: created.length, planId: plan.id, clientId: body.clientId ?? null, activateNow: body.activateNow });
    res.status(201).json({ licenses: created.map((l) => publicLicense({ ...l, plan_name: plan.name })) });
  });

  r.get('/licenses/:id', auth, async (req, res) => {
    const license = await getLicenseWithPlan(knex, Number(req.params.id));
    if (!license) throw notFound('License');
    const devices = await knex('devices').where({ license_id: license.id }).orderBy('id', 'desc');
    const client = license.client_id ? await knex('clients').where({ id: license.client_id }).first() : null;
    const history = await knex('audit_log').where({ entity: 'license', entity_id: license.id }).orderBy('id', 'desc').limit(50);
    res.json({
      license: publicLicense(license),
      client: client ? publicClient(client) : null,
      devices,
      history: history.map((h) => ({ ...h, details: parseJson(h.details, {}) })),
    });
  });

  r.put('/licenses/:id', auth, async (req, res) => {
    const body = parse(
      z.object({
        status: z.enum(['unused', 'active', 'suspended', 'revoked']).optional(),
        expiresAt: isoDate.optional(),
        lifetime: z.boolean().optional(),
        maxDevices: z.coerce.number().int().min(1).max(1000).optional(),
        planId: z.coerce.number().int().positive().optional(),
        clientId: z.coerce.number().int().positive().nullable().optional(),
        notes: z.string().trim().max(500).optional(),
      }),
      req.body,
    );
    const license = await knex('licenses').where({ id: Number(req.params.id) }).first();
    if (!license) throw notFound('License');
    const patch = { updated_at: nowIso() };
    if (body.status) patch.status = body.status;
    if (body.expiresAt !== undefined) patch.expires_at = body.expiresAt;
    if (body.lifetime) {
      patch.expires_at = null;
      patch.duration_days = 0;
    }
    if (body.maxDevices) patch.max_devices = body.maxDevices;
    if (body.planId) patch.plan_id = body.planId;
    if (body.clientId !== undefined) patch.client_id = body.clientId;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (patch.status === 'active' && !license.activated_at) patch.activated_at = nowIso();
    await knex('licenses').where({ id: license.id }).update(patch);
    await log(req, 'license.update', 'license', license.id, body);
    res.json({ license: publicLicense(await getLicenseWithPlan(knex, license.id)) });
  });

  r.post('/licenses/:id/extend', auth, async (req, res) => {
    const body = parse(z.object({ days: z.coerce.number().int().min(1).max(3650) }), req.body);
    const license = await knex('licenses').where({ id: Number(req.params.id) }).first();
    if (!license) throw notFound('License');
    await extendLicense(knex, license, body.days);
    await log(req, 'license.extend', 'license', license.id, body);
    res.json({ license: publicLicense(await getLicenseWithPlan(knex, license.id)) });
  });

  r.post('/licenses/:id/devices/:deviceRowId/release', auth, async (req, res) => {
    const n = await knex('devices')
      .where({ id: Number(req.params.deviceRowId), license_id: Number(req.params.id) })
      .update({ released_at: nowIso() });
    if (!n) throw notFound('Computer');
    await log(req, 'device.release', 'license', Number(req.params.id), { deviceRowId: Number(req.params.deviceRowId) });
    res.status(204).end();
  });

  // ---------------------------------------------------------------- plans
  r.get('/plans', auth, async (_req, res) => {
    res.json({ plans: (await knex('plans').orderBy('sort_order')).map(publicPlan) });
  });

  /** Product code: given, or made from the name (DocGen Pro → DOCGEN_PRO), unique. */
  const productCode = async (b, id = null) => {
    const base = (b.code || b.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'PRODUCT').slice(0, 34);
    let code = base;
    for (let i = 2; await knex('plans').where({ code }).whereNot({ id: id ?? 0 }).first('id'); i += 1) code = `${base}_${i}`;
    return code;
  };
  const planRow = (b) => ({
    code: b.code,
    name: b.name,
    description: b.description,
    price_paise: Math.round(b.price * 100),
    currency: b.currency.toUpperCase(),
    duration_days: b.durationDays,
    max_devices: b.maxDevices,
    features: JSON.stringify(b.features),
    is_active: b.isActive,
    is_public: b.isPublic,
    sort_order: b.sortOrder,
  });

  r.post('/plans', ownerOnly, async (req, res) => {
    const body = parse(planSchema, req.body);
    body.code = await productCode(body);
    const ts = nowIso();
    const plan = await insertOne(knex, 'plans', { ...planRow(body), created_at: ts, updated_at: ts });
    await log(req, 'plan.create', 'plan', plan.id, { code: plan.code });
    res.status(201).json({ plan: publicPlan(plan) });
  });

  r.put('/plans/:id', ownerOnly, async (req, res) => {
    const body = parse(planSchema, req.body);
    const current = await knex('plans').where({ id: Number(req.params.id) }).first();
    if (!current) throw notFound('Product');
    body.code = body.code ? await productCode(body, current.id) : current.code;
    const plan = await updateOne(knex, 'plans', { id: current.id }, { ...planRow(body), updated_at: nowIso() });
    if (!plan) throw notFound('Plan');
    await log(req, 'plan.update', 'plan', plan.id, { code: plan.code });
    res.json({ plan: publicPlan(plan) });
  });

  // ------------------------------------------------------------- payments
  r.get('/payments', auth, async (req, res) => {
    const q = parse(pageQuery.extend({ status: z.enum(['', 'created', 'pending', 'paid', 'failed', 'cancelled', 'refunded']).default('') }), req.query);
    const result = await paginate(
      knex,
      'payments',
      q,
      (qb) => {
        qb.leftJoin('clients', 'clients.id', 'payments.client_id');
        if (q.status) qb.where('payments.status', q.status);
        if (q.q) whereContains(qb, ['clients.email', 'clients.name', 'payments.provider_order_id', 'payments.provider_payment_id'], q.q);
      },
      { orderBy: [['payments.id', 'desc']], select: ['payments.*', 'clients.email as client_email', 'clients.name as client_name'] },
    );
    const plans = Object.fromEntries((await knex('plans').select('id', 'name')).map((p) => [p.id, p.name]));
    res.json({
      ...result,
      rows: result.rows.map((p) => ({ ...publicPayment({ ...p, plan_name: plans[p.plan_id] }), client: { id: p.client_id, email: p.client_email, name: p.client_name } })),
    });
  });

  /** Confirm a manual payment (bank transfer, UPI, cash) and issue the license. */
  r.post('/payments/:id/mark-paid', auth, async (req, res) => {
    const body = parse(z.object({ reference: z.string().trim().max(120).default('') }), req.body);
    const payment = await knex('payments').where({ id: Number(req.params.id) }).first();
    if (!payment) throw notFound('Payment');
    const { paid, license } = await markPaid(knex, payment, body.reference || `manual-${payment.id}`, { confirmedBy: req.admin.email });
    await log(req, 'payment.mark_paid', 'payment', payment.id, body);
    res.json({ payment: publicPayment(paid), license: publicLicense(license) });
  });

  /** Record a refund (made in the payment provider's dashboard) and revoke the license it bought. */
  r.post('/payments/:id/refund', ownerOnly, async (req, res) => {
    const body = parse(z.object({ revokeLicense: z.boolean().default(true) }), req.body);
    const payment = await knex('payments').where({ id: Number(req.params.id) }).first();
    if (!payment) throw notFound('Payment');
    if (payment.status !== 'paid') throw new ApiError(409, 'NOT_PAID', 'Only paid payments can be refunded.');
    const updated = await updateOne(knex, 'payments', { id: payment.id }, { status: 'refunded', updated_at: nowIso() });
    let revoked = false;
    if (body.revokeLicense && payment.license_id) {
      // Only a license this payment created; a renewal refund leaves the earlier license alone.
      revoked = (await knex('licenses').where({ id: payment.license_id, payment_id: payment.id }).update({ status: 'revoked', updated_at: nowIso() })) > 0;
    }
    await log(req, 'payment.refund', 'payment', payment.id, { revoked });
    res.json({ payment: publicPayment(updated), licenseRevoked: revoked });
  });

  // ----------------------------------------------------------------- website
  r.get('/site', auth, async (_req, res) => res.json({ site: await getSiteConfig(knex) }));

  r.put('/site', ownerOnly, async (req, res) => {
    const body = parse(siteSchema, req.body);
    const site = await saveSiteConfig(knex, body, req.admin.id);
    await log(req, 'site.update', 'config', null, {});
    res.json({ site });
  });

  // ------------------------------------------------------------------ ads
  r.get('/ads', auth, async (req, res) => {
    const q = parse(pageQuery, req.query);
    const result = await paginate(knex, 'ads', q, (qb) => {
      if (q.q) whereContains(qb, ['title', 'description'], q.q);
    });
    const ids = result.rows.map((a) => a.id);
    const metrics = ids.flatMap((id) => ['AD_SHOWN', 'AD_CLICKED', 'AD_CLOSED'].map((e) => `ad:${id}:${e}`));
    const stats = metrics.length
      ? await knex('usage_stats').whereIn('metric', metrics).select('metric').sum({ total: 'count' }).groupBy('metric')
      : [];
    const byAd = {};
    for (const s of stats) {
      const [, id, event] = s.metric.split(':');
      byAd[id] = { ...(byAd[id] || {}), [event]: Number(s.total) };
    }
    res.json({ ...result, rows: result.rows.map((a) => ({ ...publicAd(a), stats: byAd[a.id] || {} })) });
  });

  r.post('/ads', auth, async (req, res) => {
    const body = parse(adSchema, req.body);
    const ts = nowIso();
    const ad = await insertOne(knex, 'ads', { ...adRow(body), created_at: ts, updated_at: ts });
    await log(req, 'ad.create', 'ad', ad.id, { title: ad.title });
    res.status(201).json({ ad: publicAd(ad) });
  });

  r.put('/ads/:id', auth, async (req, res) => {
    const body = parse(adSchema, req.body);
    const current = await knex('ads').where({ id: Number(req.params.id) }).first();
    if (!current) throw notFound('Ad');
    const ad = await updateOne(knex, 'ads', { id: current.id }, { ...adRow(body), version: current.version + 1, updated_at: nowIso() });
    await log(req, 'ad.update', 'ad', ad.id, { title: ad.title });
    res.json({ ad: publicAd(ad) });
  });

  r.delete('/ads/:id', auth, async (req, res) => {
    const n = await knex('ads').where({ id: Number(req.params.id) }).del();
    if (!n) throw notFound('Ad');
    await log(req, 'ad.delete', 'ad', Number(req.params.id));
    res.status(204).end();
  });

  // ----------------------------------------------------------- app config
  r.get('/config', auth, async (_req, res) => {
    const { config, updatedAt, version } = await getAppConfig(knex);
    const checks = await knex('usage_stats').where({ metric: 'config_check' }).orderBy('day', 'desc').limit(30);
    res.json({
      config,
      version,
      updatedAt,
      nextCheckWithinDays: config.configIntervalDays,
      recentChecks: checks.map((c) => ({ day: c.day, count: c.count })),
    });
  });

  r.put('/config', ownerOnly, async (req, res) => {
    const body = parse(configSchema, req.body);
    const saved = await saveAppConfig(knex, body, req.admin.id);
    await log(req, 'config.update', 'config', null, { version: saved.version });
    res.json(saved);
  });

  // ------------------------------------------------------------ downloads
  // Installers that paying customers download from their account (one per platform).
  const tmpDir = path.join(config.downloadsDir, '.incoming');
  const installerUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        fs.mkdirSync(tmpDir, { recursive: true });
        cb(null, tmpDir);
      },
      filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
    }),
    limits: { fileSize: 600 * 1024 * 1024, files: 1 },
  });
  const platformParam = (req) => {
    const platform = String(req.params.platform);
    if (!PLATFORMS[platform]) throw new ApiError(400, 'UNKNOWN_PLATFORM', 'Choose Windows, macOS or Linux.');
    return platform;
  };

  r.get('/downloads', auth, async (_req, res) => {
    const { config: appConfig } = await getAppConfig(knex);
    res.json({
      installers: listInstallers(),
      platforms: Object.entries(PLATFORMS).map(([id, p]) => ({ id, label: p.label, extensions: p.extensions })),
      externalUrl: appConfig.app.downloadUrl,
      latestVersion: appConfig.app.latestVersion,
    });
  });

  r.post('/downloads/:platform', ownerOnly, installerUpload.single('file'), async (req, res) => {
    const platform = platformParam(req);
    if (!req.file) throw new ApiError(400, 'INVALID_FILE', 'Choose the installer file to upload.');
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!PLATFORMS[platform].extensions.includes(ext)) {
      fs.rmSync(req.file.path, { force: true });
      throw new ApiError(400, 'INVALID_FILE', `A ${PLATFORMS[platform].label} installer must be ${PLATFORMS[platform].extensions.join(', ')}.`);
    }
    const installer = storeInstaller(platform, req.file.path, req.file.originalname);
    await log(req, 'download.upload', 'download', null, { platform, fileName: installer.fileName, size: installer.size });
    res.status(201).json({ installer });
  });

  r.delete('/downloads/:platform', ownerOnly, async (req, res) => {
    const platform = platformParam(req);
    removeInstaller(platform);
    await log(req, 'download.delete', 'download', null, { platform });
    res.status(204).end();
  });

  // ----------------------------------------------------------- audit log
  r.get('/audit', auth, async (req, res) => {
    const q = parse(pageQuery.extend({ entity: z.string().trim().max(40).optional().default('') }), req.query);
    const result = await paginate(knex, 'audit_log', q, (qb) => {
      if (q.entity) qb.where({ entity: q.entity });
      if (q.q) whereContains(qb, ['action', 'details'], q.q);
    });
    res.json({ ...result, rows: result.rows.map((row) => ({ ...row, details: parseJson(row.details, {}) })) });
  });

  // ------------------------------------------------------------- admins
  r.post('/admins', requireAdmin(knex, ['owner']), async (req, res) => {
    const body = parse(
      z.object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().min(2).max(120), password: z.string().min(10).max(200), role: z.enum(['owner', 'admin', 'support']).default('admin') }),
      req.body,
    );
    const row = await insertOne(knex, 'admins', { email: body.email, name: body.name, role: body.role, password_hash: await hashPassword(body.password), created_at: nowIso() });
    const admin = { id: row.id, email: row.email, name: row.name, role: row.role };
    await log(req, 'admin.create', 'admin', admin.id, { email: admin.email, role: admin.role });
    res.status(201).json({ admin });
  });

  return r;
}
