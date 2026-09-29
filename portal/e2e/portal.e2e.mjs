/**
 * Browser end-to-end test of the client portal and admin panel against a real
 * DocGen server (started by this script on a temporary SQLite database).
 *
 * Usage:  cd portal && npm run build && node e2e/portal.e2e.mjs
 * Needs Playwright (npm i -g playwright) and a Chromium build.
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
const port = 8811;
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docgen-portal-e2e-'));
let passed = 0;
const check = (cond, label) => {
  if (!cond) throw new Error(`Assertion failed: ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
};

const server = spawn('node', [path.join(here, '../../server/src/index.js')], {
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: dataDir,
    PORTAL_URL: base,
    ADMIN_EMAIL: 'owner@docgen.test',
    ADMIN_PASSWORD: 'owner-password-1',
    ENABLE_MOCK_PAYMENTS: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(d));
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => d.toString().includes('listening') && resolve());
  setTimeout(() => reject(new Error('server did not start')), 15000);
});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on('dialog', (d) => d.accept(d.defaultValue()));
const shot = (name) => page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });

try {
  console.log('Client portal');
  await page.goto(`${base}/`);
  await page.getByText('Most popular').waitFor();
  check((await page.locator('.plan-card').count()) === 3, 'home page lists 3 plans');
  await shot('01-home');

  await page.goto(`${base}/register`);
  await page.getByLabel('Your name').fill('Meera Sharma');
  await page.getByLabel('Email').fill('meera@example.com');
  await page.getByLabel('Password').fill('meera-pass-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Tell us about your business').waitFor();
  await page.getByTestId('business-name').fill('Sharma Furniture Works');
  await page.getByLabel('GSTIN (optional)').fill('29ABCDE1234F1Z5');
  await page.getByLabel('State').selectOption('Karnataka');
  await shot('02-business');
  await page.getByTestId('save-business').click();
  await page.getByText('Choose a plan').first().waitFor();
  check(true, 'register → business details → plans');

  await page.locator('label.radio', { hasText: 'Test payment' }).locator('input').check();
  await page.locator('.plan-card', { hasText: 'Starter' }).getByRole('button').click();
  await page.getByTestId('mock-pay').click();
  const code = (await page.getByTestId('new-code').textContent()).trim();
  check(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), `payment issued activation code ${code}`);
  await shot('03-paid');
  await page.getByRole('link', { name: 'Go to my licenses' }).click();
  await page.getByTestId('license-card').first().waitFor();
  check((await page.getByTestId('license-card').first().textContent()).includes(code), 'license visible on overview');
  await shot('04-overview');

  // Desktop login (API) with the new account activates the license.
  const res = await fetch(`${base}/api/app/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'meera@example.com', password: 'meera-pass-123', deviceId: 'e2e-device-00000001', deviceName: 'Front desk PC', platform: 'windows', appVersion: '1.0.0' }),
  });
  check(res.status === 200, 'desktop app can sign in with the portal account');
  await page.reload();
  await page.getByText('Front desk PC').waitFor();
  check(true, 'activated computer listed in portal');

  console.log('Admin panel');
  await page.goto(`${base}/admin/login`);
  await page.getByLabel('Email').fill('owner@docgen.test');
  await page.getByLabel('Password').fill('owner-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Active licenses').waitFor();
  await shot('05-admin-dashboard');

  await page.locator('.admin-side').getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('button', { name: 'New client' }).click();
  const modal = page.locator('.modal');
  await modal.getByLabel('Contact name').fill('Ravi Kumar');
  await modal.getByLabel('Email').fill('ravi@example.com');
  await modal.getByLabel('Business name').fill('Ravi Constructions');
  await modal.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'Ravi Constructions' }).waitFor();
  check(true, 'admin created client manually');
  await page.getByTestId('client-new-license').click();
  await page.getByTestId('create-license').click();
  const created = await page.getByTestId('created-codes').inputValue();
  check(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(created.trim()), 'admin activated a license without payment');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Manage' }).click();
  await page.getByTestId('extend-license').click();
  await page.getByText('License extended').waitFor();
  check(true, 'admin extended the license');
  await shot('06-admin-license');
  await page.keyboard.press('Escape');

  await page.locator('.admin-side').getByRole('link', { name: 'Licenses & Codes', exact: true }).click();
  await page.getByRole('button', { name: 'Create licenses / codes' }).click();
  await page.locator('.modal').getByLabel('How many codes').fill('5');
  await page.getByTestId('create-license').click();
  const batch = (await page.getByTestId('created-codes').inputValue()).trim().split('\n');
  check(batch.length === 5, 'bulk generated 5 activation codes');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.locator('.admin-side').getByRole('link', { name: 'Ads', exact: true }).click();
  await page.getByTestId('new-ad').click();
  await page.getByTestId('ad-title').fill('Diwali offer: 20% off');
  await page.locator('.modal').getByLabel('Description').fill('Upgrade to Business before 31 Oct.');
  await page.locator('.modal').getByLabel('Link (opens in browser)').fill('https://raindeal.in/offer');
  await page.locator('.modal').getByLabel('HTML content (optional)').fill('<p style="color:#2f5bea">Limited time</p>');
  await shot('07-ad-editor');
  await page.getByTestId('save-ad').click();
  await page.getByText('Diwali offer: 20% off').waitFor();
  check(true, 'ad created');

  await page.locator('.admin-side').getByRole('link', { name: 'App configuration', exact: true }).click();
  await page.getByTestId('config-interval').fill('15');
  await page.getByRole('button', { name: 'Add video' }).click();
  const rows = page.locator('table tbody tr');
  await rows.last().locator('input').nth(0).fill('Create your first invoice');
  await rows.last().locator('input').nth(1).fill('https://www.youtube.com/watch?v=abcdefghijk');
  await page.getByTestId('save-config').click();
  await page.getByText('Configuration saved').waitFor();
  const cfg = await (await fetch(`${base}/api/app/config`)).json();
  check(cfg.configIntervalDays === 15 && cfg.ads.length === 1 && cfg.help.videos.length === 1, 'app config endpoint reflects admin changes');
  await shot('08-config');

  await page.locator('.admin-side').getByRole('link', { name: 'Payments', exact: true }).click();
  await page.getByText('meera@example.com').first().waitFor();
  check(true, 'payments list shows client payment');
  await page.locator('.admin-side').getByRole('link', { name: 'Audit log', exact: true }).click();
  await page.getByText('license.extend').first().waitFor();
  check(true, 'audit log shows admin actions');

  console.log(`\nAll ${passed} portal checks passed.`);
} catch (e) {
  await shot('failure').catch(() => {});
  console.error('PORTAL E2E FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
