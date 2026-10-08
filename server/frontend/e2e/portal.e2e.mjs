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
// A stand-in for Meta's fbevents.js: records every Pixel call in window.__fb and sets the _fbp cookie like the real one.
const fakePixelJs = `
(function () {
  window.__fb = window.__fb || [];
  document.cookie = '_fbp=fb.1.1700000000000.42424242; path=/';
  var f = window.fbq;
  f.callMethod = function () { window.__fb.push(Array.prototype.slice.call(arguments)); };
  (f.queue || []).forEach(function (a) { f.callMethod.apply(null, a); });
  f.queue = [];
})();`;
const routePixel = (ctx) => ctx.route('https://connect.facebook.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: fakePixelJs }));
/** Pixel calls made on the current page, e.g. [['init', '1862…'], ['track', 'PageView']]. */
const fbCalls = (pg) => pg.evaluate(() => window.__fb || []);
const waitFb = (pg, event) => pg.waitForFunction((e) => (window.__fb || []).some((c) => c[0] === 'track' && c[1] === e), event, { timeout: 8000 });

const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
await routePixel(context);
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
  await waitFb(page, 'PageView');
  check((await fbCalls(page)).some((c) => c[0] === 'init' && c[1] === '1862821958226928'), 'Meta Pixel 1862821958226928 loads on the website and sends PageView');
  const rawOffer = await (await fetch(`${base}/offer`)).text();
  const rawAdmin = await (await fetch(`${base}/admin/login`)).text();
  const pixelJs = await (await fetch(`${base}/meta-pixel.js`)).text();
  check(rawOffer.includes('<script src="/meta-pixel.js"></script>') && rawOffer.includes('facebook.com/tr?id=1862821958226928') && pixelJs.includes("fbq('init', '1862821958226928')"),
    'the Pixel base code is in the page HTML itself (Meta\'s event setup tool can detect it)');
  check(!rawAdmin.includes('meta-pixel.js') && !rawAdmin.includes('facebook.com/tr'), 'no Pixel in the admin panel HTML');
  check((await fbCalls(page)).filter((c) => c[0] === 'init').length === 1 && (await fbCalls(page)).filter((c) => c[1] === 'PageView').length === 1, 'Pixel initialised once, one PageView per page');
  const cards = page.getByTestId('price-card');
  check((await cards.count()) === 3 && (await page.getByTestId('price').first().textContent()).includes('1,250'), 'product page: one pricing card per duration, from ₹1,250');
  const pricing = (await page.getByTestId('pricing-cards').textContent()).replace(/\s+/g, ' ');
  check(/1-year license.*1,250.*2-year license.*2,250.*5-year license.*4,999/.test(pricing) && pricing.includes('one-time payment'), 'pricing cards: 1, 2 and 5 years with their prices, one-time payment');
  check(pricing.includes('Best value') && (await cards.nth(2).textContent()).includes('Best value'), 'pricing cards: lowest price per year marked "Best value"');
  const names = await page.getByTestId('plan-name').allTextContents();
  const periods = await page.getByTestId('plan-period').allTextContents();
  check(names.join(',') === 'Standard,Plus,Premium' && periods.join(',') === '1-year license,2-year license,5-year license',
    `each card has its own plan and duration (${names.join(' / ')}; ${periods.join(' / ')}), none says Lifetime`);
  check(await page.getByTestId('header-login').isVisible(), 'header: Login button');
  const footer = (await page.getByTestId('site-footer').textContent()).replace(/\s+/g, ' ');
  check(['Terms & Conditions', 'Privacy Policy', 'Shipping Policy', 'Cancellation & Refunds', 'Contact Us', 'Help & Support'].every((t) => footer.includes(t)), 'footer links: policies, Contact Us, Help & Support');
  check((await page.getByTestId('hero-buy').getAttribute('href')) === '#pricing', 'hero "Buy now" jumps to the pricing cards');
  const compare = (await page.getByTestId('comparison').textContent()).replace(/\s+/g, ' ');
  check(compare.includes('DocGen Desktop') && compare.includes('DocGen Mobile'), 'comparison table includes DocGen Desktop and DocGen Mobile');
  check((await page.locator('.app-frame img').count()) >= 1, 'product screenshot shown');
  check((await page.getByTestId('faq').locator('details').count()) >= 4, 'FAQ shown');
  const problems = (await page.getByTestId('problems').textContent()).replace(/\s+/g, ' ');
  check((await page.getByTestId('problem-card').count()) === 6 && problems.includes('GST mistakes cost you money') && problems.includes('Works fully offline'),
    'home: "Sound familiar?" — 6 customer problems, each with how DocGen solves it');
  check(/^\/buy\?product=1&price=\d+$/.test(await page.getByTestId('buy-365').getAttribute('href')), 'pricing card buttons open the checkout with that plan');
  check((await page.locator('a[href*="offer"]').count()) === 0, 'the ad offer page (/offer) is not linked from the website');
  check((await page.content()).includes('info.reynrel@gmail.com'), 'contact email info.reynrel@gmail.com');
  await page.getByTestId('mobile-section').scrollIntoViewIfNeeded();
  check((await page.getByTestId('mobile-section').locator('img').count()) === 2, 'landing page: "DocGen on Mobile" section with screenshots');
  check((await page.getByTestId('get-mobile').getAttribute('href')) === '/mobile', 'landing page: "Get the mobile app" opens the installation page');
  await shot('01-product');

  await page.getByTestId('buy-365').click();
  await page.getByTestId('checkout-form').waitFor();
  check((await page.getByTestId('order-total').textContent()).includes('1,250'), 'checkout: order summary ₹1,250');
  await page.getByTestId('price-1825').click();
  check((await page.getByTestId('order-total').textContent()).includes('4,999') && (await page.getByTestId('co-pay').textContent()).includes('4,999'), 'checkout: choosing 5 years updates the total (₹4,999)');
  await page.getByTestId('price-365').click();
  check((await page.getByTestId('order-total').textContent()).includes('1,250'), 'checkout: back to 1 year (₹1,250)');
  await page.getByLabel('Full name').fill('Meera Sharma');
  await page.getByLabel('Mobile number').fill('12345');
  await page.getByLabel('Email address').fill('meera@example.com');
  await page.getByTestId('co-pay').click();
  await page.getByTestId('terms-error').waitFor();
  check(rzpOrders.length === 0, 'checkout: payment does not start before the Terms & Conditions are accepted');
  check((await page.getByTestId('checkout-form').locator('a[href="/terms"]').count()) === 1, 'checkout: the checkbox links to the Terms & Conditions');
  await page.getByTestId('accept-terms').check();
  check((await page.getByTestId('terms-error').count()) === 0, 'ticking the box clears the message');
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
  const today = new Date();
  const inAYear = new Date(today.getTime() + 365 * 86400000);
  const shortDate = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  check((await page.getByTestId('start-date').textContent()) === shortDate(today) && (await page.getByTestId('expiry-date').textContent()) === shortDate(inAYear),
    'client panel: start date and expiry date');
  check(await page.getByTestId('devices-desktop').isVisible() && await page.getByTestId('devices-mobile').isVisible(), 'client panel: computers and phones listed separately');
  await page.getByTestId('purchases').waitFor();
  check(/1,250/.test(await page.getByTestId('purchases').textContent()) && /1 year/.test(await page.getByTestId('purchases').textContent()), 'client panel: purchase with its duration');
  for (const nav of ['nav-my-license', 'nav-services', 'nav-downloads', 'nav-account']) check(await page.getByTestId(nav).isVisible(), `client sidebar: ${nav.slice(4)}`);
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
  await page.getByText('Device removed').waitFor();
  check(!(await page.getByText('Front desk PC').isVisible()), 'computer removed after confirming');

  // DocGen Mobile: the same license on phones, limited by the server (2 phones for this product).
  const activatePhone = (n) =>
    fetch(`${base}/api/app/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, deviceId: `e2e-phone-0000000${n}`, deviceName: `Phone ${n}`, platform: 'android', appVersion: '1.0.0', deviceKind: 'mobile' }),
    });
  const phone1 = await activatePhone(1);
  const phone1Body = await phone1.json();
  check(phone1.status === 200 && phone1Body.license.maxMobileDevices === 2 && phone1Body.license.key === code, 'mobile app activates with the license key (2 phones allowed)');
  check((await activatePhone(2)).status === 200, 'second phone activates');
  const phone3 = await activatePhone(3);
  check(phone3.status === 409 && (await phone3.json()).error.code === 'DEVICE_LIMIT', 'third phone is refused by the server (device limit)');
  await page.reload();
  await page.getByTestId('devices-mobile').getByText('Phone 2').waitFor();
  check((await page.getByTestId('devices-mobile').textContent()).includes('2 of 2'), 'client panel: phones in use (2 of 2)');

  // Extend from the client panel: Extend → Services with the license selected → choose 2 years → new expiry → pay.
  await page.getByTestId('extend').click();
  await page.getByTestId('service-card').waitFor();
  check(await page.getByTestId('nav-services').evaluate((a) => a.classList.contains('active')), 'Extend opens Services');
  check((await page.getByTestId('services-summary').textContent()).includes(shortDate(inAYear)), 'services: current expiry shown');
  check((await page.getByTestId('new-expiry').textContent()) === shortDate(new Date(inAYear.getTime() + 365 * 86400000)), 'services: new expiry after 1 more year');
  await page.getByTestId('price-730').click();
  const extendedTo = shortDate(new Date(inAYear.getTime() + 730 * 86400000));
  check((await page.getByTestId('new-expiry').textContent()) === extendedTo, 'services: choosing 2 years shows the new expiry (current end + 730 days)');
  check((await page.getByTestId('services-pay').textContent()).includes('2,250'), 'services: pay ₹2,250 for 2 years');
  await shot('04b-services');
  await page.getByTestId('services-pay').click();
  await page.getByTestId('terms-error').waitFor();
  check(true, 'extension: Terms & Conditions must be accepted too');
  await page.getByTestId('accept-terms').check();
  await page.getByTestId('services-pay').click();
  await page.getByTestId('rzp-window').waitFor();
  check((await page.evaluate(() => window.__rzpOptions.amount)) === 225000 && (await page.evaluate(() => window.__rzpOptions.description)).includes('2 years'), 'extension opens Razorpay for ₹2,250 (2 years)');
  await page.getByTestId('rzp-pay').click();
  await page.getByTestId('services-done').waitFor();
  check((await page.getByTestId('done-expiry').textContent()) === extendedTo, 'payment verified by the server → license extended to the new expiry');
  await page.getByTestId('nav-my-license').click();
  await page.getByText('1095 days left').waitFor();
  check(true, 'My License: 1095 days left after the extension');

  // Client panel → Help & Support: a new request and its conversation.
  await page.getByTestId('nav-help-support').click();
  await page.getByTestId('new-request').click();
  await page.getByTestId('support-topic').selectOption('license');
  await page.getByTestId('support-subject').fill('Move license to my new laptop');
  await page.getByTestId('support-message').fill('I bought a new laptop. How do I move DocGen to it?');
  await shot('04c-support-new');
  await page.getByTestId('support-send').click();
  await page.getByTestId('thread').waitFor();
  check((await page.getByTestId('request-status').textContent()) === 'Waiting for our reply' && (await page.getByTestId('thread').textContent()).includes('new laptop'),
    'client panel: Help & Support request sent, conversation shown');
  await page.getByRole('link', { name: '← All requests' }).click();
  check((await page.getByTestId('my-requests').textContent()).includes('Move license to my new laptop'), 'client panel: list of my requests');
  await shot('04d-support-list');

  // Downloads: the platforms the admin offers, plus the mobile app.
  await page.getByTestId('nav-downloads').click();
  await page.getByTestId('download-list').waitFor();
  check(await page.getByTestId('tile-windows').isVisible(), 'downloads: Windows installer offered');
  check((await page.getByTestId('download-mobile').getAttribute('href')) === '/mobile', 'downloads: mobile app → installation page');
  const [download2] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-windows').click()]);
  check(download2.suggestedFilename() === 'DocGen_1.1.0_x64-setup.exe', 'downloads: installer downloads from the client panel');
  await shot('04c-downloads');

  await page.getByTestId('nav-account').click();
  await page.getByRole('heading', { name: 'Account information' }).waitFor();
  await page.getByLabel('Business name (optional)').fill('Sharma Traders');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Details saved').waitFor();
  check(true, 'account: customer updates their details');

  // Phone width: the sidebar becomes a menu.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('nav-my-license').evaluate((a) => a.click());
  await page.getByTestId('license-card').waitFor();
  await page.waitForTimeout(400);
  check(!(await page.getByTestId('nav-services').isVisible()) || (await page.getByTestId('nav-services').boundingBox()).x < 0, 'phone: menu hidden until opened');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'phone: no sideways scrolling');
  await shot('04d-phone-license');
  await page.getByTestId('menu-open').click();
  await page.waitForTimeout(300);
  check((await page.getByTestId('nav-services').boundingBox()).x >= 0, 'phone: menu button opens the sidebar');
  await shot('04e-phone-menu');
  await page.getByTestId('nav-services').click();
  await page.getByTestId('service-card').waitFor();
  await page.waitForTimeout(300);
  check(!(await page.locator('.panel.menu-open').count()), 'phone: menu closes after choosing a section');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'phone: services page fits the screen');
  await shot('04f-phone-services');
  await page.setViewportSize({ width: 1280, height: 860 });

  // Mobile installation page.
  await page.goto(`${base}/mobile`);
  await page.getByTestId('mobile-page').waitFor();
  check((await page.getByTestId('install-mobile').getAttribute('href')) === '/app/?install=1' && (await page.getByTestId('install-qr').count()) === 1,
    'mobile page: install button and QR code for the phone');
  const guide = page.getByTestId('android-guide');
  check((await guide.locator('figure').count()) === 4 && (await guide.textContent()).includes('Install and create shortcut'), 'mobile page: Android install guide in 4 steps with pictures');
  const stepImg = await fetch(`${base}/install/android-1-menu.jpg`);
  check(stepImg.status === 200 && stepImg.headers.get('content-type').includes('image'), 'install guide pictures are served');
  const appPage = await fetch(`${base}/app/`);
  check(appPage.status === 200 && (await appPage.text()).includes('manifest.webmanifest'), 'DocGen Mobile is served at /app/ with its manifest');
  await shot('04g-mobile-page');

  // Someone else at the same desk starts buying but closes the payment window.
  await page.goto(`${base}/account`);
  await page.getByTestId('sign-out').click();
  await page.goto(`${base}/buy?product=1`);
  // /buy is the plain checkout: details and payment, no steps before it.
  await page.getByTestId('checkout-form').waitFor();
  check((await page.locator('.funnel, [data-testid=funnel]').count()) === 0 && (await page.getByTestId('order-total').textContent()).includes('1,250'), '/buy opens the details form and payment directly');
  await page.getByLabel('Full name').fill('Meera Sharma');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByLabel('Email address').fill('meera@example.com');
  await page.getByTestId('accept-terms').check();
  await page.getByTestId('co-pay').click();
  await page.getByTestId('signin-instead').waitFor();
  check(true, 'an email that already has an account is asked to sign in');
  await page.getByLabel('Email address').fill('lead@example.com');
  await page.getByTestId('co-pay').click();
  await page.getByTestId('rzp-close').click();
  await page.getByText('Payment not completed').waitFor();
  check(true, 'closing the payment window keeps the visitor on the checkout');

  console.log('Ad offer page (/offer) on a phone: plans → countdown → Pay now → payment → license');
  const adVisitor = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await routePixel(adVisitor);
  const ad = await adVisitor.newPage();
  await ad.route('https://checkout.razorpay.com/v1/checkout.js', (route) => route.fulfill({ contentType: 'application/javascript', body: fakeCheckoutJs }));
  const adShot = (name) => ad.screenshot({ path: path.join(shots, `${name}.png`) });
  const offerRes = await fetch(`${base}/offer`);
  check(offerRes.status === 200 && /noindex/.test(offerRes.headers.get('x-robots-tag') || ''), 'offer page is served with X-Robots-Tag: noindex (kept out of search results)');
  await ad.goto(`${base}/offer?utm_source=facebook&utm_medium=paid_social&utm_campaign=offer-oct&fbclid=e2e-fb`);
  await ad.getByTestId('offer-page').waitFor();
  await waitFb(ad, 'ViewContent');
  const view = (await fbCalls(ad)).find((c) => c[1] === 'ViewContent');
  check(view[2].value === 1250 && view[2].currency === 'INR' && view[2].content_ids[0] === 'DOCGEN', 'Meta Pixel: ViewContent on the offer page (₹1,250, INR, DOCGEN)');
  const firstPrice = await ad.getByTestId('offer-plans').getByTestId('regular-price').first().textContent();
  check(firstPrice.includes('1,500') && !(await ad.getByTestId('offer-plans').getByTestId('offer-price').first().isVisible()), 'page opens with the regular price (₹1,500)');
  await adShot('03a-offer-open');
  await ad.locator('.offer-price.revealed').first().waitFor();
  await ad.waitForTimeout(900);
  const plan1 = (await ad.getByTestId('offer-plans').getByTestId('offer-plan-365').textContent()).replace(/\s+/g, ' ');
  check(plan1.includes('₹1,500') && plan1.includes('₹1,250') && plan1.includes('Save ₹250'), 'then the price drops: ₹1,500 crossed out, offer ₹1,250, "Save ₹250"');
  check((await ad.getByTestId('offer-plans').boundingBox()).y < 844 && (await ad.getByTestId('offer-plan-365').first().boundingBox()).y < 844, 'the plans are on the first screen of a phone');
  check((await ad.getByTestId('offer-bar').textContent()).includes('17% off'), 'top bar: limited-time offer, 17% off');
  const t1 = (await ad.getByTestId('offer-timer').textContent()).trim();
  await ad.waitForTimeout(2100);
  const t2 = (await ad.getByTestId('offer-timer').textContent()).trim();
  const secs = (t) => t.split(':').reduce((a, b) => a * 60 + Number(b), 0);
  check(/^\d\d:\d\d$/.test(t1) && secs(t1) <= 15 * 60 && secs(t2) < secs(t1), `countdown runs (${t1} → ${t2})`);
  const buyersText = await ad.getByTestId('offer-buyers-top').textContent();
  const buyers = Number(buyersText.match(/(\d+) people/)[1]);
  check(buyers >= 12 && buyers <= 24 && buyersText.includes('in the last 24 hours') && (await ad.evaluate(() => localStorage.getItem('docgen.offer.buyers'))) === String(buyers),
    `"${buyers} people bought DocGen in the last 24 hours" — a random number stored in the browser`);
  await ad.reload();
  await ad.getByTestId('offer-page').waitFor();
  check((await ad.getByTestId('offer-buyers-top').textContent()).includes(`${buyers} people`), 'reloading the page keeps the same number');
  await ad.getByTestId('offer-timer').waitFor();
  const t3 = (await ad.getByTestId('offer-timer').textContent()).trim();
  check(secs(t3) <= secs(t2), `reloading does not restart the countdown (${t2} → ${t3})`);
  const ad2 = await adVisitor.newPage();
  await ad2.goto(`${base}/offer`);
  await ad2.getByTestId('offer-page').waitFor();
  check((await ad2.getByTestId('offer-buyers-top').textContent()).includes(`${buyers + 5} people`), `a later visit adds 5 (${buyers + 5})`);
  await ad2.close();
  for (const id of ['offer-problems', 'offer-fixes', 'offer-benefits', 'offer-proof']) check(await ad.getByTestId(id).count() === 1, `section: ${id.slice(6)}`);
  check((await ad.getByTestId('offer-proof').textContent()).includes('500+') && (await ad.getByTestId('offer-proof').textContent()).includes('4.8'), 'happy customers (500+) and rating (4.8)');
  check((await ad.locator('header a, .site-nav').count()) === 0, 'no website menu on the offer page — nothing leads away from the offer');
  check(await ad.getByTestId('offer-paynow').isVisible(), 'sticky "Pay now" button at the bottom of the screen');
  await ad.locator('.offer-sticky .offer-price.revealed').waitFor();
  await ad.getByTestId('offer-problems').scrollIntoViewIfNeeded();
  await ad.waitForTimeout(300);
  await adShot('03b-offer-scroll');
  await ad.getByTestId('offer-paynow').click();
  await ad.waitForTimeout(900);
  check((await ad.getByTestId('offer-pay').boundingBox()).y < 200, '"Pay now" jumps to the payment section');
  check((await ad.getByTestId('offer-buyers').textContent()).includes('in the last 24 hours') && (await ad.getByTestId('offer-hurry').textContent()).includes('Hurry'),
    'payment section: buyers line and "Hurry!" countdown at the top');
  await ad.waitForTimeout(400);
  check(!(await ad.getByTestId('offer-sticky').evaluate((el) => el.getBoundingClientRect().top < window.innerHeight)), 'the sticky bar hides while the payment form is on screen');
  await adShot('03c-offer-pay');
  await ad.getByTestId('offer-pay').getByTestId('offer-plan-730').click();
  check((await ad.getByTestId('offer-total').textContent()).replace(/\s+/g, ' ').includes('₹2,250') && (await ad.getByTestId('co-pay').textContent()).includes('Pay now · ₹2,250'),
    'choosing 2 years: total ₹2,250 and "Pay now · ₹2,250"');
  check((await ad.getByTestId('offer-plans').getByTestId('offer-plan-730').getAttribute('aria-checked')) === 'true', 'the plan at the top follows the choice');
  await ad.getByLabel('Full name').fill('Farhan Ali');
  await ad.getByLabel('Mobile number').fill('9123456789');
  await ad.getByLabel('Email address').fill('farhan@example.com');
  await ad.getByTestId('accept-terms').check();
  await ad.getByTestId('co-pay').click();
  await ad.getByTestId('rzp-window').waitFor();
  check((await fbCalls(ad)).some((c) => c[1] === 'InitiateCheckout' && c[2].value === 2250), 'Meta Pixel: InitiateCheckout at "Pay now" (₹2,250)');
  const adRzp = await ad.evaluate(() => window.__rzpOptions);
  check(adRzp.amount === 225000 && adRzp.prefill.email === 'farhan@example.com', 'same Razorpay payment as /buy (₹2,250, email prefilled)');
  await ad.getByTestId('rzp-pay').click();
  await ad.getByTestId('purchase-success').waitFor();
  check(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test((await ad.getByTestId('new-code').textContent()).trim()) && /\(730 days\)/.test(await ad.getByTestId('valid-until').textContent()),
    'payment → account, 2-year license code shown (and emailed, as on /buy)');
  await waitFb(ad, 'Purchase');
  const purchase = (await fbCalls(ad)).find((c) => c[1] === 'Purchase');
  check(purchase[2].value === 2250 && purchase[2].currency === 'INR' && /^purchase-\d+$/.test(purchase[3]?.eventID || ''),
    `Meta Pixel: Purchase after payment (₹2,250) with the event id the server also sends (${purchase[3]?.eventID})`);
  await adShot('03d-offer-paid');
  await adVisitor.close();

  // Website: policies, Contact Us (a visitor's message), Help & Support, Login on a phone.
  for (const [path, title] of [['/terms', 'Terms & Conditions'], ['/privacy', 'Privacy Policy'], ['/shipping', 'Shipping Policy'], ['/refunds', 'Cancellation & Refunds']]) {
    await page.goto(`${base}${path}`);
    await page.getByRole('heading', { level: 1, name: title }).waitFor();
  }
  check((await page.getByTestId('policy-refunds').textContent()).includes('within 7 days'), 'policy pages: Terms, Privacy, Shipping, Cancellation & Refunds');
  await shot('04h-refunds');
  await page.goto(`${base}/contact`);
  check((await page.getByTestId('contact-details').textContent()).includes('info.reynrel@gmail.com'), 'Contact Us: email and business details');
  await page.getByTestId('support-name').fill('Arjun Rao');
  await page.getByTestId('support-email').fill('arjun@example.com');
  await page.getByTestId('support-subject').fill('Bulk licenses');
  await page.getByTestId('support-send').click();
  await page.getByText('Please check the highlighted fields.').waitFor();
  check(true, 'Contact Us: a missing message is explained');
  await page.getByTestId('support-message').fill('We have 5 shops. Is there a price for 5 licenses?');
  await page.getByTestId('support-send').click();
  await page.getByTestId('support-sent').waitFor();
  check(/^#\d+$/.test((await page.getByTestId('support-ref').textContent()).trim()), 'Contact Us: message sent, request number shown');
  await shot('04i-contact');
  await page.goto(`${base}/support`);
  check((await page.getByTestId('support-form').count()) === 1, 'Help & Support page with the request form');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  check(await page.getByTestId('header-login').isVisible(), 'phone: Login button in the header');
  await page.getByTestId('site-menu').click();
  const menu = await page.getByTestId('site-menu-panel').textContent();
  check(['Pricing', 'Help & Support', 'Contact', 'Login', 'Buy now'].every((t) => menu.includes(t)), 'phone: menu with Pricing, Help & Support, Contact, Login and Buy now');
  await shot('04j-phone-menu');
  await page.setViewportSize({ width: 1280, height: 860 });

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
  check(!(await fbCalls(page)).some((c) => c[1] === 'PageView'), 'Meta Pixel: nothing is sent from the admin panel');
  check(/Sales in .*₹5,750/.test((await page.getByTestId('stats').textContent()).replace(/\s+/g, ' ')), 'dashboard: sales this month ₹5,750 (1 year + 2-year extension + 2 years from the offer page)');
  check((await page.getByTestId('recent-sales').textContent()).includes('meera@example.com'), 'dashboard: recent sales');
  const campaign = page.getByTestId('acquisition').locator('tr', { hasText: 'gst-oct' });
  await campaign.waitFor();
  check(/google.*gst-oct.*2.*1.*50%/.test((await campaign.textContent()).replace(/\s+/g, ' ')), 'dashboard: sign-ups and sale attributed to the Google ad campaign');
  check((await page.getByTestId('support-alert').textContent()).includes('2 support requests are waiting'), 'dashboard: support requests waiting for an answer');
  await shot('05-admin-dashboard');

  await page.getByTestId('nav-support-requests').click();
  await page.getByTestId('support-requests').waitFor();
  const requests = await page.getByTestId('support-requests').textContent();
  check(requests.includes('Bulk licenses') && requests.includes('Move license to my new laptop'), 'Support requests: website and client panel requests listed');
  await page.getByRole('link', { name: /Move license to my new laptop/ }).click();
  await page.getByTestId('admin-reply').fill('Open My License, release the old computer and enter your key on the new laptop.');
  await page.getByTestId('admin-reply-send').click();
  await page.getByText('Reply sent to the customer').waitFor();
  await page.getByTestId('admin-request-status').filter({ hasText: 'Answered' }).waitFor();
  check((await page.getByTestId('admin-request-status').textContent()) === 'Answered' && (await page.getByTestId('thread').textContent()).includes('release the old computer'), 'admin answers a request (status Answered)');
  await shot('05b-admin-support');

  await page.getByTestId('nav-products-pricing').click();
  await page.getByTestId('edit-product-DOCGEN').click();
  await page.getByTestId('price-rows').waitFor();
  check((await page.locator('.price-row:not(.price-row-head)').count()) === 3, 'product editor: one row per duration (1, 2 and 5 years)');
  await page.getByTestId('price-amount-0').fill('1500');
  await page.getByTestId('add-price').click();
  await page.getByTestId('price-duration-3').selectOption('1095');
  await page.getByTestId('price-amount-3').fill('3600');
  await page.getByTestId('product-mobile-devices').fill('3');
  await page.waitForTimeout(300);
  await shot('08-products');
  await page.getByTestId('save-product').click();
  await page.getByText('Product saved').waitFor();
  const site = await (await fetch(`${base}/api/portal/site`)).json();
  const prices = site.products[0].prices.map((p) => `${p.durationDays}:${p.price}`).join(' ');
  check(site.products[0].price === 1500 && prices === '365:1500 730:2250 1095:3600 1825:4999', `admin sets the price per duration and adds 3 years without code changes (${prices})`);
  check(site.products[0].maxMobileDevices === 3, 'admin raises the phone limit to 3');
  check((await page.getByTestId('products').textContent()).includes('₹1,500'), 'products table shows the new price');

  await page.getByTestId('nav-website').click();
  await page.getByTestId('site-headline').fill('Invoices your customers trust');
  await page.getByTestId('add-video').click();
  await page.getByTestId('video-url-0').fill('https://www.youtube.com/watch?v=abcdefghijk');
  await page.getByTestId('upload-screenshot').setInputFiles(path.join(here, '../public/logo.png'));
  await page.locator('.thumb').nth(3).waitFor();
  await page.getByTestId('save-site').click();
  await page.getByText('Website updated').waitFor();
  check((await page.getByTestId('pixel-id').inputValue()) === '1862821958226928' && (await page.getByTestId('capi-status').textContent()).includes('Not set up'),
    'Admin → Website: Meta Pixel ID, and the Conversions API shown as not set up (no META_CAPI_TOKEN on this server)');
  await shot('09-website');
  const page2 = await context.newPage();
  await page2.goto(base);
  await page2.getByTestId('videos').waitFor();
  check((await page2.getByTestId('headline').textContent()) === 'Invoices your customers trust', 'website headline changed by the admin');
  check((await page2.locator('[data-testid=videos] iframe').getAttribute('src')).startsWith('https://www.youtube-nocookie.com/embed/abcdefghijk'), 'product video embedded');
  check((await page2.getByTestId('price').first().textContent()).includes('1,500') && (await page2.getByTestId('pricing-cards').textContent()).includes('3 years'), 'website shows the new prices at once');
  await page2.close();
  // The admin switches the offer page and the problems section off.
  check((await page.getByTestId('offer-link').textContent()).trim() === `${base}/offer`, 'Admin → Website shows the offer page link to copy into ads');
  await page.getByTestId('offer-enabled').uncheck();
  await page.getByTestId('site-show-problems').uncheck();
  await page.getByTestId('save-site').click();
  await page.getByText('Website updated').waitFor();
  const visitor = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page3 = await visitor.newPage();
  await page3.goto(`${base}/offer?product=1`);
  await page3.getByTestId('checkout-form').waitFor();
  check(new URL(page3.url()).pathname === '/buy', 'offer page off in Admin → Website: the link opens the normal Buy page');
  await page3.goto(base);
  await page3.getByTestId('headline').waitFor();
  check((await page3.getByTestId('problems').count()) === 0, 'problems section can be switched off');
  await visitor.close();
  await page.getByTestId('offer-enabled').check();
  await page.getByTestId('site-show-problems').check();
  await page.getByTestId('save-site').click();
  await page.getByText('Website updated').waitFor();

  await page.getByTestId('nav-customers').click();
  const meera = page.locator('table:has(th:text("Came from")) tr', { hasText: 'meera@example.com' });
  await meera.waitFor();
  const meeraRow = (await meera.textContent()).replace(/\s+/g, ' ');
  check(meeraRow.includes(code) && meeraRow.includes('₹3,500') && meeraRow.includes('google / cpc · gst-oct'), 'customers: license, amount paid and ad source per customer');
  check((await page.locator('tr', { hasText: 'lead@example.com' }).textContent()).includes('Not bought'), 'customers: unfinished checkout listed as not bought');
  check((await page.locator('tr', { hasText: 'farhan@example.com' }).textContent()).replace(/\s+/g, ' ').includes('facebook / paid_social · offer-oct'), 'customers: the offer-page buyer came from the Facebook ad');
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

  await page.getByTestId('nav-licenses').click();
  await page.getByRole('button', { name: 'Create license codes' }).click();
  await page.locator('.modal').getByLabel('How many codes').fill('5');
  await page.getByTestId('create-license').click();
  const batch = (await page.getByTestId('created-codes').inputValue()).trim().split('\n');
  check(batch.length === 5, 'bulk generated 5 license codes');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByTestId('nav-in-app-ads').click();
  await page.getByTestId('new-ad').click();
  await page.getByTestId('ad-title').fill('Diwali offer: 20% off');
  await page.locator('.modal').getByLabel('Description').fill('Renew before 31 Oct.');
  await page.locator('.modal').getByLabel('Link (opens in browser)').fill('https://reynrel.in/offer');
  await page.locator('.modal').getByLabel('HTML content (optional)').fill('<p style="color:#2f5bea">Limited time</p>');
  await shot('07-ad-editor');
  await page.getByTestId('save-ad').click();
  await page.getByText('Diwali offer: 20% off').waitFor();
  check(true, 'ad created');

  await page.getByTestId('nav-downloads').click();
  await page.locator('.installer-row', { hasText: 'DocGen_1.1.0_x64-setup.exe' }).waitFor();
  const dmg = path.join(dataDir, 'DocGen_1.1.0_universal.dmg');
  fs.writeFileSync(dmg, Buffer.alloc(1000, 2));
  await page.getByTestId('upload-macos').setInputFiles(dmg);
  await page.locator('.installer-row', { hasText: 'DocGen_1.1.0_universal.dmg' }).waitFor();
  check(true, 'admin sees the Windows installer and uploads the macOS one');
  await page.getByTestId('link-linux').fill('https://downloads.example.com/DocGen.AppImage');
  await page.getByTestId('admin-download-macos').getByText('Offer to customers').click();
  await page.getByTestId('admin-download-mobile').getByText('Offer to customers').click();
  await shot('11-downloads');
  await page.getByTestId('save-downloads').click();
  await page.getByText('Downloads updated').waitFor();
  const meeraLogin = await (await fetch(`${base}/api/portal/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'meera@example.com', password: 'meera-pass-123' }) })).json();
  const meeraDownloads = async () => (await (await fetch(`${base}/api/portal/downloads`, { headers: { Authorization: `Bearer ${meeraLogin.token}` } })).json()).files.map((f) => f.platform).join(' ');
  const offered = await meeraDownloads();
  check(offered === 'windows linux', `customer downloads follow the admin settings (${offered}: Linux link added, macOS and mobile switched off)`);
  check((await (await fetch(`${base}/api/portal/site`)).json()).mobileAvailable === false, 'mobile app hidden on the website when switched off');
  await page.getByTestId('admin-download-macos').getByText('Offer to customers').click();
  await page.getByTestId('admin-download-mobile').getByText('Offer to customers').click();
  await page.getByTestId('save-downloads').click();
  await page.getByText('Downloads updated').last().waitFor();
  check((await meeraDownloads()) === 'windows macos linux mobile', 'macOS and the mobile app offered again');

  await page.getByTestId('nav-app-settings').click();
  await page.getByTestId('config-interval').fill('15');
  await page.getByRole('button', { name: 'Add video' }).click();
  const rows = page.locator('table tbody tr');
  await rows.last().locator('input').nth(0).fill('Create your first invoice');
  await rows.last().locator('input').nth(1).fill('https://www.youtube.com/watch?v=abcdefghijk');
  await page.getByTestId('save-config').click();
  await page.getByText('Configuration saved').waitFor();
  const cfg = await (await fetch(`${base}/api/app/config`)).json();
  check(cfg.configIntervalDays === 15 && cfg.ads.length === 1 && cfg.help.videos.length === 1, 'app config endpoint reflects admin changes');

  await page.getByTestId('nav-payments').click();
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

  await page.getByTestId('nav-activity-log').click();
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
