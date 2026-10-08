/** Audit log, aggregated usage counters and remote app configuration. */

import { isMysql, nowIso, parseJson } from '../db.js';

export async function audit(knex, { actorType, actorId = null, action, entity = '', entityId = null, details = {}, ip = '' }) {
  await knex('audit_log').insert({
    actor_type: actorType,
    actor_id: actorId,
    action,
    entity,
    entity_id: entityId,
    details: JSON.stringify(details),
    ip,
    created_at: nowIso(),
  });
}

/** Increment a daily counter without storing one row per request. */
export async function bumpStat(knex, metric, by = 1) {
  const day = new Date().toISOString().slice(0, 10);
  if (isMysql(knex)) {
    await knex.raw('insert into usage_stats (`day`, metric, `count`) values (?, ?, ?) on duplicate key update `count` = `count` + ?', [day, metric, by, by]);
  } else {
    await knex.raw(
      `insert into usage_stats (day, metric, count) values (?, ?, ?)
       on conflict (day, metric) do update set count = count + excluded.count`,
      [day, metric, by],
    );
  }
}

/** Default remote configuration delivered to the desktop app. Editable in Admin → App configuration. */
export const DEFAULT_APP_CONFIG = {
  configIntervalDays: 30,
  adPolicy: { minDaysBetweenAds: 15, maxPerMonth: 2, firstOpenDelayDays: 15 },
  defaultAdEnabled: true,
  app: { latestVersion: '1.0.0', downloadUrl: '', message: '' },
  help: {
    youtubeChannel: 'https://www.youtube.com/@reynrel',
    videos: [],
  },
};

export async function getAppConfig(knex) {
  const row = await knex('app_config').where({ key: 'app' }).first();
  const stored = parseJson(row?.value, {});
  return {
    config: {
      ...DEFAULT_APP_CONFIG,
      ...stored,
      adPolicy: { ...DEFAULT_APP_CONFIG.adPolicy, ...(stored.adPolicy || {}) },
      app: { ...DEFAULT_APP_CONFIG.app, ...(stored.app || {}) },
      help: { ...DEFAULT_APP_CONFIG.help, ...(stored.help || {}) },
    },
    updatedAt: row?.updated_at || null,
    version: Number(stored.version || 1),
  };
}

export async function saveAppConfig(knex, value, adminId) {
  const current = await getAppConfig(knex);
  const next = { ...value, version: current.version + 1 };
  const row = { key: 'app', value: JSON.stringify(next), updated_by: adminId, updated_at: nowIso() };
  const exists = await knex('app_config').where({ key: 'app' }).first();
  if (exists) await knex('app_config').where({ key: 'app' }).update(row);
  else await knex('app_config').insert(row);
  return getAppConfig(knex);
}

/** The product sold on the website (Admin → Products changes price, validity and computers). */
export const DEFAULT_PRODUCT = {
  code: 'DOCGEN',
  name: 'DocGen',
  description: 'Professional invoices, quotations and business documents on your computer.',
  price_paise: 125000,
  currency: 'INR',
  duration_days: 365,
  max_devices: 1,
  max_mobile_devices: 2,
  features: JSON.stringify([
    'GST invoices, quotations, challans, receipts and more',
    'Works offline — your data stays on your computer',
    'Free updates and support during the license',
  ]),
  is_active: true,
  is_public: true,
  sort_order: 0,
};

/** Seed the product on an empty database so the website has something to sell. */
export async function seedDefaults(knex) {
  const [{ count }] = await knex('plans').count({ count: '*' });
  if (Number(count) > 0) return;
  const ts = nowIso();
  await knex('plans').insert({ ...DEFAULT_PRODUCT, created_at: ts, updated_at: ts });
  const plan = await knex('plans').where({ code: DEFAULT_PRODUCT.code }).first('id');
  await knex('plan_prices').insert(
    DEFAULT_PRICES.map(([days, paise], i) => ({ plan_id: plan.id, duration_days: days, price_paise: paise, sort_order: i, created_at: ts, updated_at: ts })),
  );
}

/** Default price list of the product: [days, paise] (Admin → Products & pricing). */
export const DEFAULT_PRICES = [
  [365, 125000],
  [730, 225000],
  [1825, 499900],
];

/** Website content (Admin → Website). Screenshots default to the images bundled with the website. */
export const DEFAULT_SITE = {
  headline: 'Professional business documents in minutes',
  subheadline:
    'Create GST invoices, quotations, delivery challans and receipts on your computer and phone. Simple to learn, works offline, looks professional.',
  screenshots: [
    { url: '/screenshots/dashboard.png', caption: 'Dashboard' },
    { url: '/screenshots/invoice.png', caption: 'GST invoice' },
    { url: '/screenshots/documents.png', caption: 'All your documents in one place' },
  ],
  videos: [],
  showComparison: true,
  showProblems: true,
  offer: { enabled: true, regularPricePercent: 20, timerMinutes: 15, showBuyers: true, customers: '500+', rating: 4.8 },
  business: {
    legalName: 'Reynrel',
    address: '',
    phone: '',
    hours: 'Monday to Saturday, 10:00 to 18:00 IST',
    jurisdiction: '',
  },
};

export async function getSiteConfig(knex) {
  const row = await knex('app_config').where({ key: 'site' }).first();
  const saved = parseJson(row?.value, {});
  const site = { ...DEFAULT_SITE, ...saved, business: { ...DEFAULT_SITE.business, ...saved.business }, offer: { ...DEFAULT_SITE.offer, ...saved.offer } };
  delete site.buyFunnel; // the old step-by-step /buy funnel, replaced by the /offer page
  return site;
}

export async function saveSiteConfig(knex, value, adminId) {
  const row = { key: 'site', value: JSON.stringify(value), updated_by: adminId, updated_at: nowIso() };
  if (await knex('app_config').where({ key: 'site' }).first('key')) await knex('app_config').where({ key: 'site' }).update(row);
  else await knex('app_config').insert(row);
  return getSiteConfig(knex);
}
