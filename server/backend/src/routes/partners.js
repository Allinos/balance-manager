/**
 * Partner programme API (services/partners.js).
 *   /api/partner/*         the partner portal: apply, sign in, dashboard, accept the current terms
 *   /api/admin/partners/*  the admin: approve, codes, commission %, permissions, commissions and payouts
 */

import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { insertOne, nowIso, updateOne, whereContains } from '../db.js';
import { ApiError, clientIp, notFound, pageQuery, paginate, parse } from '../lib/http.js';
import { limits, requireAdmin } from '../lib/auth.js';
import { burnPasswordCheck, hashPassword, signSession, verifyPassword, verifySession } from '../lib/security.js';
import { audit } from '../services/common.js';
import {
  COMMISSION_HOLD_DAYS,
  COMMISSION_STATUSES,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_PERMISSIONS,
  PARTNER_STATUSES,
  PARTNER_TERMS_VERSION,
  assignPartnerCode,
  maskName,
  partnerStats,
  permissionsOf,
  publicPartner,
  rateBps,
  reverseCommission,
} from '../services/partners.js';

const bearer = (req) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
};

/** Require a signed-in partner whose account is not closed. Sets req.partner. */
export const requirePartner = (knex) => async (req, _res, next) => {
  try {
    const token = bearer(req);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Please sign in.');
    const payload = verifySession(token, 'partner');
    const partner = await knex('partners').where({ id: Number(payload.sub) }).first();
    if (!partner || partner.token_version !== payload.tv) throw new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
    if (['rejected', 'terminated', 'suspended'].includes(partner.status)) throw new ApiError(403, 'PARTNER_INACTIVE', closedMessage(partner.status));
    req.partner = partner;
    next();
  } catch (e) {
    next(e);
  }
};

const closedMessage = (status) =>
  status === 'suspended'
    ? 'Your partner account is suspended. Please contact us.'
    : status === 'terminated'
      ? 'Your partnership has ended. Please contact us if you think this is a mistake.'
      : 'Your partner application was not approved.';

const rupees = (paise) => Math.round(Number(paise || 0)) / 100;
const rateSchema = z
  .string()
  .trim()
  .refine((v) => rateBps(v) !== null, 'must be a percentage from 0 to 50, e.g. 10 or 12.5');

async function recordTerms(knex, partner, req) {
  const ts = nowIso();
  await knex('partner_terms_acceptances').insert({
    partner_id: partner.id,
    terms_version: PARTNER_TERMS_VERSION,
    accepted_at: ts,
    ip: clientIp(req),
    user_agent: String(req.get('user-agent') || '').slice(0, 400),
  });
  await knex('partners').where({ id: partner.id }).update({ terms_version: PARTNER_TERMS_VERSION, terms_accepted_at: ts, updated_at: ts });
}

/** Customers a partner brought, as the partner may see them. */
async function referredFor(knex, partner, limit = 200) {
  const perms = permissionsOf(partner);
  const clients = await knex('clients').where({ partner_id: partner.id }).orderBy('partner_at', 'desc').orderBy('id', 'desc').limit(limit).select('id', 'name', 'created_at', 'partner_at');
  const ids = clients.map((c) => c.id);
  const paid = ids.length
    ? await knex('payments').whereIn('client_id', ids).where({ partner_id: partner.id, status: 'paid' }).select('client_id').sum({ total: 'amount_paise' }).count({ n: 'id' }).groupBy('client_id')
    : [];
  const by = Object.fromEntries(paid.map((p) => [p.client_id, p]));
  return clients.map((c) => ({
    id: c.id,
    name: perms.customerNames ? c.name : maskName(c.name),
    joinedAt: c.partner_at || c.created_at,
    purchases: Number(by[c.id]?.n || 0),
    salesAmount: perms.salesAmounts ? rupees(by[c.id]?.total) : null,
  }));
}

async function commissionsFor(knex, where, limit = 200) {
  const rows = await knex('partner_commissions as pc')
    .leftJoin('clients as c', 'c.id', 'pc.client_id')
    .leftJoin('partners as p', 'p.id', 'pc.partner_id')
    .where(where)
    .orderBy('pc.id', 'desc')
    .limit(limit)
    .select('pc.*', 'c.name as client_name', 'p.name as partner_name', 'p.code as partner_code');
  const holdMs = COMMISSION_HOLD_DAYS * 86400000;
  return rows.map((r) => ({
    id: r.id,
    partnerId: r.partner_id,
    partnerName: r.partner_name,
    partnerCode: r.partner_code || '',
    paymentId: r.payment_id,
    clientId: r.client_id,
    clientName: r.client_name || '',
    base: rupees(r.base_paise),
    rate: r.rate,
    amount: rupees(r.amount_paise),
    status: r.status,
    // Payable once the refund window has passed.
    payable: r.status === 'approved' || (r.status === 'pending' && Date.now() - Date.parse(r.created_at) >= holdMs),
    createdAt: r.created_at,
    approvedAt: r.approved_at,
    paidAt: r.paid_at,
    payoutRef: r.payout_ref,
    reversedAt: r.reversed_at,
    reversalReason: r.reversal_reason,
    reversedAfterPayout: !!r.reversed_after_payout,
  }));
}

/** Everything the partner's dashboard shows, limited by the partner's permissions. */
async function dashboardFor(knex, partner) {
  const perms = permissionsOf(partner);
  const base = { partner: publicPartner(partner), terms: { version: PARTNER_TERMS_VERSION, accepted: partner.terms_version === PARTNER_TERMS_VERSION } };
  if (partner.status !== 'approved' || !perms.dashboard) return base;
  const stats = await partnerStats(knex, partner.id);
  if (!perms.salesAmounts) {
    stats.totals.salesAmount = null;
    stats.last30.salesAmount = null;
    for (const d of stats.daily) d.salesAmount = null;
  }
  if (!perms.commissions) {
    for (const k of ['earned', 'pending', 'approved', 'paid', 'reversed']) stats.totals[k] = null;
    stats.last30.commission = null;
    for (const d of stats.daily) d.commission = null;
  }
  return {
    ...base,
    stats,
    referred: await referredFor(knex, partner),
    commissions: perms.commissions ? (await commissionsFor(knex, { 'pc.partner_id': partner.id }, 100)).map(({ partnerName: _n, partnerCode: _c, clientName, ...c }) => ({ ...c, clientName: perms.customerNames ? clientName : maskName(clientName) })) : [],
  };
}

const applySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(190),
  phone: z.string().trim().min(6).max(30),
  company: z.string().trim().max(160).optional().default(''),
  city: z.string().trim().max(80).optional().default(''),
  channel: z.string().trim().max(500).optional().default(''),
  password: z.string().min(8).max(200),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Please read and accept the Partner Terms & Conditions.' }) }),
  termsVersion: z.string().trim().max(20),
});

export function partnerPortalRoutes(knex) {
  const r = Router();
  const auth = requirePartner(knex);
  const log = (req, partnerId, action, details = {}) => audit(knex, { actorType: 'partner', actorId: partnerId, action, entity: 'partner', entityId: partnerId, details, ip: clientIp(req) });

  /** Terms version the apply form and the dashboard ask for. */
  r.get('/terms', (_req, res) => res.json({ version: PARTNER_TERMS_VERSION }));

  r.post('/register', limits.auth, async (req, res) => {
    const body = parse(applySchema, req.body);
    if (body.termsVersion !== PARTNER_TERMS_VERSION) throw new ApiError(409, 'TERMS_CHANGED', 'The partner terms were updated. Please reload the page and read them again.');
    if (await knex('partners').where({ email: body.email }).first('id')) throw new ApiError(409, 'EMAIL_TAKEN', 'A partner account with this email already exists. Please sign in.');
    const ts = nowIso();
    const partner = await insertOne(knex, 'partners', {
      name: body.name,
      email: body.email,
      phone: body.phone,
      company: body.company,
      city: body.city,
      channel: body.channel,
      password_hash: await hashPassword(body.password),
      status: 'pending',
      commission_rate: DEFAULT_COMMISSION_RATE,
      permissions: JSON.stringify(DEFAULT_PERMISSIONS),
      notes: '',
      created_at: ts,
      updated_at: ts,
    });
    await recordTerms(knex, partner, req);
    await log(req, partner.id, 'partner.apply');
    const fresh = await knex('partners').where({ id: partner.id }).first();
    res.status(201).json({ token: signSession('partner', fresh), ...(await dashboardFor(knex, fresh)) });
  });

  r.post('/login', limits.auth, async (req, res) => {
    const body = parse(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) }), req.body);
    const partner = await knex('partners').where({ email: body.email }).first();
    const ok = partner ? await verifyPassword(body.password, partner.password_hash) : await burnPasswordCheck(body.password);
    if (!partner || !ok) throw new ApiError(401, 'INVALID_LOGIN', 'Incorrect email or password.');
    if (['rejected', 'terminated', 'suspended'].includes(partner.status)) throw new ApiError(403, 'PARTNER_INACTIVE', closedMessage(partner.status));
    await knex('partners').where({ id: partner.id }).update({ last_login_at: nowIso() });
    await log(req, partner.id, 'partner.login');
    res.json({ token: signSession('partner', partner), ...(await dashboardFor(knex, partner)) });
  });

  r.get('/me', auth, async (req, res) => res.json(await dashboardFor(knex, req.partner)));

  /** Accept the current partner terms (asked again whenever they change). */
  r.post('/accept-terms', auth, async (req, res) => {
    const body = parse(z.object({ version: z.string().trim().max(20) }), req.body);
    if (body.version !== PARTNER_TERMS_VERSION) throw new ApiError(409, 'TERMS_CHANGED', 'The partner terms were updated. Please reload the page and read them again.');
    await recordTerms(knex, req.partner, req);
    await log(req, req.partner.id, 'partner.terms', { version: PARTNER_TERMS_VERSION });
    res.json(await dashboardFor(knex, await knex('partners').where({ id: req.partner.id }).first()));
  });

  r.put('/me', auth, async (req, res) => {
    const body = parse(z.object({ phone: z.string().trim().min(6).max(30), company: z.string().trim().max(160).default(''), city: z.string().trim().max(80).default('') }), req.body);
    const p = await updateOne(knex, 'partners', { id: req.partner.id }, { ...body, updated_at: nowIso() });
    res.json(await dashboardFor(knex, p));
  });

  r.put('/password', auth, limits.auth, async (req, res) => {
    const body = parse(z.object({ current: z.string().min(1).max(200), password: z.string().min(8).max(200) }), req.body);
    if (!(await verifyPassword(body.current, req.partner.password_hash))) throw new ApiError(400, 'WRONG_PASSWORD', 'Your current password is not correct.');
    const p = await updateOne(knex, 'partners', { id: req.partner.id }, { password_hash: await hashPassword(body.password), token_version: req.partner.token_version + 1, updated_at: nowIso() });
    await log(req, p.id, 'partner.password');
    res.json({ token: signSession('partner', p) });
  });

  return r;
}

const permissionsSchema = z.object(Object.fromEntries(Object.keys(DEFAULT_PERMISSIONS).map((k) => [k, z.boolean().optional()])));

export function partnerAdminRoutes(knex) {
  const r = Router();
  const auth = requireAdmin(knex);
  const ownerOnly = requireAdmin(knex, ['owner', 'admin']);
  const log = (req, action, entity, entityId, details = {}) => audit(knex, { actorType: 'admin', actorId: req.admin.id, action, entity, entityId, details, ip: clientIp(req) });

  /** Partners with their headline numbers. */
  r.get('/', auth, async (req, res) => {
    const q = parse(pageQuery.extend({ status: z.enum(['', ...PARTNER_STATUSES]).default('') }), req.query);
    const result = await paginate(knex, 'partners', q, (qb) => {
      if (q.q) whereContains(qb, ['name', 'email', 'phone', 'company', 'code'], q.q);
      if (q.status) qb.where({ status: q.status });
    });
    const ids = result.rows.map((p) => p.id);
    const [signups, sales, comm] = ids.length
      ? await Promise.all([
          knex('clients').whereIn('partner_id', ids).select('partner_id').count({ n: 'id' }).groupBy('partner_id'),
          knex('payments').whereIn('partner_id', ids).where({ status: 'paid' }).select('partner_id').count({ n: 'id' }).sum({ total: 'amount_paise' }).groupBy('partner_id'),
          knex('partner_commissions').whereIn('partner_id', ids).select('partner_id', 'status').sum({ total: 'amount_paise' }).groupBy('partner_id', 'status'),
        ])
      : [[], [], []];
    const pick = (rows, id) => rows.find((x) => x.partner_id === id);
    const counts = await knex('partners').select('status').count({ n: 'id' }).groupBy('status');
    res.json({
      ...result,
      counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
      rows: result.rows.map((p) => {
        const c = comm.filter((x) => x.partner_id === p.id);
        const amt = (s) => rupees(c.filter((x) => s.includes(x.status)).reduce((a, x) => a + Number(x.total || 0), 0));
        return {
          ...publicPartner(p),
          registrations: Number(pick(signups, p.id)?.n || 0),
          sales: Number(pick(sales, p.id)?.n || 0),
          salesAmount: rupees(pick(sales, p.id)?.total),
          pendingCommission: amt(['pending', 'approved']),
          paidCommission: amt(['paid']),
        };
      }),
    });
  });

  /** Add a partner directly (e.g. a distributor signed offline): approved, with a temporary password to hand over. */
  r.post('/', ownerOnly, async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().toLowerCase().email().max(190),
        phone: z.string().trim().max(30).default(''),
        company: z.string().trim().max(160).default(''),
        city: z.string().trim().max(80).default(''),
        commissionRate: rateSchema.default(DEFAULT_COMMISSION_RATE),
      }),
      req.body,
    );
    if (await knex('partners').where({ email: body.email }).first('id')) throw new ApiError(409, 'EMAIL_TAKEN', 'A partner with this email already exists.');
    const temporaryPassword = crypto.randomBytes(9).toString('base64url');
    const ts = nowIso();
    const partner = await insertOne(knex, 'partners', {
      name: body.name,
      email: body.email,
      phone: body.phone,
      company: body.company,
      city: body.city,
      password_hash: await hashPassword(temporaryPassword),
      status: 'approved',
      commission_rate: body.commissionRate,
      permissions: JSON.stringify(DEFAULT_PERMISSIONS),
      notes: '',
      approved_at: ts,
      approved_by: req.admin.id,
      created_at: ts,
      updated_at: ts,
    });
    await assignPartnerCode(knex, partner, '');
    await log(req, 'partner.create', 'partner', partner.id);
    res.status(201).json({ partner: publicPartner(await knex('partners').where({ id: partner.id }).first()), temporaryPassword });
  });

  r.get('/commissions', auth, async (req, res) => {
    const q = parse(z.object({ status: z.enum(['', ...COMMISSION_STATUSES]).default('') }), req.query);
    res.json({ rows: await commissionsFor(knex, (qb) => (q.status ? qb.where('pc.status', q.status) : qb), 500), holdDays: COMMISSION_HOLD_DAYS });
  });

  r.get('/:id', auth, async (req, res) => {
    const partner = await knex('partners').where({ id: Number(req.params.id) }).first();
    if (!partner) throw notFound('Partner');
    const [stats, terms, clients, commissions] = await Promise.all([
      partnerStats(knex, partner.id),
      knex('partner_terms_acceptances').where({ partner_id: partner.id }).orderBy('id', 'desc').limit(20),
      knex('clients').where({ partner_id: partner.id }).orderBy('id', 'desc').limit(300).select('id', 'name', 'email', 'created_at', 'partner_at'),
      commissionsFor(knex, { 'pc.partner_id': partner.id }, 300),
    ]);
    res.json({
      partner: { ...publicPartner(partner), notes: partner.notes },
      stats,
      terms: terms.map((t) => ({ version: t.terms_version, acceptedAt: t.accepted_at, ip: t.ip })),
      termsVersion: PARTNER_TERMS_VERSION,
      clients: clients.map((c) => ({ id: c.id, name: c.name, email: c.email, joinedAt: c.partner_at || c.created_at })),
      commissions,
    });
  });

  r.put('/:id', ownerOnly, async (req, res) => {
    const body = parse(
      z.object({
        status: z.enum(PARTNER_STATUSES).optional(),
        commissionRate: rateSchema.optional(),
        permissions: permissionsSchema.optional(),
        notes: z.string().max(2000).optional(),
        name: z.string().trim().min(2).max(120).optional(),
        phone: z.string().trim().max(30).optional(),
        company: z.string().trim().max(160).optional(),
        city: z.string().trim().max(80).optional(),
      }),
      req.body,
    );
    const partner = await knex('partners').where({ id: Number(req.params.id) }).first();
    if (!partner) throw notFound('Partner');
    const patch = { updated_at: nowIso() };
    for (const k of ['notes', 'name', 'phone', 'company', 'city']) if (body[k] !== undefined) patch[k] = body[k];
    if (body.commissionRate !== undefined) patch.commission_rate = body.commissionRate;
    if (body.permissions) patch.permissions = JSON.stringify({ ...permissionsOf(partner), ...body.permissions });
    if (body.status && body.status !== partner.status) {
      patch.status = body.status;
      if (body.status === 'approved' && !partner.approved_at) Object.assign(patch, { approved_at: nowIso(), approved_by: req.admin.id });
      // Suspending or ending a partnership signs the partner out everywhere.
      if (['suspended', 'terminated', 'rejected'].includes(body.status)) patch.token_version = partner.token_version + 1;
    }
    await knex('partners').where({ id: partner.id }).update(patch);
    if (patch.status === 'approved' && !partner.code) await assignPartnerCode(knex, partner, '');
    await log(req, 'partner.update', 'partner', partner.id, { ...body, permissions: body.permissions ? 'changed' : undefined });
    res.json({ partner: publicPartner(await knex('partners').where({ id: partner.id }).first()) });
  });

  /** Set the partner's code by hand, or a new generated one (old links then stop crediting). */
  r.put('/:id/code', ownerOnly, async (req, res) => {
    const body = parse(z.object({ code: z.string().trim().max(40).optional().default('') }), req.body);
    const partner = await knex('partners').where({ id: Number(req.params.id) }).first();
    if (!partner) throw notFound('Partner');
    const code = await assignPartnerCode(knex, partner, body.code);
    await log(req, 'partner.code', 'partner', partner.id, { from: partner.code, to: code });
    res.json({ partner: publicPartner(await knex('partners').where({ id: partner.id }).first()) });
  });

  /** A new temporary password (the partner changes it after signing in). */
  r.post('/:id/reset-password', ownerOnly, async (req, res) => {
    const partner = await knex('partners').where({ id: Number(req.params.id) }).first();
    if (!partner) throw notFound('Partner');
    const temporaryPassword = crypto.randomBytes(9).toString('base64url');
    await knex('partners').where({ id: partner.id }).update({ password_hash: await hashPassword(temporaryPassword), token_version: partner.token_version + 1, updated_at: nowIso() });
    await log(req, 'partner.password_reset', 'partner', partner.id);
    res.json({ temporaryPassword });
  });

  /** approve → paid (payout reference) → or reversed. A paid commission can only be reversed (deducted later). */
  r.post('/commissions/:id/:action', ownerOnly, async (req, res) => {
    const action = req.params.action;
    if (!['approve', 'pay', 'reverse'].includes(action)) throw notFound('Action');
    const body = parse(z.object({ payoutRef: z.string().trim().max(120).optional().default(''), reason: z.string().trim().max(300).optional().default('') }), req.body || {});
    const c = await knex('partner_commissions').where({ id: Number(req.params.id) }).first();
    if (!c) throw notFound('Commission');
    const ts = nowIso();
    if (action === 'approve') {
      if (c.status !== 'pending') throw new ApiError(409, 'NOT_PENDING', 'Only a pending commission can be approved.');
      await knex('partner_commissions').where({ id: c.id }).update({ status: 'approved', approved_at: ts, updated_at: ts });
    } else if (action === 'pay') {
      if (!['pending', 'approved'].includes(c.status)) throw new ApiError(409, 'NOT_PAYABLE', 'This commission cannot be paid.');
      const payment = await knex('payments').where({ id: c.payment_id }).first('status');
      if (payment?.status !== 'paid') throw new ApiError(409, 'PAYMENT_NOT_PAID', 'The customer payment is no longer paid (refunded?).');
      if (!body.payoutRef) throw new ApiError(400, 'PAYOUT_REF', 'Please enter the payout reference (UTR / transaction id).');
      await knex('partner_commissions').where({ id: c.id }).update({ status: 'paid', approved_at: c.approved_at || ts, paid_at: ts, payout_ref: body.payoutRef, updated_at: ts });
    } else {
      await reverseCommission(knex, c.payment_id, body.reason || 'Reversed by admin');
    }
    await log(req, `commission.${action}`, 'partner_commission', c.id, body);
    res.json({ commission: (await commissionsFor(knex, { 'pc.id': c.id }, 1))[0] });
  });

  return r;
}
