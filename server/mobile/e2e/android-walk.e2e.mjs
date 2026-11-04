/**
 * A walk through DocGen for Android as a new shop owner, on a small phone (360 × 740): Explore first → setup →
 * Customers & Vendors and Payment & Ledger on → an invoice on credit due in 3 days → Home → Payments due shows it →
 * the customer pays (Payment received) → it leaves Payments due → every main screen.
 * On each screen it fails on page errors, console errors, a page that scrolls sideways or bottom tabs cut off.
 * Screenshots: e2e/screenshots/android-ux-*.png.     cd server && npm run test:android
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
const port = 8815;
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
    // Rewarded ads: the next answers queued by the test (default: watched to the end).
    'ads.rewarded': () => {
      const s = state();
      const queue = s.rewards || [];
      const next = queue.length ? queue[0] : { rewarded: true };
      save({ ...s, rewards: queue.slice(1) });
      return next;
    },
    'dues.sync': (a) => ({ ok: true, scheduled: a.enabled ? (a.bills || []).length : 0 }),
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
  viewport: { width: 360, height: 740 },
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


const issues = [];
const overflow = async (page, where) => {
  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: window.innerWidth, wide: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(e).position !== 'fixed').slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`) }));
  if (w.doc > w.view + 1) issues.push(`${where}: page scrolls sideways (${w.doc}px > ${w.view}px) ${w.wide.join(', ')}`);
};
const step = async (page, name) => {
  await page.waitForTimeout(350);
  await overflow(page, name);
  const cut = await page.evaluate(() => [...document.querySelectorAll('.tabbar button')].filter((b) => b.getBoundingClientRect().right > window.innerWidth + 1).map((b) => b.textContent));
  if (cut.length) issues.push(`${name}: bottom tabs cut off: ${cut.join(', ')}`);
  await shot(page, name);
};
try {
  const { page, context } = await phone();
  page.on('console', (m) => m.type() === 'error' && issues.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => issues.push(`page error: ${e.message}`));
  await page.goto(`${base}/app/`);
  await page.getByTestId('welcome').waitFor();
  await step(page, 'ux-01-welcome');
  await page.getByTestId('welcome-explore').click();
  await page.getByTestId('setup').waitFor();
  await page.getByTestId('company-name').fill('Sri Lakshmi Stores');
  await step(page, 'ux-02-setup');
  for (let i = 0; i < 3; i += 1) await page.getByTestId('setup-next').click();
  await page.getByTestId('setup-save').click();
  await page.getByTestId('dashboard').waitFor();
  await step(page, 'ux-03-home-empty');
  // Switch on Customers & Vendors and Payment & Ledger like a shop owner would.
  await page.goto(`${base}/app/#/settings/parties`);
  await page.getByTestId('module-parties-toggle').check();
  await page.getByTestId('module-ledger-toggle').check();
  await step(page, 'ux-04-features');
  // An invoice on credit, due in 3 days.
  await page.goto(`${base}/app/#/doc/new/TAX_INVOICE`);
  await page.getByTestId('editor').waitFor();
  await page.getByTestId('party-name').fill('Kumar Hardware');
  await page.getByTestId('party-phone').fill('98450 22222');
  await page.getByTestId('item-name-0').fill('PVC pipe 2"');
  await page.getByTestId('item-qty-0').fill('10');
  await page.getByTestId('item-rate-0').fill('180');
  const term = page.getByTestId('doc-due-term');
  if (await term.count()) await term.selectOption({ index: 0 }).catch(() => {});
  const due = new Date(Date.now() + 3 * 864e5);
  const dueIso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
  await page.getByTestId('doc-due').fill(dueIso).catch((e) => issues.push(`due date field: ${e.message.split('\n')[0]}`));
  await page.getByTestId('bill-payment-kind').getByText('Credit').click();
  await step(page, 'ux-05-invoice-credit');
  await page.getByTestId('save-doc').click();
  await page.getByTestId('share-doc').waitFor();
  await step(page, 'ux-06-invoice-view');
  await page.goto(`${base}/app/#/`);
  await page.getByTestId('dashboard').waitFor();
  await page.waitForTimeout(500);
  const card = (await page.getByTestId('dues-card').count()) ? await page.getByTestId('dues-card').textContent() : '';
  if (!card.includes('Kumar Hardware') || !card.includes('Due in 3 days')) issues.push(`Home: the credit invoice due in 3 days is not in Payments due (${card || 'no card'})`);
  await step(page, 'ux-07-home-due');
  // The customer pays: Customers → Kumar Hardware → Payment received.
  await page.goto(`${base}/app/#/parties/all`);
  await page.getByTestId('party-row').first().waitFor();
  await step(page, 'ux-08-parties');
  await page.getByTestId('party-row').first().locator('.list-main, button').first().click();
  await page.getByTestId('party-ledger').waitFor();
  await step(page, 'ux-09-ledger');
  await page.getByTestId('ledger-received').click();
  await page.getByTestId('entry-amount').fill('2124');
  await page.getByTestId('entry-mode-UPI').click();
  await step(page, 'ux-10-payment');
  await page.getByTestId('entry-save').click();
  await page.waitForTimeout(800);
  await page.goto(`${base}/app/#/`);
  await page.getByTestId('dashboard').waitFor();
  await page.waitForTimeout(600);
  const after = (await page.getByTestId('dues-card').count()) ? await page.getByTestId('dues-card').textContent() : '';
  if (after.includes('Kumar Hardware')) issues.push(`Home: the bill is still in Payments due after the customer paid in full (${after})`);
  await step(page, 'ux-11-home-paid');
  // A vendor: Received = goods bought without a bill (I'll give), Given = Payment made, which settles it.
  await page.goto(`${base}/app/#/parties/all`);
  await page.getByTestId('add-party').click();
  await page.getByTestId('party-kind').getByText('Vendor').click();
  await page.getByTestId('party-form-name').fill('Balaji Pipes');
  await page.getByTestId('party-form-save').click();
  await page.getByTestId('party-list').getByText('Balaji Pipes').click();
  await page.getByTestId('party-ledger').waitFor();
  await page.getByTestId('ledger-received').click();
  if ((await page.getByTestId('entry-reason-goods').textContent()) !== 'Goods bought (no bill)') issues.push('vendor: Received does not offer "Goods bought (no bill)" first');
  await page.getByTestId('entry-amount').fill('2000');
  await page.getByTestId('entry-save').click();
  await page.getByTestId('entry-sheet').waitFor({ state: 'detached' });
  const owe = await page.getByTestId('party-balance').textContent();
  if (!owe.includes("I'll give") || !owe.includes('2,000')) issues.push(`vendor: after goods bought the balance is not "I'll give ₹2,000" (${owe})`);
  if (await page.getByTestId('reminder-section').count()) issues.push('vendor: a payment reminder is offered while you owe the vendor');
  await step(page, 'ux-12-vendor');
  await page.getByTestId('ledger-given').click();
  if ((await page.getByTestId('entry-reason-payment').getAttribute('aria-checked')) !== 'true') issues.push('vendor: Given does not start with "Payment made"');
  await page.getByTestId('entry-amount').fill('2000');
  await page.getByTestId('entry-save').click();
  await page.getByTestId('entry-sheet').waitFor({ state: 'detached' });
  await page.waitForTimeout(400);
  const settled = await page.getByTestId('party-balance').textContent();
  if (!settled.includes('Settled')) issues.push(`vendor: Payment made of ₹2,000 does not settle (${settled})`);
  for (const [p, n] of [['/documents', 'ux-12-documents'], ['/reports', 'ux-13-reports'], ['/products', 'ux-14-products'], ['/settings', 'ux-15-settings'], ['/settings/plan', 'ux-16-plan'], ['/settings/security', 'ux-17-security'], ['/settings/printer', 'ux-18-printer']]) {
    await page.goto(`${base}/app/#${p}`);
    await page.waitForTimeout(700);
    await step(page, n);
  }
  if (issues.length) throw new Error(`issues found:\n- ${[...new Set(issues)].join('\n- ')}`);
  console.log('Android walk-through (360 px phone): no issues on 19 screens');
} catch (e) {
  console.error(`ANDROID WALK FAILED: ${e.message}`);
  if (issues.length && !e.message.startsWith('issues found')) console.error(`issues so far:\n- ${[...new Set(issues)].join('\n- ')}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
