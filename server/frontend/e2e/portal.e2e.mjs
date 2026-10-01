/**
 * Browser end-to-end test of the client portal and admin panel against a real
 * DocGen server (started by this script on a temporary SQLite database).
 *
 * Usage:  cd server && npm run build && npm run test:portal
 * Needs Playwright (npm i -g playwright) and a Chromium build.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(path.join(process.env.NODE_GLOBAL || '/opt/node22/lib/node_modules', 'playwright')));
}

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const port = 8811;
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docgen-portal-e2e-'));
let passed = 0;
const check = (cond, label) => {
  if (!cond) throw new Error(`Assertion failed: ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
};

// A stand-in for Razorpay: its Orders API (called by the server) and its Checkout window (loaded by the
// browser from checkout.razorpay.com, intercepted below). The server code and the portal code are the real ones.
const RZP_SECRET = 'rzp_e2e_secret';
const rzpOrders = [];
const fakeRazorpayApi = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const order = { id: `order_e2e${rzpOrders.length + 1}`, ...JSON.parse(raw || '{}'), status: 'created' };
    rzpOrders.push(order);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(order));
  });
});
await new Promise((resolve) => fakeRazorpayApi.listen(0, '127.0.0.1', resolve));
const fakeCheckoutJs = `
window.Razorpay = function (options) { this.options = options; };
window.Razorpay.prototype.on = function () {};
window.Razorpay.prototype.open = function () {
  const o = this.options;
  window.__rzpOptions = o;
  const box = document.createElement('div');
  box.setAttribute('data-testid', 'rzp-window');
  box.style.cssText = 'position:fixed;top:120px;left:50%;transform:translateX(-50%);width:360px;background:#fff;border:1px solid #ccc;border-radius:10px;padding:20px;z-index:9999;box-shadow:0 12px 40px rgba(0,0,0,.25);font:14px sans-serif';
  box.innerHTML = '<b>Razorpay (test)</b><p>' + o.description + ' · ₹' + (o.amount / 100) + '</p><p>' + o.prefill.email + '</p>' +
    '<button data-testid="rzp-pay">Pay with UPI</button> <button data-testid="rzp-close">Cancel</button>';
  document.body.appendChild(box);
  box.querySelector('[data-testid=rzp-pay]').onclick = async () => {
    const paymentId = 'pay_e2e' + Date.now();
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('${RZP_SECRET}'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(o.order_id + '|' + paymentId));
    const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
    box.remove();
    o.handler({ razorpay_order_id: o.order_id, razorpay_payment_id: paymentId, razorpay_signature: hex });
  };
  box.querySelector('[data-testid=rzp-close]').onclick = () => { box.remove(); o.modal && o.modal.ondismiss && o.modal.ondismiss(); };
};`;

const server = spawn('node', [path.join(here, '../../backend/src/index.js')], {
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: dataDir,
    PORTAL_URL: base,
    ADMIN_EMAIL: 'owner@docgen.test',
    ADMIN_PASSWORD: 'owner-password-1',
    ENABLE_MOCK_PAYMENTS: '',
    RAZORPAY_KEY_ID: 'rzp_e2e_key',
    RAZORPAY_KEY_SECRET: RZP_SECRET,
    RAZORPAY_API_BASE: `http://127.0.0.1:${fakeRazorpayApi.address().port}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(d));
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => d.toString().includes('listening') && resolve());
  setTimeout(() => reject(new Error('server did not start')), 15000);
});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
const page = await context.newPage();
await page.route('https://checkout.razorpay.com/v1/checkout.js', (route) => route.fulfill({ contentType: 'application/javascript', body: fakeCheckoutJs }));
// The portal must never use browser alert/confirm/prompt boxes.
let nativeDialogs = 0;
page.on('dialog', (d) => {
  nativeDialogs += 1;
  d.dismiss();
});
const shot = (name) => page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });

/** Admin API helper (used to prepare the installer before the customer journey). */
async function adminFetch(method, url, body) {
  const login = await (await fetch(`${base}/api/admin/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@docgen.test', password: 'owner-password-1' }) })).json();
  return fetch(`${base}/api/admin${url}`, { method, headers: { Authorization: `Bearer ${login.token}` }, body });
}

try {
  const installer = new FormData();
  installer.append('file', new Blob([Buffer.alloc(200000, 1)]), 'DocGen_1.1.0_x64-setup.exe');
  check((await adminFetch('POST', '/downloads/windows', installer)).status === 201, 'admin uploaded the Windows installer');

  console.log('Customer journey: ad → product page → details → pay → license + download');
  await page.goto(`${base}/?utm_source=google&utm_medium=cpc&utm_campaign=gst-oct&gclid=e2e-click`);
  await page.getByTestId('headline').waitFor();
  check((await page.getByTestId('price-card').count()) === 1 && (await page.getByTestId('price').textContent()).includes('1,250'), 'product page: one product, ₹1,250');
  check((await page.getByTestId('price-card').textContent()).includes('one-time payment') && (await page.getByTestId('price-card').textContent()).includes('1-year license'), 'price card: one-time payment, 1-year license');
  check(await page.getByTestId('comparison').isVisible(), 'simple comparison table');
  check((await page.locator('.app-frame img').count()) >= 1, 'product screenshot shown');
  await shot('01-product');

  await page.getByTestId('hero-buy').click();
  await page.getByTestId('checkout-form').waitFor();
  check((await page.getByTestId('order-total').textContent()).includes('1,250'), 'checkout: order summary ₹1,250');
  await page.getByLabel('Full name').fill('Meera Sharma');
  await page.getByLabel('Mobile number').fill('12345');
  await page.getByLabel('Email address').fill('meera@example.com');
  await page.getByTestId('co-pay').click();
  await page.getByText('must be a valid mobile number').waitFor();
  check(true, 'invalid mobile number is explained next to the field');
  await page.getByLabel('Mobile number').fill('98765 43210');
  await shot('02-checkout');
  await page.getByTestId('co-pay').click();
  await page.getByTestId('rzp-window').waitFor();
  const rzp = await page.evaluate(() => window.__rzpOptions);
  check(rzp.key === 'rzp_e2e_key' && rzp.amount === 125000 && rzp.order_id === rzpOrders.at(-1).id && rzp.prefill.email === 'meera@example.com',
    'name, mobile, email → straight to Razorpay (₹1,250, order from the server, email prefilled)');
  await shot('02b-razorpay');
  await page.getByTestId('rzp-pay').click();
  await page.getByTestId('purchase-success').waitFor();
  const code = (await page.getByTestId('new-code').textContent()).trim();
  check(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), `payment → account created and license code ${code} shown`);
  check(/\(365 days\)/.test(await page.getByTestId('valid-until').textContent()), 'license valid for 1 year from today');
  await page.getByTestId('download-windows').waitFor();
  await shot('03-paid');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-windows').click()]);
  check(download.suggestedFilename() === 'DocGen_1.1.0_x64-setup.exe', 'installer downloads right after payment');
  check(await page.locator('.site-header').getByRole('link', { name: 'My account', exact: true }).isVisible(), 'customer is signed in automatically');

  await page.getByTestId('go-account').click();
  await page.getByTestId('license-card').waitFor();
  check((await page.getByTestId('license-code').textContent()).trim() === code, 'client panel: license code');
  check((await page.getByTestId('days-left').textContent()).includes('365 days left'), 'client panel: remaining validity');
  await page.getByTestId('download-card').waitFor();
  await page.getByTestId('purchases').waitFor();
  check((await page.getByTestId('purchases').textContent()).includes('1,250'), 'client panel: download and purchase');
  await page.getByTestId('new-password').fill('meera-pass-123');
  await page.getByRole('button', { name: 'Save password' }).click();
  await page.getByText('Password saved').waitFor();
  check(!(await page.getByTestId('set-password').isVisible()), 'customer creates a password from the panel');
  await shot('04-account');

  // Desktop sign-in with the account activates the license.
  const res = await fetch(`${base}/api/app/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'meera@example.com', password: 'meera-pass-123', deviceId: 'e2e-device-00000001', deviceName: 'Front desk PC', platform: 'windows', appVersion: '1.0.0' }),
  });
  const appLogin = await res.json();
  check(res.status === 200 && appLogin.license.daysLeft === 365, 'desktop app signs in with the account: license active, 365 days');
  await page.reload();
  await page.getByText('Front desk PC').waitFor();
  check(true, 'activated computer listed in the client panel');
  await page.getByRole('button', { name: 'Remove' }).click();
  await page.getByTestId('dialog').waitFor();
  check((await page.getByTestId('dialog').textContent()).includes('Front desk PC'), 'removing a computer asks in an in-app dialog');
  await page.getByTestId('dialog-ok').click();
  await page.getByText('Computer removed').waitFor();
  check(!(await page.getByText('Front desk PC').isVisible()), 'computer removed after confirming');

  // Renew from the client panel: one more year on top of the current end date.
  await page.getByTestId('renew').click();
  await page.getByTestId('rzp-window').waitFor();
  check((await page.evaluate(() => window.__rzpOptions.amount)) === 125000, 'renewal opens Razorpay for ₹1,250');
  await page.getByTestId('rzp-pay').click();
  await page.getByText('your license is now valid until').waitFor();
  await page.getByText('730 days left').waitFor();
  check(true, 'renewal adds a year (730 days left)');

  // Someone else at the same desk starts buying but closes the payment window.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto(`${base}/buy`);
  await page.getByLabel('Full name').fill('Meera Sharma');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByLabel('Email address').fill('meera@example.com');
  await page.getByTestId('co-pay').click();
  await page.getByTestId('signin-instead').waitFor();
  check(true, 'an email that already has an account is asked to sign in');
  await page.getByLabel('Email address').fill('lead@example.com');
  await page.getByTestId('co-pay').click();
  await page.getByTestId('rzp-close').click();
  await page.getByText('Payment not completed').waitFor();
  check(true, 'closing the payment window keeps the visitor on the checkout');

  // Forgotten password (no SMTP in this test → the page explains how to get help).
  await page.goto(`${base}/login`);
  await page.getByLabel('Email').fill('lead@example.com');
  await page.getByLabel('Password').fill('anything-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('link', { name: 'Email me a link to create a password' }).click();
  await page.getByRole('heading', { name: 'Forgot your password?' }).waitFor();
  await page.getByLabel('Email').fill('meera@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.getByText('reset your password').first().waitFor();
  check(true, 'account without a password is pointed to the password link; forgot password page answers');

  console.log('Admin panel');
  await page.goto(`${base}/admin/login`);
  await page.getByLabel('Email').fill('owner@docgen.test');
  await page.getByLabel('Password').fill('owner-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByTestId('stats').waitFor();
  check(/Sales in .*₹2,500/.test((await page.getByTestId('stats').textContent()).replace(/\s+/g, ' ')), 'dashboard: sales this month ₹2,500');
  check((await page.getByTestId('recent-sales').textContent()).includes('meera@example.com'), 'dashboard: recent sales');
  const campaign = page.getByTestId('acquisition').locator('tr', { hasText: 'gst-oct' });
  await campaign.waitFor();
  check(/google.*gst-oct.*2.*1.*50%/.test((await campaign.textContent()).replace(/\s+/g, ' ')), 'dashboard: sign-ups and sale attributed to the Google ad campaign');
  await shot('05-admin-dashboard');

  await page.locator('.admin-side').getByRole('link', { name: 'Products & pricing' }).click();
  await page.getByTestId('edit-product-DOCGEN').click();
  await page.getByTestId('product-price').fill('1500');
  await page.getByTestId('product-period').selectOption('730');
  await page.waitForTimeout(300);
  await shot('08-products');
  await page.getByTestId('save-product').click();
  await page.getByText('Product saved').waitFor();
  const site = await (await fetch(`${base}/api/portal/site`)).json();
  check(site.products[0].price === 1500 && site.products[0].durationDays === 730, 'admin changes the price (₹1,500) and validity (2 years) without code changes');
  check((await page.getByTestId('products').textContent()).includes('₹1,500'), 'products table shows the new price');

  await page.locator('.admin-side').getByRole('link', { name: 'Website' }).click();
  await page.getByTestId('site-headline').fill('Invoices your customers trust');
  await page.getByTestId('add-video').click();
  await page.getByTestId('video-url-0').fill('https://www.youtube.com/watch?v=abcdefghijk');
  await page.getByTestId('upload-screenshot').setInputFiles(path.join(here, '../public/logo.png'));
  await page.locator('.thumb').nth(3).waitFor();
  await page.getByTestId('save-site').click();
  await page.getByText('Website updated').waitFor();
  await shot('09-website');
  const page2 = await context.newPage();
  await page2.goto(base);
  await page2.getByTestId('videos').waitFor();
  check((await page2.getByTestId('headline').textContent()) === 'Invoices your customers trust', 'website headline changed by the admin');
  check((await page2.locator('[data-testid=videos] iframe').getAttribute('src')).startsWith('https://www.youtube-nocookie.com/embed/abcdefghijk'), 'product video embedded');
  check((await page2.getByTestId('price').textContent()).includes('1,500') && (await page2.getByTestId('price-card').textContent()).includes('2-year license'), 'website shows the new price at once');
  await page2.close();

  await page.locator('.admin-side').getByRole('link', { name: 'Customers' }).click();
  const meera = page.locator('table:has(th:text("Came from")) tr', { hasText: 'meera@example.com' });
  await meera.waitFor();
  const meeraRow = (await meera.textContent()).replace(/\s+/g, ' ');
  check(meeraRow.includes(code) && meeraRow.includes('₹2,500') && meeraRow.includes('google / cpc · gst-oct'), 'customers: license, amount paid and ad source per customer');
  check((await page.locator('tr', { hasText: 'lead@example.com' }).textContent()).includes('Not bought'), 'customers: unfinished checkout listed as not bought');
  await shot('10-customers');
  await page.getByRole('button', { name: 'Add customer' }).click();
  const modal = page.locator('.modal');
  await modal.getByLabel('Contact name').fill('Ravi Kumar');
  await modal.getByLabel('Email').fill('ravi@example.com');
  await modal.getByLabel('Business name').fill('Ravi Constructions');
  await modal.getByRole('button', { name: 'Save' }).click();
  await page.getByTestId('dialog').waitFor();
  const pwDialog = page.locator('.modal', { has: page.getByTestId('dialog') });
  check(/Customer added/.test(await pwDialog.textContent()) && (await pwDialog.locator('.code').textContent()).length >= 8, 'temporary password shown in an in-app dialog');
  await page.getByTestId('dialog-ok').click();
  await page.getByRole('heading', { name: 'Ravi Constructions' }).waitFor();
  check(true, 'admin added a customer manually');
  await page.getByTestId('client-new-license').click();
  await page.getByTestId('create-license').click();
  const created = await page.getByTestId('created-codes').inputValue();
  check(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(created.trim()), 'admin gave a license without payment');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Manage' }).click();
  await page.getByTestId('extend-license').click();
  await page.getByText('License extended').waitFor();
  check(true, 'admin extended the license');
  await shot('06-admin-license');
  await page.keyboard.press('Escape');

  await page.locator('.admin-side').getByRole('link', { name: 'Licenses' }).click();
  await page.getByRole('button', { name: 'Create license codes' }).click();
  await page.locator('.modal').getByLabel('How many codes').fill('5');
  await page.getByTestId('create-license').click();
  const batch = (await page.getByTestId('created-codes').inputValue()).trim().split('\n');
  check(batch.length === 5, 'bulk generated 5 license codes');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.locator('.admin-side').getByRole('link', { name: 'In-app ads' }).click();
  await page.getByTestId('new-ad').click();
  await page.getByTestId('ad-title').fill('Diwali offer: 20% off');
  await page.locator('.modal').getByLabel('Description').fill('Renew before 31 Oct.');
  await page.locator('.modal').getByLabel('Link (opens in browser)').fill('https://reynrel.in/offer');
  await page.locator('.modal').getByLabel('HTML content (optional)').fill('<p style="color:#2f5bea">Limited time</p>');
  await shot('07-ad-editor');
  await page.getByTestId('save-ad').click();
  await page.getByText('Diwali offer: 20% off').waitFor();
  check(true, 'ad created');

  await page.locator('.admin-side').getByRole('link', { name: 'Downloads' }).click();
  await page.locator('.installer-row', { hasText: 'DocGen_1.1.0_x64-setup.exe' }).waitFor();
  const dmg = path.join(dataDir, 'DocGen_1.1.0_universal.dmg');
  fs.writeFileSync(dmg, Buffer.alloc(1000, 2));
  await page.getByTestId('upload-macos').setInputFiles(dmg);
  await page.locator('.installer-row', { hasText: 'DocGen_1.1.0_universal.dmg' }).waitFor();
  check(true, 'admin sees the Windows installer and uploads the macOS one');

  await page.locator('.admin-side').getByRole('link', { name: 'App settings' }).click();
  await page.getByTestId('config-interval').fill('15');
  await page.getByRole('button', { name: 'Add video' }).click();
  const rows = page.locator('table tbody tr');
  await rows.last().locator('input').nth(0).fill('Create your first invoice');
  await rows.last().locator('input').nth(1).fill('https://www.youtube.com/watch?v=abcdefghijk');
  await page.getByTestId('save-config').click();
  await page.getByText('Configuration saved').waitFor();
  const cfg = await (await fetch(`${base}/api/app/config`)).json();
  check(cfg.configIntervalDays === 15 && cfg.ads.length === 1 && cfg.help.videos.length === 1, 'app config endpoint reflects admin changes');

  await page.locator('.admin-side').getByRole('link', { name: 'Payments' }).click();
  const leadRow = page.locator('tr', { hasText: 'lead@example.com' });
  await leadRow.waitFor();
  await leadRow.getByRole('button', { name: 'Mark paid' }).click();
  await page.getByTestId('dialog-input').fill('UTR998877');
  await page.getByTestId('dialog-ok').click();
  await page.getByText(/Payment confirmed\. License .* issued/).waitFor();
  check(true, 'admin confirms a bank transfer for an unfinished checkout; license issued');
  await page.locator('tr', { hasText: 'lead@example.com' }).getByRole('button', { name: 'Refund' }).click();
  await page.getByTestId('dialog-ok').click();
  await page.getByText('Refund recorded; license cancelled.').waitFor();
  check(true, 'admin records a refund; the license is cancelled');

  await page.locator('.admin-side').getByRole('link', { name: 'Activity log' }).click();
  await page.getByText('license.extend').first().waitFor();
  check(true, 'activity log shows admin actions');

  check(nativeDialogs === 0, 'no browser alert/confirm/prompt boxes were used');
  console.log(`\nAll ${passed} portal checks passed.`);
} catch (e) {
  await shot('failure').catch(() => {});
  console.error('PORTAL E2E FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  fakeRazorpayApi.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
