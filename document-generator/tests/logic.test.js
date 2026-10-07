import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseAd, compareVersions, HOUSE_ADS } from '../src/features/ads/adService.js';
import { isCheckDue } from '../src/services/remoteConfig.js';
import { formatActivationCode, isValidActivationCode } from '../src/services/licenseService.js';
import { isValidGstin, stateCode, stateFromGstin } from '../src/config/states.js';
import { hsnSummary } from '../src/utils/hsn.js';
import { toFixed } from '../src/utils/decimal.js';
import { DOCUMENT_TYPES, EXTRA_FIELDS, statusesFor, normaliseTemplate } from '../src/config/documentTypes.js';
import { unitOptions } from '../src/config/units.js';

const DAY = 86400000;
const FIRST_AD = HOUSE_ADS[0];
const T0 = Date.parse('2026-01-01T10:00:00Z');
const ctx = (over = {}) => ({ t: T0, licensed: false, platform: 'windows', appVersion: '1.1.0', online: true, random: () => 0, ...over });

test('activation code format AB12-CD34-EF56', () => {
  assert.equal(formatActivationCode('ab12cd34ef56'), 'AB12-CD34-EF56');
  assert.equal(formatActivationCode(' ab-12 cd'), 'AB12-CD');
  assert.equal(formatActivationCode('AB12CD34EF56GH'), 'AB12-CD34-EF56');
  assert.ok(isValidActivationCode('AB12-CD34-EF56'));
  assert.ok(!isValidActivationCode('AB12-CD34-EF5'));
  assert.ok(!isValidActivationCode('ab12-cd34-ef56'));
});

test('GST state codes and GSTIN', () => {
  assert.equal(stateCode('Maharashtra'), '27');
  assert.equal(stateCode('karnataka'), '29');
  assert.equal(stateFromGstin('27AAPFU0939F1ZV'), 'Maharashtra');
  assert.ok(isValidGstin('27AAPFU0939F1ZV'));
  assert.ok(!isValidGstin('27AAPFU0939F1Z'));
  assert.ok(!isValidGstin('XXAAPFU0939F1ZV'));
});

test('config check scheduling: monthly, offline catch-up, back-off after failure', () => {
  assert.ok(isCheckDue({}, T0), 'first check is due');
  const ok = { lastConfigFetchAt: T0, nextConfigCheckAt: T0 + 30 * DAY };
  assert.ok(!isCheckDue(ok, T0 + 29 * DAY));
  assert.ok(isCheckDue(ok, T0 + 30 * DAY));
  // Offline for 10 days after the due date → due as soon as the app checks again.
  assert.ok(isCheckDue(ok, T0 + 40 * DAY));
  // A failed attempt waits 6 hours before retrying.
  const failed = { ...ok, lastConfigAttemptAt: T0 + 40 * DAY };
  assert.ok(!isCheckDue(failed, T0 + 40 * DAY + 3600000));
  assert.ok(isCheckDue(failed, T0 + 40 * DAY + 7 * 3600000));
});

test('built-in ad every 15 days when no server config was ever received', () => {
  const state = { firstOpenAt: T0 };
  assert.equal(chooseAd(state, ctx({ t: T0 + 14 * DAY })), null);
  assert.equal(chooseAd(state, ctx({ t: T0 + 15 * DAY })), FIRST_AD);
  assert.equal(chooseAd({ ...state, defaultAdLastShownAt: T0 + 15 * DAY }, ctx({ t: T0 + 20 * DAY })), null);
  assert.equal(chooseAd({ ...state, defaultAdLastShownAt: T0 + 15 * DAY }, ctx({ t: T0 + 30 * DAY })), FIRST_AD);
  assert.equal(chooseAd(state, ctx({ t: T0 + 40 * DAY, licensed: true })), HOUSE_ADS[0], 'licensed users see the same built-in ads');
});

test('built-in ads take turns: billing software, POS, website, custom software — with or without a license', () => {
  const at = (n, licensed) => chooseAd({ firstOpenAt: T0, defaultAdIndex: n }, ctx({ t: T0 + 15 * DAY, licensed }));
  for (const licensed of [false, true]) {
    assert.deepEqual([0, 1, 2, 3, 4].map((n) => at(n, licensed).version), ['billing-1', 'pos-1', 'web-1', 'software-1', 'billing-1']);
  }
  assert.ok(HOUSE_ADS.every((a) => a.builtIn && a.id === 0 && a.image && !a.action), 'every built-in ad has a picture and opens its link');
  assert.ok(HOUSE_ADS.every((a) => /^https:\/\/reynrel\.in\/[^$\s]*utm_source=docgen-desktop/.test(a.linkUrl)), 'links are complete reynrel.in addresses');
  const cachedConfig = { adPolicy: {}, defaultAdEnabled: true, ads: [] };
  assert.equal(chooseAd({ firstOpenAt: T0, cachedConfig }, ctx({ t: T0 + 15 * DAY, licensed: true, online: false })), HOUSE_ADS[0], 'offline with a cached config');
  assert.equal(chooseAd({ firstOpenAt: T0, cachedConfig: { ...cachedConfig, defaultAdEnabled: false } }, ctx({ t: T0 + 15 * DAY, licensed: true })), null, 'server can switch them off');
});

test('remote ads: ad-free start, 15 days between ads, targeting, priority, frequency', () => {
  const ads = [
    { id: 1, title: 'Low', priority: 0, frequencyDays: 20, maxPerMonth: 4, target: { licenseStatus: 'all', platforms: [] } },
    { id: 2, title: 'High', priority: 5, frequencyDays: 60, maxPerMonth: 1, target: { licenseStatus: 'trial', platforms: ['windows'] } },
    { id: 3, title: 'Expired', priority: 9, endAt: '2025-12-01T00:00:00Z', target: {} },
    { id: 4, title: 'Mac only', priority: 9, target: { platforms: ['macos'] } },
    { id: 5, title: 'New app only', priority: 9, target: { minVersion: '2.0.0' } },
  ];
  // The server asks for 3 days / 7 days; the app never goes below 15.
  const cachedConfig = { adPolicy: { firstOpenDelayDays: 3, minDaysBetweenAds: 7, maxPerMonth: 4 }, defaultAdEnabled: true, ads };
  const base = { firstOpenAt: T0, cachedConfig };
  assert.equal(chooseAd(base, ctx({ t: T0 + 5 * DAY })), null, 'no ads in the first 15 days');
  assert.equal(chooseAd(base, ctx({ t: T0 + 14 * DAY })), null);
  assert.equal(chooseAd(base, ctx({ t: T0 + 15 * DAY })).id, 2, 'highest priority matching ad');
  assert.equal(chooseAd(base, ctx({ t: T0 + 15 * DAY, licensed: true })).id, 1, 'trial-only ad skipped for licensed');
  assert.equal(chooseAd(base, ctx({ t: T0 + 15 * DAY, platform: 'linux' })).id, 1);
  assert.equal(chooseAd(base, ctx({ t: T0 + 40 * DAY, licensed: true, licenseStartedAt: T0 + 30 * DAY })), null, '15 ad-free days after the license is activated');
  assert.equal(chooseAd(base, ctx({ t: T0 + 45 * DAY, licensed: true, licenseStartedAt: T0 + 30 * DAY })).id, 1);
  const shown = { ...base, lastAdShownAt: T0 + 15 * DAY, adShown: { 2: { lastShownAt: T0 + 15 * DAY, month: '2026-01', count: 1 } } };
  assert.equal(chooseAd(shown, ctx({ t: T0 + 22 * DAY })), null, 'at least 15 days between ads, even if the server allows 7');
  assert.equal(chooseAd(shown, ctx({ t: T0 + 30 * DAY })).id, 1, 'ad 2 waits for its own frequency');
  assert.equal(chooseAd({ ...base, monthlyAdMonth: '2026-01', monthlyAdCount: 2 }, ctx({ t: T0 + 16 * DAY })), null, 'never more than 2 a month, even if the server allows 4');
  assert.equal(chooseAd({ ...shown, lastAdShownAt: T0 + 40 * DAY }, ctx({ t: T0 + 30 * DAY })), null, 'clock set back: no ad');
  // Offline with a cached config: remote ads are skipped; a built-in ad may still appear.
  assert.equal(chooseAd(base, ctx({ t: T0 + 20 * DAY, online: false })), FIRST_AD);
  assert.equal(chooseAd({ ...base, cachedConfig: { ...cachedConfig, defaultAdEnabled: false } }, ctx({ t: T0 + 20 * DAY, online: false })), null);
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
});

test('missed ads never pile up: after months closed or offline, exactly one ad, then 15 days of quiet', () => {
  const cachedConfig = { adPolicy: {}, defaultAdEnabled: true, ads: [{ id: 7, title: 'Offer', priority: 1, target: {} }] };
  const state = { firstOpenAt: T0, lastAdShownAt: T0 + 20 * DAY, cachedConfig };
  const later = T0 + 110 * DAY; // ~3 months later; 6 ads would have been "due"
  const ad = chooseAd(state, ctx({ t: later }));
  assert.equal(typeof ad, 'object');
  assert.ok(!Array.isArray(ad) && ad.id === 7, 'one ad, the one that applies now');
  const after = { ...state, lastAdShownAt: later, monthlyAdMonth: '2026-04', monthlyAdCount: 1 };
  for (const d of [0, 1, 7, 14]) assert.equal(chooseAd(after, ctx({ t: later + d * DAY })), null, `nothing more ${d} days later`);
  assert.equal(chooseAd({ firstOpenAt: T0, defaultAdLastShownAt: T0 + 15 * DAY }, ctx({ t: T0 + 200 * DAY })).version, FIRST_AD.version, 'offline: one built-in ad, not a backlog');
});

test('HSN/SAC summary groups by code and rate', () => {
  const rows = hsnSummary([
    { hsn_sac: '9401', tax_rate: '18', taxable_amount: '9000.00', cgst_amount: '810.00', sgst_amount: '810.00', igst_amount: '0', tax_amount: '1620.00' },
    { hsn_sac: '9401', tax_rate: '18', taxable_amount: '1000.00', cgst_amount: '90.00', sgst_amount: '90.00', igst_amount: '0', tax_amount: '180.00' },
    { hsn_sac: '995419', tax_rate: '18', taxable_amount: '1500.00', cgst_amount: '135.00', sgst_amount: '135.00', igst_amount: '0', tax_amount: '270.00' },
    { hsn_sac: '9401', tax_rate: '12', taxable_amount: '100.00', cgst_amount: '6.00', sgst_amount: '6.00', igst_amount: '0', tax_amount: '12.00' },
  ]);
  assert.equal(rows.length, 3);
  const chairs = rows.find((r) => r.hsn === '9401' && r.rate === '18');
  assert.equal(toFixed(chairs.taxable), '10000.00');
  assert.equal(toFixed(chairs.cgst), '900.00');
  assert.equal(toFixed(chairs.tax), '1800.00');
});

test('document type registry is consistent', () => {
  for (const t of DOCUMENT_TYPES) {
    assert.ok(t.statuses.includes('DRAFT'), `${t.id} has DRAFT`);
    assert.ok(t.statuses.includes('CANCELLED'), `${t.id} can be cancelled (never deleted)`);
    for (const k of t.optional) assert.ok(EXTRA_FIELDS[k], `${t.id}: unknown optional field ${k}`);
    for (const c of t.conversions) assert.ok(DOCUMENT_TYPES.some((x) => x.id === c), `${t.id}: unknown conversion ${c}`);
    assert.ok(t.prefix.length <= 5);
  }
  assert.deepEqual(statusesFor('TAX_INVOICE', 'VOID').slice(-1), ['VOID'], 'legacy status kept selectable');
  assert.equal(normaliseTemplate('tally'), 'tally-std');
  assert.equal(normaliseTemplate('zoho'), 'modern');
  assert.equal(normaliseTemplate('nonsense'), 'tally-pro');
});

test('unit options put custom units first', () => {
  const groups = unitOptions(['Nos', 'Crate']);
  assert.equal(groups[0].group, 'Your units');
  assert.deepEqual(groups[0].options, ['Crate']);
  assert.ok(groups.some((g) => g.options.includes('Hour')));
});

test('copy labels follow GST Rule 48', async () => {
  const { copyLabel, clampCopies } = await import('../src/renderer/copies.js');
  const inv = { id: 'TAX_INVOICE', group: 'sales' };
  const svc = { id: 'SERVICE_INVOICE', group: 'service' };
  assert.deepEqual([0, 1, 2, 3].map((i) => copyLabel(inv, i, 4)), ['ORIGINAL FOR RECIPIENT', 'DUPLICATE FOR TRANSPORTER', 'TRIPLICATE FOR SUPPLIER', 'EXTRA COPY']);
  assert.equal(copyLabel(svc, 1, 2), 'DUPLICATE FOR SUPPLIER');
  assert.equal(copyLabel({ id: 'QUOTATION' }, 0, 1), '', 'single copy of a non-GST document has no label');
  assert.equal(copyLabel({ id: 'QUOTATION' }, 1, 2), 'DUPLICATE');
  assert.equal(clampCopies('9'), 4);
  assert.equal(clampCopies(undefined), 1);
});

test('GST rate options and units by kind', async () => {
  const { taxRateOptions, isValidRate, rateValue } = await import('../src/config/taxRates.js');
  const opts = taxRateOptions({ taxSystem: 'GST', taxRates: ['18', '7.5'] }, '18.00');
  assert.deepEqual(opts.map((o) => o.value), ['0', '0.25', '3', '5', '7.5', '12', '18', '28', '40']);
  assert.equal(rateValue('18.00'), '18');
  assert.ok(isValidRate('0.25') && !isValidRate('abc') && !isValidRate('101'));
  const svc = unitOptions([], 'service');
  assert.equal(svc[0].group, 'Service units');
  assert.equal(unitOptions([], 'product')[0].group, 'Product units');
});

test('templates are named without "Tally"; stored ids are unchanged', async () => {
  const { TEMPLATES } = await import('../src/config/documentTypes.js');
  assert.deepEqual(TEMPLATES.map((t) => [t.id, t.label]), [['tally-pro', 'Professional'], ['tally-std', 'Standard'], ['modern', 'Modern'], ['simple', 'Simple']]);
  assert.ok(TEMPLATES.every((t) => !/tally/i.test(t.label + t.description)));
});

test('setup tax choice: GST, VAT, sales tax, own name, no tax', async () => {
  const { taxSettingsFor, defaultTaxChoice, DEFAULT_SETTINGS } = await import('../src/config/defaults.js');
  const { taxLabelFor, defaultTaxMode } = await import('../src/services/documentService.js');
  assert.equal(defaultTaxChoice('INR'), 'GST');
  assert.equal(defaultTaxChoice('AED'), 'VAT');
  const gst = taxSettingsFor('GST');
  assert.deepEqual([gst.taxSystem, gst.showHsn, gst.documentStyle, gst.taxRates], ['GST', true, 'tally-pro', DEFAULT_SETTINGS.taxRates]);
  const vat = taxSettingsFor('VAT', { rate: '5' });
  assert.deepEqual([vat.taxSystem, vat.taxLabel, vat.taxRates, vat.defaultTaxRate, vat.showHsn, vat.documentStyle], ['VAT', 'VAT', ['0', '5'], '5', false, 'modern']);
  assert.equal(taxLabelFor({ ...DEFAULT_SETTINGS, ...vat }), 'VAT');
  assert.equal(defaultTaxMode({ ...DEFAULT_SETTINGS, ...vat }), 'SIMPLE');
  assert.equal(taxLabelFor({ ...DEFAULT_SETTINGS, ...taxSettingsFor('SALES_TAX', { rate: '' }) }), 'Sales Tax');
  assert.deepEqual(taxSettingsFor('SALES_TAX', { rate: 'abc' }).taxRates, ['0']);
  assert.equal(taxLabelFor({ ...DEFAULT_SETTINGS, ...taxSettingsFor('OTHER', { name: ' TVA ', rate: '20' }) }), 'TVA');
  const none = taxSettingsFor('NONE');
  assert.equal(defaultTaxMode({ ...DEFAULT_SETTINGS, ...none }), 'NONE');
});

test('A4 paging: short bills fill one page, long bills split with the tail kept on the last page', async () => {
  const { planPages, PAGE_HEIGHT, FOOTER_RESERVE } = await import('../src/renderer/paging.js');
  const m = { headH: 300, theadH: 30, tailH: 350, topCont: 40, bottomCont: 25 };
  // One item: one page, stretched by a filler to the full A4 height.
  const one = planPages({ ...m, rows: [20] });
  assert.equal(one.length, 1);
  assert.ok(Math.abs(300 + 30 + 20 + one[0].fill + 350 - PAGE_HEIGHT) < 0.01);
  // 50 rows of 22 px: several pages, every row placed once and in order, none overfull.
  const rows = Array(50).fill(22);
  const pages = planPages({ ...m, rows });
  assert.ok(pages.length >= 2);
  assert.equal(pages[0].from, 0);
  assert.equal(pages.at(-1).to, 50);
  pages.forEach((p, i) => {
    if (i) assert.equal(p.from, pages[i - 1].to);
    assert.equal(p.first, i === 0);
    assert.equal(p.last, i === pages.length - 1);
    assert.ok(!p.overflow);
    const used = (p.first ? m.headH : m.topCont) + m.theadH + 22 * (p.to - p.from) + (p.last ? m.tailH : m.bottomCont);
    assert.ok(Math.abs(used + p.fill - (PAGE_HEIGHT - FOOTER_RESERVE)) < 0.01, 'each page is filled to the foot');
  });
  // The last page never holds the totals alone.
  assert.ok(pages.at(-1).to - pages.at(-1).from >= 1);
  // Rows that all fit but not with the tail: some rows move with the tail.
  const tight = planPages({ ...m, rows: Array(18).fill(22) });
  assert.ok(tight.length === 2 && tight[1].to - tight[1].from >= 1 && tight[1].to - tight[1].from <= 3);
});
