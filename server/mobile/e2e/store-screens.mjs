/**
 * Google Play screenshots: drives the real Android web app (with the Flutter side mocked, as in android.e2e.mjs)
 * through a sample shop — invoices with GST, a customer on credit, a payment received — and saves clean screens
 * (no notices) to android-app/store/raw/. android-app/store/tool/compose.mjs puts them in phone frames.
 *     cd server && node mobile/e2e/store-screens.mjs
 * Sample businesses and people are made up.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '../../../android-app/store/raw');
fs.mkdirSync(out, { recursive: true });
const port = 8817;
const base = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docgen-store-'));

const server = spawn('node', [path.join(here, '../../backend/src/index.js')], {
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, PORTAL_URL: base, ADMIN_EMAIL: 'owner@docgen.test', ADMIN_PASSWORD: 'owner-password-1', ENABLE_MOCK_PAYMENTS: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => d.toString().includes('listening') && resolve());
  setTimeout(() => reject(new Error('server did not start')), 15000);
});

const NATIVE_MOCK = (srv) => {
  window.DOCGEN_NATIVE = { platform: 'android', version: '2.5.2', server: srv };
  const state = () => JSON.parse(localStorage.getItem('__native') || '{}');
  const save = (s) => localStorage.setItem('__native', JSON.stringify(s));
  const handlers = {
    'account.get': () => ({ account: state().account || null }),
    'account.create': (a) => {
      const account = { uid: 'store-uid', name: a.name, business: a.business, phone: a.phone, plan: 'free', login: true, synced: true };
      save({ ...state(), account, pin: a.pin });
      return { ok: true, account };
    },
    'pin.get': () => ({ enabled: !!state().pin, saved: !!state().pin, digits: 6 }),
    'sms.permission': () => ({ granted: true }),
    'sms.send': () => ({ sent: true }),
    'dues.sync': () => ({ ok: true, scheduled: 0 }),
  };
  window.flutter_inappwebview = { callHandler: async (name, args) => (handlers[name] ? handlers[name](args || {}) : { ok: true }) };
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 392, height: 800 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36',
});
await context.addInitScript(NATIVE_MOCK, base);
const page = await context.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
page.on('dialog', (d) => d.dismiss());

const CLEAN = '.toast-stack,.toasts,.toast,[data-testid="toast"],[data-testid="install-banner"]{display:none!important}';
const shot = async (name) => {
  await page.addStyleTag({ content: CLEAN });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log(`  saved ${name}.png`);
};
const day = (n) => {
  const d = new Date(Date.now() + n * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A tax invoice through the editor. `paid`: 'credit' (with a due date) or 'full'. */
async function invoice({ party, phone, items, due, paid }, screenshot) {
  await page.goto(`${base}/app/#/doc/new/TAX_INVOICE`);
  await page.getByTestId('editor').waitFor();
  await page.getByTestId('party-name').fill(party);
  await page.keyboard.press('Escape').catch(() => {});
  await page.getByTestId('party-phone').fill(phone);
  for (let i = 0; i < items.length; i += 1) {
    if (i > 0) await page.getByTestId('add-item').click();
    await page.getByTestId(`item-name-${i}`).fill(items[i][0]);
    await page.keyboard.press('Escape').catch(() => {});
    await page.getByTestId(`item-qty-${i}`).fill(String(items[i][1]));
    await page.getByTestId(`item-rate-${i}`).fill(String(items[i][2]));
  }
  if (paid === 'credit') {
    await page.getByTestId('doc-due').fill(day(due)).catch(() => {});
    await page.getByTestId('bill-payment-kind').getByText('Credit').click();
  }
  if (screenshot) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(screenshot);
  }
  await page.getByTestId('save-doc').click();
  await page.getByTestId('share-doc').waitFor();
}

try {
  await page.goto(`${base}/app/`);
  await page.getByTestId('welcome').waitFor();
  await shot('01-welcome');
  await page.getByTestId('welcome-explore').click();
  await page.getByTestId('setup').waitFor();
  await page.getByTestId('company-name').fill('Sharma Electricals');
  for (let i = 0; i < 3; i += 1) await page.getByTestId('setup-next').click();
  await page.getByTestId('setup-save').click();
  await page.getByTestId('dashboard').waitFor();
  await page.goto(`${base}/app/#/settings/parties`);
  await page.getByTestId('module-parties-toggle').check();
  await page.getByTestId('module-ledger-toggle').check();

  // The free account comes before the first document.
  await page.goto(`${base}/app/#/doc/new/TAX_INVOICE`);
  await page.getByTestId('account-gate').waitFor();
  await page.getByTestId('account-name').fill('Rakesh Sharma');
  await page.getByTestId('account-business').fill('Sharma Electricals');
  await page.getByTestId('account-phone').fill('9812345670');
  await page.getByTestId('account-pin').fill('135790');
  await page.getByTestId('account-pin2').fill('135790');
  await page.getByTestId('account-create').click();
  await page.getByTestId('editor').waitFor();

  await invoice({ party: 'Mehta Constructions', phone: '98250 11223', items: [['MCB 32A double pole', 20, 240], ['Copper wire 1.5 mm (90 m)', 10, 1450]], due: -2, paid: 'credit' });
  await invoice({ party: 'Patel Kirana Store', phone: '99090 44556', items: [['Extension board 4 socket', 6, 320]], paid: 'full' });
  await invoice({ party: 'Verma Hotel', phone: '97230 77881', items: [['Exhaust fan 12 inch', 3, 1650]], due: 1, paid: 'credit' });
  await invoice(
    { party: 'Gupta Traders', phone: '98989 12345', items: [['LED bulb 9W', 50, 85], ['Ceiling fan 1200 mm', 4, 2150], ['Modular switch 6A', 30, 45]], due: 7, paid: 'credit' },
    '02-invoice-editor',
  );
  await page.getByTestId('view').waitFor();
  await page.waitForTimeout(1200);
  await shot('03-invoice-view');

  // Gupta Traders pays part by UPI.
  await page.goto(`${base}/app/#/parties/all`);
  await page.getByTestId('party-row').first().waitFor();
  await page.getByTestId('party-list').getByText('Gupta Traders').click();
  await page.getByTestId('party-ledger').waitFor();
  await page.getByTestId('ledger-received').click();
  await page.getByTestId('entry-amount').fill('8000');
  await page.getByTestId('entry-mode-UPI').click();
  await page.getByTestId('entry-save').click();
  await page.getByTestId('entry-sheet').waitFor({ state: 'detached' });
  await page.waitForTimeout(600);
  await shot('04-ledger');

  await page.goto(`${base}/app/#/`);
  await page.getByTestId('dashboard').waitFor();
  await page.waitForTimeout(800);
  await shot('05-home');

  await page.goto(`${base}/app/#/parties/all`);
  await page.getByTestId('party-row').first().waitFor();
  await shot('06-parties');

  await page.goto(`${base}/app/#/reports`);
  await page.waitForTimeout(900);
  await shot('07-reports');

  await page.goto(`${base}/app/#/documents`);
  await page.waitForTimeout(900);
  await shot('08-documents');
  console.log(`Screens saved to ${out}`);
} catch (e) {
  console.error(`STORE SCREENS FAILED: ${e.message}`);
  await page.screenshot({ path: path.join(out, '_error.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
