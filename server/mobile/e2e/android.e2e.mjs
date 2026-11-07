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

import { execFileSync, spawn } from 'node:child_process';
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
      if (!/^\d{6}$/.test(a.pin)) return { ok: false, error: 'The PIN must be 6 digits.' };
      const account = { uid: 'firebase-uid-e2e', name: a.name, business: a.business, phone: a.phone, plan: 'free', login: true, synced: true };
      save({ ...state(), account, pin: a.pin, lockOff: false });
      return { ok: true, account };
    },
    // An existing account "in Firebase": 98765 11111 with PIN 111111.
    'account.login': (a) => {
      if (a.phone.replace(/\D/g, '').slice(-10) !== '9876511111' || a.pin !== '111111') return { ok: false, error: 'The mobile number or PIN is not correct.' };
      const account = { uid: 'firebase-uid-login', name: 'Meena Shah', business: 'Meena Stores', phone: '98765 11111', plan: 'free', login: true, synced: true };
      save({ ...state(), account, pin: a.pin, lockOff: false });
      return { ok: true, account };
    },
    'account.upgraded': (a) => {
      const s = state();
      save({ ...s, account: { ...s.account, plan: 'paid' }, upgradedKey: a.licenseKey });
      return { ok: true };
    },
    'pin.get': () => ({ enabled: !!state().pin && !state().lockOff, saved: !!state().pin, digits: 6 }),
    'pin.set': (a) =>
      state().pin && state().pin !== a.current ? { ok: false, error: 'Your current PIN is not correct.' } : (save({ ...state(), pin: a.pin, lockOff: false }), { ok: true }),
    'pin.resume': (a) => (state().pin === a.pin ? (save({ ...state(), lockOff: false }), { ok: true }) : { ok: false, error: 'That PIN is not correct.' }),
    // With an account the PIN stays (it is the login); only the lock goes off.
    'pin.disable': (a) =>
      state().pin === a.pin ? (save(state().account ? { ...state(), lockOff: true } : { ...state(), pin: null }), { ok: true }) : { ok: false, error: 'That PIN is not correct.' },
    'sms.permission': () => ({ granted: true }),
    'sms.send': () => ({ sent: true }),
    open: () => ({ ok: true }),
    'file.save': () => ({ ok: true }),
    'file.share': () => ({ ok: true }),
    screen: () => ({ ok: true }),
    event: () => ({ ok: true }),
    // Rewarded ads: the next answers queued by the test (default: watched to the end).
    'ads.rewarded': () => {
      const s = state();
      const queue = s.rewards || [];
      const next = queue.length ? queue[0] : { rewarded: true };
      save({ ...s, rewards: queue.slice(1) });
      return next;
    },
    'dues.sync': (a) => ({ ok: true, scheduled: a.enabled ? (a.bills || []).length : 0 }),
    // A paired Bluetooth thermal printer.
    'printer.list': () => ({ ok: true, printers: [{ name: 'RPP02N', address: '66:22:7A:1B:2C:3D' }] }),
    'printer.print': (a) => ({ ok: /^[0-9A-F:]{17}$/.test(a.address) && atob(a.base64 || '').charCodeAt(0) === 0x1b }),
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
/** A picture without notices on it (used on the website). */
const cleanShot = async (page, name) => {
  const style = await hideToasts(page);
  await shot(page, name);
  await style?.evaluate((el) => el.remove());
};

/** A backup with `n` invoices and `n` customers (the app's own backup format), for the free plan limits. */
/** Due dates of the first restored invoices, in days from today: two overdue, today, tomorrow, in 3 and in 20 days. */
const DUE_OFFSETS = [-3, -1, 0, 1, 3, 20];
const shiftDay = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function backupWith(n, settings) {
  const t = new Date();
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const parties = Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Customer ${i + 1}`, phone: `98765 4${String(i).padStart(4, '0')}`, kind: 'customer', company_name: '', email: '', address: '', shipping_address: '', state: '', gstin: '', tax_id: '', is_demo: 0, notes: '', archived_at: null, created_at: `${today}T00:00:00Z`, updated_at: `${today}T00:00:00Z` }));
  const documents = Array.from({ length: n }, (_, i) => ({
    id: i + 1, document_type: 'TAX_INVOICE', document_number: `INV-${String(i + 1).padStart(5, '0')}`, status: 'ISSUED', party_id: i + 1, party_name: `Customer ${i + 1}`,
    issue_date: today, due_date: DUE_OFFSETS[i] === undefined ? '' : shiftDay(today, DUE_OFFSETS[i]), currency: 'INR', currency_symbol: '₹', currency_decimals: 2, exchange_rate: '1', tax_mode: 'INTRA', tax_label: 'GST',
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
  await a.page.getByTestId('account-pin').fill('12ab345678');
  check((await a.page.getByTestId('account-pin').inputValue()) === '123456', 'PIN field takes 6 digits only');
  await a.page.getByTestId('account-pin2').fill('123457');
  check(await a.page.getByTestId('account-create').isDisabled(), 'different PINs: cannot create');
  check((await a.page.locator('input[type=password]').count()) === 2 && !(await a.page.getByText('Password', { exact: true }).count()), 'no password, only a PIN');
  await a.page.getByTestId('account-pin2').fill('123456');
  check((await a.page.getByTestId('account-switch').textContent()).includes('Log in'), 'the sign-up form offers "Already have an account? Log in"');
  await shot(a.page, '02-create-account');
  await a.page.getByTestId('account-create').click();
  await a.page.getByTestId('setup').waitFor();
  const created = (await calls(a.page, 'account.create'))[0]?.args;
  check(created?.name === 'Ravi Kumar' && created.business === 'Ravi Traders' && created.pin === '123456', 'account created by the Android app (Firebase) with name, business, mobile and a 6-digit PIN');
  check((await a.page.getByTestId('company-name').inputValue()) === 'Ravi Traders', 'setup starts with the business name of the account');
  for (let i = 0; i < 3; i += 1) await a.page.getByTestId('setup-next').click();
  await a.page.getByTestId('setup-save').click();
  await a.page.getByTestId('dashboard').waitFor();
  const tabs = await a.page.locator('.tabbar button').evaluateAll((els) => els.map((e) => e.dataset.testid));
  check(tabs[0] === 'tab-home' && tabs.at(-1) === 'tab-reports', `Home is the first tab and opens first; Reports is the rightmost tab (${tabs.join(', ')})`);
  check(await a.page.getByTestId('free-chip').isVisible(), 'Home shows "Free plan · Upgrade"');
  check((await a.page.getByTestId('type-cards').locator('.type-card').first().textContent()).includes('Retail Bill'), 'Home: Retail Bill is the first card');
  check((await a.page.getByTestId('install-banner').count()) === 0, 'no "Install app" banner inside the Android app');
  check(
    await a.page.evaluate(() => document.documentElement.classList.contains('docgen-native') && getComputedStyle(document.querySelector('.app-header')).paddingTop === '6px'),
    'no empty band at the top: Android keeps the status bar clear, the page does not add it again',
  );
  const screens = await calls(a.page, 'screen');
  check(screens.some((c) => c.args.path === '/' && c.args.free === true), 'the app tells Android the screen and the free plan (ads only for free users)');
  await cleanShot(a.page, '03-home');

  console.log('Explore first (second phone)');
  const b = await phone();
  await b.page.goto(`${base}/app/`);
  await b.page.getByTestId('welcome-explore').click();
  await b.page.getByTestId('setup').waitFor();
  check(true, 'Explore first: straight to setup, no account needed');
  await b.page.getByTestId('company-name').fill('Explorer Stores');
  for (let i = 0; i < 3; i += 1) await b.page.getByTestId('setup-next').click();
  await b.page.getByTestId('setup-save').click();
  await b.page.getByTestId('dashboard').waitFor();
  await b.page.getByTestId('create-RETAIL_BILL').click();
  await b.page.getByTestId('account-gate').waitFor();
  check((await b.page.getByTestId('editor').count()) === 0 && (await b.page.getByTestId('account-pitch').textContent()).includes('free account'), 'a new document needs the free account first (exploring users see the account form)');
  await shot(b.page, '03b-account-gate');
  await b.page.getByTestId('account-name').fill('Asha');
  await b.page.getByTestId('account-business').fill('Explorer Stores');
  await b.page.getByTestId('account-phone').fill('9876500000');
  await b.page.getByTestId('account-pin').fill('432100');
  await b.page.getByTestId('account-pin2').fill('432100');
  await b.page.getByTestId('account-create').click();
  await b.page.getByTestId('editor').waitFor();
  check(true, 'after the free account is created, the new document opens');
  await b.context.close();

  console.log('Log in (a reinstall or a new phone)');
  const l = await phone();
  await l.page.goto(`${base}/app/`);
  await l.page.getByTestId('welcome-login').click();
  await l.page.getByTestId('login-form').waitFor();
  await l.page.getByTestId('login-phone').fill('98765 11111');
  await l.page.getByTestId('login-pin').fill('999999');
  await l.page.getByTestId('login-submit').click();
  await l.page.getByTestId('login-error').waitFor();
  check((await l.page.getByTestId('login-error').textContent()).includes('not correct'), 'a wrong PIN: "The mobile number or PIN is not correct."');
  await l.page.getByTestId('login-pin').fill('111111');
  await shot(l.page, '02b-login');
  await l.page.getByTestId('login-submit').click();
  await l.page.getByTestId('setup').waitFor();
  check((await l.page.getByTestId('company-name').inputValue()) === 'Meena Stores', 'Log in with mobile number + PIN: the account comes back (business name in setup)');
  await l.context.close();

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
  await a.page.getByTestId('bill-due').scrollIntoViewIfNeeded();
  check((await a.page.getByTestId('bill-whatsapp').count()) === 0, 'no WhatsApp reminder while creating or editing a bill (reminders are sent from the ledger)');
  await cleanShot(a.page, '05-retail-bill-payment');
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
  check((await a.page.locator('.badge, .pill, [data-testid=status-badge]').allTextContents()).some((t) => /Partly paid/.test(t)) || (await a.page.getByTestId('view').textContent()).includes('Partly paid'),
    'Issue on save (on for new Android installs): the bill is issued, and with ₹200 of ₹500 paid it is Partly paid — not a draft');

  console.log('Thermal printer (Bluetooth)');
  await clearCalls(a.page);
  await a.page.getByTestId('print-receipt').click();
  await a.page.getByTestId('receipt-sheet').waitFor();
  check((await a.page.getByTestId('thermal-receipt').textContent()).includes('RB-00001'), 'receipt preview of the retail bill');
  await a.page.getByTestId('receipt-print').click();
  await a.page.getByText('Choose your Bluetooth printer').waitFor();
  await a.page.getByTestId('printer').waitFor();
  check(true, 'no printer chosen yet: Print receipt opens Settings → Printer');
  await a.page.getByTestId('printer-option').first().waitFor();
  await cleanShot(a.page, '11-printer');
  await a.page.getByTestId('printer-option').first().click();
  await a.page.getByText('RPP02N chosen for receipts').waitFor();
  await a.page.getByTestId('printer-paper-80').click();
  await a.page.getByTestId('printer-test').click();
  await a.page.getByText('Test receipt printed').waitFor();
  check((await calls(a.page, 'printer.print')).at(-1).args.address === '66:22:7A:1B:2C:3D', 'Settings → Printer: paired printer chosen, 80 mm paper, test print sent to it');
  await a.page.goBack();
  await a.page.getByTestId('print-receipt').click();
  await a.page.getByTestId('receipt-print').click();
  await a.page.getByText('Receipt printed on RPP02N').waitFor();
  const printed = (await calls(a.page, 'printer.print')).at(-1).args;
  check(printed.address === '66:22:7A:1B:2C:3D' && printed.bytes > 200 && (await a.page.getByTestId('receipt-sheet').textContent()).includes('80 mm'), `the receipt goes straight to the Bluetooth printer (ESC/POS, ${printed.bytes} bytes base64, 80 mm)`);
  await a.page.keyboard.press('Escape');

  console.log('Ledger: Send reminder by SMS (native)');
  await a.page.goto(`${base}/app/#/parties/all`);
  {
    // Payment & Ledger is on; open Walk-in Meena's ledger (saved from the bill).
    const id = await a.page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('docgen-data');
          req.onsuccess = () => {
            const all = req.result.transaction('parties').objectStore('parties').getAll();
            all.onsuccess = () => resolve(all.result.find((p) => p.name === 'Walk-in Meena')?.id);
          };
        }),
    );
    await a.page.goto(`${base}/app/#/party/${id}`);
  }
  await a.page.getByTestId('reminder-section').waitFor();
  await clearCalls(a.page);
  await a.page.getByTestId('reminder-send').click();
  await a.page.getByTestId('reminder-sms').click();
  await a.page.getByText('Reminder sent by SMS').waitFor();
  const smsReminder = (await calls(a.page, 'sms.send'))[0].args;
  check(smsReminder.ask === true, 'Send reminder → SMS asks Android for the SMS permission first when it is not given yet');
  check(smsReminder.phone === '919876543210' && smsReminder.text.includes('₹300.00 is outstanding') && smsReminder.text.includes('Kindly pay at the earliest'), `Send reminder → SMS through the phone's SMS service: "${smsReminder.text.slice(0, 70)}…"`);
  await cleanShot(a.page, '12-ledger');

  console.log('Reports');
  await a.page.goto(`${base}/app/#/reports`);
  await a.page.getByTestId('reports').waitFor();
  await a.page.getByTestId('report-sales').waitFor();
  check((await a.page.getByTestId('report-sales').textContent()).includes('500') && (await a.page.getByTestId('report-sales').textContent()).includes('1 bill'), 'Reports: sales 500 from 1 bill this month');
  check((await a.page.getByTestId('report-in').textContent()).includes('200'), 'Reports: money in 200');
  check((await a.page.getByTestId('report-unpaid').textContent()).includes('300'), 'Reports: customers still owe 300');
  check((await a.page.getByTestId('report-customers').textContent()).includes('Walk-in Meena'), 'Reports: top customers');
  await cleanShot(a.page, '07-reports');
  await a.page.getByTestId('report-period').getByText('Last month').click();
  await a.page.getByTestId('report-sales').getByText('0 bills').waitFor();
  check((await a.page.getByTestId('report-unpaid').textContent()).includes('300'), 'Reports: last month has no sales; what customers owe stays (all time)');

  console.log('Security: PIN lock');
  await a.page.goto(`${base}/app/#/settings/security`);
  await a.page.getByTestId('security').waitFor();
  check(await a.page.getByTestId('pin-toggle').isChecked(), 'PIN lock is on after creating the account');
  await a.page.getByTestId('pin-toggle').click();
  await a.page.getByTestId('pin-current').fill('999999');
  await a.page.getByTestId('pin-save').click();
  await a.page.getByText('That PIN is not correct').waitFor();
  check(await a.page.getByTestId('pin-toggle').isChecked(), 'a wrong PIN cannot switch the lock off');
  await a.page.getByTestId('pin-current').fill('123456');
  await a.page.getByTestId('pin-save').click();
  await a.page.getByText('PIN lock switched off').waitFor();
  check(!(await a.page.getByTestId('pin-toggle').isChecked()) && (await a.page.getByTestId('pin-change').count()) === 1, 'the right PIN switches the lock off; the PIN stays (it is the login)');
  await a.page.getByTestId('pin-toggle').click();
  check((await a.page.getByTestId('pin-1').count()) === 0, 'switching on again only asks for the PIN you have');
  await a.page.getByTestId('pin-current').fill('123456');
  await a.page.getByTestId('pin-save').click();
  await a.page.getByText('PIN lock is on').waitFor();
  await a.page.getByTestId('pin-change').click();
  await a.page.getByTestId('pin-current').fill('123456');
  await a.page.getByTestId('pin-1').fill('654321');
  await a.page.getByTestId('pin-2').fill('654321');
  await a.page.getByTestId('pin-save').click();
  await a.page.getByText('PIN changed').waitFor();
  const changed = (await calls(a.page, 'pin.set')).at(-1).args;
  check(changed.current === '123456' && changed.pin === '654321', 'Change PIN: the current PIN and a new 6-digit PIN (the login changes too)');

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
  console.log('Payments due and due date reminders');
  await clearCalls(a.page);
  await a.page.goto(`${base}/app/#/`);
  await a.page.getByTestId('dues-card').waitFor();
  {
    const card = (await a.page.getByTestId('dues-card').textContent()).replace(/\s+/g, ' ');
    check((await a.page.getByTestId('due-row').count()) === 5 && card.includes('2 overdue') && card.includes('Overdue 3 days') && card.includes('Due today') && card.includes('Due tomorrow') && card.includes('Due in 3 days') && !card.includes('Due in 20 days'),
      'Home: Payments due — the overdue bills and those due this week, soonest first');
    await a.page.waitForFunction(() => JSON.parse(sessionStorage.getItem('__calls') || '[]').some((c) => c.name === 'dues.sync'));
    const sync = (await calls(a.page, 'dues.sync')).at(-1).args;
    check(sync.enabled === true && sync.bills.length === 4 && sync.bills.every((b) => b.amount.includes('1,000') && b.number.startsWith('INV-')),
      'Android gets the bills due from today on, for a notification at 9:30 on each due date (4 bills)');
    await cleanShot(a.page, '10-payments-due');
    await a.page.getByTestId('due-whatsapp').first().click();
    const wa = decodeURIComponent((await calls(a.page, 'open')).at(-1)?.args.url || '');
    check(wa.startsWith('https://wa.me/919876540000?text=') && wa.includes('₹1,000.00') && wa.includes('INV-00001'), 'Payments due: one tap sends the WhatsApp reminder with the amount');
    await a.page.getByTestId('due-row').first().locator('.due-main').click();
    await a.page.getByTestId('share-doc').waitFor();
    check(true, 'tapping a due bill opens it');
  }
  await a.page.goto(`${base}/app/#/settings/parties`);
  await a.page.getByTestId('module-dues-toggle').waitFor();
  check(await a.page.getByTestId('module-dues-toggle').isChecked(), 'Features: Due date reminders on by default');
  await clearCalls(a.page);
  await a.page.getByTestId('module-dues-toggle').click();
  await a.page.getByText('Due date reminders off').waitFor();
  check((await calls(a.page, 'dues.sync')).at(-1).args.enabled === false, 'switching reminders off removes the notifications');
  await a.page.getByTestId('module-dues-toggle').click();
  await a.page.getByText('Due date reminders on').waitFor();
  check((await calls(a.page, 'dues.sync')).at(-1).args.enabled === true, 'and on again');

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
  check(limitText.includes('The free plan includes 20 documents') && (await a.page.getByTestId('confirm-ok').textContent()).includes('Watch ad · +1 document') && (await a.page.getByTestId('confirm-alt').textContent()) === 'See plans',
    'the 21st document offers a rewarded ad (+1 document), See plans or Not now (its new customer would be the 21st too: the bill is not blocked by that)');
  await a.page.waitForTimeout(600); // the sheet slides in
  await cleanShot(a.page, '09-limit');
  // An ad closed early earns nothing.
  await a.page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('__native') || '{}');
    localStorage.setItem('__native', JSON.stringify({ ...s, rewards: [{ rewarded: false, reason: 'Watch the whole ad to get one more document.' }] }));
  });
  await a.page.getByTestId('confirm-ok').click();
  await a.page.getByText('Watch the whole ad to get one more document.').waitFor();
  check((await a.page.getByTestId('editor').count()) === 1, 'an ad closed early: nothing earned, the bill stays open');
  await a.page.getByTestId('save-doc').click();
  await a.page.getByTestId('confirm-ok').click();
  await a.page.getByTestId('share-doc').waitFor();
  check((await calls(a.page, 'ads.rewarded')).length === 2, 'the ad watched to the end: the 21st document is saved straight away');
  await a.page.goto(`${base}/app/#/settings/plan`);
  await a.page.getByTestId('plan-bonus').waitFor();
  check((await a.page.getByTestId('plan-documents').textContent()).includes('21 / 21') && (await a.page.getByTestId('plan-bonus').textContent()).includes('1 document'), 'Plan & Account: 21 / 21, 1 document earned with an ad');
  await a.page.goto(`${base}/app/#/doc/new/TAX_INVOICE`);
  await a.page.getByTestId('editor').waitFor();
  await a.page.getByTestId('party-name').fill('One more');
  await a.page.getByTestId('item-name-0').fill('Item');
  await a.page.getByTestId('item-rate-0').fill('100');
  await a.page.getByTestId('save-doc').click();
  await a.page.getByTestId('confirm-alt').click();
  await a.page.getByTestId('plan').waitFor();
  check(true, 'the 22nd: "See plans" opens Plan & Account');
  await clearCalls(a.page);
  await a.page.getByTestId('plan-upgrade').click();
  const buy = (await calls(a.page, 'open'))[0]?.args.url || '';
  check(buy.startsWith(`${base}/buy?`) && buy.includes('name=Ravi+Kumar') && buy.includes('phone=98765+43210'), 'Upgrade opens the website checkout with the account filled in');

  console.log('Upgrade: activate the license (the data stays on the phone)');
  const { client } = await admin('POST', '/clients', { name: 'Ravi Kumar', email: 'ravi@example.com', password: 'ravi-pass-123', business_name: 'Ravi Traders' });
  const [license] = (await admin('POST', '/licenses', { clientId: client.id, activateNow: true, maxMobileDevices: 1 })).licenses;
  await a.page.getByTestId('plan-have-license').click();
  await a.page.getByTestId('plan-license-key').fill(license.code);
  await a.page.getByTestId('plan-activate').click();
  await a.page.getByText('DocGen is upgraded: no limits and no ads').waitFor({ timeout: 20000 });
  check((await a.page.getByText('Your data stays on this phone').count()) >= 1 && (await a.page.getByTestId('plan-transfer').count()) === 0, 'upgraded: no limits, no ads; nothing is copied online (the data stays on the phone)');
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

  // Pictures for the website (frontend/public/screenshots/android-*.png, AndroidApp.jsx), at phone size.
  for (const [from, to] of [['03-home', 'home'], ['05-retail-bill-payment', 'bill'], ['12-ledger', 'ledger'], ['07-reports', 'reports']]) {
    try {
      execFileSync('convert', [path.join(shots, `android-${from}.png`), '-resize', '50%', '-strip', path.join(siteShots, `android-${to}.png`)]);
    } catch {
      fs.copyFileSync(path.join(shots, `android-${from}.png`), path.join(siteShots, `android-${to}.png`));
    }
  }
  check(fs.existsSync(path.join(siteShots, 'android-reports.png')), 'Android pictures saved for the website');

  console.log(`\nAndroid e2e: ${passed} checks passed`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
