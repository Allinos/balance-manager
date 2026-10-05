import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseAd, compareVersions, DEFAULT_AD, HOUSE_ADS } from '../src/features/ads/adService.js';
import { isCheckDue } from '../src/services/remoteConfig.js';
import { formatActivationCode, isValidActivationCode } from '../src/services/licenseService.js';
import { isValidGstin, stateCode, stateFromGstin } from '../src/config/states.js';
import { hsnSummary } from '../src/utils/hsn.js';
import { toFixed } from '../src/utils/decimal.js';
import { DOCUMENT_TYPES, EXTRA_FIELDS, statusesFor, normaliseTemplate } from '../src/config/documentTypes.js';
import { unitOptions } from '../src/config/units.js';

const DAY = 86400000;
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
  assert.equal(chooseAd(state, ctx({ t: T0 + 15 * DAY })), DEFAULT_AD);
  assert.equal(chooseAd({ ...state, defaultAdLastShownAt: T0 + 15 * DAY }, ctx({ t: T0 + 20 * DAY })), null);
  assert.equal(chooseAd({ ...state, defaultAdLastShownAt: T0 + 15 * DAY }, ctx({ t: T0 + 30 * DAY })), DEFAULT_AD);
  assert.equal(chooseAd(state, ctx({ t: T0 + 40 * DAY, licensed: true })), HOUSE_ADS[0], 'licensed users see reynrel.in products, never "Activate"');
});

test('built-in ads take turns: Activate (no license only), billing software, POS, reynrel.in services', () => {
  const at = (n, licensed) => chooseAd({ firstOpenAt: T0, defaultAdIndex: n }, ctx({ t: T0 + 15 * DAY, licensed }));
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((n) => at(n, false).version), [1, 'billing-1', 'pos-1', 'web-1', 'software-1', 'marketing-1', 1]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((n) => at(n, true).version), ['billing-1', 'pos-1', 'web-1', 'software-1', 'marketing-1', 'billing-1']);
  assert.ok(HOUSE_ADS.every((a) => a.builtIn && a.id === 0 && a.linkUrl.startsWith('https://reynrel.in/')), 'built-in ads open reynrel.in; counters stay local');
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
  assert.equal(chooseAd(base, ctx({ t: T0 + 20 * DAY, online: false })), DEFAULT_AD);
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
  assert.equal(chooseAd({ firstOpenAt: T0, defaultAdLastShownAt: T0 + 15 * DAY }, ctx({ t: T0 + 200 * DAY })).version, DEFAULT_AD.version, 'offline: one built-in ad, not a backlog');
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
