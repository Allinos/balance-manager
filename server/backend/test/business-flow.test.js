/**
 * The customer journey the server exists for:
 *   ad click → landing page → create account → pay (Razorpay) → download the app → activate.
 * Plus the safety rules around it: signed payments only, one license per payment, amount checks,
 * renewals/upgrades, paid-only downloads, password reset by email, and test payments off by default.
 *
 * Razorpay is replaced by a small local fake that behaves like its Orders API.
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- fake Razorpay
const orders = new Map();
const fakeRazorpay = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const auth = Buffer.from(String(req.headers.authorization || '').replace('Basic ', ''), 'base64').toString();
    if (auth !== 'rzp_test_key:rzp_test_secret') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { description: 'Authentication failed' } }));
    }
    if (req.method === 'POST' && req.url === '/v1/orders') {
      const body = JSON.parse(raw);
      const order = { id: `order_${crypto.randomBytes(6).toString('hex')}`, amount: body.amount, currency: body.currency, receipt: body.receipt, status: 'created' };
      orders.set(order.id, order);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(order));
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end('{}');
  });
});
await new Promise((resolve) => fakeRazorpay.listen(0, '127.0.0.1', resolve));

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docgen-flow-'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATA_DIR: dataDir,
  ENABLE_MOCK_PAYMENTS: '',
  RAZORPAY_KEY_ID: 'rzp_test_key',
  RAZORPAY_KEY_SECRET: 'rzp_test_secret',
  RAZORPAY_WEBHOOK_SECRET: 'whsec_test',
  RAZORPAY_API_BASE: `http://127.0.0.1:${fakeRazorpay.address().port}`,
});

const { createKnex, migrate, nowIso } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { hashPassword } = await import('../src/lib/security.js');
const { seedDefaults } = await import('../src/services/common.js');
const { outbox } = await import('../src/services/mail.js');

let knex;
let server;
let base;
let adminToken;

async function api(method, url, { body, token, headers = {}, raw } = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    redirect: 'manual',
    headers: { ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw ?? (body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json, headers: res.headers };
}

const sign = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
/** What Razorpay Checkout hands the browser after a successful payment. */
const checkoutResponse = (orderId, paymentId = `pay_${crypto.randomBytes(5).toString('hex')}`) => ({
  razorpay_order_id: orderId,
  razorpay_payment_id: paymentId,
  razorpay_signature: sign('rzp_test_secret', `${orderId}|${paymentId}`),
});
async function webhook(event, entity, secret = 'whsec_test') {
  const raw = JSON.stringify({ event, payload: { payment: { entity } } });
  return api('POST', '/api/payments/webhook/razorpay', { raw, headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': sign(secret, raw) } });
}

async function register(email, attribution) {
  const r = await api('POST', '/api/portal/auth/register', { body: { name: 'Meena Sharma', email, password: 'meena-pass-123', phone: '9876543210', attribution } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.token;
}
const plan = async (code) => (await api('GET', '/api/portal/plans')).body.plans.find((p) => p.code === code);

before(async () => {
  // SQLite by default; TEST_DATABASE_URL=mysql://… runs the same journey on MySQL (row locks included).
  knex = process.env.TEST_DATABASE_URL ? createKnex({ databaseUrl: process.env.TEST_DATABASE_URL }) : createKnex({ databaseUrl: '', sqliteFile: path.join(dataDir, 'flow.sqlite') });
  if (process.env.TEST_DATABASE_URL) {
    for (const t of ['audit_log', 'app_config', 'usage_stats', 'ads', 'devices', 'licenses', 'payments', 'clients', 'plans', 'admins', 'knex_migrations', 'knex_migrations_lock']) {
      await knex.schema.dropTableIfExists(t);
    }
  }
  await migrate(knex);
  await seedDefaults(knex);
  await knex('admins').insert({ email: 'owner@test.local', name: 'Owner', role: 'owner', password_hash: await hashPassword('owner-password-1'), created_at: nowIso() });
  server = createApp(knex, { logger: { error() {} } }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  adminToken = (await api('POST', '/api/admin/auth/login', { body: { email: 'owner@test.local', password: 'owner-password-1' } })).body.token;
});

after(async () => {
  server?.close();
  fakeRazorpay.close();
  await knex?.destroy();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('safe defaults', () => {
  test('test payments are off unless ENABLE_MOCK_PAYMENTS=true (and never in production)', () => {
    const read = (env) =>
      execFileSync(process.execPath, ['--input-type=module', '-e', "import('./src/config.js').then(({ config }) => process.stdout.write(String(config.enableMockPayments)))"], {
        cwd: path.join(here, '..'),
        env: { PATH: process.env.PATH, NODE_ENV: 'test', ...env },
      }).toString();
    assert.equal(read({}), 'false');
    assert.equal(read({ ENABLE_MOCK_PAYMENTS: 'true' }), 'true');
    assert.equal(read({ ENABLE_MOCK_PAYMENTS: 'true', NODE_ENV: 'production' }), 'false');
  });

  test('the portal offers Razorpay first and no test payments', async () => {
    const r = await api('GET', '/api/portal/plans');
    assert.deepEqual(r.body.providers.map((p) => p.name), ['razorpay', 'manual']);
    const token = await register('nomock@example.com');
    const mock = await api('POST', '/api/portal/checkout', { token, body: { planId: (await plan('STARTER')).id, provider: 'mock' } });
    assert.equal(mock.status, 400);
    assert.equal(mock.body.error.code, 'UNKNOWN_PROVIDER');
  });

  test('the Razorpay checkout script is allowed by the content security policy', async () => {
    const r = await api('GET', '/api/health');
    assert.match(r.headers.get('content-security-policy'), /script-src 'self' https:\/\/checkout\.razorpay\.com/);
  });
});

describe('ad → account → Razorpay payment → download → activate', () => {
  let token;
  let payment;
  let orderId;
  let license;

  test('sign-up records the ad campaign it came from', async () => {
    token = await register('meena@example.com', { utm_source: 'Google', utm_medium: 'cpc', utm_campaign: 'gst-invoice-oct', gclid: 'Cj0KCQ', landing: '/?utm_source=google' });
    const me = await api('GET', '/api/portal/me', { token });
    assert.deepEqual(
      { source: me.body.client.signup.source, medium: me.body.client.signup.medium, campaign: me.body.client.signup.campaign },
      { source: 'google', medium: 'cpc', campaign: 'gst-invoice-oct' },
    );
    assert.equal(me.body.client.signup.details.gclid, 'Cj0KCQ');
    // Junk tracking data never blocks a sign-up.
    const junk = await api('POST', '/api/portal/auth/register', {
      body: { name: 'Junk Tags', email: 'junk@example.com', password: 'junk-pass-123', attribution: { utm_campaign: 'x'.repeat(3000), utm_source: 42 } },
    });
    assert.equal(junk.status, 201);
    // Facebook click id without UTM tags, and a plain referral.
    await register('fb@example.com', { fbclid: 'IwAR0' });
    await register('ref@example.com', { referrer: 'https://www.justdial.com/some/page' });
    const clients = await api('GET', '/api/admin/clients?pageSize=50', { token: adminToken });
    const by = Object.fromEntries(clients.body.rows.map((c) => [c.email, c.signup.source]));
    assert.equal(by['fb@example.com'], 'facebook');
    assert.equal(by['ref@example.com'], 'justdial.com');
    assert.equal(by['nomock@example.com'], 'direct');
  });

  test('no download before paying', async () => {
    const r = await api('GET', '/api/portal/downloads', { token });
    assert.equal(r.body.entitled, false);
    assert.equal(r.body.files.length, 0);
  });

  test('admin uploads the Windows installer (wrong file types are refused)', async () => {
    const bad = new FormData();
    bad.append('file', new Blob(['not an installer']), 'readme.txt');
    const refused = await api('POST', '/api/admin/downloads/windows', { token: adminToken, body: bad });
    assert.equal(refused.status, 400);
    const form = new FormData();
    form.append('file', new Blob([Buffer.alloc(4096, 7)]), 'DocGen_1.1.0_x64-setup.exe');
    const up = await api('POST', '/api/admin/downloads/windows', { token: adminToken, body: form });
    assert.equal(up.status, 201, JSON.stringify(up.body));
    assert.equal(up.body.installer.fileName, 'DocGen_1.1.0_x64-setup.exe');
    assert.equal(up.body.installer.size, 4096);
    const list = await api('GET', '/api/admin/downloads', { token: adminToken });
    assert.equal(list.body.installers.length, 1);
  });

  test('checkout creates a Razorpay order for the exact plan price', async () => {
    const starter = await plan('STARTER');
    const co = await api('POST', '/api/portal/checkout', { token, body: { planId: starter.id, provider: 'razorpay' } });
    assert.equal(co.status, 201, JSON.stringify(co.body));
    payment = co.body.payment;
    orderId = co.body.checkout.orderId;
    assert.equal(co.body.checkout.type, 'razorpay');
    assert.equal(co.body.checkout.keyId, 'rzp_test_key');
    assert.equal(co.body.checkout.prefill.email, 'meena@example.com');
    assert.equal(orders.get(orderId).amount, starter.pricePaise);
    assert.equal(payment.providerOrderId, orderId);
  });

  test('a forged or mismatched payment confirmation is refused', async () => {
    const forged = { ...checkoutResponse(orderId), razorpay_signature: 'f'.repeat(64) };
    const r1 = await api('POST', `/api/portal/payments/${payment.id}/confirm`, { token, body: forged });
    assert.equal(r1.status, 400);
    assert.equal(r1.body.error.code, 'INVALID_SIGNATURE');
    const r2 = await api('POST', `/api/portal/payments/${payment.id}/confirm`, { token, body: checkoutResponse('order_someoneelse') });
    assert.equal(r2.body.error.code, 'PAYMENT_MISMATCH');
    const state = await api('GET', '/api/portal/payments', { token });
    assert.equal(state.body.rows[0].status, 'pending');
  });

  test('webhook and browser confirmation arriving together issue exactly one license', async () => {
    const paymentId = 'pay_both001';
    const [hook, confirm] = await Promise.all([
      webhook('payment.captured', { id: paymentId, order_id: orderId, amount: payment.amountPaise, method: 'upi' }),
      api('POST', `/api/portal/payments/${payment.id}/confirm`, { token, body: checkoutResponse(orderId, paymentId) }),
    ]);
    assert.equal(hook.status, 200);
    assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
    license = confirm.body.license;
    assert.match(license.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const licenses = await knex('licenses').where({ payment_id: payment.id });
    assert.equal(licenses.length, 1, 'one payment → one license');
    // Razorpay retries webhooks: still one license.
    await webhook('payment.captured', { id: paymentId, order_id: orderId, amount: payment.amountPaise });
    assert.equal((await knex('licenses').where({ payment_id: payment.id })).length, 1);
  });

  test('the customer gets one receipt email with the activation code', async () => {
    const mails = outbox.filter((m) => m.to === 'meena@example.com' && /Payment received/.test(m.subject));
    assert.equal(mails.length, 1);
    assert.match(mails[0].text, new RegExp(license.code));
    assert.match(mails[0].text, /\/account/);
  });

  test('after paying, a personal download link serves the installer', async () => {
    const r = await api('GET', '/api/portal/downloads', { token });
    assert.equal(r.body.entitled, true);
    assert.equal(r.body.files[0].platform, 'windows');
    const file = await fetch(`${base}${r.body.files[0].url}`);
    assert.equal(file.status, 200);
    assert.match(file.headers.get('content-disposition'), /DocGen_1\.1\.0_x64-setup\.exe/);
    assert.equal((await file.arrayBuffer()).byteLength, 4096);
    const broken = await api('GET', '/api/downloads/not-a-valid-link');
    assert.equal(broken.status, 302);
    assert.equal(broken.headers.get('location'), '/account?download=expired');
    const stats = await api('GET', '/api/admin/stats', { token: adminToken });
    assert.equal(stats.body.last30Days['download:windows'], 1);
  });

  test('the desktop app activates with the same account', async () => {
    const r = await api('POST', '/api/app/login', {
      body: { email: 'meena@example.com', password: 'meena-pass-123', deviceId: 'flow-device-0001', deviceName: 'Shop PC', platform: 'windows', appVersion: '1.1.0' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.license.status, 'active');
  });

  test('the admin sees sign-ups, customers and revenue per campaign', async () => {
    const r = await api('GET', '/api/admin/stats/acquisition?days=30', { token: adminToken });
    const google = r.body.rows.find((x) => x.source === 'google' && x.campaign === 'gst-invoice-oct');
    assert.deepEqual({ signups: google.signups, customers: google.customers, revenue: google.revenue, conversion: google.conversion }, { signups: 1, customers: 1, revenue: 999, conversion: 100 });
    const facebook = r.body.rows.find((x) => x.source === 'facebook');
    assert.equal(facebook.customers, 0);
  });
});

describe('webhook safety', () => {
  test('unsigned, underpaid and failed payments never issue a license', async () => {
    const token = await register('hook@example.com');
    const co = await api('POST', '/api/portal/checkout', { token, body: { planId: (await plan('BUSINESS')).id, provider: 'razorpay' } });
    const orderId = co.body.checkout.orderId;
    const bad = await webhook('payment.captured', { id: 'pay_x', order_id: orderId, amount: co.body.payment.amountPaise }, 'wrong-secret');
    assert.equal(bad.status, 400);
    const under = await webhook('payment.captured', { id: 'pay_y', order_id: orderId, amount: 100 });
    assert.equal(under.status, 200);
    const failed = await webhook('payment.failed', { id: 'pay_z', order_id: orderId, error_description: 'Bank declined' });
    assert.equal(failed.status, 200);
    const row = await knex('payments').where({ id: co.body.payment.id }).first();
    assert.equal(row.status, 'failed');
    assert.equal(row.license_id, null);
    const audit = await knex('audit_log').where({ entity: 'payment', entity_id: row.id }).pluck('action');
    assert.ok(audit.includes('payment.webhook.amount_mismatch'));
    const ignored = await webhook('refund.created', { id: 'pay_z', order_id: orderId });
    assert.equal(ignored.status, 200);
  });
});

describe('renewals and upgrades', () => {
  let token;
  let license;
  const pay = async (planCode, renewLicenseId) => {
    const co = await api('POST', '/api/portal/checkout', { token, body: { planId: (await plan(planCode)).id, provider: 'razorpay', renewLicenseId } });
    assert.equal(co.status, 201, JSON.stringify(co.body));
    const r = await api('POST', `/api/portal/payments/${co.body.payment.id}/confirm`, { token, body: checkoutResponse(co.body.checkout.orderId) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.license;
  };

  test('upgrading Starter to Business moves the license to Business with 3 computers', async () => {
    token = await register('upgrade@example.com');
    license = await pay('STARTER');
    const upgraded = await pay('BUSINESS', license.id);
    assert.equal(upgraded.id, license.id, 'same activation code');
    assert.equal(upgraded.planName, 'Business');
    assert.equal(upgraded.maxDevices, 3);
    assert.equal(upgraded.durationDays, 730, 'unused license: both periods apply from activation');
  });

  test('renewing with the Lifetime plan makes the license lifetime; lifetime cannot be renewed again', async () => {
    const lifetime = await pay('LIFETIME', license.id);
    assert.equal(lifetime.lifetime, true);
    assert.equal(lifetime.maxDevices, 3, 'keeps the larger computer limit');
    const again = await api('POST', '/api/portal/checkout', { token, body: { planId: (await plan('STARTER')).id, provider: 'razorpay', renewLicenseId: license.id } });
    assert.equal(again.body.error.code, 'LICENSE_LIFETIME');
  });

  test('a suspended license cannot be renewed by the customer', async () => {
    const other = await pay('STARTER');
    await api('PUT', `/api/admin/licenses/${other.id}`, { token: adminToken, body: { status: 'suspended' } });
    const r = await api('POST', '/api/portal/checkout', { token, body: { planId: (await plan('STARTER')).id, provider: 'razorpay', renewLicenseId: other.id } });
    assert.equal(r.body.error.code, 'LICENSE_BLOCKED');
  });
});

describe('forgotten password', () => {
  test('reset link by email: works once, expires with a password change, no account enumeration', async () => {
    await register('forgot@example.com');
    const unknown = await api('POST', '/api/portal/auth/forgot', { body: { email: 'nobody@example.com' } });
    const known = await api('POST', '/api/portal/auth/forgot', { body: { email: 'forgot@example.com' } });
    assert.deepEqual(unknown.body, known.body, 'same answer for unknown emails');
    const mail = outbox.filter((m) => m.to === 'forgot@example.com').at(-1);
    assert.match(mail.subject, /Reset your DocGen password/);
    const link = /https?:\/\/\S+reset-password\?token=(\S+)/.exec(mail.text);
    const resetToken = decodeURIComponent(link[1]);

    const weak = await api('POST', '/api/portal/auth/reset', { body: { token: resetToken, password: 'short' } });
    assert.equal(weak.status, 400);
    const ok = await api('POST', '/api/portal/auth/reset', { body: { token: resetToken, password: 'brand-new-pass-9' } });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token, 'signed in after reset');
    const reused = await api('POST', '/api/portal/auth/reset', { body: { token: resetToken, password: 'another-pass-99' } });
    assert.equal(reused.body.error.code, 'INVALID_RESET_LINK');
    const login = await api('POST', '/api/portal/auth/login', { body: { email: 'forgot@example.com', password: 'brand-new-pass-9' } });
    assert.equal(login.status, 200);
  });
});
