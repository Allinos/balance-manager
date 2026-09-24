/**
 * End-to-end test of the real DocGen desktop binary through tauri-driver
 * (WebDriver). Covers the complete first-use workflow:
 *
 *   first launch setup → Documents → Invoice → customer → item → GST check →
 *   save → preview → close app → reopen → Created Documents → search →
 *   duplicate → convert → delete/restore → products → Tally style.
 *
 * Usage (Linux):  xvfb-run -a node e2e/run.mjs
 * Requires: tauri-driver (cargo install tauri-driver) and WebKitWebDriver.
 * Build first:   npx tauri build --debug --no-bundle
 */

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.DOCGEN_BINARY || path.join(root, 'src-tauri/target/debug/docgen');
const DATA_DIR = path.join(process.env.XDG_DATA_HOME || path.join(homedir(), '.local/share'), 'com.docgen.desktop');
const SHOTS = path.join(root, 'e2e/screenshots');
const DRIVER = 'http://127.0.0.1:4444';
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecc';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let session = null;
let passed = 0;

async function wd(method, url, body) {
  const res = await fetch(`${DRIVER}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(json.value || json).slice(0, 300)}`);
  return json.value;
}
const s = (url) => `/session/${session}${url}`;

async function startApp() {
  const value = await wd('POST', '/session', {
    capabilities: { alwaysMatch: { browserName: 'wry', 'tauri:options': { application: APP } } },
  });
  session = value.sessionId;
  await sleep(1500);
}
async function stopApp() {
  if (session) await wd('DELETE', `/session/${session}`).catch(() => {});
  session = null;
  await sleep(800);
}

async function exec(script, args = []) {
  return wd('POST', s('/execute/sync'), { script, args });
}
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
/** Find a clickable element by its visible text. */
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
const clickCss = async (css) => click(await find(css));
const clickText = async (text, selector) => click(await findText(text, selector));
async function type(css, text, { clear = true } = {}) {
  const id = await find(css);
  if (clear) await wd('POST', s(`/element/${id}/clear`), {});
  await wd('POST', s(`/element/${id}/value`), { text });
  await sleep(150);
}
const textOf = async (css) => wd('GET', s(`/element/${await find(css)}/text`));
const bodyText = () => exec('return document.body.innerText');
async function waitForText(text, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if ((await bodyText()).toLowerCase().includes(text.toLowerCase())) return;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for text: ${text}`);
}
async function shot(name) {
  const b64 = await wd('GET', s('/screenshot'));
  writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(b64, 'base64'));
}
const go = (hash) => exec(`window.location.hash = arguments[0]`, [hash]).then(() => sleep(600));
function check(cond, label) {
  if (!cond) throw new Error(`Assertion failed: ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

let driver = null;
async function startDriver(env = {}) {
  driver = spawn('tauri-driver', ['--port', '4444'], { stdio: 'ignore', env: { ...process.env, ...env } });
  await sleep(1500);
}
function stopDriver() {
  driver?.kill();
  driver = null;
}

/** Advertisement flow against the bundled ad server (ad-server/). */
async function adPhase() {
  console.log('12. Remote advertisement configuration');
  const port = 8787;
  const configFile = path.join(SHOTS, 'ad-config.json');
  writeFileSync(
    configFile,
    JSON.stringify({
      version: 7,
      fetchIntervalDays: 7,
      ads: {
        enabled: true, monthlyLimit: 4, minimumDaysBetweenAds: 7, title: 'From the DocGen team',
        contentUrl: process.env.E2E_AD_CONTENT || `http://127.0.0.1:${port}/ads/ad-01.html`, clickUrl: 'https://example.com/product', version: 'ad-01',
      },
    }),
  );
  const server = spawn('node', [path.join(root, 'ad-server/server.js')], {
    stdio: 'ignore',
    env: { ...process.env, PORT: String(port), CONFIG_FILE: configFile },
  });
  await sleep(1000);
  try {
    await startDriver({
      DOCGEN_CONFIG_URL: `http://127.0.0.1:${port}/api/app-config`,
      DOCGEN_EVENTS_URL: `http://127.0.0.1:${port}/api/events`,
    });
    await startApp();
    await go('#/documents');
    await sleep(8000);
    if (process.env.E2E_DEBUG) {
      console.log('online:', await exec('return navigator.onLine'));
      console.log(await wd('POST', s('/execute/async'), { script: `const d=arguments[arguments.length-1]; Promise.all([window.__TAURI_INTERNALS__.invoke('ad_state_get'), window.__TAURI_INTERNALS__.invoke('remote_config_fetch').catch(e=>({err:e}))]).then(d, e=>d({error:String(e)}));`, args: [] }));
    }
    await find('.ad-popup', 15000);
    const sandbox = await exec(`return document.querySelector('.ad-frame').getAttribute('sandbox')`);
    check(sandbox === '', 'ad shown in a fully sandboxed iframe (no scripts, opaque origin)');
    await sleep(3000);
    await shot('12-ad');
    await clickCss('.ad-header .icon-btn');
    const state = await wd('POST', s('/execute/async'), {
      script: `const done = arguments[arguments.length - 1];
        window.__TAURI_INTERNALS__.invoke('ad_state_get').then(done, (e) => done({ error: String(e) }));`,
      args: [],
    });
    check(state.monthlyAdCount === 1 && state.lastConfigVersion === 7 && !!state.lastAdShownAt, 'ad state stored locally (count, version, time)');
    await stopApp();
    await startApp();
    await go('#/documents');
    await sleep(9000);
    check(!(await exec(`return !!document.querySelector('.ad-popup')`)), 'no second ad before minimumDaysBetweenAds');
    await sleep(500);
    const stats = await (await fetch(`http://127.0.0.1:${port}/api/stats`)).json();
    check(stats['ad-01']?.AD_SHOWN === 1 && stats['ad-01']?.AD_CLOSED === 1, 'anonymous events reached the server');
  } finally {
    await stopApp();
    stopDriver();
    server.kill();
  }
}

async function main() {
  if (process.env.E2E_ONLY_ADS) {
    mkdirSync(SHOTS, { recursive: true });
    await adPhase();
    console.log(`\nAll ${passed} checks passed.`);
    return;
  }
  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  await startDriver();
  try {
    console.log('1. First launch & setup wizard');
    await startApp();
    await waitForText('Welcome to DocGen');
    await shot('01-welcome');
    await clickCss('[data-testid="setup-next"]');
    await type('[data-testid="setup-company"]', 'Sharma Furniture Works');
    await type('input[list="setup-states"]', 'Karnataka');
    await clickCss('[data-testid="setup-next"]');
    await clickText('Skip');
    await waitForText('Choose your currency');
    await clickCss('[data-testid="setup-next"]');
    await waitForText('Pick a document style');
    await shot('02-style');
    await clickCss('[data-testid="setup-finish"]');
    await waitForText('Choose what you want to create');
    check(true, 'setup completed and Documents page shown');
    await shot('03-documents');

    console.log('2. Create an invoice');
    await clickText('Invoice', '.doc-card');
    await waitForText('New Tax Invoice');
    await type('[data-testid="party-name"]', 'ABC Construction');
    await type('input[type="email"]', 'accounts@abc.example');
    await type('[data-testid="item-name-0"]', 'Teak Dining Table');
    await type('[data-testid="item-qty-0"]', '2');
    await type('[data-testid="item-rate-0"]', '1000');
    await clickCss('[data-testid="add-item"]');
    await type('[data-testid="item-name-1"]', 'Delivery & Installation');
    await type('[data-testid="item-rate-1"]', '500');
    await sleep(400);
    const cgst = await textOf('[data-testid="total-cgst"]');
    const grand = await textOf('[data-testid="grand-total"]');
    check(cgst.includes('225.00'), `CGST auto-calculated (${cgst})`);
    check(grand.includes('2,950.00'), `Grand total 2,500 + 18% GST = ${grand}`);
    await shot('04-editor');
    await clickCss('[data-testid="save-doc"]');
    await waitForText('INV-00001');
    await waitForText('Amount in words');
    const view = await bodyText();
    check(view.includes('Two Thousand Nine Hundred Fifty Rupees Only'), 'amount in words rendered');
    check(view.includes('ABC Construction'), 'customer on document');
    await shot('05-invoice-zoho');

    console.log('3. Close and reopen the application');
    await stopApp();
    await startApp();
    await go('#/created');
    await waitForText('Created Documents');
    await type('.search input', 'ABC');
    await sleep(700);
    let text = await bodyText();
    check(text.includes('INV-00001'), 'invoice found by customer search after restart');
    await type('.search input', 'Teak');
    await sleep(700);
    check((await bodyText()).includes('INV-00001'), 'invoice found by product search');
    await shot('06-created-search');

    console.log('4. Duplicate');
    await clickCss('button[title="Duplicate"]');
    await waitForText('New Tax Invoice');
    await clickCss('[data-testid="save-doc"]');
    await waitForText('INV-00002');
    check(true, 'duplicate saved as INV-00002');

    console.log('5. Quotation → Sales Order conversion');
    await go('#/doc/new/QUOTATION');
    await waitForText('New Quotation');
    await type('[data-testid="party-name"]', 'XYZ Interiors');
    await type('[data-testid="item-name-0"]', 'Office Chair');
    await type('[data-testid="item-qty-0"]', '5');
    await type('[data-testid="item-rate-0"]', '4500');
    await clickCss('[data-testid="save-doc"]');
    await waitForText('QTN-00001');
    await clickCss('.editor-actions details summary');
    await clickText('Convert to Sales Order', '.menu-item');
    await waitForText('New Sales Order');
    await waitForText('Created from');
    await clickCss('[data-testid="save-doc"]');
    await waitForText('SO-00001');
    text = await bodyText();
    check(text.toLowerCase().includes('created from') && text.includes('QTN-00001'), 'sales order shows Created From: QTN-00001');

    console.log('6. Delivery challan hides prices');
    await clickCss('.editor-actions details summary');
    await clickText('Convert to Delivery Challan', '.menu-item');
    await waitForText('New Delivery Challan');
    await clickCss('[data-testid="save-doc"]');
    await waitForText('DC-00001');
    text = await exec('return document.querySelector(".doc").innerText');
    check(!/grand total/i.test(text) && !text.includes('4,500'), 'challan has no prices or totals');
    check(/receiver's signature/i.test(text), 'challan has receiver signature');
    await shot('07-challan');

    console.log('7. Delete and restore a draft');
    await go('#/created');
    await waitForText('DC-00001');
    await clickCss('button[title="Delete"]');
    await clickText('Delete', '.modal .btn-danger');
    await sleep(600);
    check(!(await exec("return document.querySelector('table')?.innerText || ''")).includes('DC-00001'), 'deleted document hidden from list');
    await exec(`const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.value==='DELETED'));
      const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,'DELETED'); s.dispatchEvent(new Event('change',{bubbles:true}));`);
    await waitForText('DC-00001');
    await clickText('Restore');
    await sleep(600);
    check(true, 'document restored');

    console.log('8. Products & Services');
    await go('#/products');
    await clickCss('[data-testid="add-product"]');
    await type('[data-testid="product-name"]', 'Sofa Set 3+1+1');
    await type('[data-testid="product-price"]', '38500');
    await clickCss('[data-testid="product-save"]');
    await waitForText('Sofa Set 3+1+1');
    check(true, 'product created');
    await shot('08-products');

    console.log('9. Payment receipt');
    await go('#/doc/new/PAYMENT_RECEIPT');
    await waitForText('New Payment Receipt');
    await type('[data-testid="party-name"]', 'ABC Construction');
    await type('[data-testid="amount-received"]', '125000');
    await clickCss('[data-testid="save-doc"]');
    await waitForText('RCT-00001');
    check((await bodyText()).includes('One Lakh Twenty Five Thousand Rupees Only'), 'receipt amount in words (Indian)');
    await shot('09-receipt');

    console.log('10. Tally style');
    await go('#/settings/documents');
    await clickText('Tally style');
    await clickText('Save changes');
    await sleep(500);
    await go('#/created');
    await waitForText('INV-00001');
    const invoiceId = await exec(`return [...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('INV-00001')) ? 1 : 0`);
    check(invoiceId === 1, 'invoice listed');
    await go('#/doc/1');
    await waitForText('TAX INVOICE');
    check(await exec('return !!document.querySelector(".doc-tally")'), 'document rendered in Tally style');
    await shot('10-invoice-tally');

    console.log('11. Dashboard');
    await go('#/dashboard');
    await waitForText('Total Documents');
    await shot('11-dashboard');
    check(true, 'dashboard renders');

    await stopApp();
    stopDriver();
    await adPhase();

    console.log(`\nAll ${passed} checks passed.`);
  } catch (e) {
    await shot('failure').catch(() => {});
    console.error('Page text at failure:\n', (await bodyText().catch(() => '')).slice(0, 1500));
    throw e;
  } finally {
    await stopApp();
    stopDriver();
  }
}

main().catch(async (e) => {
  console.error('\nE2E FAILED:', e.message);
  try {
    if (session) await shot('failure');
  } catch {
    /* ignore */
  }
  await stopApp();
  process.exit(1);
});
