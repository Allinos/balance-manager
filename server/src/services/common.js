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
  adPolicy: { minDaysBetweenAds: 7, maxPerMonth: 4, firstOpenDelayDays: 3 },
  defaultAdEnabled: true,
  app: { latestVersion: '1.0.0', downloadUrl: '', message: '' },
  help: {
    youtubeChannel: 'https://www.youtube.com/@RainDeal',
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

/** Seed plans on an empty database so the portal has something to show. */
export async function seedDefaults(knex) {
  const [{ count }] = await knex('plans').count({ count: '*' });
  if (Number(count) > 0) return;
  const ts = nowIso();
  await knex('plans').insert([
    {
      code: 'STARTER', name: 'Starter', description: 'For a single computer.', price_paise: 99900, duration_days: 365,
      max_devices: 1, features: JSON.stringify(['1 computer', 'All document types', 'Email support', 'No ads']),
      sort_order: 1, created_at: ts, updated_at: ts,
    },
    {
      code: 'BUSINESS', name: 'Business', description: 'For growing teams.', price_paise: 249900, duration_days: 365,
      max_devices: 3, features: JSON.stringify(['3 computers', 'All document types', 'Priority WhatsApp support', 'No ads']),
      sort_order: 2, created_at: ts, updated_at: ts,
    },
    {
      code: 'LIFETIME', name: 'Lifetime', description: 'Pay once, use forever.', price_paise: 699900, duration_days: 0,
      max_devices: 2, features: JSON.stringify(['2 computers', 'Lifetime updates', 'Priority support', 'No ads']),
      sort_order: 3, created_at: ts, updated_at: ts,
    },
  ]);
}
