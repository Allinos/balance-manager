/**
 * Browser end-to-end test of DocGen Mobile (the installable web app at /app/) against a real
 * DocGen server on a temporary SQLite database, in phone-sized Chromium (Pixel-like, touch).
 *
 *   cd server && npm run build && npm run test:mobile
 *
 * Covers the desktop features on the phone: setup, documents of every kind in the 4 templates, numbering, statuses,
 * convert / duplicate / cancel / delete / restore, sales CSV, products & categories, settings, backup,
 * licensing (phone limit, expiry, removed phone) and data from the first mobile version.
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
const TEMPLATE_LABELS = { 'tally-pro': 'Professional', 'tally-std': 'Standard', modern: 'Modern', simple: 'Simple' };
/** Choose an option in a picker (searchable list in a bottom sheet). */
async function pick(page, testId, label) {
  await page.getByTestId(testId).click();
  const sheet = page.getByTestId(`${testId}-sheet`);
  await sheet.waitFor();
  const search = sheet.getByTestId(`${testId}-search`);
  if (await search.count()) await search.fill(label);
  await sheet.locator('.picker-option', { hasText: label }).first().click();
  await sheet.waitFor({ state: 'detached' });
}

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

  console.log('Activation and setup');
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
  check((await a.page.getByTestId('company-state').textContent()).includes('Maharashtra'), 'GSTIN fills the state');
  await a.page.getByTestId('setup-next').click();
  await a.page.getByTestId('business-trading').click();
  await a.page.getByTestId('setup-next').click();
  check((await a.page.getByTestId('tax-GST').getAttribute('class')).includes('active'), 'setup: GST is selected for INR');
  await a.page.getByTestId('tax-VAT').click();
  await a.page.getByTestId('setup-tax-rate').fill('5');
  check((await a.page.getByTestId('sample-preview').count()) === 0, 'setup: no invoice on the tax step');
  await a.page.getByTestId('tax-GST').click();
  await shot(a.page, '02-setup-tax');
  await a.page.getByTestId('setup-next').click();
  check((await a.page.getByTestId('template-tally-pro').getAttribute('class')).includes('active'), 'setup: template step, Professional selected for GST');
  await a.page.getByTestId('template-modern').click();
  await a.page.getByTestId('sample-preview').locator('.doc-modern').waitFor();
  await a.page.getByTestId('template-tally-pro').click();
  await a.page.getByTestId('sample-preview').locator('.doc-tp').waitFor();
  check(true, 'setup: business type, currency, tax name, then the template with a live sample invoice');
  await shot(a.page, '02-setup-template');
  await a.page.getByTestId('setup-save').click();
  await a.page.getByTestId('dashboard').waitFor();
  check(/Licensed · 36[56] days left/.test(await a.page.getByTestId('license-chip').textContent()), 'dashboard shows the license validity');
  check((await a.page.getByTestId('type-cards').locator('.type-card').count()) === 8, 'dashboard: 8 document-type cards for a trading business');
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

  console.log('Settings → Company');
  await a.page.getByTestId('tab-settings').click();
  await a.page.getByTestId('settings-company').click();
  await a.page.getByTestId('company-address').fill('14, Shivaji Road\nPune 411001');
  await a.page.getByTestId('company-phone').fill('98220 12345');
  await a.page.getByTestId('company-upi').fill('nairtraders@okhdfcbank');
  await a.page.getByTestId('company-bank-name').fill('HDFC Bank');
  await a.page.getByTestId('company-ifsc').fill('hdfc0001234');
  await a.page.getByTestId('company-account-number').fill('50100012345678');
  const [logoChooser] = await Promise.all([a.page.waitForEvent('filechooser'), a.page.getByTestId('logo-pick').click()]);
  await logoChooser.setFiles(path.join(here, '../public/icons/icon-192.png'));
  await a.page.getByTestId('settings-company').locator('.image-picker-box img').first().waitFor();
  check(true, 'logo chosen from the phone');
  await a.page.getByTestId('settings-save').click();
  await a.page.getByText('Company details saved').waitFor();
  check(true, 'company address, bank details, UPI and logo saved');

  console.log('Tax invoice');
  await a.page.getByTestId('back').click();
  await a.page.getByTestId('tab-dashboard').click();
  await a.page.getByTestId('create-TAX_INVOICE').click();
  await a.page.getByTestId('editor').waitFor();
  await a.page.waitForFunction(() => document.querySelector('[data-testid=doc-number]')?.placeholder === 'INV-00001');
  await shot(a.page, '03a-editor-top');
  check(true, 'next number shown before saving (INV-00001)');
  await a.page.getByTestId('party-name').fill('ABC Construction Pvt Ltd');
  await a.page.getByTestId('party-gstin').fill('29ABCDE1234F1Z5');
  await a.page.getByTestId('party-phone').fill('98765 43210');
  check((await a.page.getByTestId('party-state').textContent()).includes('Karnataka') && (await a.page.getByTestId('place-of-supply').textContent()).includes('Karnataka'), 'customer GSTIN → Karnataka, place of supply follows');
  check((await a.page.getByTestId('tax-mode').inputValue()) === 'INTER', 'other state → IGST chosen automatically');
  await a.page.getByTestId('more-details').click();
  await a.page.getByTestId('meta-vehicleNo').fill('MH12AB1234');
  await a.page.getByTestId('item-name-0').fill('Teak Dining Table');
  await a.page.getByTestId('item-hsn-0').fill('9403');
  await a.page.getByTestId('item-qty-0').fill('2');
  await a.page.getByTestId('item-rate-0').fill('25000');
  await a.page.getByTestId('item-save-product-0').click();
  await a.page.getByText('saved to Products & Services').waitFor();
  check(true, 'item saved to Products & Services from the invoice');
  await a.page.getByTestId('add-item').click();
  await a.page.getByTestId('item-name-1').fill('Delivery & installation');
  await pick(a.page, 'item-unit-1', 'Job');
  await a.page.getByTestId('item-rate-1').fill('1000');
  check((await a.page.getByTestId('total-igst').textContent()).includes('9,180.00'), 'inter-state → IGST 18% (9,180.00)');
  check((await a.page.getByTestId('grand-total').textContent()).includes('60,180.00'), 'grand total 60,180.00');
  check((await a.page.getByTestId('amount-words').textContent()).includes('Sixty Thousand One Hundred Eighty Rupees Only'), 'amount in words');
  await a.page.getByTestId('preview').click();
  await a.page.getByTestId('preview-sheet').locator('.doc-tp').waitFor();
  check((await a.page.getByTestId('preview-sheet').textContent()).includes('INV-00001'), 'live preview in the template before saving');
  await a.page.getByTestId('sheet-close').click();
  await shot(a.page, '03-editor');
  await a.page.getByTestId('save-doc').click();
  await a.page.getByTestId('view').waitFor();
  const invoiceUrl = a.page.url();
  const page1 = () => a.page.getByTestId('doc-page');
  const docText = await page1().textContent();
  for (const [needle, label] of [
    ['TAX INVOICE', 'title'],
    ['INV-00001', 'number'],
    ['27AAPFU0939F1ZV', 'own GSTIN'],
    ['29ABCDE1234F1Z5', 'customer GSTIN'],
    ['Karnataka', 'place of supply'],
    ['IGST', 'IGST'],
    ['9403', 'HSN code'],
    ['MH12AB1234', 'vehicle number (additional details)'],
    ['Sixty Thousand One Hundred Eighty Rupees Only', 'amount in words'],
    ['HDFC0001234', 'bank details'],
  ]) {
    check(docText.includes(needle), `invoice shows ${label}`);
  }
  check((await page1().locator('img[src^="data:image/svg"]').count()) >= 1, 'invoice shows the UPI QR code');
  check((await page1().locator('.doc-tp').count()) === 1, 'Professional template (desktop renderer)');
  await a.page.waitForTimeout(300);
  await a.page.screenshot({ path: path.join(siteShots, 'mobile-invoice.png') });
  for (const [id, cls] of [
    ['modern', '.doc-modern'],
    ['simple', '.doc-simple'],
    ['tally-std', '.doc-tally-std'],
    ['tally-pro', '.doc-tp'],
  ]) {
    await pick(a.page, 'template-switch', TEMPLATE_LABELS[id]);
    await page1().locator(cls).waitFor();
    if (id === 'modern') await shot(a.page, '04-template-modern');
  }
  check(true, 'all 4 templates: Modern, Simple, Standard, Professional');
  await a.page.getByTestId('view-status').click();
  await a.page.getByTestId('status-option-PAID').click();
  await a.page.getByText('INV-00001: Paid').waitFor();
  check(true, 'status changed to Paid');
  await a.page.getByTestId('party-pill').click();
  check((await a.page.getByTestId('contact-whatsapp').getAttribute('href')) === 'https://wa.me/919876543210', 'contact the customer: call, WhatsApp, email');
  await a.page.keyboard.press('Escape');
  await a.page.getByTestId('view-more').click();
  await a.page.getByTestId('action-history').click();
  check(/Created[\s\S]*Status changed|Status changed[\s\S]*Created/.test(await a.page.getByTestId('history').textContent()), 'history: created, template, status changes');
  await a.page.keyboard.press('Escape');

  console.log('Convert, duplicate, cancel');
  await a.page.getByTestId('view-more').click();
  await a.page.getByTestId('action-convert-PAYMENT_RECEIPT').click();
  await a.page.getByTestId('editor').waitFor();
  check((await a.page.getByTestId('amount-received').inputValue()) === '60180.00', 'convert invoice → payment receipt with the amount');
  await a.page.getByTestId('payment-mode').selectOption('UPI');
  await a.page.getByTestId('receipt-balance').waitFor();
  await a.page.getByTestId('amount-received').fill('20000');
  check(/Balance after this receipt\s*₹\s?40,180/.test(await a.page.getByTestId('receipt-balance').textContent()), 'receipt against INV-00001: invoice amount and balance after this receipt (₹40,180)');
  await a.page.getByTestId('paper-size-A5').click();
  await a.page.getByTestId('save-doc').click();
  await a.page.getByTestId('view').waitFor();
  check((await page1().textContent()).includes('RCT-00001') && (await a.page.locator('.lineage').textContent()).includes('INV-00001'), 'receipt RCT-00001 created from INV-00001');
  const a5 = await page1().locator('.doc').first().evaluate((d) => [d.classList.contains('doc-a5'), Math.round((d.offsetWidth / 96) * 25.4)]);
  check(a5[0] && a5[1] === 148 && (await a.page.locator('style[data-paper="A5"]').count()) === 1, 'receipt on A5 paper (148 mm), printed on an A5 page');
  check((await page1().getByTestId('receipt-settlement').textContent()).includes('60,180'), 'printed receipt: invoice amount, received earlier, this receipt, balance due');
  await shot(a.page, '05b-receipt-a5');
  await a.page.goto(invoiceUrl.replace(/#.*$/, '#/doc/new/PAYMENT_RECEIPT'));
  await a.page.getByTestId('editor').waitFor();
  await pick(a.page, 'receipt-invoice', 'INV-00001');
  await a.page.getByTestId('receipt-balance').waitFor();
  check((await a.page.getByTestId('amount-received').inputValue()) === '40180.00' && (await a.page.getByTestId('receipt-balance').textContent()).includes('20,000'),
    'new receipt: choose the invoice → customer filled, ₹20,000 received earlier, ₹40,180 suggested');
  await a.page.getByTestId('save-doc').click();
  await a.page.getByTestId('view').waitFor();
  check((await page1().textContent()).includes('RCT-00002'), 'second receipt RCT-00002 saved');
  await a.page.goto(invoiceUrl);
  await a.page.getByTestId('view').waitFor();
  await a.page.getByTestId('view-more').click();
  await a.page.getByTestId('action-duplicate').click();
  await a.page.getByTestId('editor').waitFor();
  await a.page.getByTestId('save-doc').click();
  await a.page.getByTestId('view').waitFor();
  check((await page1().textContent()).includes('INV-00002'), 'duplicate saved as INV-00002');
  await a.page.getByTestId('view-more').click();
  await a.page.getByTestId('action-cancel').click();
  await a.page.getByTestId('confirm-input').fill('Duplicate by mistake');
  await a.page.getByTestId('confirm-ok').click();
  await a.page.getByTestId('cancelled-note').waitFor();
  check((await a.page.getByTestId('cancelled-note').textContent()).includes('Duplicate by mistake') && (await page1().textContent()).includes('CANCELLED'), 'invoice cancelled with a reason, kept and marked CANCELLED');

  console.log('Quotation with a saved customer and product');
  await a.page.getByTestId('back').click();
  await a.page.getByTestId('documents').waitFor();
  await a.page.getByTestId('new-document-btn').click();
  await a.page.getByTestId('new-QUOTATION').click();
  await a.page.getByTestId('party-name').fill('ABC');
  await a.page.locator('.suggest-list').getByText('ABC Construction Pvt Ltd').click();
  check((await a.page.getByTestId('party-gstin').inputValue()) === '29ABCDE1234F1Z5', 'saved customer picked from suggestions');
  await a.page.getByTestId('item-name-0').fill('Teak');
  await a.page.locator('.suggest-list').getByText('Teak Dining Table').click();
  check((await a.page.getByTestId('item-rate-0').inputValue()) === '25000' && (await a.page.getByTestId('item-hsn-0').inputValue()) === '9403', 'saved product picked: rate and HSN filled');
  await a.page.getByTestId('item-disc-0').fill('10');
  const quoteTotal = await a.page.getByTestId('grand-total').textContent();
  check(quoteTotal.includes('26,550.00'), `discount 10% → 22,500 + GST 18% = 26,550.00 (${quoteTotal})`);
  check(!(await a.page.getByTestId('show-bank').isChecked()), 'quotation: "Show bank details" off by default');
  await a.page.getByTestId('save-doc').click();
  await a.page.getByTestId('view').waitFor();
  check(!(await page1().textContent()).includes('HDFC0001234'), 'quotation printed without bank details');

  console.log('Documents');
  await a.page.getByTestId('back').click();
  await a.page.getByTestId('documents-list').waitFor();
  const rows = () => a.page.getByTestId('documents-list').getByTestId('doc-row');
  await rows().nth(4).waitFor();
  check((await rows().count()) === 5, 'Documents lists 2 invoices, 2 receipts and the quotation');
  await shot(a.page, '05a-documents');
  check((await a.page.getByTestId('summary-line').textContent()).includes('Cancelled'), 'summary line with status counts');
  await a.page.getByTestId('manager-search').fill('QTN');
  await a.page.waitForTimeout(400);
  check((await rows().count()) === 1, 'search by number');
  await a.page.getByTestId('manager-search').fill('teak');
  await a.page.waitForTimeout(400);
  check((await rows().count()) === 3, 'search by product name');
  await a.page.getByTestId('manager-search').fill('');
  await pick(a.page, 'type-filter', 'Quotation');
  await a.page.waitForTimeout(300);
  check((await rows().count()) === 1, 'filter by document type');
  const qtnId = (await rows().first().getByRole('button').last().getAttribute('data-testid')).replace('more-', '');
  await a.page.getByTestId(`status-${qtnId}`).click();
  await a.page.getByTestId('status-option-ACCEPTED').click();
  await a.page.getByText('QTN-00001: Accepted').waitFor();
  check(true, 'status quick change from the list');
  await a.page.getByTestId(`more-${qtnId}`).click();
  await a.page.getByTestId('action-delete').click();
  await a.page.getByTestId('confirm-ok').click();
  await a.page.getByText('QTN-00001 deleted').waitFor();
  await a.page.getByTestId('show-deleted').click();
  await rows().first().waitFor();
  await a.page.getByTestId(`more-${qtnId}`).click();
  await a.page.getByTestId('action-restore').click();
  await a.page.getByText('QTN-00001 restored').waitFor();
  check(true, 'delete → Deleted → restore');
  await a.page.getByTestId('show-deleted').click();

  check(!(await a.page.getByText('Files', { exact: true }).count()) && !(await a.page.getByTestId('add-external').count()), 'no uploaded-files section on the phone');

  console.log('Sales data download');
  await a.page.getByTestId('sales-download').click();
  const [csvDownload] = await Promise.all([a.page.waitForEvent('download'), a.page.getByTestId('sales-download-go').click()]);
  const csv = fs.readFileSync(await csvDownload.path(), 'utf8');
  check(/^DocGen-Sales-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/.test(csvDownload.suggestedFilename()) && csv.includes('INV-00001,Tax Invoice,PAID,ABC Construction Pvt Ltd') && csv.includes('29ABCDE1234F1Z5'), 'sales CSV with the party GSTIN');

  console.log('Products & Services');
  await a.page.getByTestId('tab-products').click();
  await a.page.getByTestId('product-list').waitFor();
  check((await a.page.getByTestId('product-list').textContent()).includes('Teak Dining Table'), 'product saved from the invoice is listed');
  await a.page.getByTestId('open-categories').click();
  await a.page.getByTestId('category-name').fill('Furniture');
  await a.page.getByTestId('category-add').click();
  await a.page.getByTestId('categories').getByText('Furniture').waitFor();
  await a.page.keyboard.press('Escape');
  await a.page.getByTestId('add-product').click();
  await a.page.getByTestId('product-name').fill('Office Chair');
  await a.page.getByTestId('product-hsn').fill('9401');
  await a.page.getByTestId('product-price').fill('5310');
  await a.page.getByTestId('product-tax-type').selectOption('INCLUSIVE');
  await pick(a.page, 'product-category', 'Furniture');
  await a.page.getByTestId('product-more').click();
  await a.page.getByTestId('product-purchase-price').fill('3200');
  await a.page.getByTestId('product-save').click();
  await a.page.getByTestId('product-list').getByText('Office Chair').waitFor();
  check((await a.page.getByTestId('product-list').textContent()).includes('18% incl.'), 'product with category, HSN, price including GST, purchase price');
  await pick(a.page, 'category-filter', 'Furniture');
  await a.page.waitForTimeout(300);
  check((await a.page.getByTestId('product-row').count()) === 1, 'filter by category');
  await shot(a.page, '05-products');

  console.log('Settings: documents, numbering, units, document types');
  await a.page.getByTestId('tab-settings').click();
  await shot(a.page, '07a-settings');
  for (const removed of ['units', 'general', 'currency']) check(!(await a.page.getByTestId(`settings-${removed}`).count()), `no ${removed} settings on the phone`);
  await a.page.getByTestId('settings-documents').click();
  await a.page.getByTestId('settings-template-modern').click();
  await a.page.getByTestId('sample-preview').locator('.doc-modern').waitFor();
  await a.page.getByTestId('copies-2').click();
  await shot(a.page, '07b-settings-documents');
  await a.page.getByTestId('settings-save').click();
  await a.page.getByText('Settings saved').waitFor();
  check(true, 'default template Modern and 2 copies saved (live sample)');
  await a.page.getByTestId('back').click();
  await a.page.getByTestId('settings-numbering').click();
  await a.page.getByTestId('seq-format-TAX_INVOICE').selectOption('{PREFIX}/{FY}/{NUM}');
  await a.page.getByTestId('seq-save-TAX_INVOICE').click();
  await a.page.getByText('Invoice numbering saved').waitFor();
  check(/^INV\/\d{4}-\d{2}\/0003$/.test(await a.page.getByTestId('seq-preview-TAX_INVOICE').textContent()), 'numbering format INV/2026-27/0003');
  await a.page.getByTestId('back').click();
  await a.page.getByTestId('settings-types').click();
  await pick(a.page, 'type-choose', 'Delivery Challan');
  await a.page.getByTestId('type-title').fill('DELIVERY NOTE');
  await a.page.getByTestId('settings-save').click();
  await a.page.getByText('Delivery Challan settings saved').waitFor();
  check(true, 'per-type settings (title of the delivery challan)');
  await a.page.getByTestId('back').click();
  await a.page.getByTestId('tab-dashboard').click();
  await a.page.getByTestId('create-DELIVERY_CHALLAN').click();
  await a.page.getByTestId('party-name').fill('Site office');
  await a.page.getByTestId('item-name-0').fill('Teak Dining Table');
  await pick(a.page, 'item-unit-0', 'Box');
  check(!(await a.page.getByTestId('item-rate-0').count()), 'delivery challan: no prices');
  await a.page.getByTestId('save-doc').click();
  await a.page.getByTestId('view').waitFor();
  check((await page1().textContent()).includes('DELIVERY NOTE') && (await page1().locator('.doc-modern').count()) >= 1, 'challan printed with its own title in the default template');
  check((await page1().locator('.doc-extra-copy').count()) === 1, 'second copy prepared for printing');

  console.log('Backup');
  await a.page.goto(`${base}/app/#/settings/backup`);
  await a.page.getByTestId('settings-backup').waitFor();
  const [backupDownload] = await Promise.all([a.page.waitForEvent('download'), a.page.getByTestId('backup').click()]);
  const backupFile = path.join(dataDir, 'backup.json');
  fs.copyFileSync(await backupDownload.path(), backupFile);
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  check(backup.format === 'docgen-mobile-data' && backup.stores.documents.length === 6 && backup.stores.company.logo.startsWith('data:image'), 'backup file with documents and logo');
  await a.page.goto(`${base}/app/#/products`);
  await a.page.getByTestId('add-product').click();
  await a.page.getByTestId('product-name').fill('Added after the backup');
  await a.page.getByTestId('product-save').click();
  await a.page.getByTestId('product-list').getByText('Added after the backup').waitFor();
  await a.page.goto(`${base}/app/#/settings/backup`);
  await a.page.getByTestId('restore').click();
  await a.page.getByTestId('confirm-ok').click();
  const [restoreChooser] = await Promise.all([a.page.waitForEvent('filechooser'), a.page.getByTestId('restore-choose').click()]);
  await restoreChooser.setFiles(backupFile);
  await a.page.getByText('Backup restored').waitFor();
  await a.page.goto(`${base}/app/#/products`);
  await a.page.getByTestId('product-list').getByText('Office Chair').waitFor();
  check(!(await a.page.getByTestId('product-list').textContent()).includes('Added after the backup'), 'backup restored (product added later is gone)');
  await a.page.goto(`${base}/app/#/documents`);
  await rows().nth(4).waitFor();
  check((await rows().count()) === 6, 'all 6 documents back after the restore');

  console.log('Works offline, no repeated login');
  await a.page.goto(`${base}/app/`);
  await a.page.getByTestId('dashboard').waitFor();
  await a.page.reload();
  await a.page.getByTestId('dashboard').waitFor();
  check((await a.page.getByTestId('recent-documents').getByTestId('doc-row').count()) === 6, 'reopened without logging in; recent documents');
  await a.page.waitForTimeout(400);
  await a.page.screenshot({ path: path.join(siteShots, 'mobile-dashboard.png') });
  await a.context.setOffline(true);
  await a.page.reload();
  await a.page.getByTestId('dashboard').waitFor();
  await a.page.getByTestId('tab-documents').click();
  await rows().nth(4).waitFor();
  check(true, 'offline: the app opens and the documents are there');
  await a.context.setOffline(false);

  console.log('Phone limit enforced by the server; data from the first mobile version');
  const b = await phone();
  await b.page.goto(`${base}/app/`);
  await b.page.getByTestId('activation').waitFor();
  // Data saved by the first DocGen Mobile version on this phone.
  await b.page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('docgen-mobile', 1);
        req.onsuccess = () => {
          const tx = req.result.transaction(['kv', 'documents', 'parties', 'products'], 'readwrite');
          tx.objectStore('kv').put({ name: 'Old Shop', gstin: '27AAPFU0939F1ZV', state: 'Maharashtra', upi: 'old@upi', bankName: 'SBI' }, 'company');
          tx.objectStore('kv').put({ TAX_INVOICE: 7 }, 'counters');
          tx.objectStore('documents').put({ type: 'TAX_INVOICE', number: 'INV-00007', status: 'SENT', date: '2026-09-01', party: { name: 'Old Customer', state: 'Maharashtra' }, placeOfSupply: 'Maharashtra', taxMode: 'INTRA', items: [{ name: 'Old item', qty: '1', rate: '1000', taxRate: '18', unit: 'Nos' }], roundOff: true, notes: '', terms: '', createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z' });
          tx.oncomplete = () => resolve();
        };
      }),
  );
  // The updated app starts with the old data present (as after an update).
  await b.page.evaluate(() => new Promise((resolve) => { const r = indexedDB.deleteDatabase('docgen-data'); r.onsuccess = r.onerror = r.onblocked = () => resolve(); }));
  await b.page.reload();
  await b.page.getByTestId('activation').waitFor();
  await b.page.getByTestId('mode-login').click();
  await b.page.getByTestId('login-email').fill('priya@example.com');
  await b.page.getByTestId('login-password').fill('priya-pass-123');
  await b.page.getByTestId('activate').click();
  await b.page.getByTestId('dashboard').waitFor();
  check(true, 'second phone signs in with email and password');
  await b.page.getByTestId('tab-documents').click();
  await b.page.getByTestId('documents-list').getByText('INV-00007').waitFor();
  check((await b.page.getByTestId('documents-list').textContent()).includes('1,180.00'), 'data from the first mobile version carried over (invoice INV-00007, ₹1,180.00)');
  await b.page.getByTestId('new-document-btn').click();
  await b.page.getByTestId('new-TAX_INVOICE').click();
  await b.page.waitForFunction(() => document.querySelector('[data-testid=doc-number]')?.placeholder === 'INV-00008');
  check(true, 'numbering continues after the old invoices (INV-00008)');
  await b.page.goto(`${base}/app/#/settings`);
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
  await a.page.goto(`${base}/app/#/settings/license`);
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
  await b.page.goto(`${base}/app/#/settings/license`);
  await b.page.getByTestId('license-check').click();
  await b.page.getByTestId('locked').waitFor();
  check((await b.page.getByTestId('locked').textContent()).includes('expired'), 'expired license (checked with the server) locks the app');
  await shot(b.page, '06-expired');
  await admin('POST', `/licenses/${license.id}/extend`, { days: 365 });
  await b.page.getByTestId('check-again').click();
  await b.page.getByTestId('license-card').waitFor();
  check((await b.page.getByTestId('license-expiry').textContent()).length > 4, 'the new expiry date is shown');
  check(true, 'extended license → "Check again" unlocks');
  const released = (await admin('GET', `/licenses/${license.id}`)).devices.filter((d) => d.kind === 'mobile');
  const bId = await b.page.evaluate(() => localStorage.getItem('docgen.mobile.device'));
  const phoneB = released.find((d) => !d.released_at && d.device_id === bId);
  await admin('POST', `/licenses/${license.id}/devices/${phoneB.id}/release`);
  await b.page.getByTestId('license-check').click();
  await b.page.getByTestId('activation').waitFor();
  check(true, 'a phone removed in the client/admin panel must activate again');

  // A phone on the same Wi-Fi opening http://<computer's address>:8787/app/ — not a secure context, so the browser
  // has no crypto.randomUUID / crypto.subtle and no service worker. Activation must still work.
  const lan = Object.values(os.networkInterfaces()).flat().find((n) => n && n.family === 'IPv4' && !n.internal)?.address;
  if (lan) {
    console.log(`Plain http:// address (${lan})`);
    const [lanLicense] = (await admin('POST', '/licenses', { clientId: client.id, activateNow: true, maxMobileDevices: 1 })).licenses;
    const c = await phone();
    await c.page.goto(`http://${lan}:${port}/app/`);
    await c.page.getByTestId('activation').waitFor();
    check(await c.page.evaluate(() => !window.isSecureContext && typeof crypto.randomUUID !== 'function' && !crypto.subtle), 'plain http:// network address: not a secure context');
    check((await c.page.getByTestId('install-banner').textContent()).includes('https://'), 'explains that installing needs an https:// address');
    await c.page.getByTestId('license-key').fill(lanLicense.code);
    await c.page.getByTestId('activate').click();
    await c.page.getByTestId('setup').waitFor();
    check(true, 'license activates over plain http:// (no crypto.randomUUID error)');
    await c.page.getByTestId('setup-next').click();
    await c.page.getByTestId('setup-next').click();
    await c.page.getByTestId('setup-next').click();
    await c.page.getByTestId('setup-save').click();
    await c.page.getByTestId('dashboard').waitFor();
    await c.page.getByTestId('create-TAX_INVOICE').click();
    await c.page.getByTestId('party-name').fill('Walk-in customer');
    await c.page.getByTestId('item-name-0').fill('Repair');
    await c.page.getByTestId('item-rate-0').fill('500');
    await c.page.getByTestId('save-doc').click();
    await c.page.getByTestId('view').waitFor();
    check((await c.page.getByTestId('doc-page').textContent()).includes('INV-00001'), 'documents work over plain http:// too');
    await c.page.goto(`http://${lan}:${port}/app/`);
    await c.page.getByTestId('dashboard').waitFor();
    await c.page.reload();
    await c.page.getByTestId('dashboard').waitFor();
    check(true, 'reopened without activating again (signature checked without crypto.subtle)');
  }

  console.log(`\nAll ${passed} mobile checks passed.`);
} catch (e) {
  console.error('MOBILE E2E FAILED:', e.message.split('\n').slice(0, 3).join(' | '));
  for (const [i, ctx] of browser.contexts().entries()) for (const pg of ctx.pages()) await pg.screenshot({ path: path.join(shots, `failure-${i}.png`) }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
