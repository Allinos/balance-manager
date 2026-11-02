/**
 * End-to-end test of DocGen for Android's web side: the mobile web app as it runs inside the Flutter app
 * (android-app/), against a real DocGen server, in phone-sized Chromium. The Flutter side is replaced by a
 * recording bridge (window.flutter_inappwebview.callHandler) so every call the app makes to Android is checked.
 *
 *   cd server && npm run build -w mobile && node mobile/e2e/android.e2e.mjs
 *
 * Covers: first start (Welcome, free account with PIN, no license), Home first and Reports as the last tab,
 * the retail bill without GST, SMS alerts, WhatsApp payment reminders, sharing and saving through Android,
 * Reports, PIN lock settings, the free plan limits (20 documents) and the upgrade that copies the phone's data
 * to the server. Saves the Android screenshots to e2e/screenshots/android-*.png.
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
fs.mkdirSync(shots, { recursive: true });
const port = 8814;
const base = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docgen-android-e2e-'));
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

/**
 * The Flutter side, recorded: account and PIN kept in localStorage (like the phone's secure storage), every call
 * logged in sessionStorage so it survives reloads.
 */
const NATIVE_MOCK = (server) => {
  window.DOCGEN_NATIVE = { platform: 'android', version: '2.5.1', server };
  const state = () => JSON.parse(localStorage.getItem('__native') || '{}');
  const save = (s) => localStorage.setItem('__native', JSON.stringify(s));
  const log = (name, args) => {
    const calls = JSON.parse(sessionStorage.getItem('__calls') || '[]');
    // Files are logged without their contents.
    const { base64, ...rest } = args || {};
    calls.push({ name, args: { ...rest, ...(base64 !== undefined ? { bytes: base64.length } : {}) } });
    sessionStorage.setItem('__calls', JSON.stringify(calls));
  };
  const handlers = {
    'account.get': () => ({ account: state().account || null }),
    'account.create': (a) => {
      if (!/^\d{4}$/.test(a.pin)) return { ok: false, error: 'The PIN must be 4 digits.' };
      const account = { uid: 'firebase-uid-e2e', name: a.name, business: a.business, phone: a.phone, plan: 'free', synced: true };
      save({ ...state(), account, pin: a.pin });
      return { ok: true, account };
    },
    'account.upgraded': (a) => {
      const s = state();
      save({ ...s, account: { ...s.account, plan: 'paid' }, upgradedKey: a.licenseKey });
      return { ok: true };
    },
    'pin.get': () => ({ enabled: !!state().pin }),
    'pin.set': (a) => (save({ ...state(), pin: a.pin }), { ok: true }),
    'pin.disable': (a) => (state().pin === a.pin ? (save({ ...state(), pin: null }), { ok: true }) : { ok: false, error: 'That PIN is not correct.' }),
    'sms.permission': () => ({ granted: true }),
    'sms.send': () => ({ sent: true }),
    open: () => ({ ok: true }),
    'file.save': () => ({ ok: true }),
    'file.share': () => ({ ok: true }),
    screen: () => ({ ok: true }),
    event: () => ({ ok: true }),
  };
  window.flutter_inappwebview = {
    callHandler: async (name, args) => {
      log(name, args);
      const h = handlers[name];
      return h ? h(args || {}) : null;
    },
  };
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36',
};
const phone = async () => {
  const context = await browser.newContext(PHONE);
  await context.addInitScript(NATIVE_MOCK, base);
  const page = await context.newPage();
  page.on('dialog', (d) => d.dismiss());
  page.on('pageerror', (e) => console.error('page error:', e.message));
  return { context, page };
};
const shot = (page, name) => page.screenshot({ path: path.join(shots, `android-${name}.png`) });
const calls = (page, name) => page.evaluate((n) => JSON.parse(sessionStorage.getItem('__calls') || '[]').filter((c) => !n || c.name === n), name);
const clearCalls = (page) => page.evaluate(() => sessionStorage.setItem('__calls', '[]'));
const hideToasts = (page) => page.addStyleTag({ content: '.toast-stack,.toasts,.toast{display:none!important}' }).catch(() => {});

/** A backup with `n` invoices and `n` customers (the app's own backup format), for the free plan limits. */
function backupWith(n, settings) {
  const today = new Date().toISOString().slice(0, 10);
  const parties = Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Customer ${i + 1}`, phone: `98765 4${String(i).padStart(4, '0')}`, kind: 'customer', company_name: '', email: '', address: '', shipping_address: '', state: '', gstin: '', tax_id: '', is_demo: 0, notes: '', archived_at: null, created_at: `${today}T00:00:00Z`, updated_at: `${today}T00:00:00Z` }));
  const documents = Array.from({ length: n }, (_, i) => ({
    id: i + 1, document_type: 'TAX_INVOICE', document_number: `INV-${String(i + 1).padStart(5, '0')}`, status: 'ISSUED', party_id: i + 1, party_name: `Customer ${i + 1}`,
    issue_date: today, due_date: '', currency: 'INR', currency_symbol: '₹', currency_decimals: 2, exchange_rate: '1', tax_mode: 'INTRA', tax_label: 'GST',
    subtotal: '1000', discount: '0', taxable: '1000', tax: '0', cgst: '0', sgst: '0', igst: '0', shipping: '0', other_charges: '0', round_off: '0', grand_total: '1000',
    meta: '{}', is_demo: 0, deleted_at: null, created_at: `${today}T00:00:00Z`, updated_at: `${today}T00:00:00Z`, __items: [{ name: 'Item', quantity: '1', unit_price: '1000', total_amount: '1000' }], __taxes: [],
  }));
  return {
    format: 'docgen-mobile-data', version: 1, exportedAt: new Date().toISOString(),
    stores: { settings: Object.entries(settings), doc_settings: [], company: { name: 'Ravi Traders', upi_id: 'ravi@okaxis' }, sequences: [], categories: [], products: [], parties, documents, history: [], folders: [], files: [], blobs: [] },
  };
}

try {
  console.log('First start: Welcome, free account with a PIN, no license');
  const a = await phone();
  await a.page.goto(`${base}/app/`);
  await a.page.getByTestId('welcome').waitFor();
  check((await a.page.getByTestId('activation').count()) === 0, 'no license screen: the app can be explored at once');
  check((await a.page.getByTestId('welcome').textContent()).includes('Free for 20 documents, 20 payments and 20 customers & vendors'), 'Welcome explains the free plan (20 documents, 20 payments, 20 customers & vendors)');
  await shot(a.page, '01-welcome');
  await a.page.getByTestId('welcome-create').click();
  await a.page.getByTestId('account-name').fill('Ravi Kumar');
  await a.page.getByTestId('account-business').fill('Ravi Traders');
  await a.page.getByTestId('account-phone').fill('98765 43210');
  await a.page.getByTestId('account-pin').fill('12ab34');
  check((await a.page.getByTestId('account-pin').inputValue()) === '1234', 'PIN field takes 4 digits only');
  await a.page.getByTestId('account-pin2').fill('1235');
  check(await a.page.getByTestId('account-create').isDisabled(), 'different PINs: cannot create');
  check((await a.page.locator('input[type=password]').count()) === 2 && !(await a.page.getByText('Password', { exact: true }).count()), 'no password, only a PIN');
  await a.page.getByTestId('account-pin2').fill('1234');
  await shot(a.page, '02-create-account');
  await a.page.getByTestId('account-create').click();
  await a.page.getByTestId('setup').waitFor();
  const created = (await calls(a.page, 'account.create'))[0]?.args;
  check(created?.name === 'Ravi Kumar' && created.business === 'Ravi Traders' && created.pin === '1234', 'account created by the Android app (Firebase) with name, business, mobile and PIN');
  check((await a.page.getByTestId('company-name').inputValue()) === 'Ravi Traders', 'setup starts with the business name of the account');
  for (let i = 0; i < 3; i += 1) await a.page.getByTestId('setup-next').click();
  await a.page.getByTestId('setup-save').click();
  await a.page.getByTestId('dashboard').waitFor();
  const tabs = await a.page.locator('.tabbar button').evaluateAll((els) => els.map((e) => e.dataset.testid));
  check(tabs[0] === 'tab-home' && tabs.at(-1) === 'tab-reports', `Home is the first tab and opens first; Reports is the rightmost tab (${tabs.join(', ')})`);
  check(await a.page.getByTestId('free-chip').isVisible(), 'Home shows "Free plan · Upgrade"');
  check((await a.page.getByTestId('type-cards').locator('.type-card').first().textContent()).includes('Retail Bill'), 'Home: Retail Bill is the first card');
  check((await a.page.getByTestId('install-banner').count()) === 0, 'no "Install app" banner inside the Android app');
  const screens = await calls(a.page, 'screen');
  check(screens.some((c) => c.args.path === '/' && c.args.free === true), 'the app tells Android the screen and the free plan (ad banner on lists)');
  await shot(a.page, '03-home');

  console.log('Explore first (second phone)');
  const b = await phone();
  await b.page.goto(`${base}/app/`);
  await b.page.getByTestId('welcome-explore').click();
  await b.page.getByTestId('setup').waitFor();
  check(true, 'Explore first: straight to setup, no account needed');
  await b.context.close();

  console.log('Settings: Features (Payment & Ledger, SMS alerts)');
  await a.page.getByTestId('tab-settings').click();
  await a.page.getByTestId('settings-plan').waitFor();
  const sections = await a.page.locator('[data-testid^=settings-]').evaluateAll((els) => els.map((e) => e.dataset.testid));
  check(sections.includes('settings-plan') && sections.includes('settings-security') && !sections.includes('settings-license'), 'Settings: Plan & Account and Security instead of License');
  await a.page.getByTestId('settings-parties').click();
  await a.page.getByTestId('module-ledger-toggle').check();
  await a.page.getByTestId('module-sms-toggle').check();
  await a.page.getByText('SMS alerts on').waitFor();
  check((await calls(a.page, 'sms.permission')).length === 1, 'switching SMS alerts on asks Android for the SMS permission');
  await shot(a.page, '04-features');

  console.log('Retail bill without GST, payment, WhatsApp reminder, SMS');
  await clearCalls(a.page);
  await a.page.goto(`${base}/app/#/`);
  await a.page.getByTestId('create-RETAIL_BILL').click();
  await a.page.getByTestId('editor').waitFor();
  await a.page.waitForFunction(() => document.querySelector('[data-testid=doc-number]')?.placeholder === 'RB-00001');
  check(true, 'Retail Bill numbered RB-00001');
  await a.page.getByTestId('party-name').fill('Walk-in Meena');
  await a.page.getByTestId('party-phone').fill('98765 43210');
  await a.page.getByTestId('item-name-0').fill('Basmati Rice 5kg');
  await a.page.getByTestId('item-qty-0').fill('2');
  await a.page.getByTestId('item-rate-0').fill('250');
  check((await a.page.getByTestId('grand-total').textContent()).includes('500.00'), 'no GST on a retail bill: 2 × 250 = 500.00');
  check((await a.page.getByTestId('total-igst').count()) === 0 && (await a.page.getByTestId('total-cgst').count()) === 0, 'no tax lines');
  await a.page.getByTestId('bill-payment-kind').getByText('Partial').click();
  await a.page.getByTestId('bill-payment-amount-0').fill('200');
  check((await a.page.getByTestId('bill-due').textContent()).includes('300'), 'partly paid: 300 due');
  await a.page.getByTestId('bill-whatsapp').scrollIntoViewIfNeeded();
  await shot(a.page, '05-retail-bill-payment');
  await a.page.getByTestId('bill-whatsapp').click();
  const wa = (await calls(a.page, 'open')).at(-1)?.args.url || '';
  check(wa.startsWith('https://wa.me/919876543210?text=') && decodeURIComponent(wa).includes('₹300'), 'WhatsApp reminder to +91 98765 43210 with the outstanding ₹300');
  check(decodeURIComponent(wa).includes('Ravi Traders'), 'reminder signed with the business name');
  await a.page.getByTestId('save-doc').click();
  await a.page.getByTestId('share-doc').waitFor();
  await a.page.waitForFunction(() => JSON.parse(sessionStorage.getItem('__calls') || '[]').some((c) => c.name === 'sms.send'));
  const sms = (await calls(a.page, 'sms.send'))[0].args;
  check(sms.phone === '919876543210' && sms.text.includes('Retail Bill RB-00001') && sms.text.includes('Balance due: ₹300') && sms.text.endsWith('- Ravi Traders'), `SMS alert sent through the phone: "${sms.text}"`);
  check((await calls(a.page, 'event')).some((c) => c.args.name === 'doc_saved'), 'a saved bill is reported (rare full-screen ad for free users)');
  check((await a.page.locator('.doc-retail').count()) > 0, 'retail bill printed in the Retail template');
  check(!(await a.page.locator('.doc').first().textContent()).includes('GSTIN'), 'no GST details on the retail bill');
  const hidden = await hideToasts(a.page);
  await shot(a.page, '06-retail-bill');
  await hidden?.evaluate((el) => el.remove());
  await a.page.getByTestId('share-doc').click();
  await a.page.waitForFunction(() => JSON.parse(sessionStorage.getItem('__calls') || '[]').some((c) => c.name === 'file.share'));
  const shared = (await calls(a.page, 'file.share'))[0].args;
  check(shared.mime === 'application/pdf' && shared.name.startsWith('RB-00001') && shared.bytes > 1000, `retail bill shared directly as a PDF through Android (${shared.name})`);
  await a.page.getByTestId('download-pdf').click();
  await a.page.waitForFunction(() => JSON.parse(sessionStorage.getItem('__calls') || '[]').some((c) => c.name === 'file.save'));
  check(true, 'Download saves the PDF to Downloads through Android');
  check(await a.page.getByTestId('doc-whatsapp').isVisible(), 'WhatsApp payment reminder on the unpaid bill');

  console.log('Reports');
  await a.page.goto(`${base}/app/#/reports`);
  await a.page.getByTestId('reports').waitFor();
  await a.page.getByTestId('report-sales').waitFor();
  check((await a.page.getByTestId('report-sales').textContent()).includes('500') && (await a.page.getByTestId('report-sales').textContent()).includes('1 bill'), 'Reports: sales 500 from 1 bill this month');
  check((await a.page.getByTestId('report-in').textContent()).includes('200'), 'Reports: money in 200');
  check((await a.page.getByTestId('report-unpaid').textContent()).includes('300'), 'Reports: customers still owe 300');
  check((await a.page.getByTestId('report-customers').textContent()).includes('Walk-in Meena'), 'Reports: top customers');
  await shot(a.page, '07-reports');
  await a.page.getByTestId('report-period').getByText('Last month').click();
  await a.page.getByTestId('report-sales').getByText('0 bills').waitFor();
  check((await a.page.getByTestId('report-unpaid').textContent()).includes('300'), 'Reports: last month has no sales; what customers owe stays (all time)');

  console.log('Security: PIN lock');
  await a.page.goto(`${base}/app/#/settings/security`);
  await a.page.getByTestId('security').waitFor();
  check(await a.page.getByTestId('pin-toggle').isChecked(), 'PIN lock is on after creating the account');
  await a.page.getByTestId('pin-toggle').click();
  await a.page.getByTestId('pin-1').fill('9999');
  await a.page.getByTestId('pin-save').click();
  await a.page.getByText('That PIN is not correct').waitFor();
  check(await a.page.getByTestId('pin-toggle').isChecked(), 'a wrong PIN cannot switch the lock off');
  await a.page.getByTestId('pin-1').fill('1234');
  await a.page.getByTestId('pin-save').click();
  await a.page.getByText('PIN lock switched off').waitFor();
  check(!(await a.page.getByTestId('pin-toggle').isChecked()), 'the right PIN switches the lock off');
  await a.page.getByTestId('pin-toggle').click();
  await a.page.getByTestId('pin-1').fill('4321');
  await a.page.getByTestId('pin-2').fill('4321');
  await a.page.getByTestId('pin-save').click();
  await a.page.getByText('PIN lock is on').waitFor();
  check((await calls(a.page, 'pin.set')).at(-1).args.pin === '4321', 'PIN lock switched on again with a new PIN');

  console.log('Free plan limits');
  const settings = await a.page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('docgen-data');
        req.onsuccess = () => {
          const tx = req.result.transaction('settings');
          const store = tx.objectStore('settings');
          const keys = store.getAllKeys();
          const values = store.getAll();
          tx.oncomplete = () => resolve(Object.fromEntries(keys.result.map((k, i) => [k, values.result[i]])));
        };
      }),
  );
  check(settings.androidWelcome === true && settings.setupComplete, 'settings stored on the phone');
  const backupFile = path.join(dataDir, 'twenty.json');
  fs.writeFileSync(backupFile, JSON.stringify(backupWith(20, settings)));
  await a.page.goto(`${base}/app/#/settings/backup`);
  await a.page.getByTestId('restore').click();
  await a.page.getByTestId('confirm-ok').click();
  const [chooser] = await Promise.all([a.page.waitForEvent('filechooser'), a.page.getByTestId('restore-choose').click()]);
  await chooser.setFiles(backupFile);
  await a.page.getByText('Backup restored').waitFor();
  await a.page.goto(`${base}/app/#/settings/plan`);
  await a.page.getByTestId('plan-documents').waitFor();
  check((await a.page.getByTestId('plan-documents').textContent()).includes('20 / 20'), 'Plan & Account: 20 / 20 documents used');
  check((await a.page.getByTestId('plan-parties').textContent()).includes('20 / 20'), 'Plan & Account: 20 / 20 customers & vendors used');
  check((await a.page.getByTestId('plan-payments').textContent()).includes('0 / 20'), 'Plan & Account: 0 / 20 payments used');
  check((await a.page.getByTestId('plan-account-name').textContent()) === 'Ravi Kumar', 'the free account is shown');
  await shot(a.page, '08-plan');
  await a.page.goto(`${base}/app/#/doc/new/TAX_INVOICE`);
  await a.page.getByTestId('editor').waitFor();
  await a.page.getByTestId('party-name').fill('One more');
  await a.page.getByTestId('item-name-0').fill('Item');
  await a.page.getByTestId('item-rate-0').fill('100');
  await a.page.getByTestId('save-doc').click();
  await a.page.getByText('Free plan limit reached').waitFor();
  const limitText = await a.page.getByTestId('confirm').textContent();
  check(limitText.includes('The free plan includes 20 documents'), 'the 21st document asks to upgrade (its new customer would be the 21st too: the bill is not blocked by that)');
  await shot(a.page, '09-limit');
  await a.page.getByTestId('confirm-ok').click();
  await a.page.getByTestId('plan').waitFor();
  check(true, '"See plans" opens Plan & Account');
  await clearCalls(a.page);
  await a.page.getByTestId('plan-upgrade').click();
  const buy = (await calls(a.page, 'open'))[0]?.args.url || '';
  check(buy.startsWith(`${base}/buy?`) && buy.includes('name=Ravi+Kumar') && buy.includes('phone=98765+43210'), 'Upgrade opens the website checkout with the account filled in');

  console.log('Upgrade: activate the license, data copied to the server');
  const { client } = await admin('POST', '/clients', { name: 'Ravi Kumar', email: 'ravi@example.com', password: 'ravi-pass-123', business_name: 'Ravi Traders' });
  const [license] = (await admin('POST', '/licenses', { clientId: client.id, activateNow: true, maxMobileDevices: 1 })).licenses;
  await a.page.getByTestId('plan-have-license').click();
  await a.page.getByTestId('plan-license-key').fill(license.code);
  await a.page.getByTestId('plan-activate').click();
  await a.page.getByText('Your data is safe in your DocGen account').waitFor({ timeout: 20000 });
  const toast = await a.page.getByText('Your data is safe in your DocGen account').textContent();
  check(toast.includes('20 documents') && toast.includes('20 customers & vendors'), `phone data copied to the server: ${toast}`);
  check((await calls(a.page, 'account.upgraded'))[0]?.args.licenseKey === license.code, 'the account is marked as upgraded (Firebase)');
  await a.page.getByTestId('license-card').waitFor();
  check(true, 'Plan & Account now shows the license');
  await a.page.goto(`${base}/app/#/`);
  await a.page.getByTestId('dashboard').waitFor();
  const lastScreen = (await calls(a.page, 'screen')).at(-1).args;
  check(lastScreen.free === false, 'licensed: Android is told to show no ads');
  check((await a.page.getByTestId('free-chip').count()) === 0, 'no free plan chip after the upgrade');
  await a.page.goto(`${base}/app/#/doc/new/TAX_INVOICE`);
  await a.page.getByTestId('editor').waitFor();
  await a.page.getByTestId('party-name').fill('After upgrade');
  await a.page.getByTestId('item-name-0').fill('Item');
  await a.page.getByTestId('item-rate-0').fill('100');
  await a.page.getByTestId('save-doc').click();
  await a.page.getByTestId('share-doc').waitFor();
  check(true, 'no limits after the upgrade (21st invoice saved)');

  console.log(`\nAndroid e2e: ${passed} checks passed`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
