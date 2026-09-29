/**
 * Initial schema. Works on MySQL 8 and SQLite.
 * Money is stored as integer paise; JSON as text; timestamps as ISO-8601 UTC text
 * ("2026-09-29T05:41:00.000Z"), which sorts and compares correctly as text on both
 * databases and has no year-2038 limit.
 */

export async function up(knex) {
  const mysql = knex.client.config.client === 'mysql2';
  // Helpers for the few column types that differ between databases.
  const ts = (t, name) => (mysql ? t.string(name, 30) : t.timestamp(name, { useTz: true }));
  // MySQL does not allow defaults on TEXT columns; the application always supplies these values.
  const text = (t, name, def) => (mysql ? t.text(name).notNullable() : t.text(name).notNullable().defaultTo(def));
  // Foreign keys must match the unsigned auto-increment primary keys on MySQL.
  const ref = (t, name) => t.integer(name).unsigned();
  if (mysql) await knex.raw('SET NAMES utf8mb4');

  await knex.schema.createTable('admins', (t) => {
    t.increments('id').primary();
    t.string('email', 190).notNullable().unique();
    t.string('password_hash', 100).notNullable();
    t.string('name', 120).notNullable().defaultTo('');
    t.string('role', 20).notNullable().defaultTo('admin'); // owner | admin | support
    t.integer('token_version').notNullable().defaultTo(0);
    ts(t, 'last_login_at');
    ts(t, 'created_at').notNullable();
  });

  await knex.schema.createTable('plans', (t) => {
    t.increments('id').primary();
    t.string('code', 40).notNullable().unique();
    t.string('name', 80).notNullable();
    t.string('description', 500).notNullable().defaultTo('');
    t.integer('price_paise').notNullable().defaultTo(0);
    t.string('currency', 3).notNullable().defaultTo('INR');
    t.integer('duration_days').notNullable().defaultTo(365); // 0 = lifetime
    t.integer('max_devices').notNullable().defaultTo(1);
    text(t, 'features', '[]');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.boolean('is_public').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
  });

  await knex.schema.createTable('clients', (t) => {
    t.increments('id').primary();
    t.string('email', 190).notNullable().unique(); // stored lower-case
    t.string('password_hash', 100).notNullable();
    t.string('name', 120).notNullable();
    t.string('phone', 30).notNullable().defaultTo('');
    t.string('business_name', 160).notNullable().defaultTo('');
    t.string('business_type', 40).notNullable().defaultTo('');
    t.string('gstin', 20).notNullable().defaultTo('');
    t.string('address', 500).notNullable().defaultTo('');
    t.string('city', 80).notNullable().defaultTo('');
    t.string('state', 80).notNullable().defaultTo('');
    t.string('pin', 12).notNullable().defaultTo('');
    t.string('country', 60).notNullable().defaultTo('India');
    t.string('status', 20).notNullable().defaultTo('active'); // active | suspended
    t.string('source', 20).notNullable().defaultTo('portal'); // portal | admin
    t.integer('token_version').notNullable().defaultTo(0);
    ts(t, 'last_login_at');
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
    t.index(['created_at']);
    t.index(['business_name']);
    t.index(['status']);
  });

  await knex.schema.createTable('payments', (t) => {
    t.increments('id').primary();
    ref(t, 'client_id').notNullable().references('clients.id').onDelete('CASCADE');
    ref(t, 'plan_id').notNullable().references('plans.id');
    ref(t, 'license_id'); // license created or extended by this payment
    ref(t, 'renew_license_id'); // license the client asked to extend
    t.string('provider', 30).notNullable();
    t.string('provider_order_id', 120);
    t.string('provider_payment_id', 120);
    t.integer('amount_paise').notNullable();
    t.string('currency', 3).notNullable().defaultTo('INR');
    t.string('status', 20).notNullable().defaultTo('created'); // created | pending | paid | failed | cancelled | refunded
    text(t, 'meta', '{}');
    ts(t, 'paid_at');
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
    t.index(['client_id', 'created_at']);
    t.index(['status', 'created_at']);
    t.index(['provider', 'provider_order_id']);
  });

  await knex.schema.createTable('licenses', (t) => {
    t.increments('id').primary();
    t.string('code', 14).notNullable().unique(); // AB12-CD34-EF56
    ref(t, 'client_id').references('clients.id').onDelete('SET NULL');
    ref(t, 'plan_id').notNullable().references('plans.id');
    t.string('status', 20).notNullable().defaultTo('unused'); // unused | active | suspended | revoked
    t.integer('duration_days').notNullable().defaultTo(365); // applied at first activation when expires_at is empty
    t.integer('max_devices').notNullable().defaultTo(1);
    ts(t, 'activated_at');
    ts(t, 'expires_at'); // null + duration_days 0 = lifetime
    t.string('source', 20).notNullable().defaultTo('admin'); // payment | admin | bulk
    ref(t, 'payment_id');
    t.string('notes', 500).notNullable().defaultTo('');
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
    t.index(['client_id']);
    t.index(['status', 'expires_at']);
    t.index(['plan_id']);
    t.index(['created_at']);
  });

  await knex.schema.createTable('devices', (t) => {
    t.increments('id').primary();
    ref(t, 'license_id').notNullable().references('licenses.id').onDelete('CASCADE');
    t.string('device_id', 80).notNullable();
    t.string('device_name', 120).notNullable().defaultTo('');
    t.string('platform', 20).notNullable().defaultTo('');
    t.string('app_version', 20).notNullable().defaultTo('');
    ts(t, 'activated_at').notNullable();
    ts(t, 'last_seen_at').notNullable();
    ts(t, 'released_at');
    t.unique(['license_id', 'device_id']);
    t.index(['device_id']);
  });

  await knex.schema.createTable('ads', (t) => {
    t.increments('id').primary();
    t.string('title', 80).notNullable();
    t.string('description', 300).notNullable().defaultTo('');
    t.string('image_url', 500).notNullable().defaultTo('');
    text(t, 'html', '');
    t.string('link_url', 500).notNullable().defaultTo('');
    t.string('cta_text', 30).notNullable().defaultTo('Learn more');
    t.boolean('is_active').notNullable().defaultTo(true);
    ts(t, 'start_at');
    ts(t, 'end_at');
    t.integer('frequency_days').notNullable().defaultTo(7); // min days between showings of this ad
    t.integer('max_per_month').notNullable().defaultTo(4);
    t.integer('priority').notNullable().defaultTo(0);
    text(t, 'target', '{}'); // { licenseStatus, platforms, minVersion, maxVersion }
    t.integer('version').notNullable().defaultTo(1);
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
    t.index(['is_active', 'start_at', 'end_at']);
  });

  // Aggregated daily counters (never one row per request).
  await knex.schema.createTable('usage_stats', (t) => {
    t.string('day', 10).notNullable();
    t.string('metric', 60).notNullable(); // e.g. config_check, ad:12:AD_SHOWN
    t.integer('count').notNullable().defaultTo(0);
    t.primary(['day', 'metric']);
  });

  await knex.schema.createTable('app_config', (t) => {
    t.string('key', 60).primary();
    t.text('value').notNullable();
    ref(t, 'updated_by');
    ts(t, 'updated_at').notNullable();
  });

  await knex.schema.createTable('audit_log', (t) => {
    t.bigIncrements('id').primary();
    t.string('actor_type', 20).notNullable(); // admin | client | system | app
    ref(t, 'actor_id');
    t.string('action', 60).notNullable();
    t.string('entity', 40).notNullable().defaultTo('');
    ref(t, 'entity_id');
    text(t, 'details', '{}');
    t.string('ip', 64).notNullable().defaultTo('');
    ts(t, 'created_at').notNullable();
    t.index(['entity', 'entity_id']);
    t.index(['created_at']);
  });
}

export async function down(knex) {
  for (const table of ['audit_log', 'app_config', 'usage_stats', 'ads', 'devices', 'licenses', 'payments', 'clients', 'plans', 'admins']) {
    await knex.schema.dropTableIfExists(table);
  }
}
