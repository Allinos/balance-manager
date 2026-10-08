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

// ---------------------------------------------------------------- fake Meta Graph API (Conversions API)
const metaRequests = [];
const fakeMeta = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    metaRequests.push({ url: req.url, body: JSON.parse(raw || '{}') });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ events_received: 1 }));
  });
});
await new Promise((resolve) => fakeMeta.listen(0, '127.0.0.1', resolve));

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docgen-flow-'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATA_DIR: dataDir,
  ENABLE_MOCK_PAYMENTS: '',
  RAZORPAY_KEY_ID: 'rzp_test_key',
  RAZORPAY_KEY_SECRET: 'rzp_test_secret',
  RAZORPAY_WEBHOOK_SECRET: 'whsec_test',
  RAZORPAY_API_BASE: `http://127.0.0.1:${fakeRazorpay.address().port}`,
  META_CAPI_TOKEN: 'meta_test_token',
  META_TEST_EVENT_CODE: 'TEST4242',
  META_GRAPH_BASE: `http://127.0.0.1:${fakeMeta.address().port}`,
});

const { createKnex, migrate, nowIso } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { hashPassword } = await import('../src/lib/security.js');
const { seedDefaults } = await import('../src/services/common.js');
const { addSamplePlans } = await import('./sample-plans.js');
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
    for (const t of ['support_messages', 'support_requests', 'plan_prices', 'audit_log', 'app_config', 'usage_stats', 'ads', 'devices', 'licenses', 'payments', 'clients', 'plans', 'admins', 'knex_migrations', 'knex_migrations_lock']) {
      await knex.schema.dropTableIfExists(t);
    }
  }
  await migrate(knex);
  await seedDefaults(knex);
  await addSamplePlans(knex);
  await knex('admins').insert({ email: 'owner@test.local', name: 'Owner', role: 'owner', password_hash: await hashPassword('owner-password-1'), created_at: nowIso() });
  server = createApp(knex, { logger: { error() {} } }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  adminToken = (await api('POST', '/api/admin/auth/login', { body: { email: 'owner@test.local', password: 'owner-password-1' } })).body.token;
});

after(async () => {
  server?.close();
  fakeRazorpay.close();
  fakeMeta.close();
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
    const mock = await api('POST', '/api/portal/checkout', { token, body: { acceptTerms: true, planId: (await plan('STARTER')).id, provider: 'mock' } });
    assert.equal(mock.status, 400);
    assert.equal(mock.body.error.code, 'UNKNOWN_PROVIDER');
  });

  test('the Razorpay checkout script is allowed by the content security policy', async () => {
    const r = await api('GET', '/api/health');
    assert.match(r.headers.get('content-security-policy'), /script-src 'self' https:\/\/checkout\.razorpay\.com/);
    assert.match(r.headers.get('content-security-policy'), /script-src [^;]*https:\/\/connect\.facebook\.net/, 'the Meta Pixel script is allowed');
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
    const co = await api('POST', '/api/portal/checkout', { token, body: { acceptTerms: true, planId: starter.id, provider: 'razorpay' } });
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
    const mails = outbox.filter((m) => m.to === 'meena@example.com' && /Your DocGen license/.test(m.subject));
    assert.equal(mails.length, 1);
    assert.match(mails[0].text, new RegExp(license.code));
    assert.match(mails[0].text, /Valid until: \d{2} \w{3} \d{4}/);
    assert.match(mails[0].text, /Download for Windows: http\S+\/api\/downloads\//, 'a 7-day download link');
    assert.match(mails[0].text, /Open my account: http\S+\/account/);
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
    const co = await api('POST', '/api/portal/checkout', { token, body: { acceptTerms: true, planId: (await plan('BUSINESS')).id, provider: 'razorpay' } });
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
    const co = await api('POST', '/api/portal/checkout', { token, body: { acceptTerms: true, planId: (await plan(planCode)).id, provider: 'razorpay', renewLicenseId } });
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
    assert.ok(upgraded.daysLeft >= 729 && upgraded.daysLeft <= 731, `both years count from the first payment (${upgraded.daysLeft})`);
  });

  test('renewing with the Lifetime plan makes the license lifetime; lifetime cannot be renewed again', async () => {
    const lifetime = await pay('LIFETIME', license.id);
    assert.equal(lifetime.lifetime, true);
    assert.equal(lifetime.maxDevices, 3, 'keeps the larger computer limit');
    const again = await api('POST', '/api/portal/checkout', { token, body: { acceptTerms: true, planId: (await plan('STARTER')).id, provider: 'razorpay', renewLicenseId: license.id } });
    assert.equal(again.body.error.code, 'LICENSE_LIFETIME');
  });

  test('a suspended license cannot be renewed by the customer', async () => {
    const other = await pay('STARTER');
    await api('PUT', `/api/admin/licenses/${other.id}`, { token: adminToken, body: { status: 'suspended' } });
    const r = await api('POST', '/api/portal/checkout', { token, body: { acceptTerms: true, planId: (await plan('STARTER')).id, provider: 'razorpay', renewLicenseId: other.id } });
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

describe('buy without an account (product page → checkout)', () => {
  const device = (n) => ({ deviceId: `guest-device-${n}-abcdef`, deviceName: `Shop PC ${n}`, platform: 'windows', appVersion: '1.1.0' });
  const buy = async (email, extra = {}) => {
    const start = await api('POST', '/api/portal/checkout/start', {
      body: { acceptTerms: true, name: 'Ravi Kumar', email, phone: '98765 43210', attribution: { utm_source: 'google', utm_campaign: 'diwali' }, ...extra },
    });
    assert.equal(start.status, 201, JSON.stringify(start.body));
    return start.body;
  };
  const confirm = (start, body = checkoutResponse(start.checkout.orderId)) =>
    api('POST', '/api/portal/checkout/confirm', { body: { checkoutToken: start.checkoutToken, ...body } });
  let session;
  let license;

  test('the product page shows one product: DocGen, ₹1,250 one-time, 1-year license', async () => {
    const r = await api('GET', '/api/portal/site');
    assert.equal(r.status, 200);
    const [product] = r.body.products;
    assert.equal(product.code, 'DOCGEN');
    assert.equal(product.price, 1250);
    assert.equal(product.durationDays, 365);
    assert.ok(r.body.site.headline);
    assert.ok(r.body.providers.some((p) => p.name === 'razorpay'));
  });

  test('name, mobile and email are checked', async () => {
    const r = await api('POST', '/api/portal/checkout/start', { body: { acceptTerms: true, name: 'R', email: 'not-an-email', phone: '12' } });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.details.fields.name && r.body.error.details.fields.email && r.body.error.details.fields.phone);
  });

  test('the Terms & Conditions must be accepted before a payment starts', async () => {
    const guest = await api('POST', '/api/portal/checkout/start', { body: { name: 'Ravi Kumar', email: 'terms@example.com', phone: '9876543210' } });
    assert.equal(guest.status, 400);
    assert.match(guest.body.error.details.fields.acceptTerms, /Terms & Conditions/);
    const token = await register('terms-signed-in@example.com');
    const signedIn = await api('POST', '/api/portal/checkout', { token, body: { provider: 'razorpay' } });
    assert.equal(signedIn.status, 400);
    assert.ok(signedIn.body.error.details.fields.acceptTerms);
    const ok = await api('POST', '/api/portal/checkout', { token, body: { acceptTerms: true, provider: 'razorpay' } });
    assert.equal(ok.status, 201);
    assert.ok((await knex('payments').where({ id: ok.body.payment.id }).first()).terms_accepted_at, 'the time of acceptance is stored with the payment');
  });

  test('checkout creates the account (no password yet) and a Razorpay order for the product price', async () => {
    const start = await buy('ravi@example.com');
    assert.equal(start.checkout.type, 'razorpay');
    assert.equal(orders.get(start.checkout.orderId).amount, 125000);
    assert.equal(start.checkout.prefill.email, 'ravi@example.com');
    const client = await knex('clients').where({ email: 'ravi@example.com' }).first();
    assert.equal(client.password_hash, '');
    assert.equal(client.phone, '9876543210');
    assert.equal(client.ref_source, 'google');
    const forged = await confirm(start, { ...checkoutResponse(start.checkout.orderId), razorpay_signature: '0'.repeat(64) });
    assert.equal(forged.status, 400);
    const bad = await api('POST', '/api/portal/checkout/confirm', { body: { checkoutToken: 'nope', ...checkoutResponse(start.checkout.orderId) } });
    assert.equal(bad.body.error.code, 'CHECKOUT_EXPIRED');

    const paid = await confirm(start);
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    license = paid.body.license;
    assert.equal(license.status, 'active');
    assert.equal(license.daysLeft, 365, 'valid for one year from today');
    assert.ok(paid.body.token, 'signed in automatically');
    session = paid.body.token;
    const me = await api('GET', '/api/portal/me', { token: session });
    assert.equal(me.body.client.hasPassword, false);
    const dl = await api('GET', '/api/portal/downloads', { token: session });
    assert.equal(dl.body.entitled, true);
  });

  test('the email has the license code, validity, a download link and a link to create a password', async () => {
    const mail = outbox.filter((m) => m.to === 'ravi@example.com').at(-1);
    assert.match(mail.subject, /Your DocGen license and download/);
    assert.match(mail.text, new RegExp(`License code: ${license.code}`));
    assert.match(mail.text, /Valid until: \d{2} \w{3} \d{4}/);
    assert.match(mail.text, /₹1,250/);
    const download = /Download for Windows: http\S+(\/api\/downloads\/\S+)/.exec(mail.text);
    const file = await fetch(`${base}${download[1]}`, { redirect: 'manual' });
    assert.equal(file.status, 200, 'the emailed download link works without signing in');
    const link = /Create your password: http\S+reset-password\?setup=1&token=(\S+)/.exec(mail.text);
    const set = await api('POST', '/api/portal/auth/reset', { body: { token: decodeURIComponent(link[1]), password: 'ravi-secret-1' } });
    assert.equal(set.status, 200);
    const app = await api('POST', '/api/app/login', { body: { email: 'ravi@example.com', password: 'ravi-secret-1', ...device(1) } });
    assert.equal(app.status, 200, JSON.stringify(app.body));
    assert.equal(app.body.license.status, 'active');
    assert.equal(app.body.license.daysLeft, 365);
  });

  test('an email that already has an account must sign in; an unpaid checkout can be retried', async () => {
    const again = await api('POST', '/api/portal/checkout/start', { body: { acceptTerms: true, name: 'Someone', email: 'ravi@example.com', phone: '9876500000' } });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'ACCOUNT_EXISTS');
    await buy('lead@example.com');
    const retry = await buy('lead@example.com', { name: 'Lead Again' });
    assert.ok(retry.payment.id);
    assert.equal((await knex('clients').where({ email: 'lead@example.com' })).length, 1);
    const login = await api('POST', '/api/portal/auth/login', { body: { email: 'lead@example.com', password: 'whatever-123' } });
    assert.equal(login.body.error.code, 'NO_PASSWORD');
    const app = await api('POST', '/api/app/login', { body: { email: 'lead@example.com', password: 'whatever-123', ...device(2) } });
    assert.equal(app.status, 401, 'no password, no desktop sign-in');
  });

  test('a signed-in buyer without a password sets one without the current password', async () => {
    const start = await buy('first@example.com');
    const paid = await confirm(start);
    const r = await api('PUT', '/api/portal/me/password', { token: paid.body.token, body: { newPassword: 'first-pass-12' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.client.hasPassword, true);
    const wrong = await api('PUT', '/api/portal/me/password', { token: r.body.token, body: { newPassword: 'other-pass-12' } });
    assert.equal(wrong.status, 400, 'now the current password is required');
  });

  test('the admin changes the price and the license period without code changes', async () => {
    const product = (await api('GET', '/api/portal/site')).body.products[0];
    const upd = await api('PUT', `/api/admin/plans/${product.id}`, { token: adminToken, body: { ...product, prices: [{ durationDays: 730, price: 1500 }] } });
    assert.equal(upd.status, 200, JSON.stringify(upd.body));
    assert.equal(upd.body.plan.code, 'DOCGEN', 'code kept');
    assert.equal((await api('GET', '/api/portal/site')).body.products[0].price, 1500);
    const start = await buy('pricey@example.com');
    assert.equal(orders.get(start.checkout.orderId).amount, 150000);
    const paid = await confirm(start);
    assert.equal(paid.body.license.daysLeft, 730);
    await api('PUT', `/api/admin/plans/${product.id}`, { token: adminToken, body: { ...product } });
  });

  test('desktop: suspended accounts and expired or refunded licenses stop working', async () => {
    const client = await knex('clients').where({ email: 'ravi@example.com' }).first();
    const login = await api('POST', '/api/app/login', { body: { email: 'ravi@example.com', password: 'ravi-secret-1', ...device(1) } });
    await api('PUT', `/api/admin/clients/${client.id}`, { token: adminToken, body: { status: 'suspended' } });
    const refresh = await api('POST', '/api/app/license/refresh', { body: { token: login.body.token, deviceId: device(1).deviceId } });
    assert.equal(refresh.body.license.status, 'suspended', 'a suspended account blocks its licenses');
    const code = await api('POST', '/api/app/activate', { body: { code: license.code, ...device(3) } });
    assert.equal(code.body.error.code, 'ACCOUNT_SUSPENDED');
    await api('PUT', `/api/admin/clients/${client.id}`, { token: adminToken, body: { status: 'active' } });

    await knex('licenses').where({ id: license.id }).update({ expires_at: new Date(Date.now() - 86400000).toISOString() });
    const expired = await api('POST', '/api/app/login', { body: { email: 'ravi@example.com', password: 'ravi-secret-1', ...device(1) } });
    assert.equal(expired.body.error.code, 'LICENSE_EXPIRED');
    assert.match(expired.body.error.message, /expired on .*Renew/);
    const r2 = await api('POST', '/api/app/license/refresh', { body: { token: login.body.token, deviceId: device(1).deviceId } });
    assert.equal(r2.body.license.status, 'expired');

    const lead = await buy('refund@example.com');
    const paid = await confirm(lead);
    const refund = await api('POST', `/api/admin/payments/${paid.body.payment.id}/refund`, { token: adminToken, body: {} });
    assert.equal(refund.body.licenseRevoked, true);
    const act = await api('POST', '/api/app/activate', { body: { code: paid.body.license.code, ...device(4) } });
    assert.equal(act.body.error.code, 'LICENSE_REVOKED');
  });

  test('admin dashboard has sales figures and customers show their license', async () => {
    const stats = await api('GET', '/api/admin/stats', { token: adminToken });
    assert.ok(stats.body.monthSales >= 3 && stats.body.monthRevenue > 0);
    assert.ok(stats.body.recentSales.length > 0 && stats.body.recentSales[0].client.email);
    const list = await api('GET', '/api/admin/clients?q=ravi%40example.com', { token: adminToken });
    assert.equal(list.body.rows[0].license.code, license.code);
    assert.equal(list.body.rows[0].paidTotal, 1250);
  });
});

describe('license durations, extension, mobile devices and downloads', () => {
  const mobile = (n) => ({ deviceId: `mobile-device-${n}-abcdef`, deviceName: `Android phone ${n}`, platform: 'android', appVersion: '1.0.0', deviceKind: 'mobile' });
  let session;
  let license;
  let product;

  test('the product has a price per duration (1, 2 and 5 years by default)', async () => {
    product = (await api('GET', '/api/portal/site')).body.products.find((p) => p.code === 'DOCGEN');
    assert.deepEqual(product.prices.map((p) => [p.durationDays, p.price, p.label]), [
      [365, 1250, '1 year'],
      [730, 2250, '2 years'],
      [1825, 4999, '5 years'],
    ]);
    assert.equal(product.maxMobileDevices, 2);
  });

  test('buying the 2-year option charges its price and gives a 2-year license', async () => {
    const twoYears = product.prices.find((p) => p.durationDays === 730);
    const start = await api('POST', '/api/portal/checkout/start', { body: { acceptTerms: true, name: 'Two Year', email: 'twoyear@example.com', phone: '9876500001', priceId: twoYears.id } });
    assert.equal(start.status, 201, JSON.stringify(start.body));
    assert.equal(orders.get(start.body.checkout.orderId).amount, 225000);
    assert.equal(start.body.payment.durationLabel, '2 years');
    const paid = await api('POST', '/api/portal/checkout/confirm', { body: { checkoutToken: start.body.checkoutToken, ...checkoutResponse(start.body.checkout.orderId) } });
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    license = paid.body.license;
    session = paid.body.token;
    assert.equal(license.daysLeft, 730);
    assert.equal(license.maxMobileDevices, 2);
    const other = await api('POST', '/api/portal/checkout/start', { body: { acceptTerms: true, name: 'Xavier', email: 'x-price@example.com', phone: '9876500002', priceId: 999999 } });
    assert.equal(other.status, 404, 'unknown price refused');
  });

  test('extending with the 5-year option adds 5 years to the current end date', async () => {
    const fiveYears = product.prices.find((p) => p.durationDays === 1825);
    const co = await api('POST', '/api/portal/checkout', { token: session, body: { acceptTerms: true, priceId: fiveYears.id, renewLicenseId: license.id } });
    assert.equal(co.status, 201, JSON.stringify(co.body));
    assert.equal(orders.get(co.body.checkout.orderId).amount, 499900);
    const r = await api('POST', `/api/portal/payments/${co.body.payment.id}/confirm`, { token: session, body: checkoutResponse(co.body.checkout.orderId) });
    assert.equal(r.body.license.id, license.id, 'same license key');
    assert.equal(r.body.license.daysLeft, 730 + 1825);
  });

  test('DocGen Mobile: activation with the key, at most 2 phones per license (enforced on the server)', async () => {
    const one = await api('POST', '/api/app/activate', { body: { code: license.code, ...mobile(1) } });
    assert.equal(one.status, 200, JSON.stringify(one.body));
    assert.equal(one.body.license.key, license.code);
    assert.equal(one.body.license.product, 'DocGen');
    assert.ok(one.body.license.startedAt && one.body.license.expiresAt);
    const two = await api('POST', '/api/app/activate', { body: { code: license.code, ...mobile(2) } });
    assert.equal(two.status, 200);
    const again = await api('POST', '/api/app/activate', { body: { code: license.code, ...mobile(1) } });
    assert.equal(again.status, 200, 'the same phone can activate again');
    const three = await api('POST', '/api/app/activate', { body: { code: license.code, ...mobile(3) } });
    assert.equal(three.status, 409);
    assert.equal(three.body.error.code, 'DEVICE_LIMIT');
    assert.match(three.body.error.message, /2 phone/);
    // Computers have their own limit.
    const pc = await api('POST', '/api/app/activate', { body: { code: license.code, deviceId: 'desktop-for-mobile-test-1', deviceName: 'PC', platform: 'windows', appVersion: '1.1.0' } });
    assert.equal(pc.status, 200, 'a computer still activates while both phone places are used');
    // The customer frees a phone in the client panel; then another phone can be added.
    const mine = await api('GET', '/api/portal/licenses', { token: session });
    const phones = mine.body.licenses.find((l) => l.id === license.id).devices.filter((d) => d.kind === 'mobile');
    assert.equal(phones.length, 2);
    await api('POST', `/api/portal/licenses/${license.id}/devices/${phones[0].id}/release`, { token: session });
    const four = await api('POST', '/api/app/activate', { body: { code: license.code, ...mobile(4) } });
    assert.equal(four.status, 200);
    // A refresh from a released phone is refused.
    const refreshed = await api('POST', '/api/app/license/refresh', { body: { token: one.body.token, deviceId: mobile(1).deviceId, deviceKind: 'mobile' } });
    assert.equal(refreshed.body.error.code, 'DEVICE_RELEASED');
  });

  test('DocGen Mobile: sign in with email and password', async () => {
    session = (await api('PUT', '/api/portal/me/password', { token: session, body: { newPassword: 'two-year-pass-1' } })).body.token;
    const r = await api('POST', '/api/app/login', { body: { email: 'twoyear@example.com', password: 'two-year-pass-1', ...mobile(4) } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.license.key, license.code);
  });

  test('the admin sets prices, mobile limit and which downloads customers see', async () => {
    const upd = await api('PUT', `/api/admin/plans/${product.id}`, {
      token: adminToken,
      body: { ...product, maxMobileDevices: 3, prices: [{ durationDays: 365, price: 1300 }, { durationDays: 1095, price: 3300, label: '3 years (best value)' }] },
    });
    assert.equal(upd.status, 200, JSON.stringify(upd.body));
    assert.deepEqual(upd.body.plan.prices.map((p) => [p.durationDays, p.price, p.label]), [
      [365, 1300, '1 year'],
      [1095, 3300, '3 years (best value)'],
    ]);
    assert.equal(upd.body.plan.maxMobileDevices, 3);
    const dup = await api('PUT', `/api/admin/plans/${product.id}`, { token: adminToken, body: { ...product, prices: [{ durationDays: 365, price: 1 }, { durationDays: 365, price: 2 }] } });
    assert.equal(dup.status, 400, 'two prices for the same duration are refused');

    const off = await api('PUT', '/api/admin/downloads/settings', {
      token: adminToken,
      body: { windows: { enabled: true, url: '' }, macos: { enabled: true, url: 'https://example.com/DocGen.dmg' }, linux: { enabled: false, url: '' }, mobile: { enabled: true, url: '' } },
    });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    const list = await api('GET', '/api/portal/downloads', { token: session });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.deepEqual(list.body.files.map((f) => [f.platform, f.type]), [
      ['windows', 'file'],
      ['macos', 'link'],
      ['mobile', 'page'],
    ]);
    assert.equal(list.body.files[2].url, '/mobile');
    const site = await api('GET', '/api/portal/site');
    assert.equal(site.body.mobileAvailable, true);
    await api('PUT', '/api/admin/downloads/settings', {
      token: adminToken,
      body: { windows: { enabled: true, url: '' }, macos: { enabled: true, url: '' }, linux: { enabled: true, url: '' }, mobile: { enabled: false, url: '' } },
    });
    assert.ok(!(await api('GET', '/api/portal/downloads', { token: session })).body.files.some((f) => f.platform === 'mobile'), 'mobile switched off');
    assert.equal((await api('GET', '/api/portal/site')).body.mobileAvailable, false);
  });

  test('admin can change a license\'s phone limit', async () => {
    const r = await api('PUT', `/api/admin/licenses/${license.id}`, { token: adminToken, body: { maxMobileDevices: 1 } });
    assert.equal(r.body.license.maxMobileDevices, 1);
    const blocked = await api('POST', '/api/app/activate', { body: { code: license.code, ...mobile(5) } });
    assert.equal(blocked.body.error.code, 'DEVICE_LIMIT');
  });
});

describe('Help & Support', () => {
  let customer;
  let requestId;

  test('a visitor sends a request from the website: saved, confirmed by email, support inbox notified', async () => {
    const before = outbox.length;
    const r = await api('POST', '/api/portal/support', {
      body: { name: 'Asha Patel', email: 'Asha@Example.com', phone: '9876500011', topic: 'buying', subject: 'GST on invoices', message: 'Does DocGen print CGST and SGST separately?', source: 'contact' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.request.status, 'open');
    assert.equal(r.body.request.email, 'asha@example.com');
    assert.equal(r.body.request.clientId, null);
    const mails = outbox.slice(before);
    assert.equal(mails.length, 2);
    assert.equal(mails[0].to, 'asha@example.com');
    assert.match(mails[0].subject, new RegExp(`#${r.body.request.id}`));
    assert.equal(mails[1].replyTo, 'asha@example.com', 'support can reply straight to the customer');
    assert.match(mails[1].text, /CGST and SGST/);
  });

  test('requests are checked; robots filling the hidden field are ignored', async () => {
    const bad = await api('POST', '/api/portal/support', { body: { name: 'A', email: 'nope', subject: '', message: 'hi' } });
    assert.equal(bad.status, 400);
    assert.ok(['name', 'email', 'subject', 'message'].every((k) => bad.body.error.details.fields[k]));
    const count = Number((await knex('support_requests').count({ c: '*' }))[0].c);
    const robot = await api('POST', '/api/portal/support', { body: { name: 'Spam Bot', email: 'bot@example.com', subject: 'Cheap offer', message: 'Buy followers now, very cheap', website: 'http://spam.example' } });
    assert.equal(robot.status, 201);
    assert.equal(Number((await knex('support_requests').count({ c: '*' }))[0].c), count, 'nothing saved');
  });

  test('a signed-in customer writes from the client panel and sees the request there', async () => {
    customer = await register('support-customer@example.com');
    const r = await api('POST', '/api/portal/support', {
      token: customer,
      body: { name: 'Meena Sharma', email: 'someone-else@example.com', topic: 'license', subject: 'Activate on a new PC', message: 'I changed my computer. How do I move my license?', source: 'panel' },
    });
    assert.equal(r.status, 201);
    requestId = r.body.request.id;
    assert.equal(r.body.request.email, 'support-customer@example.com', 'a signed-in customer writes as themselves');
    assert.ok(r.body.request.clientId);
    const list = await api('GET', '/api/portal/support', { token: customer });
    assert.deepEqual(list.body.requests.map((x) => x.subject), ['Activate on a new PC']);
    const detail = await api('GET', `/api/portal/support/${requestId}`, { token: customer });
    assert.equal(detail.body.request.messages.length, 1);
    assert.equal(detail.body.request.topicLabel, 'License & activation');
    const other = await register('support-other@example.com');
    assert.equal((await api('GET', `/api/portal/support/${requestId}`, { token: other })).status, 404, 'other customers cannot read it');
    assert.equal((await api('GET', '/api/portal/support', { token: other })).body.requests.length, 0);
  });

  test('admin sees open requests, answers (emailed to the customer), the customer replies and closes', async () => {
    const list = await api('GET', '/api/admin/support', { token: adminToken });
    assert.equal(list.status, 200);
    assert.ok(list.body.rows.some((x) => x.id === requestId));
    assert.ok(list.body.counts.open >= 2);
    assert.ok((await api('GET', '/api/admin/stats', { token: adminToken })).body.openSupport >= 2);
    const detail = await api('GET', `/api/admin/support/${requestId}`, { token: adminToken });
    assert.equal(detail.body.client.email, 'support-customer@example.com');
    const before = outbox.length;
    const reply = await api('POST', `/api/admin/support/${requestId}/messages`, { token: adminToken, body: { message: 'Open My License and release the old computer, then activate on the new one.' } });
    assert.equal(reply.status, 201);
    assert.equal(reply.body.request.status, 'answered');
    assert.equal(outbox.length, before + 1);
    assert.equal(outbox.at(-1).to, 'support-customer@example.com');
    assert.match(outbox.at(-1).text, /release the old computer/);
    assert.match(outbox.at(-1).text, new RegExp(`/account/support/${requestId}`));

    const again = await api('POST', `/api/portal/support/${requestId}/messages`, { token: customer, body: { message: 'Thanks, where do I find My License?' } });
    assert.equal(again.body.request.status, 'open', 'a customer reply opens it again');
    assert.deepEqual(again.body.request.messages.map((m) => m.author), ['customer', 'support', 'customer']);
    assert.equal(outbox.at(-1).to, 'info.reynrel@gmail.com', 'support inbox notified');

    const closed = await api('POST', `/api/admin/support/${requestId}/messages`, { token: adminToken, body: { message: 'In the menu on the left.', close: true } });
    assert.equal(closed.body.request.status, 'closed');
    const open = await api('GET', '/api/admin/support', { token: adminToken });
    assert.ok(!open.body.rows.some((x) => x.id === requestId), 'solved requests leave the default list');
    assert.ok((await api('GET', '/api/admin/support?status=closed', { token: adminToken })).body.rows.some((x) => x.id === requestId));
    const reopened = await api('PUT', `/api/admin/support/${requestId}`, { token: adminToken, body: { status: 'open' } });
    assert.equal(reopened.body.request.status, 'open');
    const solved = await api('POST', `/api/portal/support/${requestId}/close`, { token: customer });
    assert.equal(solved.body.request.status, 'closed');
  });
});

describe('prices shown to customers', () => {
  test('an empty duration is refused instead of becoming a lifetime license', async () => {
    const product = (await api('GET', '/api/admin/plans', { token: adminToken })).body.plans.find((p) => p.code === 'DOCGEN');
    const prices = product.prices.map((p) => ({ id: p.id, durationDays: p.durationDays, price: p.price, label: '' }));
    const r = await api('PUT', `/api/admin/plans/${product.id}`, {
      token: adminToken,
      body: { name: product.name, maxDevices: product.maxDevices, prices: [...prices, { durationDays: '', price: 999, label: '' }] },
    });
    assert.equal(r.status, 400);
    assert.match(JSON.stringify(r.body.error.details.fields), /duration/);
  });

  test('each price has its own duration text, separate from the optional name', async () => {
    const product = (await api('GET', '/api/admin/plans', { token: adminToken })).body.plans.find((p) => p.code === 'DOCGEN');
    const longest = Math.max(...product.prices.map((p) => p.durationDays));
    const prices = product.prices.map((p) => ({ id: p.id, durationDays: p.durationDays, price: p.price, label: p.durationDays === longest ? 'Premium' : '' }));
    const saved = await api('PUT', `/api/admin/plans/${product.id}`, { token: adminToken, body: { name: product.name, maxDevices: product.maxDevices, prices } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const site = await api('GET', '/api/portal/site');
    const docgen = site.body.products.find((p) => p.code === 'DOCGEN');
    const top = docgen.prices.find((p) => p.durationDays === longest);
    assert.equal(top.period, `${longest / 365} years`);
    assert.equal(top.tag, 'Premium');
    assert.ok(docgen.prices.filter((p) => p !== top).every((p) => p.tag === '' && p.label === p.period));
    assert.ok(docgen.prices.every((p) => p.period !== 'Lifetime'));
  });
});

describe('Meta Pixel and Conversions API', () => {
  const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
  const waitFor = async (fn) => {
    for (let i = 0; i < 50; i++) {
      const v = fn();
      if (v) return v;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  };

  test('the Pixel ID is on the website; the access token never is', async () => {
    const r = await api('GET', '/api/portal/site');
    assert.deepEqual(r.body.site.metaPixel, { enabled: true, pixelId: '1641005901370085' });
    assert.ok(!JSON.stringify(r.body).includes('meta_test_token'));
    const admin = await api('GET', '/api/admin/site', { token: adminToken });
    assert.deepEqual(admin.body.metaCapi, { configured: true, testMode: true });
    assert.ok(!JSON.stringify(admin.body).includes('meta_test_token'));
    // A site saved with the first Pixel ID uses the new dataset ID.
    await api('PUT', '/api/admin/site', { token: adminToken, body: { ...admin.body.site, metaPixel: { enabled: true, pixelId: '1862821958226928' } } });
    assert.equal((await api('GET', '/api/portal/site')).body.site.metaPixel.pixelId, '1641005901370085');
    await api('PUT', '/api/admin/site', { token: adminToken, body: admin.body.site });
  });

  test('the Pixel base code is added to the page HTML (for Meta\'s checks), but not to the admin panel', async () => {
    const { withPixel, pixelScript } = await import('../src/services/meta.js');
    const html = withPixel('<html><head><title>x</title></head><body class="a"><div id="root"></div></body></html>', '1641005901370085');
    assert.match(html, /<script src="\/meta-pixel\.js"><\/script>\s*<\/head>/);
    assert.match(html, /<body class="a">\s*<noscript><img [^>]*facebook\.com\/tr\?id=1641005901370085&amp;ev=PageView&amp;noscript=1/);
    assert.equal(withPixel('<head></head>', 'abc'), '<head></head>', 'an invalid ID adds nothing');
    assert.match(pixelScript('1641005901370085'), /connect\.facebook\.net\/en_US\/fbevents\.js[\s\S]*fbq\('init', '1641005901370085'\)/);
    assert.ok(!pixelScript('1641005901370085').includes('PageView'), 'PageView is sent by the website, once per page');
  });

  test('a paid order is sent once as a Purchase, with hashed email and phone and the ad click', async () => {
    const start = await api('POST', '/api/portal/checkout/start', {
      headers: { 'User-Agent': 'Mozilla/5.0 (test phone)' },
      body: {
        acceptTerms: true, name: 'Farhan Ali', email: 'Farhan@Example.com', phone: '91234 56789',
        attribution: { fbclid: 'IwAR-e2e-click' }, tracking: { fbp: 'fb.1.1700000000000.123456789', path: '/offer' },
      },
    });
    assert.equal(start.status, 201, JSON.stringify(start.body));
    const id = start.body.payment.id;
    const body = checkoutResponse(start.body.checkout.orderId);
    // Browser confirmation and the Razorpay webhook both report the payment: still one event.
    const [paid] = await Promise.all([
      api('POST', '/api/portal/checkout/confirm', { body: { checkoutToken: start.body.checkoutToken, ...body } }),
      webhook('payment.captured', { id: body.razorpay_payment_id, order_id: start.body.checkout.orderId, amount: orders.get(start.body.checkout.orderId).amount, currency: 'INR', status: 'captured' }),
    ]);
    assert.equal(paid.status, 200);
    const sent = await waitFor(() => metaRequests.find((m) => m.body.data?.[0]?.event_id === `purchase-${id}`));
    assert.ok(sent, 'Purchase sent to Meta');
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(metaRequests.filter((m) => m.body.data?.[0]?.event_id === `purchase-${id}`).length, 1, 'sent once');
    assert.equal(sent.url, '/v21.0/1641005901370085/events');
    assert.equal(sent.body.access_token, 'meta_test_token');
    assert.equal(sent.body.test_event_code, 'TEST4242');
    const [e] = sent.body.data;
    assert.equal(e.event_name, 'Purchase');
    assert.equal(e.action_source, 'website');
    assert.match(e.event_source_url, /\/offer$/);
    assert.deepEqual(
      { value: e.custom_data.value, currency: e.custom_data.currency, ids: e.custom_data.content_ids, order: e.custom_data.order_id },
      { value: (await knex('payments').where({ id }).first()).amount_paise / 100, currency: 'INR', ids: ['DOCGEN'], order: String(id) },
    );
    assert.equal(e.user_data.em, sha('farhan@example.com'));
    assert.equal(e.user_data.ph, sha('919123456789'));
    assert.equal(e.user_data.fbp, 'fb.1.1700000000000.123456789');
    assert.match(e.user_data.fbc, /^fb\.1\.\d+\.IwAR-e2e-click$/);
    assert.equal(e.user_data.client_user_agent, 'Mozilla/5.0 (test phone)');
    assert.ok(e.user_data.client_ip_address && e.user_data.external_id);
    assert.ok(!JSON.stringify(e).includes('farhan@example.com') && !JSON.stringify(e).includes('9123456789'), 'no plain email or phone');
  });

  test('with the Pixel switched off in Admin → Website nothing is sent', async () => {
    const site = (await api('GET', '/api/admin/site', { token: adminToken })).body.site;
    const off = await api('PUT', '/api/admin/site', { token: adminToken, body: { ...site, metaPixel: { enabled: false, pixelId: site.metaPixel.pixelId } } });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    const bad = await api('PUT', '/api/admin/site', { token: adminToken, body: { ...site, metaPixel: { enabled: true, pixelId: 'abc' } } });
    assert.equal(bad.status, 400, 'a Pixel ID is digits only');
    const before = metaRequests.length;
    const start = await api('POST', '/api/portal/checkout/start', { body: { acceptTerms: true, name: 'Off Test', email: 'pixel-off@example.com', phone: '9000000001' } });
    const paid = await api('POST', '/api/portal/checkout/confirm', { body: { checkoutToken: start.body.checkoutToken, ...checkoutResponse(start.body.checkout.orderId) } });
    assert.equal(paid.status, 200);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(metaRequests.length, before);
    await api('PUT', '/api/admin/site', { token: adminToken, body: site });
  });
});
