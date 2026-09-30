/**
 * Endpoints used by the DocGen desktop application.
 *
 * The desktop app never sends business data. It sends only what is needed for
 * licensing (email/password or activation code, an anonymous device id,
 * device name, platform, app version) and anonymous ad counters.
 */

import { Router } from 'express';
import { z } from 'zod';
import { nowIso, parseJson } from '../db.js';
import { ApiError, clientIp, parse } from '../lib/http.js';
import { limits } from '../lib/auth.js';
import { CODE_PATTERN, burnPasswordCheck, loadLicenseKeys, normaliseCode, verifyLicenseToken, verifyPassword } from '../lib/security.js';
import { audit, bumpStat, getAppConfig } from '../services/common.js';
import { activateOnDevice, effectiveStatus, getLicenseWithPlan, licenseForClient, licenseToken } from '../services/licenses.js';

const device = {
  deviceId: z.string().trim().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/, 'invalid device id'),
  deviceName: z.string().trim().max(120).optional().default(''),
  platform: z.string().trim().max(20).optional().default(''),
  appVersion: z.string().trim().max(20).optional().default(''),
};

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(190), password: z.string().min(1).max(200), ...device });
const activateSchema = z.object({ code: z.string().trim().max(20), ...device });
const tokenSchema = z.object({ token: z.string().max(4000), deviceId: device.deviceId });

/** Ads published to the app: active, inside their date window, newest first. */
async function publishedAds(knex) {
  const now = nowIso();
  const rows = await knex('ads')
    .where({ is_active: true })
    .andWhere((q) => q.whereNull('start_at').orWhere('start_at', '<=', now))
    .andWhere((q) => q.whereNull('end_at').orWhere('end_at', '>=', now))
    .orderBy([{ column: 'priority', order: 'desc' }, { column: 'id', order: 'desc' }])
    .limit(20);
  return rows.map((a) => ({
    id: a.id,
    version: a.version,
    title: a.title,
    description: a.description,
    imageUrl: a.image_url,
    html: a.html,
    linkUrl: a.link_url,
    ctaText: a.cta_text,
    frequencyDays: a.frequency_days,
    maxPerMonth: a.max_per_month,
    priority: a.priority,
    startAt: a.start_at,
    endAt: a.end_at,
    target: parseJson(a.target, {}),
  }));
}

export function appRoutes(knex) {
  const r = Router();

  r.get('/public-key', (_req, res) => res.json({ algorithm: 'Ed25519', publicKey: loadLicenseKeys().publicKeyB64 }));

  /** Remote configuration: check interval, ads, help videos, latest version. */
  r.get('/config', limits.app, async (_req, res) => {
    const { config, updatedAt, version } = await getAppConfig(knex);
    await bumpStat(knex, 'config_check');
    const intervalDays = Math.max(1, Math.min(365, Number(config.configIntervalDays) || 30));
    res.set('Cache-Control', 'no-store');
    res.json({
      version,
      updatedAt,
      serverTime: nowIso(),
      configIntervalDays: intervalDays,
      nextCheckAt: new Date(Date.now() + intervalDays * 86400000).toISOString(),
      adPolicy: config.adPolicy,
      defaultAdEnabled: config.defaultAdEnabled !== false,
      ads: await publishedAds(knex),
      help: config.help,
      app: config.app,
    });
  });

  /** Anonymous ad counters: { event, adId }. */
  r.post('/events', limits.app, async (req, res) => {
    const body = parse(
      z.object({ event: z.enum(['AD_SHOWN', 'AD_CLICKED', 'AD_CLOSED']), adId: z.coerce.number().int().min(0).max(1e9).optional().default(0) }),
      req.body,
    );
    await bumpStat(knex, `ad:${body.adId}:${body.event}`);
    res.status(204).end();
  });

  /** Sign in from the desktop app with the portal account and activate this computer. */
  r.post('/login', limits.auth, async (req, res) => {
    const body = parse(loginSchema, req.body);
    const client = await knex('clients').where({ email: body.email }).first();
    const ok = client ? await verifyPassword(body.password, client.password_hash) : await burnPasswordCheck(body.password);
    if (!client || !ok) throw new ApiError(401, 'INVALID_LOGIN', 'Incorrect email or password.');
    if (client.status !== 'active') throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'Your account is suspended. Please contact support.');

    const result = await knex.transaction(async (trx) => {
      const candidates = await licenseForClient(trx, client.id, body.deviceId);
      if (!candidates) {
        throw new ApiError(
          403,
          'NO_LICENSE',
          'Your account has no active license yet. Choose a plan in the client portal, or enter an activation code.',
        );
      }
      let lastError;
      for (const candidate of candidates) {
        try {
          return await activateOnDevice(trx, candidate, body);
        } catch (e) {
          lastError = e;
          if (e.code !== 'DEVICE_LIMIT') throw e;
        }
      }
      throw lastError;
    });
    await logActivation(knex, client, result, body, req, 'app.login');
    res.json({ token: licenseToken(result, client, body.deviceId), license: { status: effectiveStatus(result), expiresAt: result.expires_at } });
  });

  /** Activate this computer with an activation code (AB12-CD34-EF56). */
  r.post('/activate', limits.auth, async (req, res) => {
    const body = parse(activateSchema, req.body);
    const code = normaliseCode(body.code);
    if (!CODE_PATTERN.test(code)) throw new ApiError(400, 'INVALID_CODE_FORMAT', 'Activation codes look like AB12-CD34-EF56.');
    const license = await knex('licenses').where({ code }).first();
    if (!license) throw new ApiError(404, 'INVALID_CODE', 'This activation code is not valid. Please check it and try again.');
    const result = await knex.transaction((trx) => activateOnDevice(trx, license, body));
    const client = result.client_id ? await knex('clients').where({ id: result.client_id }).first() : null;
    await logActivation(knex, client, result, body, req, 'app.activate');
    res.json({ token: licenseToken(result, client, body.deviceId), license: { status: effectiveStatus(result), expiresAt: result.expires_at } });
  });

  /** Refresh a stored license (picks up renewals, extensions, suspensions). */
  r.post('/license/refresh', limits.app, async (req, res) => {
    const body = parse(tokenSchema, req.body);
    const payload = verifyLicenseToken(body.token);
    if (!payload || payload.did !== body.deviceId) throw new ApiError(401, 'INVALID_TOKEN', 'This license could not be verified. Please sign in again.');
    const license = await getLicenseWithPlan(knex, payload.lid);
    if (!license) throw new ApiError(404, 'LICENSE_NOT_FOUND', 'This license no longer exists. Please contact support.');
    const deviceRow = await knex('devices').where({ license_id: license.id, device_id: body.deviceId }).first();
    if (!deviceRow || deviceRow.released_at) {
      throw new ApiError(403, 'DEVICE_RELEASED', 'This computer was removed from the license. Please sign in or activate again.');
    }
    await knex('devices').where({ id: deviceRow.id }).update({ last_seen_at: nowIso() });
    const client = license.client_id ? await knex('clients').where({ id: license.client_id }).first() : null;
    res.json({ token: licenseToken(license, client, body.deviceId), license: { status: effectiveStatus(license), expiresAt: license.expires_at } });
  });

  /** Sign out / release this computer so the license can be used elsewhere. */
  r.post('/license/release', limits.app, async (req, res) => {
    const body = parse(tokenSchema, req.body);
    const payload = verifyLicenseToken(body.token);
    if (!payload || payload.did !== body.deviceId) throw new ApiError(401, 'INVALID_TOKEN', 'This license could not be verified.');
    await knex('devices').where({ license_id: payload.lid, device_id: body.deviceId }).update({ released_at: nowIso() });
    await audit(knex, { actorType: 'app', action: 'app.release', entity: 'license', entityId: payload.lid, details: { deviceId: body.deviceId }, ip: clientIp(req) });
    res.status(204).end();
  });

  return r;
}

async function logActivation(knex, client, license, body, req, action) {
  await audit(knex, {
    actorType: 'app',
    actorId: client?.id ?? null,
    action,
    entity: 'license',
    entityId: license.id,
    details: { deviceId: body.deviceId, deviceName: body.deviceName, platform: body.platform, appVersion: body.appVersion },
    ip: clientIp(req),
  });
}
