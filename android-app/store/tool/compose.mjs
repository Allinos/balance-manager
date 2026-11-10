/**
 * Google Play phone screenshots (1080 × 1920): each screen from ../raw (made by server/mobile/e2e/store-screens.mjs)
 * in a phone frame under a short headline, saved to ../screenshots/.
 *     node android-app/store/tool/compose.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const store = path.join(here, '..');
const out = path.join(store, 'screenshots');
fs.mkdirSync(out, { recursive: true });

const SLIDES = [
  ['05-home', 'Know who owes you', 'Payments due, overdue bills and today’s work on one screen'],
  ['03-invoice-view', 'GST invoices in seconds', 'Print, save as PDF or share on WhatsApp'],
  ['04-ledger', 'A simple ledger for every customer', 'Given, received and the balance — always up to date'],
  ['06-parties', 'Customers & vendors in one place', 'See who will pay you and whom you will pay'],
  ['07-reports', 'Your business at a glance', 'Sales, money in and money still to come'],
  ['08-documents', 'Every bill, neatly kept', 'Invoices, receipts and quotations — find any in a second'],
  ['01-welcome', 'Free to start', 'Your data stays on your phone, protected by a PIN'],
];

const THEMES = [
  ['#1e40af', '#2563eb'],
  ['#0f766e', '#14b8a6'],
  ['#1e3a8a', '#4f46e5'],
  ['#9a3412', '#ea580c'],
];

const img = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
const icon = img(path.join(store, 'play-icon-512.png'));

const page = (shot, title, sub, [c1, c2]) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1080px; height: 1920px; overflow: hidden; font-family: Inter, Roboto, sans-serif; color: #fff;
    background: radial-gradient(circle at 85% 8%, rgba(255,255,255,.18), transparent 38%), linear-gradient(160deg, ${c1}, ${c2}); }
  .head { position: absolute; top: 70px; left: 80px; right: 80px; text-align: center; }
  .brand { display: inline-flex; align-items: center; gap: 14px; font-weight: 700; font-size: 34px; opacity: .95; }
  .brand img { width: 56px; height: 56px; border-radius: 14px; box-shadow: 0 4px 12px rgba(0,0,0,.2); }
  h1 { margin-top: 26px; font-size: 70px; line-height: 1.08; font-weight: 800; letter-spacing: -1.5px; }
  p { margin-top: 18px; font-size: 34px; line-height: 1.35; font-weight: 500; opacity: .9; }
  .phone { position: absolute; left: 50%; top: 478px; width: 700px; height: 1430px; transform: translateX(-50%);
    background: #0b0f1a; border-radius: 80px; padding: 22px; box-shadow: 0 40px 90px rgba(0,0,0,.4), inset 0 0 0 3px #2a3142; }
  .screen { width: 100%; height: 100%; border-radius: 60px; overflow: hidden; background: #fff; position: relative; }
  .screen img { width: 100%; display: block; margin-top: 44px; }
  .bar { position: absolute; top: 0; left: 0; right: 0; height: 44px; background: #fff; display: flex; align-items: center;
    justify-content: space-between; padding: 0 44px; color: #111; font-size: 21px; font-weight: 700; }
  .cam { position: absolute; top: 12px; left: 50%; width: 22px; height: 22px; margin-left: -11px; border-radius: 50%; background: #0b0f1a; }
</style></head><body>
  <div class="head">
    <div class="brand"><img src="${icon}" alt="">DocGen</div>
    <h1>${title}</h1>
    <p>${sub}</p>
  </div>
  <div class="phone"><div class="screen">
    <div class="bar"><span>9:41</span><span>▴ ◢ ▮</span></div><div class="cam"></div>
    <img src="${img(shot)}" alt="">
  </div></div>
</body></html>`;

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
for (let i = 0; i < SLIDES.length; i += 1) {
  const [name, title, sub] = SLIDES[i];
  const file = path.join(store, 'raw', `${name}.png`);
  if (!fs.existsSync(file)) {
    console.warn(`missing ${file} — run server/mobile/e2e/store-screens.mjs first`);
    continue;
  }
  await tab.setContent(page(file, title, sub, THEMES[i % THEMES.length]), { waitUntil: 'networkidle' });
  await tab.evaluate(() => document.fonts.ready);
  const target = path.join(out, `phone-${String(i + 1).padStart(2, '0')}-${name.replace(/^\d+-/, '')}.png`);
  await tab.screenshot({ path: target });
  console.log(`  ${path.relative(store, target)}`);
}
await browser.close();
