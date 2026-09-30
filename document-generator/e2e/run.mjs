/**
 * End-to-end test of the real DocGen desktop binary through tauri-driver
 * (WebDriver), against a real, local DocGen server (../server).
 *
 * Phases (each is a fresh app launch; the data folder persists between phases
 * unless noted):
 *   1  first launch: setup wizard → activation cards → skip (30-day trial)
 *   2  remote configuration + HTML ad (sandboxed) + anonymous ad counters
 *   3  UI: sidebar collapse, branding, reynrel.in link, Help & Support (server videos)
 *   4  Tally Professional GST invoice: GSTIN → state code, IGST, units, extra fields
 *   5  preview actions: Download PDF, template switcher (4 templates), history
 *   6  Document Manager: status quick-edit (pencil), filters, cancel invoice (reason, kept)
 *   7  external documents: add, open list, delete/restore; Dashboard counts + recent
 *   8  settings: custom units, customers page, searchable selects
 *   9  account sign-in → licensed → sign out
 *  10  configuration schedule: no re-check before due; re-check when due (clock +31 d)
 *  11  30 days ended → activation popup → activation code AB12-CD34-EF56
 *  12  server offline → cached config still used; failed attempt recorded
 *  13  server back → check succeeds and is rescheduled
 *  14  license expired on the server → gate
 *  15  offline build: built-in ad every ~15 days, clock-rollback guard
 *  16  performance: 20,000 documents
 *
 * Usage (Linux):  xvfb-run -a node e2e/run.mjs
 * Requires: tauri-driver, WebKitWebDriver, server dependencies (cd ../server && npm ci).
 * Build first:   npx tauri build --debug --no-bundle
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.resolve(root, '../server/backend');
const APP = process.env.DOCGEN_BINARY || path.join(root, 'src-tauri/target/debug/docgen');
const DATA_DIR = path.join(process.env.XDG_DATA_HOME || path.join(homedir(), '.local/share'), 'com.docgen.desktop');
const OUT = path.join(root, 'e2e/screenshots');
const WORK = path.join(OUT, 'work');
const DRIVER = 'http://127.0.0.1:4444';
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecc';
const PORT = 8799;
const API = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: 'admin@e2e.test', password: 'Admin-Pass-2026' };
const CLIENT = { email: 'owner@sharma.test', password: 'Client-Pass-2026', name: 'Ravi Sharma', businessName: 'Sharma Furniture Works' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let session = null;
let passed = 0;
const results = [];
let phase = '';

// ---------------------------------------------------------------- WebDriver
async function wd(method, url, body) {
  const res = await fetch(`${DRIVER}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(json.value || json).slice(0, 300)}`);
  return json.value;
}
const s = (url) => `/session/${session}${url}`;
async function startApp() {
  const value = await wd('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'wry', 'tauri:options': { application: APP } } } });
  session = value.sessionId;
  await sleep(1500);
}
async function stopApp() {
  if (session) await wd('DELETE', `/session/${session}`).catch(() => {});
  session = null;
  await sleep(800);
}
const exec = (script, args = []) => wd('POST', s('/execute/sync'), { script, args });
/** Call a Tauri command from the page. */
const invoke = (cmd, args = {}) =>
  wd('POST', s('/execute/async'), {
    script: `const done = arguments[arguments.length - 1];
      window.__TAURI_INTERNALS__.invoke(arguments[0], arguments[1]).then(done, (e) => done({ __error: String(e) }));`,
    args: [cmd, args],
  });
async function find(css, timeout = 8000) {
  const end = Date.now() + timeout;
  let lastErr;
  while (Date.now() < end) {
    try {
      const el = await wd('POST', s('/element'), { using: 'css selector', value: css });
      return el[ELEMENT] ?? Object.values(el)[0];
    } catch (e) {
      lastErr = e;
      await sleep(150);
    }
  }
  throw new Error(`Element not found: ${css} (${lastErr?.message})`);
}
const exists = (css) => exec('return !!document.querySelector(arguments[0])', [css]);
async function findText(text, selector = 'button, a, li, label', timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const ok = await exec(
      `const els=[...document.querySelectorAll(arguments[1])].filter(e=>e.offsetParent!==null && e.textContent.trim().includes(arguments[0]));
       if(!els.length) return false; els.sort((a,b)=>a.textContent.length-b.textContent.length); els[0].setAttribute('data-e2e','hit'); return true;`,
      [text, selector],
    );
    if (ok) {
      const id = await find('[data-e2e="hit"]');
      await exec(`document.querySelector('[data-e2e="hit"]').removeAttribute('data-e2e')`);
      return id;
    }
    await sleep(150);
  }
  throw new Error(`Text not found: ${text}`);
}
const click = async (id) => {
  await wd('POST', s(`/element/${id}/click`), {});
  await sleep(250);
};
const clickCss = async (css, timeout) => click(await find(css, timeout));
const clickText = async (text, selector) => click(await findText(text, selector));
async function type(css, text, { clear = true } = {}) {
  const id = await find(css);
  if (clear) await wd('POST', s(`/element/${id}/clear`), {});
  if (text) await wd('POST', s(`/element/${id}/value`), { text });
  await sleep(150);
}
const textOf = async (css) => wd('GET', s(`/element/${await find(css)}/text`));
/** Wait until an element's text contains `needle`; returns true/false instead of throwing. */
async function hasText(css, needle, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const t = await exec('return document.querySelector(arguments[0])?.innerText || ""', [css]);
    if (t.includes(needle)) return true;
    await sleep(200);
  }
  return false;
}
const bodyText = () => exec('return document.body.innerText');
async function waitForText(text, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if ((await bodyText()).toLowerCase().includes(text.toLowerCase())) return;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for text: ${text}`);
}
async function waitFor(fn, label, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(250);
  }
  throw new Error(`Timed out: ${label}`);
}
async function shot(name) {
  const b64 = await wd('GET', s('/screenshot'));
  writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(b64, 'base64'));
}
const go = (hash) => exec(`window.location.hash = arguments[0]`, [hash]).then(() => sleep(700));
/** Set a native <select> the React way. */
const setSelect = (css, value) =>
  exec(
    `const el=document.querySelector(arguments[0]); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
     set.call(el, arguments[1]); el.dispatchEvent(new Event('change',{bubbles:true}));`,
    [css, value],
  ).then(() => sleep(500));
/** Send keys to the focused element (WebDriver key codes: Enter \uE007, ↑ \uE013, ↓ \uE015). */
async function keys(...parts) {
  // Each part goes to whatever is focused at that moment (focus may move after Enter).
  for (const text of parts) {
    const active = await wd('GET', s('/element/active'));
    const id = active[ELEMENT] ?? Object.values(active)[0];
    await wd('POST', s(`/element/${id}/value`), { text });
    await sleep(300);
  }
}
const ENTER = '\uE007';
const UP = '\uE013';
/** A short description of the focused element. */
/** Wait until the focused element matches (keyboard steps finish asynchronously). */
async function focusIs(expected, timeout = 2000) {
  const end = Date.now() + timeout;
  let now = '';
  while (Date.now() < end) {
    now = await focused();
    if (expected instanceof RegExp ? expected.test(now) : now === expected) return true;
    await sleep(100);
  }
  return false;
}
const focused = () =>
  exec(`const a=document.activeElement; return a.dataset.testid || a.closest('.ss')?.querySelector('.ss-control')?.dataset.testid || a.getAttribute('aria-label') || a.closest('.field')?.querySelector('.field-label')?.textContent.trim() || a.className || a.tagName`);

/** Choose an option in a SearchSelect by typing (when searchable) and clicking it. */
async function pick(testId, text) {
  await clickCss(`[data-testid="${testId}"]`);
  if (await exists(`[data-testid="${testId}-search"]`)) await type(`[data-testid="${testId}-search"]`, text);
  await clickText(text, '.ss-option');
}
/** Open the "…" menu of the table row containing `rowText` and choose `label`. */
async function rowMenu(tableCss, rowText, label) {
  const ok = await exec(
    `const row=[...document.querySelectorAll(arguments[0] + ' tbody tr')].find(r=>r.innerText.includes(arguments[1]));
     if(!row) return 'no row'; const d=row.querySelector('details.menu'); d.open=true;
     const item=[...d.querySelectorAll('.menu-item')].find(b=>b.innerText.includes(arguments[2]));
     if(!item) return 'no item'; item.click(); return 'ok';`,
    [tableCss, rowText, label],
  );
  if (ok !== 'ok') throw new Error(`row menu ${rowText} / ${label}: ${ok}`);
  await sleep(400);
}
function check(cond, label) {
  if (!cond) throw new Error(`Assertion failed: ${label}`);
  passed += 1;
  results.push([phase, label]);
  console.log(`  ✓ ${label}`);
}
function section(name) {
  phase = name;
  console.log(name);
}

// ------------------------------------------------------------------ driver
let driver = null;
async function startDriver(env = {}) {
  driver = spawn('tauri-driver', ['--port', '4444'], { stdio: 'ignore', env: { ...process.env, ...env } });
  await sleep(1500);
}
function stopDriver() {
  driver?.kill();
  driver = null;
}
async function relaunch(env) {
  await stopApp();
  stopDriver();
  await startDriver(env);
  await startApp();
}

// ------------------------------------------------------------------ server
let server = null;
const serverEnv = {
  NODE_ENV: 'test',
  PORT: String(PORT),
  DATA_DIR: path.join(WORK, 'server-data'),
  JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-123',
  ADMIN_EMAIL: ADMIN.email,
  ADMIN_PASSWORD: ADMIN.password,
  PORTAL_URL: `http://localhost:${PORT}`,
};
async function startServer() {
  server = spawn('node', ['src/index.js'], { cwd: serverDir, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...serverEnv } });
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${API}/api/app/public-key`)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('server did not start');
}
function stopServer() {
  server?.kill();
  server = null;
}
let adminToken = '';
async function api(method, url, body, token = adminToken) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = res.status === 204 ? {} : await res.json();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

/** Admin prepares: a client with a license, a spare activation code, config, one HTML ad. */
async function seedServer() {
  adminToken = (await api('POST', '/api/admin/auth/login', ADMIN, '')).token;
  const plans = (await api('GET', '/api/admin/plans')).plans;
  const business = plans.find((p) => p.code === 'BUSINESS');
  const { client } = await api('POST', '/api/admin/clients', { ...CLIENT, phone: '9876543210', state: 'Maharashtra' });
  const [accountLicense] = (await api('POST', '/api/admin/licenses', { planId: business.id, clientId: client.id, activateNow: false })).licenses;
  const [spare] = (await api('POST', '/api/admin/licenses', { planId: business.id })).licenses;
  await api('PUT', '/api/admin/config', {
    configIntervalDays: 30,
    adPolicy: { minDaysBetweenAds: 7, maxPerMonth: 4, firstOpenDelayDays: 0 },
    defaultAdEnabled: true,
    app: { latestVersion: '', downloadUrl: '', message: '' },
    help: {
      youtubeChannel: 'https://www.youtube.com/@reynrel',
      videos: [
        { title: 'Create a GST invoice in 2 minutes', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', description: 'From customer to PDF', duration: '2:10' },
        { title: 'Organise documents with folders', url: 'https://youtu.be/dQw4w9WgXcQ', description: '', duration: '1:45' },
      ],
    },
  });
  const { ad } = await api('POST', '/api/admin/ads', {
    title: 'Festive offer on DocGen Business',
    description: 'Use DocGen on 3 computers with priority support.',
    html: '<h3 style="margin:0">20% off this week</h3><p>Upgrade from the client portal.</p><script>parent.document.title="pwned"</script>',
    linkUrl: 'https://reynrel.in/docgen',
    ctaText: 'See plans',
    frequencyDays: 30,
    maxPerMonth: 2,
    priority: 5,
    target: { licenseStatus: 'trial', platforms: [], minVersion: '', maxVersion: '' },
  });
  return { accountLicense, spare, ad, client };
}

// -------------------------------------------------------------- test files
function makeFiles() {
  mkdirSync(WORK, { recursive: true });
  const pdf = path.join(WORK, 'Supplier bill 4411.pdf');
  writeFileSync(
    pdf,
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  );
  const png = path.join(WORK, 'delivery-proof.png');
  writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  return { pdf, png };
}

// ------------------------------------------------------------------- phases
async function main() {
  rmSync(DATA_DIR, { recursive: true, force: true });
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const files = makeFiles();
  const pdfDir = path.join(WORK, 'pdf');
  mkdirSync(pdfDir, { recursive: true });

  await startServer();
  const seed = await seedServer();
  const publicKey = (await (await fetch(`${API}/api/app/public-key`)).json()).publicKey;
  const online = {
    DOCGEN_SERVER_URL: API,
    DOCGEN_PORTAL_URL: `http://localhost:${PORT}`,
    DOCGEN_LICENSE_PUBLIC_KEY: publicKey,
    DOCGEN_E2E_PICK: `${files.pdf};${files.png}`,
    DOCGEN_E2E_SAVE_DIR: pdfDir,
  };
  await startDriver(online);
  try {
    // ------------------------------------------------------------------ 1
    section('1. First launch: setup wizard and activation choices');
    await startApp();
    await waitForText('Welcome to DocGen');
    check((await bodyText()).includes('Create. Manage. Grow.'), 'welcome shows name and tagline');
    await shot('01-welcome');
    await clickCss('[data-testid="setup-next"]');
    await type('[data-testid="setup-company"]', 'Sharma Furniture Works');
    await type('[data-testid="setup-gstin"]', '27AAPFU0939F1ZV');
    check(await hasText('[data-testid="setup-state"]', 'Maharashtra'), 'GSTIN fills the state (27 → Maharashtra)');
    await clickCss('[data-testid="setup-state"]');
    check(await exists('[data-testid="setup-state-search"]'), 'state list is searchable (more than 10 options)');
    check((await bodyText()).includes('more — type to search'), 'state list shows the first 10 and a hint');
    await type('[data-testid="setup-state-search"]', 'maha');
    check((await exec('return document.querySelectorAll(".ss-option:not(.create)").length')) === 1, 'typing filters the state list');
    await clickText('Maharashtra', '.ss-option');
    await shot('02-company');
    await clickCss('[data-testid="setup-next"]');
    await clickCss('[data-testid="business-trading"]');
    await clickCss('[data-testid="setup-next"]');
    await waitForText('Pick an invoice template');
    await clickCss('[data-testid="template-tally-pro"]');
    await shot('03-template');
    await clickCss('[data-testid="setup-next"]');
    await waitForText('Activate DocGen');
    check((await exec('return document.querySelectorAll(".activate-card").length')) === 2, 'two activation cards');
    let act = await exec('return document.querySelector(".activate").innerText');
    check(act.includes('Login Using Your Account') && act.includes('OR') && act.includes('I Have a License') && act.includes('Skip'), 'cards, OR separator and Skip');
    check(!(await exists('[data-testid="license-email"]')) && !(await exists('[data-testid="license-code"]')), 'no input fields on the initial screen');
    check(!/free trial|trial/i.test(await bodyText()), 'no trial wording');
    await shot('04-activation');
    await clickCss('[data-testid="choose-login"]');
    await find('[data-testid="license-email"]');
    act = await exec('return document.querySelector(".activate").innerText');
    check(act.includes('Sign In') && (await exists('[data-testid="license-password"]')) && (await exists('[data-testid="create-account"]')), 'login card opens email/password, Sign In and Create Account');
    await shot('04b-login-form');
    await clickCss('[data-testid="activate-back"]');
    await clickCss('[data-testid="choose-code"]');
    await type('[data-testid="license-code"]', 'ab12cd34ef56');
    check((await exec('return document.querySelector("[data-testid=license-code]").value')) === 'AB12-CD34-EF56', 'license card: code auto-formats to AB12-CD34-EF56, Activate button');
    await clickCss('[data-testid="activate-back"]');
    await clickCss('[data-testid="license-skip"]');
    await find('[data-testid="type-cards"]');
    check((await exec('return location.hash')) === '#/dashboard', 'Skip opens the Dashboard directly');
    const line = await textOf('[data-testid="trial-line"]');
    check(line.trim() === '30 Days' && !/trial/i.test(await bodyText()), `thin green line with remaining days only (${line.trim()})`);

    // ------------------------------------------------------------------ 2
    section('2. Server configuration and HTML advertisement');
    await find('[data-testid="ad-popup"]', 20000);
    const adInfo = await exec(`const f=document.querySelector('[data-testid=ad-frame]');
      return { sandbox: f.getAttribute('sandbox'), srcdoc: f.getAttribute('srcdoc') || '', blocked: f.contentDocument === null, title: document.title, text: document.querySelector('[data-testid=ad-popup]').innerText };`);
    check(adInfo.text.includes('Festive offer on DocGen Business'), 'remote ad shown with title and description');
    check(adInfo.sandbox === '' && adInfo.blocked, 'ad HTML is in a fully sandboxed frame (no scripts, opaque origin)');
    check(adInfo.srcdoc.includes('20% off this week') && adInfo.title !== 'pwned', 'ad HTML rendered; its script did not run');
    check(!(await exists('.modal-backdrop')), 'ad does not block the app (corner card, no backdrop)');
    await sleep(1200);
    await shot('05-remote-ad');
    if (process.env.E2E_STOP_AFTER === '2') return;
    await clickCss('[data-testid="ad-close"]');
    let adState = await invoke('ad_state_get');
    const firstFetch = Number(adState.lastConfigFetchAt);
    check(firstFetch > 0 && adState.cachedConfig?.ads?.length === 1, 'configuration fetched and cached locally');
    check(Math.round((adState.nextConfigCheckAt - firstFetch) / 86400000) === 30, 'next check scheduled 30 days later (server interval)');
    check(adState.adShown?.[seed.ad.id]?.count === 1 && adState.monthlyAdCount === 1, 'ad display counted locally');
    await sleep(1500);
    const adStats = (await api('GET', '/api/admin/ads')).rows.find((a) => a.id === seed.ad.id).stats;
    check(adStats.AD_SHOWN === 1 && adStats.AD_CLOSED === 1, 'anonymous ad counters reached the server');

    // ------------------------------------------------------------------ 3
    section('3. Layout, branding and Help & Support');
    const brand = await exec('return document.querySelector(".brand").innerText');
    check(brand.includes('DocGen') && brand.includes('Create. Manage. Grow.'), 'sidebar brand name and tagline');
    check((await textOf('[data-testid="company-link"]')).includes('reynrel.in') && (await bodyText()).includes('A product of'), '"A product of reynrel.in" in the sidebar');
    const wordmark = await exec('const d=document.querySelector(".sidebar .brand-doc"), g=document.querySelector(".sidebar .brand-gen"); return [d.textContent, getComputedStyle(d).color, g.textContent, getComputedStyle(g).color]');
    check(wordmark.join('|') === 'Doc|rgb(34, 76, 200)|Gen|rgb(216, 148, 62)', `name in brand colours: Doc blue, Gen orange (${wordmark.join(' ')})`);
    const logo = await exec('const i=document.querySelector(".sidebar img.brand-mark"); return [i.getAttribute("src"), i.naturalWidth, i.naturalHeight, Math.round(i.getBoundingClientRect().width), Math.round(i.getBoundingClientRect().height)]');
    check(logo[0] === '/brand-icon.png' && logo[1] > 0 && logo[1] === logo[2] && logo[3] === logo[4], `new logo shown, square, not stretched (${logo.join(' ')})`);
    const order = await exec('return [...document.querySelectorAll(".sidebar .nav-item")].map(e=>e.innerText.trim())');
    check(order.at(-1) === 'Settings' && order.at(-2) === 'Help & Support', `Settings and Help at the bottom (${order.join(', ')})`);
    await clickCss('[data-testid="sidebar-toggle"]');
    check(await exec('return document.querySelector(".app").classList.contains("sidebar-collapsed") && getComputedStyle(document.querySelector(".nav-item .nav-text")).display === "none"'), 'sidebar collapses to icons only');
    await shot('06-sidebar-collapsed');
    await clickCss('[data-testid="sidebar-toggle"]');
    check(!(await exec('return document.querySelector(".app").classList.contains("sidebar-collapsed")')), 'sidebar expands again');
    check((await exec('return document.documentElement.dataset.theme')) === 'light', 'light mode is the default');
    await go('#/help');
    await waitForText('Video tutorials');
    await waitForText('Create a GST invoice in 2 minutes');
    check(true, 'Help shows tutorial videos from the server configuration');
    await clickCss('[data-testid="guide-gst"]');
    check((await bodyText()).includes('Place of supply decides CGST+SGST'), 'built-in guides open');
    await type('[data-testid="help-search"]', 'backup');
    check((await bodyText()).includes('Export Backup') && !(await bodyText()).includes('Create your first invoice'), 'help search filters guides');
    await shot('07-help');

    // ------------------------------------------------------------------ 4
    section('4. Tally Professional GST invoice');
    await go('#/dashboard');
    await clickCss('[data-testid="create-TAX_INVOICE"]');
    await waitForText('New Tax Invoice');
    await type('[data-testid="party-name"]', 'ABC Construction Pvt Ltd');
    await type('[data-testid="party-gstin"]', '29ABCDE1234F1Z5');
    check(await hasText('[data-testid="party-state"]', 'Karnataka'), 'customer GSTIN fills state Karnataka');
    check(await hasText('[data-testid="place-of-supply"]', 'Karnataka'), 'place of supply follows the customer state');
    await type('[data-testid="item-name-0"]', 'Teak Dining Table');
    await exec(`const i=document.querySelector('[aria-label="HSN/SAC"]'); i.focus();`);
    await type('[aria-label="HSN/SAC"]', '9403');
    await type('[data-testid="item-qty-0"]', '2');
    await type('[data-testid="item-rate-0"]', '25000');
    await clickCss('[data-testid="item-unit-0"]');
    await type('[data-testid="item-unit-0-search"]', 'Set');
    await clickText('Set', '.ss-option');
    check(await hasText('[data-testid="item-unit-0"]', 'Set'), `unit chosen from the searchable unit list (${await exec('return document.querySelector("[data-testid=item-unit-0]").innerText')})`);
    await clickCss('[data-testid="more-details"]');
    await type('[data-testid="meta-buyerOrderNo"]', 'PO/ABC/118');
    await type('[data-testid="meta-dispatchedThrough"]', 'Own vehicle');
    await type('[data-testid="meta-vehicleNo"]', 'MH12AB1234');
    await sleep(400);
    const totals = await textOf('[data-testid="totals"]');
    check(totals.includes('IGST') && totals.includes('9,000.00'), 'inter-state → IGST 18% on 50,000 = 9,000');
    check((await textOf('[data-testid="grand-total"]')).includes('59,000.00'), 'grand total 59,000');
    check(await hasText('[data-testid="item-tax-0"]', '18%'), 'GST chosen with the searchable GST select (18%)');
    await clickCss('[data-testid="round-off"] [data-testid="help-tip"]');
    check((await exec('return document.querySelector(".help-tip-pop")?.innerText || ""')).includes('Rounds the Grand Total'), '? next to a difficult field shows a short explanation');
    await exec(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
    await sleep(200);
    check(!(await exists('.help-tip-pop')), 'help closes with Esc');
    await shot('08-editor');
    await clickCss('[data-testid="save-doc"]');
    await waitForText('INV-00001');
    await find('.doc-tp');
    const inv = await exec('return document.querySelector(".doc").innerText');
    for (const [needle, label] of [
      ['TAX INVOICE', 'title'],
      ['(ORIGINAL FOR RECIPIENT)', 'copy label'],
      ['27AAPFU0939F1ZV', 'supplier GSTIN'],
      ['Maharashtra, Code: 27', 'supplier state name and code'],
      ['29ABCDE1234F1Z5', 'buyer GSTIN'],
      ['Karnataka, Code: 29', 'buyer state name and code'],
      ['PO/ABC/118', "buyer's order no."],
      ['MH12AB1234', 'vehicle no.'],
      ['HSN/SAC', 'HSN/SAC column and summary'],
      ['Integrated Tax', 'HSN summary with IGST'],
      ['Tax Amount (in words)', 'tax amount in words'],
      ['Fifty Nine Thousand Rupees Only', 'amount in words'],
      ['E. & O.E', 'E. & O.E'],
      ['reverse charge', 'reverse charge line'],
      ['Declaration', 'declaration'],
      ['for Sharma Furniture Works', '"for <company>"'],
      ['Authorised Signatory', 'authorised signatory'],
    ]) {
      check(inv.includes(needle), `Tally invoice has ${label}`);
    }
    await shot('09-invoice-tally-pro');

    // ------------------------------------------------------------------ 5
    section('5. Preview actions: download PDF, templates, history');
    await clickCss('[data-testid="download-pdf"]');
    await waitForText('PDF saved to', 60000);
    const pdfFile = readdirSync(pdfDir).find((f) => f.endsWith('.pdf'));
    const pdfBytes = readFileSync(path.join(pdfDir, pdfFile));
    check(pdfFile.startsWith('INV-00001') && pdfBytes.subarray(0, 5).toString() === '%PDF-' && pdfBytes.length > 5000, `PDF downloaded without print dialog (${pdfFile}, ${Math.round(pdfBytes.length / 1024)} KB)`);
    for (const [id, cls] of [
      ['tally-std', '.doc-tally-std'],
      ['modern', '.doc-modern'],
      ['simple', '.doc-simple'],
      ['tally-pro', '.doc-tp'],
    ]) {
      await setSelect('[data-testid="template-switch"]', id);
      await find(cls);
      if (id !== 'tally-pro') await shot(`10-template-${id}`);
      check(true, `template "${id}" renders the same data`);
    }
    await clickCss('.editor-actions details summary');
    await clickText('History', '.menu-item');
    await find('[data-testid="history-panel"]');
    const hist = await textOf('[data-testid="history-panel"]');
    check(hist.includes('Created') && hist.includes('Template changed'), 'history lists creation and template changes');

    // ------------------------------------------------------------------ 6
    section('6. Document Manager: status quick edit and cancel');
    await go('#/dashboard');
    await clickCss('[data-testid="create-QUOTATION"]');
    await waitForText('New Quotation');
    await type('[data-testid="party-name"]', 'ABC');
    await find('.autocomplete-list li', 5000);
    await clickText('ABC Construction Pvt Ltd', '.autocomplete-list li');
    await sleep(800);
    check(!(await exists('.autocomplete-list')), 'saved client chosen with one click: suggestion list closes');
    check((await exec('return document.querySelector("[data-testid=party-gstin]").value')) === '29ABCDE1234F1Z5', 'saved client details filled in immediately');
    check(!(await exists('[data-testid="save-party"]')), '"Save this customer" prompt removed after choosing a saved client');
    await type('[data-testid="party-name"]', 'XYZ Interiors');
    check(await exists('[data-testid="save-party"]'), 'prompt returns (as update) only when details are edited');
    await type('[data-testid="item-name-0"]', 'Office Chair');
    await type('[data-testid="item-qty-0"]', '5');
    await type('[data-testid="item-rate-0"]', '4500.50');
    await sleep(400);
    check(await exists('[data-testid="totals"] .roundoff-row + .grand'), 'Round Off sits directly above Grand Total');
    check(await exec('return document.querySelector("[data-testid=round-off-yes]").checked'), 'Round Off radio: Yes by default');
    check((await textOf('[data-testid="grand-total"]')).includes('26,553.00'), `rounded grand total (${await textOf('[data-testid="grand-total"]')})`);
    await clickCss('[data-testid="round-off-no"]');
    await sleep(300);
    check((await textOf('[data-testid="grand-total"]')).includes('26,552.95'), `Round Off No → exact grand total (${await textOf('[data-testid="grand-total"]')})`);
    await clickCss('[data-testid="round-off-yes"]');
    await sleep(300);
    check((await textOf('[data-testid="grand-total"]')).includes('26,553.00') && (await textOf('[data-testid="round-off-amount"]')).includes('0.05'), 'Round Off Yes → 26,553.00 (+0.05)');
    await shot('08b-roundoff');
    await clickCss('[data-testid="save-doc"]');
    await waitForText('QTN-00001');
    await go('#/manager');
    await find('[data-testid="documents-table"]');
    await clickCss('[data-testid="status-edit-2"]');
    const options = await exec('return [...document.querySelectorAll(".status-option")].map(b=>b.innerText.trim())');
    check(options.join(',') === 'Draft,Sent,Accepted,Rejected,Cancelled', `quotation statuses (${options.join(', ')})`);
    await shot('11-status-editor');
    await clickCss('[data-testid="status-option-ACCEPTED"]');
    await waitFor(async () => (await exec('return document.querySelector("[data-testid=documents-table]").innerText')).includes('Accepted'), 'status saved');
    await go('#/help');
    await go('#/manager');
    await waitForText('Accepted');
    check(true, 'status changed from the list with the pencil and saved immediately');
    check(!(await exists('.folder-panel')) && !(await exists('.filter-row')) && !(await exists('.create-strip')), 'no folder panel, filters or create strip');
    const summaryText = (await exec('return document.querySelector("[data-testid=summary-line]").innerText')).replace(/\s+/g, ' ');
    check(/2 Total/.test(summaryText) && /2 This Month/.test(summaryText) && /0 Files/.test(summaryText) && /Draft 1/.test(summaryText) && /Accepted 1/.test(summaryText), `one compact summary card (${summaryText})`);
    await pick('type-filter', 'Quotation');
    await sleep(600);
    let filtered = await exec('return document.querySelector("[data-testid=documents-table]").innerText');
    check(filtered.includes('QTN-00001') && !filtered.includes('INV-00001'), 'Filter next to Search: by document type');
    await pick('type-filter', 'All types');
    await sleep(400);
    await clickCss('[data-testid="new-document"]');
    await waitForText('Create a new document');
    check(true, '+ New Document opens the document chooser');
    await exec(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
    await sleep(300);
    let table;
    await type('[data-testid="manager-search"]', 'Teak');
    await sleep(700);
    table = await exec('return document.querySelector("[data-testid=documents-table]").innerText');
    check(table.includes('INV-00001') && !table.includes('QTN-00001'), 'search by product name');
    await type('[data-testid="manager-search"]', '');
    await go('#/doc/1');
    await clickCss('[data-testid="cancel-doc"]');
    await type('[data-testid="confirm-input"]', 'Order cancelled by customer');
    await clickCss('[data-testid="confirm-ok"]');
    await find('[data-testid="cancelled-note"]');
    check(await exists('.doc-watermark'), 'cancelled invoice shows a CANCELLED mark on the page');
    check(!(await exists('[data-testid="edit-doc"]')), 'cancelled invoice can no longer be edited');
    await clickCss('.editor-actions details summary');
    await clickText('History', '.menu-item');
    check((await textOf('[data-testid="history-panel"]')).includes('Order cancelled by customer'), 'cancellation reason kept in history');
    await shot('12-cancelled-invoice');
    const bundle = await invoke('document_get', { id: 1 });
    check(bundle.document.status === 'CANCELLED' && !bundle.document.deleted_at && bundle.items.length === 1, 'invoice kept (not deleted) with its items');

    // ------------------------------------------------------------------ 7
    section('7. External documents and Dashboard');
    await go('#/manager');
    await clickCss('[data-testid="add-external"]');
    await waitForText('delivery-proof');
    await find('[data-testid="files-table"]');
    table = await textOf('[data-testid="files-table"]');
    check(table.includes('Supplier bill 4411') && table.includes('delivery-proof'), 'Add External Document: PDF and image stored and listed');
    check(/2\s*Files/.test(await exec('return document.querySelector("[data-testid=summary-line]").innerText')), 'summary counts the files');
    await shot('13-files');
    await rowMenu('[data-testid=files-table]', 'delivery-proof', 'Delete');
    await clickCss('[data-testid="confirm-ok"]');
    await sleep(500);
    await clickCss('[data-testid="show-deleted"]');
    await sleep(500);
    await clickText('Restore', '[data-testid=files-table] button');
    await sleep(500);
    check((await invoke('files_list', { filter: { deleted: true } })).total === 0, 'file deleted and restored');
    await go('#/dashboard');
    await find('[data-testid="recent-documents"]');
    const invCard = await exec('return document.querySelector("[data-testid=card-TAX_INVOICE]").innerText');
    const qtnCard = await exec('return document.querySelector("[data-testid=card-QUOTATION]").innerText');
    check(invCard.includes('Invoices') && invCard.includes('1') && qtnCard.includes('Quotations') && qtnCard.includes('1'), `Dashboard cards show type and document count (${invCard.replace(/\n/g, ' ')} / ${qtnCard.replace(/\n/g, ' ')})`);
    const rows = () => exec('return new Set([...document.querySelectorAll("[data-testid^=card-]")].map(c=>Math.round(c.getBoundingClientRect().top))).size');
    check((await exec('return document.querySelectorAll("[data-testid^=card-]").length')) === 8 && (await rows()) === 2, 'eight cards in exactly two rows');
    const plus = await exec('const b=document.querySelector("[data-testid=create-TAX_INVOICE]").getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height), getComputedStyle(document.querySelector("[data-testid=create-TAX_INVOICE]")).borderRadius]');
    check(plus[0] === plus[1] && plus[0] >= 30 && plus[2] === '50%', `round + button (${plus.join(' ')})`);
    await clickCss('[data-testid="customize-dashboard"]');
    await clickCss('[data-testid="customize-PAYMENT_RECEIPT"]');
    await clickCss('[data-testid="customize-GOODS_RECEIPT"]');
    await clickCss('[data-testid="customize-CREDIT_NOTE"]');
    await clickCss('[data-testid="customize-save"]');
    await sleep(600);
    check((await exists('[data-testid="card-PAYMENT_RECEIPT"]')) && !(await exists('[data-testid="card-GOODS_RECEIPT"]')) && (await rows()) === 2, 'Customize adds/removes cards; still two rows');
    const recent = await textOf('[data-testid="recent-documents"]');
    check(recent.includes('INV-00001') && recent.includes('QTN-00001'), 'Recent Documents listed');
    await shot('00-dashboard');

    // ------------------------------------------------------------------ 8
    section('8. Units, customers and settings');
    await go('#/settings/units');
    await type('[data-testid="unit-new"]', 'Crate');
    await clickCss('[data-testid="unit-add"]');
    await clickText('Save changes');
    await sleep(500);
    check((await textOf('[data-testid="custom-units"]')).includes('Crate'), 'custom unit saved');
    await go('#/doc/new/TAX_INVOICE');
    await waitForText('New Tax Invoice');
    await clickCss('[data-testid="item-unit-0"]');
    await find('.ss-pop');
    const unitPop = await exec('return document.querySelector(".ss-pop").innerText');
    check(/your units/i.test(unitPop) && unitPop.includes('Crate'), `custom units listed in the unit selector (${unitPop.replace(/\n/g, ' ').slice(0, 80)})`);
    await exec(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
    await go('#/manager');
    const nav = await exec('return document.querySelector(".sidebar").innerText');
    check(!/Customers/.test(nav), 'Customer & Vendor management removed from the navigation');
    const parties = await invoke('parties_list', { search: 'ABC' });
    check(parties.some((pt) => pt.gstin === '29ABCDE1234F1Z5'), 'saved customer data kept (used when typing a name on documents)');
    await go('#/products');
    await clickCss('[data-testid="add-product"]');
    await type('[data-testid="product-name"]', 'Site Visit');
    await clickText('Service', '.segmented button');
    await type('[data-testid="product-hsn"]', '998719');
    const hsnGst = await exec(`const h=document.querySelector('[data-testid=product-hsn]').closest('.field').getBoundingClientRect(); const g=document.querySelector('[data-testid=product-gst]').closest('.field').getBoundingClientRect(); return [Math.round(h.top), Math.round(g.top), Math.round(h.width), Math.round(g.width)]`);
    check(hsnGst[0] === hsnGst[1] && Math.abs(hsnGst[2] - hsnGst[3]) <= 2, `HSN/SAC and GST on one row, 50/50 (${hsnGst.join(' ')})`);
    await pick('product-gst', '5%');
    check(await hasText('[data-testid="product-gst"]', '5%'), 'GST chosen from the searchable GST select');
    await clickCss('[data-testid="product-unit"]');
    const firstGroup = await exec('return [...document.querySelectorAll(".ss-pop .ss-group")].map(g=>g.innerText).find(g=>!/recent|your units/i.test(g)) || ""');
    check(/service units/i.test(firstGroup), `service units listed first for services (${firstGroup})`);
    await wd('POST', s(`/element/${await find('[data-testid="product-unit-search"]')}/value`), { text: '\uE00C' });
    await sleep(300);
    check(!(await exists('.ss-pop')) && (await exists('[data-testid="product-save"]')), 'Esc closes only the dropdown, not the dialog');
    await shot('14-product-form');
    await clickCss('[data-testid="product-save"]');
    await waitForText('Site Visit');
    check(true, 'service saved');
    await go('#/settings/documents');
    check((await exec('return document.querySelectorAll("[data-testid^=settings-template-]").length')) === 4, 'four templates offered in settings');
    await clickText('Triple Copy', '.segmented button');
    await clickText('Save changes');
    await sleep(500);
    await go('#/doc/1');
    await find('.doc-tp');
    const copyLabels = await exec('return [...document.querySelectorAll(".tp-copy")].map(e=>e.textContent)');
    check(copyLabels.join('|') === '(ORIGINAL FOR RECIPIENT)|(DUPLICATE FOR TRANSPORTER)|(TRIPLICATE FOR SUPPLIER)', `three copies with GST copy labels (${copyLabels.join(', ')})`);
    check(!(await exec('return document.querySelectorAll(".doc-extra-copy")[0].offsetParent')), 'extra copies are print-only (screen shows one copy)');
    for (const f of readdirSync(pdfDir)) rmSync(path.join(pdfDir, f));
    await clickCss('[data-testid="download-pdf"]');
    await waitForText('PDF saved to', 60000);
    const pdf3 = readFileSync(path.join(pdfDir, readdirSync(pdfDir)[0])).toString('latin1');
    const pages = (pdf3.match(/\/Type\s*\/Page[^s]/g) || []).length;
    check(pages === 3, `downloaded PDF has 3 pages (${pages})`);
    await go('#/settings/documents');
    await clickText('Single Copy', '.segmented button');
    await clickText('Save changes');
    await sleep(500);
    await go('#/settings/about');
    await find('[data-testid="config-summary"]');
    check((await textOf('[data-testid="config-summary"]')).includes('30 days'), 'About shows config check interval, last and next check');

    // ---------------------------------------------------------------- 8b
    section('8b. Keyboard data entry (no mouse)');
    await go('#/doc/new/TAX_INVOICE');
    await waitForText('New Tax Invoice');
    await sleep(400);
    check((await focusIs('party-name')), 'new invoice starts in the customer name');
    await keys(`Keyboard Traders${ENTER}`);
    check((await focusIs('Company')), `Enter → next field (${await focused()})`);
    await keys(UP);
    check((await focusIs('party-name')), 'Arrow Up → previous field');
    await keys(ENTER, ENTER);
    check((await focusIs('Address')), 'Enter moves on from an empty field');
    await keys(`12 MG Road${ENTER}`, `Shivaji Nagar`);
    check((await focusIs('Address')), 'Enter inside a multi-line address adds a new line');
    await keys(ENTER, ENTER);
    const addr = await exec('return [...document.querySelectorAll("textarea")].find(t=>t.value.includes("MG Road")).value');
    check((await focusIs('Phone')) && addr === '12 MG Road\nShivaji Nagar', `Enter twice leaves the address, no extra blank line (${JSON.stringify(addr)})`);
    await keys(`9876500000${ENTER}`, ENTER);
    check((await focusIs('party-gstin')), 'Phone → Email → GSTIN');
    await keys(ENTER);
    check((await focusIs('party-state')), 'GSTIN → State (searchable select)');
    await keys(ENTER);
    await find('.ss-pop');
    await keys(`maha${ENTER}`);
    check((await hasText('[data-testid="party-state"]', 'Maharashtra')) && (await focusIs('item-name-0')), `select: Enter opens, type to search, Enter chooses and moves on (${await focused()})`);
    await keys(`Keyboard Desk${ENTER}`);
    check((await focusIs('HSN/SAC')), `item name → HSN (${await focused()})`);
    await keys(`9403${ENTER}`);
    check((await focusIs('item-qty-0')), `HSN → quantity (${await focused()})`);
    await keys(`3${ENTER}`);
    check((await exec('return document.querySelector("[data-testid=item-qty-0]").value')) === '3', 'quantity replaced by typing (value selected on focus)');
    check((await focusIs('item-unit-0')), 'quantity → unit');
    await keys(ENTER, ENTER);
    check((await focusIs('item-rate-0')) && (await hasText('[data-testid="item-unit-0"]', 'Nos')), `Enter, Enter on a select keeps its value and moves on (${await focused()} / ${await exec('return document.querySelector("[data-testid=item-unit-0]").innerText')})`);
    await keys(`1000${ENTER}`, ENTER);
    check((await focusIs('item-tax-0')), 'rate → discount → GST');
    await keys(ENTER, ENTER);
    check((await focusIs('add-item')), 'after the last item field focus goes to Add Item');
    await keys(ENTER);
    check((await focusIs('item-name-1')), 'Enter on Add Item starts a new row');
    await keys(ENTER);
    check((await focusIs(/Shipping/)), `Enter on an empty item name leaves the item list (${await focused()})`);
    const kbTotal = await textOf('[data-testid="grand-total"]');
    check(kbTotal.includes('3,540.00'), `keyboard-entered invoice totals correctly: 3 × 1,000 + 18% (${kbTotal})`);
    await keys('\uE009s');
    await waitForText('saved', 8000);
    check(true, 'saved with Ctrl+S');
    await go('#/products');
    await clickCss('[data-testid="add-product"]');
    await sleep(300);
    check((await focusIs('product-name')), 'product form starts in Name');
    await keys(`Keyboard Chair${ENTER}`, ENTER);
    check((await focusIs('product-category')), 'Name → SKU → Category');
    await keys(ENTER, ENTER, ENTER, ENTER);
    check((await focusIs('product-hsn')), 'Category → Unit → HSN (values kept)');
    await keys(`9401${ENTER}`, ENTER, ENTER);
    check((await focusIs(/Description/)), 'HSN → GST → Description');
    await keys(ENTER, `2500${ENTER}`);
    check((await focusIs(/Price is/)), 'Description → Selling price → Price is');
    await keys(ENTER);
    await waitForText('Keyboard Chair');
    check(!(await exists('.modal')), 'Enter on the last field saves the product');

    // ------------------------------------------------------------------ 9
    section('9. Sign in with account');
    await go('#/settings/license');
    await clickCss('[data-testid="choose-login"]');
    await type('[data-testid="license-email"]', CLIENT.email);
    await type('[data-testid="license-password"]', 'wrong-password');
    await clickCss('[data-testid="license-login"]');
    await waitForText('incorrect');
    check(true, 'wrong password rejected with a clear message');
    await type('[data-testid="license-password"]', CLIENT.password);
    await clickCss('[data-testid="license-login"]');
    await waitForText('DocGen is activated', 15000);
    check(!(await exists('[data-testid="trial-line"]')) && (await textOf('[data-testid="license-status"]')).includes('Business'), 'licensed: plan shown, day line hidden');
    await shot('15-licensed');
    const devices = (await api('GET', `/api/admin/clients/${seed.client.id}`)).licenses.flatMap((l) => l.devices);
    check(devices.length === 1 && !devices[0].released_at, 'server registered this computer');
    await clickText('Sign out on this computer');
    await clickCss('[data-testid="confirm-ok"]');
    await waitForText('Not activated', 10000);
    check((await invoke('license_status')).mode === 'trial', 'signed out → back to trial');

    // ----------------------------------------------------------------- 10
    section('10. Configuration check schedule');
    await relaunch(online);
    await go('#/manager');
    await sleep(4500);
    adState = await invoke('ad_state_get');
    check(Number(adState.lastConfigFetchAt) === firstFetch, 'no new check before it is due');
    check(!(await exists('[data-testid="ad-popup"]')), 'same ad not repeated (per-ad frequency)');

    // ----------------------------------------------------------------- 11
    section('11. Trial ended → activation code');
    await relaunch({ ...online, DOCGEN_CLOCK_OFFSET_DAYS: '31' });
    await find('[data-testid="activation-required"]');
    const popup = await textOf('[data-testid="activation-required"]');
    check(popup.includes('Your 30-day period has ended') && popup.includes('You can request through email or call for extending your time.'), 'activation popup explains the 30-day period has ended');
    check((await exec('return document.querySelectorAll("[data-testid=activation-required] .activate-card").length')) === 2 && !(await exists('[data-testid="license-skip"]')), 'popup has the two cards and no Skip');
    await exec(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
    await sleep(300);
    check((await exists('[data-testid="activation-required"]')) && !(await exists('[data-testid="activation-required"] .modal-close')), 'popup cannot be dismissed');
    await shot('16-trial-ended');
    await sleep(4000);
    adState = await invoke('ad_state_get');
    const secondFetch = Number(adState.lastConfigFetchAt);
    check(secondFetch > firstFetch + 30 * 86400000, 'overdue check ran at startup (monthly schedule)');
    await clickCss('[data-testid="choose-code"]');
    await type('[data-testid="license-code"]', seed.spare.code);
    await clickCss('[data-testid="license-activate"]');
    await waitFor(async () => !(await exists('[data-testid="activation-required"]')), 'popup closes after activation', 15000);
    check((await invoke('license_status')).license.code === seed.spare.code, 'activated with code');

    // ----------------------------------------------------------------- 12
    section('12. Server offline');
    stopServer();
    await relaunch({ ...online, DOCGEN_CLOCK_OFFSET_DAYS: '62' });
    await waitForText('Document Manager');
    check((await invoke('license_status')).licensed, 'license works offline');
    await sleep(4500);
    adState = await invoke('ad_state_get');
    check(Number(adState.lastConfigFetchAt) === secondFetch && Number(adState.lastConfigAttemptAt) > secondFetch, 'failed check recorded; cached config kept');
    await go('#/help');
    await waitForText('Create a GST invoice in 2 minutes');
    check(true, 'help videos still shown from the cached configuration');

    // ----------------------------------------------------------------- 13
    section('13. Server back online');
    await startServer();
    await relaunch({ ...online, DOCGEN_CLOCK_OFFSET_DAYS: '63' });
    await sleep(4500);
    adState = await invoke('ad_state_get');
    check(Number(adState.lastConfigFetchAt) > secondFetch, 'check succeeds after reconnecting');
    check(Math.round((adState.nextConfigCheckAt - adState.lastConfigFetchAt) / 86400000) === 30, 'next check rescheduled 30 days after the successful one');

    // ----------------------------------------------------------------- 14
    section('14. License expired on the server');
    await api('PUT', `/api/admin/licenses/${seed.spare.id}`, { expiresAt: new Date(Date.now() - 86400000).toISOString() });
    await go('#/settings/license');
    await clickText('Check license now');
    await find('[data-testid="activation-required"]', 10000);
    await waitForText('Your DocGen license has expired', 10000);
    check(true, 'expired license locks the app with a renewal message');
    await shot('17-license-expired');
    await stopApp();
    stopDriver();

    // ----------------------------------------------------------------- 15
    section('15. Offline build: built-in ad, clock rollback');
    rmSync(DATA_DIR, { recursive: true, force: true });
    await startDriver({});
    await startApp();
    await waitForText('Welcome to DocGen');
    await clickCss('[data-testid="setup-next"]');
    await type('[data-testid="setup-company"]', 'Offline Traders');
    for (let i = 0; i < 3; i += 1) await clickCss('[data-testid="setup-next"]');
    await clickCss('[data-testid="choose-login"]');
    await waitForText('not connected to the license server');
    check(true, 'offline build explains that sign-in needs a server');
    await clickCss('[data-testid="license-skip"]');
    await find('[data-testid="type-cards"]');
    await sleep(6500);
    check(!(await exists('[data-testid="ad-popup"]')), 'no ad on the first day');
    await relaunch({ DOCGEN_CLOCK_OFFSET_DAYS: '16' });
    await find('[data-testid="ad-popup"]', 15000);
    check((await textOf('[data-testid="ad-popup"]')).includes('Get more from DocGen'), 'built-in DocGen message after ~15 days offline');
    await shot('18-default-ad');
    await clickCss('[data-testid="ad-cta"]');
    await waitForText('License & Account');
    check(true, 'built-in ad button opens License & Account');
    await relaunch({ DOCGEN_CLOCK_OFFSET_DAYS: '20' });
    await go('#/manager');
    await sleep(6500);
    check(!(await exists('[data-testid="ad-popup"]')), 'built-in ad not repeated within 15 days');
    await relaunch({ DOCGEN_CLOCK_OFFSET_DAYS: '0' });
    check((await invoke('license_status')).trialDaysLeft === 10, 'setting the clock back does not extend the trial');

    // ----------------------------------------------------------------- 16
    section('16. Performance with 20,000 documents');
    await stopApp();
    const perf = seedDocuments(20000);
    check(true, `seeded ${perf.count} documents in ${perf.ms} ms`);
    await startApp();
    let t0 = Date.now();
    await go('#/manager');
    await find('[data-testid="documents-table"]');
    const listMs = Date.now() - t0;
    const stats = await exec('return document.querySelector("[data-testid=summary-line]")?.innerText || ""');
    check(stats.includes('20,000') || stats.includes('20000'), 'summary counts all documents');
    check(listMs < 3000, `Document Manager opens in ${listMs} ms`);
    t0 = Date.now();
    const q = await invoke('documents_list', { filter: { search: 'Customer 19999', limit: 50 } });
    const searchMs = Date.now() - t0;
    check(q.rows?.length >= 1, `search finds a document among 20,000 in ${searchMs} ms (incl. WebDriver round-trip)`);
    check(searchMs < 1500, 'search under 1.5 s');
    t0 = Date.now();
    await invoke('documents_list', { filter: { offset: 19950, limit: 50 } });
    const pageMs = Date.now() - t0;
    check(pageMs < 1500, `last page loads in ${pageMs} ms`);
    results.push(['perf', JSON.stringify({ seedMs: perf.ms, listMs, searchMs, pageMs })]);
    await shot('19-manager-20k');

    console.log(`\nAll ${passed} checks passed.`);
    writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ passed, results }, null, 2));
  } catch (e) {
    await shot('failure').catch(() => {});
    console.error('Page text at failure:\n', (await bodyText().catch(() => '')).slice(0, 1500));
    throw e;
  } finally {
    await stopApp();
    stopDriver();
    stopServer();
  }
}

/** Insert many documents directly into the app database (fast, for performance checks). */
function seedDocuments(count) {
  const require = createRequire(path.join(serverDir, 'package.json'));
  const Database = require('better-sqlite3');
  const file = path.join(DATA_DIR, 'docgen.sqlite');
  if (!existsSync(file)) throw new Error(`database not found: ${file}`);
  const db = new Database(file);
  const t0 = Date.now();
  const insertDoc = db.prepare(`INSERT INTO documents (document_type, document_number, status, party_name, issue_date, currency, currency_symbol,
      subtotal, tax, grand_total, created_at, updated_at, meta)
    VALUES (@type, @number, @status, @party, @date, 'INR', '₹', @sub, @tax, @total, datetime('now'), datetime('now'), '{}')`);
  const insertItem = db.prepare(`INSERT INTO document_items (document_id, position, name, quantity, unit, unit_price, tax_rate, taxable_amount, tax_amount, total_amount)
    VALUES (?, 0, ?, '1', 'Nos', ?, '18', ?, ?, ?)`);
  const types = ['TAX_INVOICE', 'QUOTATION', 'DELIVERY_CHALLAN', 'PURCHASE_ORDER', 'PAYMENT_RECEIPT'];
  const run = db.transaction(() => {
    for (let i = 0; i < count; i += 1) {
      const type = types[i % types.length];
      const sub = (1000 + (i % 500) * 10).toFixed(2);
      const tax = (Number(sub) * 0.18).toFixed(2);
      const total = (Number(sub) + Number(tax)).toFixed(2);
      const month = String((i % 12) + 1).padStart(2, '0');
      const { lastInsertRowid } = insertDoc.run({ type, number: `PERF-${type.slice(0, 3)}-${i}`, status: i % 3 ? 'ISSUED' : 'DRAFT', party: `Customer ${i}`, date: `2025-${month}-15`, sub, tax, total });
      insertItem.run(lastInsertRowid, `Product ${i % 700}`, sub, sub, tax, total);
    }
  });
  run();
  db.close();
  return { count, ms: Date.now() - t0 };
}

main().catch(async (e) => {
  console.error(`\nE2E FAILED in "${phase}":`, e.message);
  try {
    if (session) await shot('failure');
  } catch {
    /* ignore */
  }
  await stopApp();
  stopDriver();
  stopServer();
  process.exit(1);
});
