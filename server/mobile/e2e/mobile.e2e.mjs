/**
 * Browser end-to-end test of DocGen Mobile (the installable web app at /app/) against a real
 * DocGen server on a temporary SQLite database, in phone-sized Chromium (Pixel-like, touch).
 *
 *   cd server && npm run build && npm run test:mobile
 *
 * Also saves the phone screenshots used on the website (frontend/public/screenshots/mobile-*.png).
 */

import { spawn } from 'node:child_process';
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
const siteShots = path.join(here, '../../frontend/public/screenshots');
fs.mkdirSync(shots, { recursive: true });
const port = 8813;
const base = `http://localhost:${port}`; // localhost: a secure context, so the service worker runs
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docgen-mobile-e2e-'));
let passed = 0;
const check = (cond, label) => {
  if (!cond) throw new Error(`Assertion failed: ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
};

const server = spawn('node', [path.join(here, '../../backend/src/index.js')], {
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, PORTAL_URL: base, ADMIN_EMAIL: 'owner@docgen.test', ADMIN_PASSWORD: 'owner-password-1', ENABLE_MOCK_PAYMENTS: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(d));
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => d.toString().includes('listening') && resolve());
  setTimeout(() => reject(new Error('server did not start')), 15000);
});

let adminToken = '';
async function admin(method, url, body) {
  if (!adminToken) {
    const r = await fetch(`${base}/api/admin/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@docgen.test', password: 'owner-password-1' }) });
    adminToken = (await r.json()).token;
  }
  const r = await fetch(`${base}/api/admin${url}`, { method, headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status} ${JSON.stringify(json)}`);
  return json;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
};
const phone = async () => {
  const context = await browser.newContext({ ...PHONE, acceptDownloads: true });
  const page = await context.newPage();
  page.on('dialog', (d) => d.dismiss());
  return { context, page };
};
const shot = (page, name) => page.screenshot({ path: path.join(shots, `${name}.png`) });

try {
  // A customer with a 1-year license (2 phones) and a password.
  const { client } = await admin('POST', '/clients', { name: 'Priya Nair', email: 'priya@example.com', password: 'priya-pass-123', business_name: 'Nair Traders' });
  const [license] = (await admin('POST', '/licenses', { clientId: client.id, activateNow: true, maxMobileDevices: 2 })).licenses;
  check(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(license.code) && license.maxMobileDevices === 2, `license ${license.code} for 2 phones`);

  console.log('Installation page');
  const a = await phone();
  await a.page.goto(`${base}/mobile`);
  await a.page.getByTestId('mobile-page').waitFor();
  check((await a.page.getByTestId('install-mobile').textContent()).includes('Install DocGen Mobile'), 'installation page with the Install button (on a phone)');
  check((await a.page.locator('.install-steps').textContent()).includes('Add to Home screen'), 'Android and iPhone installation steps');
  await a.page.getByTestId('install-mobile').click();
  await a.page.getByTestId('activation').waitFor();
  check(a.page.url().startsWith(`${base}/app/`), 'Install opens the app (/app/)');
  const manifest = await (await fetch(`${base}/app/manifest.webmanifest`)).json();
  check(manifest.display === 'standalone' && manifest.start_url === '/app/' && manifest.icons.some((i) => i.purpose === 'maskable'), 'web app manifest: standalone, /app/, maskable icon (installable on Android)');
  check(await a.page.evaluate(async () => !!(await navigator.serviceWorker.ready).active), 'service worker active (offline support)');
  check(await a.page.getByTestId('install-banner').isVisible(), 'Install banner while running in the browser');

  console.log('Activation');
  await a.page.getByTestId('license-key').fill('ZZZZ-ZZZZ-ZZZZ');
  await a.page.getByTestId('activate').click();
  await a.page.getByTestId('activation-error').waitFor();
  check((await a.page.getByTestId('activation-error').textContent()).includes('not valid'), 'a wrong key is refused by the server');
  await a.page.getByTestId('license-key').fill(license.code.toLowerCase().replace(/-/g, ''));
  check((await a.page.getByTestId('license-key').inputValue()) === license.code, 'key formats itself while typing');
  await shot(a.page, '01-activation');
  await a.page.getByTestId('activate').click();
  await a.page.getByTestId('setup').waitFor();
  check((await a.page.getByTestId('company-name').inputValue()) === 'Nair Traders', 'activated; business name taken from the account');
  await a.page.getByTestId('company-gstin').fill('27AAPFU0939F1ZV');
  check((await a.page.getByTestId('company-state').inputValue()) === 'Maharashtra', 'GSTIN fills the state');
  await a.page.getByTestId('setup-save').click();
  await a.page.getByTestId('dashboard').waitFor();
  check(/Licensed · 36[56] days left/.test(await a.page.getByTestId('license-chip').textContent()), 'dashboard shows the license validity');
  const stored = await a.page.evaluate(() => JSON.parse(localStorage.getItem('docgen.mobile.license')));
  check(stored.key === license.code && stored.expiresAt && stored.startedAt, 'license key, start and expiry kept in local storage');
  const sealed = await a.page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('docgen-mobile');
        req.onsuccess = () => {
          const get = req.result.transaction('kv').objectStore('kv').get('license');
          get.onsuccess = () => resolve(!!get.result?.data && !get.result.plain);
        };
      }),
  );
  check(sealed, 'license token stored encrypted in IndexedDB');
  const devices = (await admin('GET', `/licenses/${license.id}`)).devices;
  check(devices.length === 1 && devices[0].kind === 'mobile' && devices[0].platform === 'android', 'server registered the phone (kind mobile)');

  console.log('Bank details and an invoice');
  await a.page.getByTestId('tab-settings').click();
  await a.page.getByTestId('settings-bank').click();
  await a.page.getByTestId('bank-upi').fill('nairtraders@okhdfcbank');
  await a.page.getByTestId('bank-name').fill('HDFC Bank');
  await a.page.getByTestId('bank-ifsc').fill('hdfc0001234');
  await a.page.getByTestId('bank-account').fill('50100012345678');
  await a.page.getByTestId('bank-save').click();
  await a.page.getByText('Bank details saved').waitFor();
  await a.page.getByTestId('tab-dashboard').click();
  await a.page.getByTestId('quick-TAX_INVOICE').click();
  await a.page.getByTestId('editor').waitFor();
  await a.page.getByTestId('party-name').fill('ABC Construction Pvt Ltd');
  await a.page.getByTestId('party-gstin').fill('29ABCDE1234F1Z5');
  check((await a.page.getByTestId('party-state').inputValue()) === 'Karnataka' && (await a.page.getByTestId('place-of-supply').inputValue()) === 'Karnataka', 'customer GSTIN → Karnataka, place of supply follows');
  await a.page.getByTestId('item-name-0').fill('Teak Dining Table');
  await a.page.getByTestId('item-qty-0').fill('2');
  await a.page.getByTestId('item-rate-0').fill('25000');
  await a.page.getByTestId('add-item').click();
  await a.page.getByTestId('item-name-1').fill('Delivery & installation');
  await a.page.getByTestId('item-rate-1').fill('1000');
  check((await a.page.getByTestId('total-igst').textContent()).includes('9,180.00'), 'inter-state → IGST 18% (9,180.00)');
  check((await a.page.getByTestId('grand-total').textContent()).includes('60,180.00'), 'grand total 60,180.00');
  await shot(a.page, '02-editor');
  await a.page.getByTestId('save-doc').click();
  await a.page.getByTestId('view').waitFor();
  const doc = await a.page.getByTestId('print-doc').textContent();
  for (const [needle, label] of [
    ['TAX INVOICE', 'title'],
    ['INV-00001', 'number'],
    ['27AAPFU0939F1ZV', 'own GSTIN'],
    ['29ABCDE1234F1Z5', 'customer GSTIN'],
    ['Karnataka (29)', 'place of supply with code'],
    ['IGST', 'IGST'],
    ['Sixty Thousand One Hundred Eighty Rupees Only', 'amount in words'],
    ['HDFC0001234', 'bank details'],
    ['Scan to pay (UPI)', 'UPI QR code'],
  ]) {
    check(doc.includes(needle), `invoice shows ${label}`);
  }
  await a.page.waitForTimeout(300);
  await a.page.screenshot({ path: path.join(siteShots, 'mobile-invoice.png') });
  await a.page.getByTestId('status').click();
  await a.page.getByTestId('status-PAID').click();
  await a.page.getByText('Marked as Paid').waitFor();
  check(true, 'status changed to Paid');

  console.log('Quotation, products, documents');
  await a.page.getByTestId('back').click();
  await a.page.getByTestId('tab-documents').click();
  await a.page.getByTestId('fab').click();
  await a.page.getByTestId('new-QUOTATION').click();
  await a.page.getByTestId('party-name').fill('ABC');
  await a.page.getByText('ABC Construction Pvt Ltd').first().click();
  check((await a.page.getByTestId('party-gstin').inputValue()) === '29ABCDE1234F1Z5', 'saved customer picked from suggestions');
  await a.page.getByTestId('item-name-0').fill('Teak');
  await a.page.locator('.suggest-list').getByText('Teak Dining Table').click();
  check((await a.page.getByTestId('item-rate-0').inputValue()) === '25000', 'saved product picked: rate filled');
  check(!(await a.page.getByTestId('show-bank').isChecked()), 'quotation: "Show bank details" off by default');
  await a.page.getByTestId('save-doc').click();
  await a.page.getByTestId('view').waitFor();
  check(!(await a.page.getByTestId('pd-bank').count()), 'quotation printed without bank details');
  await a.page.getByTestId('back').click();
  await a.page.getByTestId('tab-documents').click();
  await a.page.getByTestId('doc-list').locator('.list-item').nth(1).waitFor();
  check((await a.page.getByTestId('doc-list').locator('.list-item').count()) === 2, 'Documents lists the invoice and the quotation');
  await a.page.getByTestId('doc-search').fill('QTN');
  check((await a.page.getByTestId('doc-list').locator('.list-item').count()) === 1, 'search');
  await a.page.getByTestId('tab-products').click();
  await a.page.getByTestId('product-list').waitFor();
  check((await a.page.getByTestId('product-list').textContent()).includes('Teak Dining Table'), 'items from invoices saved as products');
  await a.page.getByTestId('fab').click();
  await a.page.getByTestId('product-name').fill('Office Chair');
  await a.page.getByTestId('product-rate').fill('4500');
  await a.page.getByTestId('product-save').click();
  await a.page.getByText('Office Chair').waitFor();
  check(true, 'product added from Products & Services');
  await shot(a.page, '03-products');

  console.log('Works offline, no repeated login');
  await a.page.getByTestId('tab-dashboard').click();
  await a.page.getByTestId('dashboard').waitFor();
  await a.page.reload();
  await a.page.getByTestId('dashboard').waitFor();
  check((await a.page.getByTestId('month-sales').textContent()).includes('60,180.00'), 'reopened without logging in; sales this month 60,180.00');
  await a.page.waitForTimeout(400);
  await a.page.screenshot({ path: path.join(siteShots, 'mobile-dashboard.png') });
  await a.context.setOffline(true);
  await a.page.reload();
  await a.page.getByTestId('dashboard').waitFor();
  await a.page.getByTestId('tab-documents').click();
  await a.page.getByTestId('doc-list').locator('.list-item').nth(1).waitFor();
  check((await a.page.getByTestId('doc-list').locator('.list-item').count()) === 2, 'offline: the app opens and the documents are there');
  await a.context.setOffline(false);

  console.log('Phone limit enforced by the server');
  const b = await phone();
  await b.page.goto(`${base}/app/`);
  await b.page.getByTestId('mode-login').click();
  await b.page.getByTestId('login-email').fill('priya@example.com');
  await b.page.getByTestId('login-password').fill('priya-pass-123');
  await b.page.getByTestId('activate').click();
  await b.page.getByTestId('setup').waitFor();
  check(true, 'second phone signs in with email and password');
  const c = await phone();
  await c.page.goto(`${base}/app/`);
  await c.page.getByTestId('license-key').fill(license.code);
  await c.page.getByTestId('activate').click();
  await c.page.getByTestId('activation-error').waitFor();
  check((await c.page.getByTestId('activation-error').textContent()).includes('2 phone'), 'third phone refused: the license allows 2 phones');
  await c.page.evaluate(() => localStorage.setItem('docgen.mobile.license', JSON.stringify({ key: 'FAKE-FAKE-FAKE', expiresAt: '2099-01-01' })));
  await c.page.reload();
  await c.page.getByTestId('activation').waitFor();
  check(await c.page.getByTestId('activation').isVisible(), 'writing a license into local storage does not unlock the app');
  // The first phone signs out → its place is free.
  await a.page.getByTestId('tab-settings').click();
  await a.page.getByTestId('license-signout').click();
  await a.page.getByTestId('confirm-ok').click();
  await a.page.getByTestId('activation').waitFor();
  check(true, 'phone signed out (place freed on the server)');
  await c.page.getByTestId('license-key').fill(license.code);
  await c.page.getByTestId('activate').click();
  await c.page.getByTestId('setup').waitFor();
  check(true, 'another phone can now be activated');

  console.log('License checks');
  await admin('PUT', `/licenses/${license.id}`, { expiresAt: new Date(Date.now() - 86400000).toISOString() });
  await b.page.getByTestId('company-name').fill('Nair Traders');
  await b.page.getByTestId('setup-save').click();
  await b.page.getByTestId('tab-settings').click();
  await b.page.getByTestId('license-check').click();
  await b.page.getByTestId('locked').waitFor();
  check((await b.page.getByTestId('locked').textContent()).includes('expired'), 'expired license (checked with the server) locks the app');
  await shot(b.page, '04-expired');
  await admin('POST', `/licenses/${license.id}/extend`, { days: 365 });
  await b.page.getByTestId('check-again').click();
  await b.page.getByTestId('license-card').waitFor();
  check((await b.page.getByTestId('license-expiry').textContent()).length > 4, 'the new expiry date is shown');
  check(true, 'extended license → "Check again" unlocks');
  const released = (await admin('GET', `/licenses/${license.id}`)).devices.filter((d) => d.kind === 'mobile');
  const bId = await b.page.evaluate(() => localStorage.getItem('docgen.mobile.device'));
  const phoneB = released.find((d) => !d.released_at && d.device_id === bId);
  await admin('POST', `/licenses/${license.id}/devices/${phoneB.id}/release`);
  await b.page.getByTestId('tab-settings').click();
  await b.page.getByTestId('license-check').click();
  await b.page.getByTestId('activation').waitFor();
  check(true, 'a phone removed in the client/admin panel must activate again');

  console.log(`\nAll ${passed} mobile checks passed.`);
} catch (e) {
  console.error('MOBILE E2E FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
