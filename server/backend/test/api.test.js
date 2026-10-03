/**
 * API tests against a real HTTP server and a fresh database.
 * Runs on SQLite by default; set TEST_DATABASE_URL=mysql://… to run the same suite on MySQL.
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docgen-test-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dataDir;
process.env.ENABLE_MOCK_PAYMENTS = 'true';

const { createKnex, migrate, nowIso } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { hashPassword, loadLicenseKeys } = await import('../src/lib/security.js');
const { seedDefaults } = await import('../src/services/common.js');
const { addSamplePlans } = await import('./sample-plans.js');

let knex;
let server;
let base;

async function api(method, url, { body, token } = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** Verify a desktop license token exactly like the Rust client does. */
function verifyToken(token) {
  const [bodyB64, sigB64] = token.split('.');
  const raw = Buffer.from(loadLicenseKeys().publicKeyB64, 'base64');
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]);
  const key = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
  assert.ok(crypto.verify(null, Buffer.from(bodyB64), key, Buffer.from(sigB64, 'base64url')), 'signature must verify with public key');
  return JSON.parse(Buffer.from(bodyB64, 'base64url').toString());
}

const device = (n = 1) => ({ deviceId: `test-device-${n}-abcdef`, deviceName: `PC ${n}`, platform: 'windows', appVersion: '1.0.0' });

before(async () => {
  knex = process.env.TEST_DATABASE_URL ? createKnex({ databaseUrl: process.env.TEST_DATABASE_URL }) : createKnex({ databaseUrl: '', sqliteFile: path.join(dataDir, 'test.sqlite') });
  if (process.env.TEST_DATABASE_URL) {
    for (const t of ['plan_prices', 'audit_log', 'app_config', 'usage_stats', 'ads', 'devices', 'licenses', 'payments', 'clients', 'plans', 'admins', 'knex_migrations', 'knex_migrations_lock']) {
      await knex.schema.dropTableIfExists(t);
    }
  }
  await migrate(knex);
  await seedDefaults(knex);
  await addSamplePlans(knex);
  await knex('admins').insert({ email: 'owner@test.local', name: 'Owner', role: 'owner', password_hash: await hashPassword('owner-password-1'), created_at: nowIso() });
  server = createApp(knex, { logger: { error() {} } }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await knex?.destroy();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('client portal', () => {
  let token;
  test('register validates input', async () => {
    const bad = await api('POST', '/api/portal/auth/register', { body: { name: 'A', email: 'nope', password: 'short' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'VALIDATION_ERROR');
  });

  test('register, duplicate email, login', async () => {
    const r = await api('POST', '/api/portal/auth/register', { body: { name: 'Asha Traders', email: 'Asha@Example.com', password: 'secret-pass-1' } });
    assert.equal(r.status, 201);
    assert.equal(r.body.client.email, 'asha@example.com');
    const dup = await api('POST', '/api/portal/auth/register', { body: { name: 'Asha', email: 'asha@example.com', password: 'secret-pass-1' } });
    assert.equal(dup.status, 409);
    const wrong = await api('POST', '/api/portal/auth/login', { body: { email: 'asha@example.com', password: 'wrong-password' } });
    assert.equal(wrong.status, 401);
    const ok = await api('POST', '/api/portal/auth/login', { body: { email: 'asha@example.com', password: 'secret-pass-1' } });
    assert.equal(ok.status, 200);
    token = ok.body.token;
  });

  test('business details with GSTIN validation', async () => {
    const bad = await api('PUT', '/api/portal/me', { token, body: { gstin: '12345' } });
    assert.equal(bad.status, 400);
    const ok = await api('PUT', '/api/portal/me', { token, body: { business_name: 'Asha Traders', gstin: '29abcde1234f1z5', state: 'Karnataka' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.client.gstin, '29ABCDE1234F1Z5');
  });

  test('desktop login without a license is refused with a clear code', async () => {
    const r = await api('POST', '/api/app/login', { body: { email: 'asha@example.com', password: 'secret-pass-1', ...device(1) } });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'NO_LICENSE');
  });

  test('checkout (mock provider) issues a license; desktop login activates it', async () => {
    const plans = await api('GET', '/api/portal/plans');
    const starter = plans.body.plans.find((p) => p.code === 'STARTER');
    const co = await api('POST', '/api/portal/checkout', { token, body: { planId: starter.id, provider: 'mock' } });
    assert.equal(co.status, 201);
    assert.equal(co.body.payment.status, 'pending');
    assert.equal(co.body.checkout.type, 'mock');
    const paid = await api('POST', `/api/portal/payments/${co.body.payment.id}/confirm`, { token, body: { outcome: 'success' } });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.payment.status, 'paid');
    assert.match(paid.body.license.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal(paid.body.license.status, 'active', 'a bought license is valid from the payment date');
    assert.equal(paid.body.license.daysLeft, 365);
    // Confirming twice is idempotent.
    const again = await api('POST', `/api/portal/payments/${co.body.payment.id}/confirm`, { token, body: {} });
    assert.equal(again.body.license.id, paid.body.license.id);

    const login = await api('POST', '/api/app/login', { body: { email: 'asha@example.com', password: 'secret-pass-1', ...device(1) } });
    assert.equal(login.status, 200);
    const payload = verifyToken(login.body.token);
    assert.equal(payload.status, 'active');
    assert.equal(payload.did, device(1).deviceId);
    assert.equal(payload.planName, 'Starter');
    const days = (Date.parse(payload.expiresAt) - Date.now()) / 86400000;
    assert.ok(days > 364 && days < 366, `validity starts at activation (${days})`);

    // Starter allows one computer.
    const second = await api('POST', '/api/app/login', { body: { email: 'asha@example.com', password: 'secret-pass-1', ...device(2) } });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'DEVICE_LIMIT');

    // Release the first computer from the portal, then the second can activate.
    const lic = await api('GET', '/api/portal/licenses', { token });
    const dev = lic.body.licenses[0].devices[0];
    assert.equal(dev.name, 'PC 1');
    const rel = await api('POST', `/api/portal/licenses/${lic.body.licenses[0].id}/devices/${dev.id}/release`, { token });
    assert.equal(rel.status, 204);
    const third = await api('POST', '/api/app/login', { body: { email: 'asha@example.com', password: 'secret-pass-1', ...device(2) } });
    assert.equal(third.status, 200);
  });

  test('payment history is paginated', async () => {
    const r = await api('GET', '/api/portal/payments?page=1&pageSize=5', { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.page, 1);
    assert.ok(r.body.total >= 1);
  });
});

describe('activation codes and license refresh', () => {
  let adminToken;
  let code;
  let appToken;
  before(async () => {
    const r = await api('POST', '/api/admin/auth/login', { body: { email: 'owner@test.local', password: 'owner-password-1' } });
    adminToken = r.body.token;
  });

  test('admin generates a batch of codes without payment', async () => {
    const plans = await api('GET', '/api/admin/plans', { token: adminToken });
    const business = plans.body.plans.find((p) => p.code === 'BUSINESS');
    const r = await api('POST', '/api/admin/licenses', { token: adminToken, body: { planId: business.id, count: 3, notes: 'Dealer batch' } });
    assert.equal(r.status, 201);
    assert.equal(r.body.licenses.length, 3);
    code = r.body.licenses[0].code;
    assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  test('code format and unknown codes are rejected', async () => {
    const bad = await api('POST', '/api/app/activate', { body: { code: 'ab12-cd34', ...device(5) } });
    assert.equal(bad.body.error.code, 'INVALID_CODE_FORMAT');
    const unknown = await api('POST', '/api/app/activate', { body: { code: 'ZZZZ-ZZZZ-ZZZZ', ...device(5) } });
    assert.equal(unknown.status, 404);
  });

  test('activate with code; refresh picks up admin extension and suspension', async () => {
    const r = await api('POST', '/api/app/activate', { body: { code: code.toLowerCase().replace(/-/g, ' '), ...device(5) } });
    assert.equal(r.status, 200);
    appToken = r.body.token;
    const first = verifyToken(appToken);
    assert.equal(first.maxDevices, 3);

    const list = await api('GET', `/api/admin/licenses?q=${code}`, { token: adminToken });
    const id = list.body.rows[0].id;
    const ext = await api('POST', `/api/admin/licenses/${id}/extend`, { token: adminToken, body: { days: 30 } });
    assert.equal(ext.status, 200);
    const refreshed = await api('POST', '/api/app/license/refresh', { body: { token: appToken, deviceId: device(5).deviceId } });
    assert.equal(refreshed.status, 200);
    const second = verifyToken(refreshed.body.token);
    assert.ok(Date.parse(second.expiresAt) - Date.parse(first.expiresAt) > 29 * 86400000);

    await api('PUT', `/api/admin/licenses/${id}`, { token: adminToken, body: { status: 'suspended' } });
    const suspended = await api('POST', '/api/app/license/refresh', { body: { token: appToken, deviceId: device(5).deviceId } });
    assert.equal(verifyToken(suspended.body.token).status, 'suspended');
    const blocked = await api('POST', '/api/app/activate', { body: { code, ...device(6) } });
    assert.equal(blocked.body.error.code, 'LICENSE_SUSPENDED');
    await api('PUT', `/api/admin/licenses/${id}`, { token: adminToken, body: { status: 'active', expiresAt: new Date(Date.now() - 86400000).toISOString() } });
    const expired = await api('POST', '/api/app/activate', { body: { code, ...device(7) } });
    assert.equal(expired.body.error.code, 'LICENSE_EXPIRED');
  });

  test('tampered or foreign tokens are rejected', async () => {
    const [b, s] = appToken.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(b, 'base64url')), maxDevices: 999 })).toString('base64url');
    const r = await api('POST', '/api/app/license/refresh', { body: { token: `${forged}.${s}`, deviceId: device(5).deviceId } });
    assert.equal(r.status, 401);
    const other = await api('POST', '/api/app/license/refresh', { body: { token: appToken, deviceId: device(9).deviceId } });
    assert.equal(other.status, 401);
  });

  test('release frees the device', async () => {
    const r = await api('POST', '/api/app/license/release', { body: { token: appToken, deviceId: device(5).deviceId } });
    assert.equal(r.status, 204);
    const after = await api('POST', '/api/app/license/refresh', { body: { token: appToken, deviceId: device(5).deviceId } });
    assert.equal(after.body.error.code, 'DEVICE_RELEASED');
  });
});

describe('admin', () => {
  let t;
  before(async () => {
    t = (await api('POST', '/api/admin/auth/login', { body: { email: 'owner@test.local', password: 'owner-password-1' } })).body.token;
  });

  test('requires authentication', async () => {
    assert.equal((await api('GET', '/api/admin/clients')).status, 401);
    assert.equal((await api('GET', '/api/admin/clients', { token: 'garbage' })).status, 401);
    const clientToken = (await api('POST', '/api/portal/auth/login', { body: { email: 'asha@example.com', password: 'secret-pass-1' } })).body.token;
    assert.equal((await api('GET', '/api/admin/clients', { token: clientToken })).status, 401, 'client tokens are not admin tokens');
  });

  test('create client manually and activate a license for them without payment', async () => {
    const c = await api('POST', '/api/admin/clients', { token: t, body: { name: 'Ravi Builders', email: 'ravi@example.com', business_name: 'Ravi Builders Pvt Ltd', state: 'Kerala' } });
    assert.equal(c.status, 201);
    assert.ok(c.body.temporaryPassword.length >= 8);
    const plans = (await api('GET', '/api/admin/plans', { token: t })).body.plans;
    const lifetime = plans.find((p) => p.code === 'LIFETIME');
    const l = await api('POST', '/api/admin/licenses', { token: t, body: { planId: lifetime.id, clientId: c.body.client.id, activateNow: true } });
    assert.equal(l.body.licenses[0].status, 'active');
    assert.equal(l.body.licenses[0].lifetime, true);
    const login = await api('POST', '/api/app/login', { body: { email: 'ravi@example.com', password: c.body.temporaryPassword, ...device(11) } });
    assert.equal(login.status, 200);
    assert.equal(verifyToken(login.body.token).expiresAt, null);
    const detail = await api('GET', `/api/admin/clients/${c.body.client.id}`, { token: t });
    assert.equal(detail.body.licenses.length, 1);
    assert.equal(detail.body.licenses[0].devices.length, 1);
  });

  test('manual payment marked paid by admin', async () => {
    const client = (await api('POST', '/api/portal/auth/login', { body: { email: 'asha@example.com', password: 'secret-pass-1' } })).body.token;
    const co = await api('POST', '/api/portal/checkout', { token: client, body: { planId: 1, provider: 'manual' } });
    assert.equal(co.body.checkout.type, 'manual');
    const pending = await api('POST', `/api/portal/payments/${co.body.payment.id}/confirm`, { token: client, body: {} });
    assert.equal(pending.status, 202);
    const mark = await api('POST', `/api/admin/payments/${co.body.payment.id}/mark-paid`, { token: t, body: { reference: 'UTR123' } });
    assert.equal(mark.body.payment.status, 'paid');
    assert.ok(mark.body.license.code);
    const list = await api('GET', '/api/admin/payments?status=paid', { token: t });
    assert.ok(list.body.rows.every((p) => p.status === 'paid'));
  });

  test('plans CRUD with validation', async () => {
    const bad = await api('POST', '/api/admin/plans', { token: t, body: { code: 'x', name: '' } });
    assert.equal(bad.status, 400);
    const ok = await api('POST', '/api/admin/plans', {
      token: t,
      body: { code: 'PRO_MONTHLY', name: 'Pro Monthly', price: 199, durationDays: 30, maxDevices: 2, features: ['2 computers'] },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.plan.pricePaise, 19900);
    assert.equal(ok.body.plan.prices.length, 1, 'a single price + duration becomes the price list');
    const upd = await api('PUT', `/api/admin/plans/${ok.body.plan.id}`, {
      token: t,
      body: { ...ok.body.plan, prices: [{ ...ok.body.plan.prices[0], price: 249 }], isPublic: false },
    });
    assert.equal(upd.body.plan.price, 249);
    const pub = await api('GET', '/api/portal/plans');
    assert.ok(!pub.body.plans.some((p) => p.code === 'PRO_MONTHLY'), 'private plans are hidden from the portal');
  });

  test('ads and app configuration reach the desktop config endpoint', async () => {
    const insecure = await api('POST', '/api/admin/ads', { token: t, body: { title: 'x', linkUrl: 'http://evil.example' } });
    assert.equal(insecure.status, 400);
    const ad = await api('POST', '/api/admin/ads', {
      token: t,
      body: {
        title: 'Festive offer',
        description: '20% off Business plan',
        imageUrl: 'https://cdn.example.com/banner.png',
        linkUrl: 'https://reynrel.in/offer',
        html: '<b>Offer</b>',
        frequencyDays: 10,
        target: { licenseStatus: 'trial', platforms: ['windows'] },
      },
    });
    assert.equal(ad.status, 201);
    const hidden = await api('POST', '/api/admin/ads', { token: t, body: { title: 'Old', endAt: '2020-01-01T00:00:00Z' } });
    assert.equal(hidden.status, 201);
    const cfg = await api('PUT', '/api/admin/config', {
      token: t,
      body: {
        configIntervalDays: 14,
        adPolicy: { minDaysBetweenAds: 5, maxPerMonth: 3, firstOpenDelayDays: 0 },
        defaultAdEnabled: false,
        app: { latestVersion: '1.1.0', downloadUrl: 'https://reynrel.in/docgen', message: '' },
        help: { youtubeChannel: 'https://www.youtube.com/@reynrel', videos: [{ title: 'Create your first invoice', url: 'https://www.youtube.com/watch?v=abcdefghijk' }] },
      },
    });
    assert.equal(cfg.status, 200);
    const app = await api('GET', '/api/app/config');
    assert.equal(app.body.configIntervalDays, 14);
    assert.equal(app.body.defaultAdEnabled, false);
    assert.equal(app.body.ads.length, 1, 'expired ads are not published');
    assert.equal(app.body.ads[0].target.licenseStatus, 'trial');
    assert.equal(app.body.help.videos.length, 1);
    const evt = await api('POST', '/api/app/events', { body: { event: 'AD_SHOWN', adId: ad.body.ad.id } });
    assert.equal(evt.status, 204);
    const ads = await api('GET', '/api/admin/ads', { token: t });
    assert.equal(ads.body.rows.find((a) => a.id === ad.body.ad.id).stats.AD_SHOWN, 1);
    const adminCfg = await api('GET', '/api/admin/config', { token: t });
    assert.ok(adminCfg.body.recentChecks[0].count >= 1);
  });

  test('audit log records admin actions', async () => {
    const r = await api('GET', '/api/admin/audit?pageSize=100', { token: t });
    const actions = r.body.rows.map((x) => x.action);
    for (const a of ['license.create', 'license.extend', 'payment.mark_paid', 'plan.create', 'ad.create', 'config.update']) {
      assert.ok(actions.includes(a), `missing audit ${a}`);
    }
  });

  test('pagination limits are enforced', async () => {
    const r = await api('GET', '/api/admin/licenses?pageSize=1000', { token: t });
    assert.equal(r.status, 400);
    const ok = await api('GET', '/api/admin/licenses?pageSize=2&page=2', { token: t });
    assert.equal(ok.body.rows.length, 2);
    assert.equal(ok.body.page, 2);
  });
});

describe('errors', () => {
  test('unknown endpoint and malformed JSON return friendly JSON errors', async () => {
    const r = await api('GET', '/api/nope');
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'NOT_FOUND');
    const res = await fetch(`${base}/api/portal/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'BAD_JSON');
  });
});
